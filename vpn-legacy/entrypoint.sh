#!/bin/bash
set -e

mkdir -p /dev/net
[ ! -c /dev/net/tun ] && mknod /dev/net/tun c 10 200 || true
[ ! -c /dev/ppp ] && mknod /dev/ppp c 108 0 || true

# Configuration variables
USERNAME="${VPN_USERNAME:-mc801a}"
PASSWORD="${VPN_PASSWORD:-Kotialy5G2026!}"
PSK="${VPN_IPSEC_PSK:-kotialy5g}"
LOCAL_IP="${LOCAL_IP:-192.168.254.1}"
LAN_IP="192.168.68.54"
PPTP_RANGE="${PPTP_RANGE:-192.168.254.10-50}"
L2TP_START="${L2TP_START:-192.168.254.51}"
L2TP_END="${L2TP_END:-192.168.254.100}"
UPSTREAM_DNS_1="1.1.1.1"
UPSTREAM_DNS_2="8.8.8.8"

# Bind 192.168.254.1 to lo so SmartDNS & SNI Proxy listen immediately
ip addr add 192.168.254.1/32 dev lo 2>/dev/null || true

echo "=========================================================="
echo "[VPN-LEGACY] Käynnistetään SmartDNS + SNI Proxy + VPN..."
echo "[VPN-LEGACY] Käyttäjätunnus   : $USERNAME"
echo "[VPN-LEGACY] VPN Gateway IP   : $LOCAL_IP"
echo "[VPN-LEGACY] PPTP IP-alue     : $PPTP_RANGE (TCP 1723 + GRE)"
echo "[VPN-LEGACY] L2TP IP-alue     : $L2TP_START - $L2TP_END (UDP 1701)"
echo "[VPN-LEGACY] SmartDNS Domainit: *.a2d.tv, mtv.fi, *.katsomo.fi"
echo "=========================================================="

# 1. Setup PPP authentication secrets (both CHAP and PAP)
mkdir -p /etc/ppp
cat <<EOF > /etc/ppp/chap-secrets
# Secrets for authentication using CHAP
# client        server  secret                  IP addresses
"$USERNAME"     *       "$PASSWORD"             *
"$USERNAME"     *       "$PSK"                  *
EOF

cat <<EOF > /etc/ppp/pap-secrets
# Secrets for authentication using PAP
# client        server  secret                  IP addresses
"$USERNAME"     *       "$PASSWORD"             *
"$USERNAME"     *       "$PSK"                  *
EOF

chmod 600 /etc/ppp/chap-secrets /etc/ppp/pap-secrets

# 2. Setup PPTP configuration (PoPToP)
cat <<EOF > /etc/pptpd.conf
option /etc/ppp/options.pptpd
logwtmp
localip $LOCAL_IP
remoteip $PPTP_RANGE
EOF

cat <<EOF > /etc/ppp/options.pptpd
name pptpd
refuse-pap
refuse-chap
refuse-mschap
require-mschap-v2
require-mppe-128
ms-dns $LOCAL_IP
ms-dns $LAN_IP
proxyarp
nodefaultroute
lock
nobsdcomp
novj
novjccomp
nologfd
mtu 1400
mru 1400
EOF

# 3. Setup xl2tpd configuration
mkdir -p /etc/xl2tpd /var/run/xl2tpd
cat <<EOF > /etc/xl2tpd/xl2tpd.conf
[global]
port = 1701
auth file = /etc/ppp/chap-secrets
access control = no

[lns default]
ip range = $L2TP_START-$L2TP_END
local ip = $LOCAL_IP
require chap = yes
refuse pap = no
require authentication = yes
name = l2tpd
pppoptfile = /etc/ppp/options.xl2tpd
length bit = yes
EOF

cat <<EOF > /etc/xl2tpd/l2tp-secrets
* * $PSK
* * $PASSWORD
EOF
chmod 600 /etc/xl2tpd/l2tp-secrets

cat <<EOF > /etc/ppp/options.xl2tpd
name l2tpd
ipcp-accept-local
ipcp-accept-remote
ms-dns $LOCAL_IP
ms-dns $LAN_IP
noccp
auth
idle 1800
mtu 1400
mru 1400
proxyarp
nodefaultroute
lock
connect-delay 5000
EOF

# 4. Setup strongSwan IPsec configuration (for L2TP/IPsec)
cat <<EOF > /etc/ipsec.conf
config setup
    charondebug="ike 1, knl 1, cfg 0"
    uniqueids=no

conn %default
    ikelifetime=60m
    keylife=20m
    rekeymargin=3m
    keyingtries=1
    keyexchange=ikev1
    authby=secret
    ike=aes128-sha1-modp1024,aes256-sha1-modp1024,3des-sha1-modp1024!
    esp=aes128-sha1,aes256-sha1,3des-sha1!

conn L2TP-PSK-NAT
    rightsubnet=vhost:%priv
    also=L2TP-PSK-noNAT

conn L2TP-PSK-noNAT
    type=transport
    left=%defaultroute
    leftprotoport=17/1701
    right=%any
    rightprotoport=17/%any
    auto=add
EOF

cat <<EOF > /etc/ipsec.secrets
: PSK "$PSK"
: PSK "$PASSWORD"
EOF
chmod 600 /etc/ipsec.secrets

# 5. Setup SmartDNS (dnsmasq)
mkdir -p /etc/dnsmasq.d
cat <<EOF > /etc/dnsmasq.conf
listen-address=$LOCAL_IP,$LAN_IP
bind-interfaces
bogus-priv
domain-needed
no-resolv
server=$UPSTREAM_DNS_1
server=$UPSTREAM_DNS_2
cache-size=1500

# Katsomo / MTV / A2D SmartDNS Redirection to local SNI Proxy ($LOCAL_IP)
address=/a2d.tv/$LOCAL_IP
address=/mtv.fi/$LOCAL_IP
address=/katsomo.fi/$LOCAL_IP
address=/mtvpressi.fi/$LOCAL_IP
EOF

# 6. Setup Transparent SNI Proxy (sniproxy)
mkdir -p /var/run
cat <<EOF > /etc/sniproxy.conf
user daemon
pidfile /var/run/sniproxy.pid

error_log {
    syslog daemon
    priority notice
}

resolver {
    nameserver $UPSTREAM_DNS_1
    nameserver $UPSTREAM_DNS_2
    mode ipv4_only
}

listen $LOCAL_IP:443 {
    proto tls
    table https_hosts
}

listen $LOCAL_IP:80 {
    proto http
    table http_hosts
}

listen $LAN_IP:443 {
    proto tls
    table https_hosts
}

listen $LAN_IP:80 {
    proto http
    table http_hosts
}

table https_hosts {
    .*:443 $*
}

table http_hosts {
    .*:80 $*
}
EOF

# 7. Setup firewall forwarding and NAT (only for 192.168.254.0/24, OpenVPN remains 192.168.255.0/24)
iptables -t nat -A POSTROUTING -s 192.168.254.0/24 -j MASQUERADE || true
iptables -A FORWARD -s 192.168.254.0/24 -j ACCEPT || true
iptables -A FORWARD -d 192.168.254.0/24 -j ACCEPT || true
iptables -A FORWARD -m state --state RELATED,ESTABLISHED -j ACCEPT || true
iptables -A FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu || true

# Handle clean shutdown on SIGTERM / SIGINT
cleanup() {
    echo "[VPN-LEGACY] Pysäytetään palvelut..."
    kill -TERM "$SNIPROXY_PID" 2>/dev/null || true
    kill -TERM "$DNSMASQ_PID" 2>/dev/null || true
    ipsec stop 2>/dev/null || true
    kill -TERM "$XL2TPD_PID" 2>/dev/null || true
    kill -TERM "$PPTPD_PID" 2>/dev/null || true
    exit 0
}
trap cleanup SIGTERM SIGINT

# 8. Start Services
echo "[VPN-LEGACY] Käynnistetään dnsmasq (SmartDNS)..."
dnsmasq -k --conf-file=/etc/dnsmasq.conf &
DNSMASQ_PID=$!

echo "[VPN-LEGACY] Käynnistetään sniproxy (TLS SNI Proxy)..."
sniproxy -c /etc/sniproxy.conf -f &
SNIPROXY_PID=$!

echo "[VPN-LEGACY] Käynnistetään IPsec (strongSwan)..."
ipsec start 2>&1 || true

echo "[VPN-LEGACY] Käynnistetään xl2tpd..."
xl2tpd -D 2>&1 &
XL2TPD_PID=$!

echo "[VPN-LEGACY] Käynnistetään pptpd..."
pptpd --fg 2>&1 &
PPTPD_PID=$!

echo "[VPN-LEGACY] Valmiina! SmartDNS ja SNI Proxy aktiivisena osoitteessa $LOCAL_IP!"

# Wait for children
wait -n "$XL2TPD_PID" "$PPTPD_PID" "$DNSMASQ_PID" "$SNIPROXY_PID"
