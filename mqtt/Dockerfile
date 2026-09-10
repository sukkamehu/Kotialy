FROM eclipse-mosquitto:2.0.22

COPY mosquitto.conf /mosquitto/config/mosquitto.conf
COPY aclfile /mosquitto/config/aclfile
COPY docker-entrypoint.sh /usr/local/bin/kotialy-mosquitto

RUN chmod 755 /usr/local/bin/kotialy-mosquitto

ENTRYPOINT ["/usr/local/bin/kotialy-mosquitto"]
