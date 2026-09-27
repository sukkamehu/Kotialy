# AGENTS.md — Kotiäly Kehitys- ja Vianmääritysohjeet

Tämä tiedosto ohjeistaa AI-agentteja järjestelmän reaaliaikaisen tilan tutkimisessa, vianmäärityksessä ja tuotantopalvelimen hallinnassa.

---

## 🚀 Pääsääntö: Reaaliaikaisen tilanteen ja datan tutkiminen

> **Kun tarvitsee selvittää järjestelmän reaaliaikaista toimintaa, vikatilanteita, trendejä, tietokannan dataa tai ajonaikaisia lokeja, mene AINA katsomaan tuotantopalvelimelta SSH-yhteydellä:**
>
> **SSH-osoite:** `juuso@192.168.68.54`  
> **Projektipolku palvelimella:** `~/Dev/kotialy/`  
> **SSH toimii suoraan avaimella:** `ssh juuso@192.168.68.54 "<komento>"`

---

## 🛠️ Yleisimmät komennot palvelimella (`juuso@192.168.68.54`)

### 1. Konttien tila ja lokit
```bash
# Tarkista pyörivät kontit (server, dashboard, mqtt, openvpn)
ssh juuso@192.168.68.54 "docker ps"

# Katso backend-palvelimen lokit reaaliajassa / viimeisimmät rivit
ssh juuso@192.168.68.54 "docker logs --tail 100 -f kotialy-server-1"

# Katso MQTT brokerin lokit
ssh juuso@192.168.68.54 "docker logs --tail 50 kotialy-mqtt-1"

# Katso autodeploy-lokit
ssh juuso@192.168.68.54 "cat ~/Dev/kotialy/logs/autodeploy.log | tail -n 50"
```

---

### 2. Tietokanta ja sensorihistoria (SQLite)
Tuotannon aktiivinen SQLite-tietokanta sijaitsee palvelimella polussa `~/Dev/kotialy/server/data/kotialy.db` (tai kontissa `/app/server/data/kotialy.db`).

```bash
# Tarkista tuoreimmat sensoritilat (esim. VILP / HeishaMon / Tuya)
ssh juuso@192.168.68.54 "sqlite3 ~/Dev/kotialy/server/data/kotialy.db 'SELECT topic, value, datetime(updated_at/1000, \"unixepoch\", \"localtime\") FROM sensor_state ORDER BY updated_at DESC LIMIT 20;'"

# Tarkista päivittäiset energiat ja COP (daily_costs)
ssh juuso@192.168.68.54 "sqlite3 ~/Dev/kotialy/server/data/kotialy.db 'SELECT date, heat_consumption_kwh, dhw_consumption_kwh, heat_production_kwh, dhw_production_kwh, cop FROM daily_costs ORDER BY date DESC LIMIT 10;'"

# Tarkista APC:n (automaattisen hintaohjauksen) lokit
ssh juuso@192.168.68.54 "sqlite3 ~/Dev/kotialy/server/data/kotialy.db 'SELECT datetime(timestamp/1000, \"unixepoch\", \"localtime\"), action, reason, price_cents, outdoor_temp, dhw_temp FROM apc_logs ORDER BY timestamp DESC LIMIT 15;'"
```

---

### 3. MQTT-liikenteen kuuntelu ja tarkistus
```bash
# Kuuntele Panasonic VILP / HeishaMon -viestejä
ssh juuso@192.168.68.54 "docker exec -i kotialy-mqtt-1 mosquitto_sub -u kotialy -P <MQTT_PASS> -t 'panasonic_heat_pump/#' -v -C 10"

# Kuuntele Zigbee / Tuya -viestejä
ssh juuso@192.168.68.54 "docker exec -i kotialy-mqtt-1 mosquitto_sub -u kotialy -P <MQTT_PASS> -t 'zigbee2mqtt/#' -v -C 10"
```

---

### 4. Konttien uudelleenkäynnistys ja päivitys
```bash
# Käynnistä server-kontti uudelleen
ssh juuso@192.168.68.54 "cd ~/Dev/kotialy && docker compose restart server"

# Koko pinon uudelleenrakennus ja käynnistys
ssh juuso@192.168.68.54 "cd ~/Dev/kotialy && docker compose up -d --build"
```
