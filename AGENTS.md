# AGENTS.md — Kotiäly Kehitys- ja Vianmääritysohjeet

Tämä tiedosto ohjeistaa AI-agentteja järjestelmän reaaliaikaisen tilan tutkimisessa, vianmäärityksessä ja tuotantopalvelimen hallinnassa.

---

## 🚀 Pääsääntö 1: Reaaliaikaisen tilanteen ja datan tutkiminen

> **Kun tarvitsee selvittää järjestelmän reaaliaikaista toimintaa, vikatilanteita, trendejä, tietokannan dataa tai ajonaikaisia lokeja, mene AINA katsomaan tuotantopalvelimelta SSH-yhteydellä:**
>
> **SSH-osoite:** `juuso@192.168.68.54`  
> **Projektipolku palvelimella:** `~/Dev/kotialy/`  
> **SSH toimii suoraan avaimella:** `ssh juuso@192.168.68.54 "<komento>"`
> **Poista vanhat DOCKER roskat aina.**

---

## 📦 Pääsääntö 2: Kaikki koodimuutokset pitää AINA commitoida GitHubiin

> **Kaikki tehdyt koodimuutokset ja korjaukset tulee AINA commitoida selkeällä viestillä ja pushata suoraan GitHubin main-haaraan (`git push origin main`), sekä päivittää/buildata tuotantopalvelimelle.**
>
> ```bash
> git add . && git commit -m "kuvaus muutoksesta" && git push origin main
> # Palvelimen päivitys:
> ssh juuso@192.168.68.54 "cd ~/Dev/kotialy && git pull && docker compose build dashboard && docker compose up -d dashboard"
> ```

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

---

## 🏠 Kiinteistön ja lämmitysjärjestelmän rakenne (TÄRKEÄ)

- **Rakennus:** Omakotitalo Etelä-Suomessa, rakennusvuosi 2006, pinta-ala n. 250 m² (E-luku 265 kWh/m²/v, luokka E).
- **Lattiarakenne:** **Lautakoolattu rossipohja** (tuulettuva alapohja / puurakenne), **EI betonilaatta**.
  - Lämpökapasiteetti (termomassa) on pienempi ja reagointinopeus nopeampi kuin raskaassa betonissa.
  - Lattian jatkuva kierto lämmityskaudella on kriittistä vedon tunteen ja lämpötilan tasaisuuden säilyttämiseksi.
- **LVI- ja mitoitustiedot:**
  - Rakennuksen mitoitusteho: **9,2 kW**
  - Lämmitysverkoston virtaus: **870 l/h** (n. 14,5 l/min)
  - Lämmitysverkoston suunniteltu ΔT (meno–paluu): **9,1 °C**
  - Lämmitysverkoston painehäviö: **29 kPa**
  - Lämmitysverkoston vesitilavuus: **123 litraa** (puskurin kanssa yht. ~223 litraa)
- **Energiankulutuksen perusta (ennen VILP-asennusta sähkökattilalla):**
  - Tilojen lämmitys: 16 225 kWh/v
  - Ilmanvaihdon lämmitys: 2 115 kWh/v
  - Käyttövesi: 4 200 kWh/v
  - Laskennallinen lämmitysenergia: **22 540 kWh/v**
  - Historiallinen toteutunut kokonaissähkö (lämmitys + taloussähkö): **n. 35 000 kWh/v**
- **Nykyinen laitteisto:**
  - Panasonic Aquarea 12 kW / T-CAP VILP (WH-MXC12J9E8 Monobloc) + HeishaMon
  - 100 L puskurivaraaja (4-putkikytkentä), hydraulinen erotin
  - 284 L käyttövesivaraaja laajalla latauskierukalla
  - Toisiopiirissä Sonoff-älyohjattu kiertovesipumppu (`lattialampopumppu`)

---

## 🌡️ Lämpötila-anturit ja niiden sijainnit

- **Pääkiinteistön sisälämpötila (omakotitalo):**
  - `tuya/alakerta/temperature` (**Alakerta**) — Edustaa alakerran sisälämpötilaa.
  - `tuya/ylakerran_tyohuone/temperature` (**Yläkerran työhuone**) — Edustaa yläkerran sisälämpötilaa.
  - *Näiden kahden anturin keskiarvo / lukemat kuvaavat asunnon todellista sisälämpötilaa (tavoite ~21,3 °C).*
- **Muut tilat ja etäkohteet:**
  - `tuya/naytollinen/temperature` (**Näytöllinen mittari**) — **Sijaitsee eri talossa (sijoitusasunnossa)**. Pidetään mukana UI:ssa/seurannassa, mutta **EI** edusta pääkiinteistön sisälämpötilaa.
  - `tuya/autotalli/temperature` — Autotallin lämpötila.
  - `tuya/sauna/temperature` — Saunan lämpötila.
  - `tuya/ulko/temperature` ja `main/Outside_Temp` — Ulkolämpötila.



