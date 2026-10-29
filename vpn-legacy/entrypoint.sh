#!/bin/bash
set -e

mkdir -p /dev/net
[ ! -c /dev/net/tun ] && mknod /dev/net/tun c 10 200 || true
[ ! -c /dev/ppp ] && mknod /dev/ppp c 108 0 || true

# Environment configuration with safe defaults
USERNAME="${VPN_USERNAME:-mc801a}"
PASSWORD="${VPN_PASSWORD:-Kotialy5G2026!}"
PSK="${VPN_IPSEC_PSK:-kotialy5g}"
LOCAL_IP="${LOCAL_IP:-192.168.254.1}"
PPTP_RANGE="${PPTP_RANGE:-192.168.254.10-50}"
L2TP_START="${L2TP_START:-192.168.254.51}"
L2TP_END="${L2TP_END:-192.168.254.100}"
DNS_1="${DNS_1:-192.168.68.1}"
DNS_2="${DNS_2:-8.8.8.8}"

echo "=========================================================="
echo "[VPN-LEGACY] Käynnistetään L2TP & PPTP VPN palvelin..."
echo "[VPN-LEGACY] Käyttäjätunnus : $USERNAME"
echo "[VPN-LEGACY] Yhdyskäytävä IP: $LOCAL_IP"
echo "[VPN-LEGACY] PPTP IP-alue  : $PPTP_RANGE (TCP 1723 + GRE)"
echo "[VPN-LEGACY] L2TP IP-alue  : $L2TP_START - $L2TP_END (UDP 1701)"
echo "[VPN-LEGACY] IPsec PSK     : $PSK (UDP 500, 4500)"
echo "=========================================================="

# 1. Setup PPP authentication secrets (both CHAP and PAP)
mkdir -p /etc/ppp
cat <<EOF > /etc/ppp/chap-secrets
# Secrets for authentication using CHAP
# client        server  secret                  IP addresses
"$USERNAME"     *       "$PASSWORD"             *
EOF

cat <<EOF > /etc/ppp/pap-secrets
# Secrets for authentication using PAP
# client        server  secret                  IP addresses
"$USERNAME"     *       "$PASSWORD"             *
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
ms-dns $DNS_1
ms-dns $DNS_2
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

cat <<EOF > /etc/ppp/options.xl2tpd
name l2tpd
ipcp-accept-local
ipcp-accept-remote
ms-dns $DNS_1
ms-dns $DNS_2
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
EOF
chmod 600 /etc/ipsec.secrets

# 5. Setup firewall forwarding and NAT (only for 192.168.254.0/24, OpenVPN remains 192.168.255.0/24)
iptables -t nat -A POSTROUTING -s 192.168.254.0/24 -j MASQUERADE || true
iptables -A FORWARD -s 192.168.254.0/24 -j ACCEPT || true
iptables -A FORWARD -d 192.168.254.0/24 -j ACCEPT || true
iptables -A FORWARD -m state --state RELATED,ESTABLISHED -j ACCEPT || true
# TCP MSS Clamping to prevent cellular fragmentation freezes
iptables -A FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu || true

# Handle clean shutdown on SIGTERM / SIGINT
cleanup() {
    echo "[VPN-LEGACY] Pysäytetään palvelut..."
    ipsec stop 2>/dev/null || true
    kill -TERM "$XL2TPD_PID" 2>/dev/null || true
    kill -TERM "$PPTPD_PID" 2>/dev/null || true
    exit 0
}
trap cleanup SIGTERM SIGINT

# 6. Start IPsec (strongSwan)
ipsec start 2>&1 || true

# 7. Start xl2tpd daemon
xl2tpd -D 2>&1 &
XL2TPD_PID=$!

# 8. Start pptpd daemon in background
pptpd --fg 2>&1 &
PPTPD_PID=$!

echo "[VPN-LEGACY] Valmiina ottamaan vastaan yhteyksiä MC801A1-reitittimeltä!"

# Wait for children
wait -n "$XL2TPD_PID" "$PPTPD_PID"
