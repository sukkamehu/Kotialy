FROM alpine:3.20

RUN apk add --no-cache openvpn easy-rsa iptables bash

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 1194/udp

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
