FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        pptpd \
        xl2tpd \
        ppp \
        iptables \
        iproute2 \
        procps \
        strongswan \
        libcharon-extra-plugins \
        dnsmasq \
        sniproxy \
        ca-certificates && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 1723/tcp 1701/udp 500/udp 4500/udp 53/udp 53/tcp 443/tcp 80/tcp

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
