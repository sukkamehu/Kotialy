#!/usr/bin/env bash
# ==============================================================================
# Kotiäly - Automaattinen päivitys- ja deploy-skripti (Ubuntu / Linux)
#
# Tarkistaa git-version / uudet julkaisut ja deployaa automaattisesti
# ==============================================================================

set -euo pipefail

# Määritä projektin juurihakemisto skriptin sijainnista
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

LOG_FILE="${PROJECT_DIR}/logs/autodeploy.log"
LOCK_FILE="/tmp/kotialy-autodeploy.lock"

# Varmista että lokihakemisto on olemassa
mkdir -p "${PROJECT_DIR}/logs"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "${LOG_FILE}"
}

# Lukitustiedosto päällekkäisten ajojen estämiseksi
exec 200>"${LOCK_FILE}"
if ! flock -n 200; then
  log "Autodeploy on jo käynnissä toisessa prosessissa. Poistutaan."
  exit 0
fi

cd "${PROJECT_DIR}"

# Tarkista nykyinen haara
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")

# Hae etärepon tiedot hiljaisesti
git fetch origin "${BRANCH}" --quiet || {
  log "VIRHE: 'git fetch' epäonnistui. Tarkista verkkoyhteys tai git-oikeudet."
  exit 1
}

LOCAL_HASH=$(git rev-parse HEAD)
REMOTE_HASH=$(git rev-parse "origin/${BRANCH}")

if [ "${LOCAL_HASH}" = "${REMOTE_HASH}" ]; then
  # Ei uusia muutoksia
  exit 0
fi

log "------------------------------------------------------------"
log "Uusi versio havaittu! Päivitetään: ${LOCAL_HASH:0:7} -> ${REMOTE_HASH:0:7} (haara: ${BRANCH})"

# Vedä uusimmat muutokset
if ! git pull --ff-only origin "${BRANCH}"; then
  log "VIRHE: 'git pull' epäonnistui. Manuaalinen tarkistus vaaditaan (mahdollisia paikallisia ristiriitoja)."
  exit 1
fi

# Tunnista käyttömuoto: Docker Compose vai suora Node/PM2
if [ -f "docker-compose.yml" ] && command -v docker &>/dev/null && docker compose ps &>/dev/null; then
  log "Käynnistetään Docker Compose -päivitys..."
  
  docker compose build --pull
  docker compose up -d --remove-orphans
  
  # Siivoa vanhat ylimääräiset imaget taustalta
  docker image prune -f --filter "until=24h" >/dev/null 2>&1 || true
  
  log "Docker Compose -palvelut päivitetty onnistuneesti!"
else
  log "Käynnistetään Node.js / paikallinen päivitys..."
  
  if [ -f "package.json" ]; then
    npm install --silent
    npm run install:all
    npm run build
  fi

  # Jos PM2 on käytössä, käynnistetään prosessit uudelleen
  if command -v pm2 &>/dev/null && pm2 list | grep -q "kotialy"; then
    log "Uudelleenkäynnistetään PM2-prosessit..."
    pm2 restart kotialy || pm2 restart all
  fi

  # Jos systemd-palvelu on käytössä, käynnistetään se uudelleen
  if systemctl is-active --quiet kotialy.service 2>/dev/null; then
    log "Uudelleenkäynnistetään systemd kotialy.service..."
    sudo systemctl restart kotialy.service || true
  fi

  log "Paikallinen asennus päivitetty onnistuneesti!"
fi

log "Päivitys suoritettu valmiiksi versioon: $(git rev-parse --short HEAD)"
log "------------------------------------------------------------"
