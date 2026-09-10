#!/bin/sh
set -eu

: "${HEISHAMON_MQTT_USERNAME:?HEISHAMON_MQTT_USERNAME is required}"
: "${HEISHAMON_MQTT_PASSWORD:?HEISHAMON_MQTT_PASSWORD is required}"
: "${APP_MQTT_USERNAME:?APP_MQTT_USERNAME is required}"
: "${APP_MQTT_PASSWORD:?APP_MQTT_PASSWORD is required}"
: "${ZIGBEE2MQTT_MQTT_USERNAME:?ZIGBEE2MQTT_MQTT_USERNAME is required}"
: "${ZIGBEE2MQTT_MQTT_PASSWORD:?ZIGBEE2MQTT_MQTT_PASSWORD is required}"

mkdir -p /mosquitto/data
password_file=/mosquitto/data/passwordfile

set_password() {
  username="$1"
  password="$2"

  if [ -f "$password_file" ]; then
    mosquitto_passwd -b "$password_file" "$username" "$password"
  else
    mosquitto_passwd -b -c "$password_file" "$username" "$password"
  fi
}

# Environment values are the source of truth, so rotating a password only
# requires updating .env and recreating this container.
set_password "$HEISHAMON_MQTT_USERNAME" "$HEISHAMON_MQTT_PASSWORD"
set_password "$APP_MQTT_USERNAME" "$APP_MQTT_PASSWORD"
set_password "$ZIGBEE2MQTT_MQTT_USERNAME" "$ZIGBEE2MQTT_MQTT_PASSWORD"

# mosquitto_passwd runs as root here, but the broker drops privileges to the
# mosquitto user and must be able to read the file.
chown mosquitto:mosquitto "$password_file"

exec /usr/sbin/mosquitto -c /mosquitto/config/mosquitto.conf
