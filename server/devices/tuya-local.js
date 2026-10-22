const fs = require('fs');
const path = require('path');
const TuyAPI = require('tuyapi');

class TuyaLocalService {
  constructor() {
    this.keysPath = path.resolve(__dirname, '../data/tuya_keys.json');
    this.keys = {};
    this.knownDevices = new Map();
    this.deviceVersions = new Map();
    this.offlineCooldownMs = 60000;
    this.offlineDevices = new Map();

    // Default known IP addresses and protocol versions for home devices
    this.registerKnownDevice('bfee1ec43ebb997b0c12ru', '192.168.68.78', '3.5'); // Ulkovalot 2 (迷你MINI通断器1路)
    this.registerKnownDevice('bfb6ed442015162bc97kca', '192.168.68.58', '3.5'); // Kiertovesipumppu
    this.registerKnownDevice('bf48a78786f87488b4otcg', '192.168.68.62', '3.4'); // Energy+ Älypistorasia Home Connect IP20
    this.registerKnownDevice('bfc6974c07151a07e7fa3g', '192.168.68.70', '3.3'); // Sauna Breaker (WiFi Switch / 1P-Mtrg)

    this.loadKeys();
  }

  registerKnownDevice(id, ip, version = '3.3') {
    if (id && ip) {
      this.knownDevices.set(id, ip);
      this.deviceVersions.set(id, version);
      this.offlineDevices.delete(id);
    }
  }

  loadKeys() {
    const candidatePaths = [
      process.env.TUYA_KEYS_PATH,
      path.resolve(__dirname, '../data/tuya_keys.json'),
      path.resolve(process.cwd(), 'data/tuya_keys.json'),
      '/app/data/tuya_keys.json',
      path.resolve(__dirname, '../../data/tuya_keys.json'),
    ].filter(Boolean);

    for (const p of candidatePaths) {
      try {
        if (fs.existsSync(p)) {
          const raw = fs.readFileSync(p, 'utf8');
          this.keys = JSON.parse(raw);
          this.keysPath = p;
          console.log(`[TUYA:LOCAL] Ladattu ${Object.keys(this.keys).length} laitteen paikalliset salausavaimet tiedostosta: ${p}`);
          return;
        }
      } catch (err) {
        console.warn(`[TUYA:LOCAL] Varoitus polun ${p} lukemisessa:`, err.message);
      }
    }

    // Embedded fallback keys if json file is missing in container
    this.keys = {
      'bfee1ec43ebb997b0c12ru': { name: 'Ulkovalot 2', key: '3!x|]E}bR#V(x6!)', category: 'tdq' },
      'bf7a39a3a10e38a52engat': { name: 'Ulkovalot 1', key: '5.v\'C~nxZwx;{3Bl', category: 'dlq' },
      'bfb6ed442015162bc97kca': { name: 'Kiertovesipumppu', key: '>N(dN?y~O>M{`mPn', category: 'tdq' },
      'bf48a78786f87488b4otcg': { name: 'Energy+ Älypistorasia', key: '55X}9Qr^-w2sd`n}', category: 'cz' },
      'bfc6974c07151a07e7fa3g': { name: 'Sauna Breaker', key: 'E+Ip=MU8Cop=1q8A', category: 'dlq' },
      'bf711b7007598a9ab8cmfm': { name: 'Gateway', key: 'mxOkJ@~Pq7n$*~+g', category: 'wg2' },
    };
    console.log(`[TUYA:LOCAL] Käytetään ${Object.keys(this.keys).length} sisäänrakennettua varoavainta.`);
  }

  getKey(deviceId) {
    if (this.keys[deviceId]?.key) return this.keys[deviceId].key;
    // Fallback: reload in case file was updated
    this.loadKeys();
    return this.keys[deviceId]?.key || null;
  }

  getName(deviceId) {
    return this.keys[deviceId]?.name || deviceId;
  }

  isDeviceSupportedLocally(deviceId) {
    return Boolean(this.getKey(deviceId));
  }

  /**
   * Control switch power locally via direct TCP (port 6668)
   */
  async setSwitch(deviceId, turnOn, options = {}) {
    const key = this.getKey(deviceId);
    if (!key) {
      throw new Error(`Ei paikallista avainta laitteelle ${deviceId}`);
    }

    const val = Boolean(turnOn);
    let ip = options.ip || this.knownDevices.get(deviceId) || null;
    let version = options.version || this.deviceVersions.get(deviceId) || '3.3';

    // If IP is not known and device recently failed discovery, skip immediately to prevent lagging
    if (!ip) {
      const offlineUntil = this.offlineDevices.get(deviceId) || 0;
      if (Date.now() < offlineUntil) {
        throw new Error(`Laite ${this.getName(deviceId)} ei vastaa lähiverkossa (offline-tila)`);
      }
    }

    const dev = new TuyAPI({
      id: deviceId,
      key,
      ip: ip || undefined,
      version: version || undefined,
      issueRefreshOnConnect: false,
    });

    dev.on('error', () => { });

    try {
      // If IP is not known, discover via local UDP with short 1.5s timeout
      if (!ip) {
        console.log(`[TUYA:LOCAL] Etsitään laitetta ${this.getName(deviceId)} (${deviceId}) lähiverkosta...`);
        try {
          await dev.find({ timeout: 1.5 });
          ip = dev.device.ip;
          version = dev.device.version || '3.3';
          this.registerKnownDevice(deviceId, ip, version);
        } catch (findErr) {
          this.offlineDevices.set(deviceId, Date.now() + this.offlineCooldownMs);
          throw findErr;
        }
      }

      // Connect with 1.8s timeout
      await Promise.race([
        dev.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Yhteysaikakatkaisu')), 1800)),
      ]);

      // Most Tuya smart switches use DPS 1 for relay power state
      const targetDps = options.dps || 1;
      await dev.set({ dps: targetDps, set: val });

      console.log(`[TUYA:LOCAL] ✅ ${this.getName(deviceId)} (${ip}) kytketty paikallisesti -> ${val ? 'PÄÄLLE' : 'POIS'}`);

      // Graceful disconnect
      setTimeout(() => {
        try { dev.disconnect(); } catch (_) { }
      }, 300);

      return {
        success: true,
        local: true,
        state: val,
        ip,
        deviceId,
        name: this.getName(deviceId),
      };
    } catch (err) {
      try { dev.disconnect(); } catch (_) { }
      throw new Error(`Paikallinen Tuya-ohjaus epäonnistui (${deviceId} @ ${ip || 'unknown'}): ${err.message}`);
    }
  }

  /**
   * Query status DPS locally
   */
  async getStatus(deviceId, options = {}) {
    const key = this.getKey(deviceId);
    if (!key) throw new Error(`Ei paikallista avainta laitteelle ${deviceId}`);

    let ip = options.ip || this.knownDevices.get(deviceId) || null;
    let version = options.version || this.deviceVersions.get(deviceId) || '3.3';

    const dev = new TuyAPI({
      id: deviceId,
      key,
      ip: ip || undefined,
      version: version || undefined,
    });

    dev.on('error', () => { });

    try {
      if (!ip) {
        await dev.find({ timeout: 4 });
        ip = dev.device.ip;
        version = dev.device.version || '3.3';
        this.registerKnownDevice(deviceId, ip, version);
      }

      await Promise.race([
        dev.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Yhteysaikakatkaisu')), 3000)),
      ]);

      const status = await dev.get({ schema: true });
      setTimeout(() => {
        try { dev.disconnect(); } catch (_) { }
      }, 500);

      return {
        success: true,
        local: true,
        dps: status.dps || status,
        ip,
        deviceId,
      };
    } catch (err) {
      try { dev.disconnect(); } catch (_) { }
      throw new Error(`Paikallinen tilakysely epäonnistui (${deviceId}): ${err.message}`);
    }
  }
}

module.exports = new TuyaLocalService();
