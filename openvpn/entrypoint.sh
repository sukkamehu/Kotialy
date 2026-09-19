#!/bin/bash
set -e

mkdir -p /dev/net
if [ ! -c /dev/net/tun ]; then
    mknod /dev/net/tun c 10 200
fi

# Setup NAT forwarding so VPN clients can reach the host, LAN, and the whole Internet
iptables -t nat -A POSTROUTING -s 192.168.255.0/24 -j MASQUERADE || true
iptables -A FORWARD -s 192.168.255.0/24 -j ACCEPT || true
iptables -A FORWARD -d 192.168.255.0/24 -j ACCEPT || true
iptables -A FORWARD -m state --state RELATED,ESTABLISHED -j ACCEPT || true

echo "[OPENVPN] Käynnistetään OpenVPN palvelin..."
exec openvpn --config /etc/openvpn/openvpn.conf
