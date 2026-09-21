require('dotenv').config();
const fs = require('fs');
const puppeteer = require('puppeteer-core');
const db = require('./db');

const HERRFORS_BASE_URL = 'https://portal.herrfors.fi';
const HERRFORS_IDENTITY_URL = 'https://identity.herrfors.fi/';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36';

class HerrforsClient {
  constructor() {
    this.sessionTimer = null;
    this.syncTimer = null;
    this.isRefreshing = false;
    this.isLoggingIn = false;
    this.isSyncing = false;
    this.lastError = null;
    this.sessionInfo = null;
  }

  /**
   * Find available Chrome or Chromium binary across macOS, Linux & Alpine Docker
   */
  findChromeBinary() {
    if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
      return process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) {
      return process.env.CHROME_BIN;
    }
    const candidates = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  /**
   * Get current settings from DB / Env
   */
  getSettings() {
    return db.getHerrforsSettings();
  }

  /**
   * Get active session token
   */
  getToken() {
    const settings = this.getSettings();
    return settings.session_token || process.env.HERRFORS_SESSION_TOKEN || '';
  }

  /**
   * Get active coId / contract ID
   */
  getCoId() {
    const settings = this.getSettings();
    return settings.co_id || process.env.HERRFORS_CO_ID || '';
  }

  /**
   * Helper headers for Herrfors API calls
   */
  getHeaders(token) {
    return {
      'accept': 'application/json, text/plain, */*',
      'accept-language': 'fi,en-US;q=0.9,en;q=0.8',
      'cache-control': 'no-cache',
      'pragma': 'no-cache',
      'referer': `${HERRFORS_BASE_URL}/fi-FI/charts`,
      'user-agent': USER_AGENT,
      'cookie': `__Secure-next-auth.session-token=${token};`,
    };
  }

  /**
   * Perform automated headless authentication against Herrfors Identity
   */
  async authenticate() {
    const settings = this.getSettings();
    const username = settings.username || process.env.HERRFORS_USERNAME;
    const password = settings.password || process.env.HERRFORS_PASSWORD;

    if (!username || !password) {
      const err = 'Herrfors käyttäjätunnus tai salasana puuttuu (HERRFORS_USERNAME / HERRFORS_PASSWORD)';
      this.lastError = err;
      return { ok: false, error: err };
    }

    const chromePath = this.findChromeBinary();
    if (!chromePath) {
      const err = 'Chromium/Chrome -selainta ei löytynyt automaattista kirjautumista varten';
      this.lastError = err;
      return { ok: false, error: err };
    }

    if (this.isLoggingIn) {
      console.log('[HERRFORS] Kirjautuminen jo käynnissä...');
      return { ok: false, error: 'Login already in progress' };
    }

    this.isLoggingIn = true;
    console.log(`[HERRFORS] Suoritetaan automaattinen kirjautuminen (käyttäjä: ${username})...`);

    let browser = null;
    try {
      browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();

      let extractedToken = null;

      // Intercept response cookies
      page.on('response', res => {
        try {
          const setCookie = res.headers()['set-cookie'];
          if (setCookie && setCookie.includes('__Secure-next-auth.session-token')) {
            const match = setCookie.match(/__Secure-next-auth\.session-token=([^;]+)/);
            if (match && match[1]) {
              extractedToken = match[1];
            }
          }
        } catch {
          // ignore
        }
      });

      console.log('[HERRFORS] Avataan identity-sivu...');
      await page.goto(HERRFORS_IDENTITY_URL, { waitUntil: 'networkidle2', timeout: 30000 });

      // Form 0 is the primary login form
      await page.waitForSelector('form', { timeout: 10000 });
      const forms = await page.$$('form');
      if (!forms || forms.length === 0) {
        throw new Error('Kirjautumislomaketta ei löytynyt sivulta');
      }

      const loginForm = forms[0];
      const emailInput = await loginForm.$('input[name="username"]');
      const passwordInput = await loginForm.$('input[name="password"]');

      if (!emailInput || !passwordInput) {
        throw new Error('Kirjautumiskenttiä ei löytynyt lomakkeelta');
      }

      console.log('[HERRFORS] Syötetään kirjautumistiedot...');
      await emailInput.click();
      await emailInput.type(username, { delay: 15 });
      await passwordInput.click();
      await passwordInput.type(password, { delay: 15 });

      console.log('[HERRFORS] Lähetetään lomake (requestSubmit)...');
      await page.evaluate(() => {
        const f = document.querySelectorAll('form')[0];
        if (f) f.requestSubmit();
      });

      // Wait for token from response header or portal cookie storage
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        if (extractedToken) break;

        try {
          const portalCookies = await page.cookies('https://portal.herrfors.fi');
          const found = portalCookies.find(c => c.name === '__Secure-next-auth.session-token');
          if (found && found.value) {
            extractedToken = found.value;
            break;
          }
        } catch {
          // ignore
        }

        await new Promise(r => setTimeout(r, 400));
      }

      if (!extractedToken) {
        throw new Error('Kirjautumistokenia (__Secure-next-auth.session-token) ei saatu poimittua kirjautumisen jälkeen');
      }

      console.log('[HERRFORS] Automaattinen kirjautuminen onnistui! Uusi token tallennettu.');
      db.updateHerrforsSetting('session_token', extractedToken);
      db.updateHerrforsSetting('last_login_at', Date.now());
      this.lastError = null;

      return { ok: true, token: extractedToken };
    } catch (err) {
      console.error('[HERRFORS] Automaattinen kirjautuminen epäonnistui:', err.message);
      this.lastError = `Kirjautumisvirhe: ${err.message}`;
      return { ok: false, error: err.message };
    } finally {
      if (browser) {
        try { await browser.close(); } catch { /* ignore */ }
      }
      this.isLoggingIn = false;
    }
  }

  /**
   * Refresh session token by querying /api/auth/session
   * This extends the token validity by 24 hours. If it fails or returns empty session, falls back to automated login.
   */
  async refreshSession() {
    let token = this.getToken();
    if (!token) {
      console.log('[HERRFORS] Token puuttuu, suoritetaan ensikirjautuminen...');
      const authRes = await this.authenticate();
      if (!authRes.ok) {
        this.lastError = authRes.error;
        return { ok: false, error: authRes.error };
      }
      token = authRes.token;
    }

    if (this.isRefreshing) {
      return { ok: true, message: 'Refresh already in progress' };
    }

    this.isRefreshing = true;
    try {
      console.log('[HERRFORS] Virkistetään session token...');
      const res = await fetch(`${HERRFORS_BASE_URL}/api/auth/session`, {
        method: 'GET',
        headers: this.getHeaders(token),
      });

      if (!res.ok) {
        console.warn(`[HERRFORS] auth/session palautti ${res.status}. Kokeillaan automaattista uudelleenkirjautumista...`);
        const authRes = await this.authenticate();
        if (authRes.ok) {
          return { ok: true, refreshedAt: Date.now() };
        }
        throw new Error(`Herrfors auth/session palautti tilakoodin ${res.status} ${res.statusText}`);
      }

      // Check if a new cookie was set
      const setCookie = res.headers.get('set-cookie');
      if (setCookie) {
        const match = setCookie.match(/__Secure-next-auth\.session-token=([^;]+)/);
        if (match && match[1] && match[1] !== token) {
          console.log('[HERRFORS] Uusi session token vastaanotettu ja päivitetty.');
          db.updateHerrforsSetting('session_token', match[1]);
          token = match[1];
        }
      }

      const data = await res.json();

      // If session is empty or missing expires, token has expired on server side
      if (!data || Object.keys(data).length === 0 || !data.expires) {
        console.warn('[HERRFORS] auth/session palautti tyhjän istunnon. Suoritetaan automaattinen kirjautuminen...');
        const authRes = await this.authenticate();
        if (authRes.ok) {
          return { ok: true, refreshedAt: Date.now() };
        }
        throw new Error('Istunto vanhentunut ja automaattinen kirjautuminen epäonnistui');
      }

      this.sessionInfo = data;
      this.lastError = null;

      db.updateHerrforsSetting('token_expires', data.expires);
      db.updateHerrforsSetting('last_refresh_at', Date.now());

      console.log(`[HERRFORS] Session token virkistetty onnistuneesti (Voimassa: ${data?.expires || '24h'})`);
      return {
        ok: true,
        expires: data.expires,
        refreshedAt: Date.now(),
      };
    } catch (err) {
      this.lastError = err.message;
      console.error('[HERRFORS] Session virkistys epäonnistui:', err.message);
      return { ok: false, error: err.message };
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Fetch 15-minute readings for a specific date range [fromIso, toIso]
   */
  async fetchReadingsChunk(fromIso, toIso, retryOnAuth = true) {
    let token = this.getToken();
    const coId = this.getCoId();
    if (!token) {
      const authRes = await this.authenticate();
      if (!authRes.ok) throw new Error(`Herrfors token puuttuu ja kirjautuminen epäonnistui: ${authRes.error}`);
      token = authRes.token;
    }

    if (!coId) {
      throw new Error('Herrfors coId puuttuu');
    }

    const url = `${HERRFORS_BASE_URL}/api/charts/readings?coId=${encodeURIComponent(coId)}&consumption=true&price=true&temp=true&timeStep=15&from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(token),
    });

    if (!res.ok) {
      if ((res.status === 401 || res.status === 403) && retryOnAuth) {
        console.warn(`[HERRFORS] charts/readings palautti ${res.status}. Suoritetaan automaattinen uudelleenkirjautuminen ja yritetään uudelleen...`);
        const authRes = await this.authenticate();
        if (authRes.ok) {
          return this.fetchReadingsChunk(fromIso, toIso, false);
        }
      }
      throw new Error(`Herrfors charts/readings palautti tilakoodin ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    const values = data.values || [];
    const readings = [];
    let lastKnownTemp = null;

    for (const v of values) {
      if (!v.date) continue;
      const startMs = new Date(v.date).getTime();
      if (isNaN(startMs)) continue;
      const endMs = startMs + 15 * 60 * 1000;
      const dateStr = new Date(startMs).toISOString().slice(0, 10);

      if (v.temperature != null && !isNaN(Number(v.temperature))) {
        lastKnownTemp = Number(v.temperature);
      }

      readings.push({
        start_time: startMs,
        end_time: endMs,
        date_str: dateStr,
        consumption_kwh: v.consumption != null ? Number(v.consumption) : null,
        price: v.price != null ? Number(v.price) : null,
        price_with_vat: v.priceWithVat != null ? Number(v.priceWithVat) : null,
        temperature: v.temperature != null ? Number(v.temperature) : lastKnownTemp,
        fetched_at: Date.now(),
      });
    }

    if (readings.length > 0) {
      db.upsertHerrforsReadings(readings);
    }

    return {
      count: readings.length,
      maxPower: data.maximumPowerConsumption || null,
      readings,
    };
  }

  /**
   * Fetch and sync readings for a date range in 1-day chunks (to preserve 15-minute resolution)
   */
  async syncRange(startDate, endDate) {
    if (this.isSyncing) {
      return { ok: true, message: 'Sync already in progress' };
    }

    this.isSyncing = true;
    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();
    const DAY_MS = 24 * 60 * 60 * 1000;

    let currentStart = startMs;
    let totalSaved = 0;

    try {
      // First ensure session is fresh
      await this.refreshSession();

      while (currentStart < endMs) {
        const currentEnd = Math.min(currentStart + DAY_MS, endMs);
        const fromIso = new Date(currentStart).toISOString();
        const toIso = new Date(currentEnd).toISOString();

        console.log(`[HERRFORS] Haetaan mittaukset väliltä ${fromIso} - ${toIso}...`);
        const result = await this.fetchReadingsChunk(fromIso, toIso);
        totalSaved += result.count;

        currentStart = currentEnd;
        // Brief pause to avoid hammering API
        await new Promise(r => setTimeout(r, 300));
      }

      db.updateHerrforsSetting('last_sync_at', Date.now());
      db.updateHerrforsSetting('last_sync_status', 'OK');
      console.log(`[HERRFORS] Synkronointi valmis. Tallennettu yhteensä ${totalSaved} 15-min mittauspistettä.`);

      // Automatically push backup to Cloudflare R2 if configured
      if (totalSaved > 0) {
        try {
          const s3Service = require('./s3-service');
          if (s3Service && s3Service.isConfigured()) {
            s3Service.backupDatabase().catch(err => {
              console.error('[R2] Post-sync backup failed:', err.message);
            });
          }
        } catch {
          // ignore
        }
      }

      return { ok: true, totalSaved };
    } catch (err) {
      this.lastError = err.message;
      db.updateHerrforsSetting('last_sync_status', `Virhe: ${err.message}`);
      console.error('[HERRFORS] Synkronointivirhe:', err.message);
      return { ok: false, error: err.message, totalSaved };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Sync past N days
   */
  async syncRecentDays(days = 7) {
    const end = new Date();
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    start.setHours(0, 0, 0, 0);
    return this.syncRange(start.toISOString(), end.toISOString());
  }

  /**
   * Get comprehensive heating vs total electricity analysis
   */
  getHeatingComparison(fromMs, toMs) {
    const now = Date.now();
    const effectiveFrom = fromMs ? Number(fromMs) : now - 7 * 24 * 60 * 60 * 1000;
    const effectiveTo = toMs ? Number(toMs) : now;

    // 1. Fetch Herrfors readings for this window
    const herrforsRows = db.getHerrforsReadings(effectiveFrom, effectiveTo);

    // 2. Fetch Heat pump consumption topics from sensor_history
    const heatHistory = db.getTopicHistory('main/Heat_Power_Consumption', effectiveFrom - 3600000, effectiveTo);
    const dhwHistory = db.getTopicHistory('main/DHW_Power_Consumption', effectiveFrom - 3600000, effectiveTo);
    const coolHistory = db.getTopicHistory('main/Cool_Power_Consumption', effectiveFrom - 3600000, effectiveTo);

    const heatProdHistory = db.getTopicHistory('main/Heat_Power_Production', effectiveFrom - 3600000, effectiveTo);
    const dhwProdHistory = db.getTopicHistory('main/DHW_Power_Production', effectiveFrom - 3600000, effectiveTo);

    const tapoTotalHistory = db.getTopicHistory('tapo/total_power', effectiveFrom - 3600000, effectiveTo);
    const tapoIsovarastoHistory = db.getTopicHistory('tapo/isovarasto/power', effectiveFrom - 3600000, effectiveTo);
    const tapoPikkuvarastoHistory = db.getTopicHistory('tapo/pikkuvarasto/power', effectiveFrom - 3600000, effectiveTo);
    const tapoPesukoneHistory = db.getTopicHistory('tapo/pesukone/power', effectiveFrom - 3600000, effectiveTo);
    const tapoKuivausrumpuHistory = db.getTopicHistory('tapo/kuivausrumpu/power', effectiveFrom - 3600000, effectiveTo);

    const costSettings = db.getCostSettings();
    const vatMultiplier = 1 + (costSettings.vat_percent || 25.5) / 100;
    const marginCents = costSettings.margin_cents_kwh || 0.286;

    const getTransferCents = (timeMs) => {
      if (costSettings.transfer_mode === 'day_night') {
        const h = new Date(timeMs).getHours();
        const isNight = h >= 22 || h < 7;
        return isNight
          ? (costSettings.transfer_night_cents_kwh != null ? costSettings.transfer_night_cents_kwh : 3.12)
          : (costSettings.transfer_day_cents_kwh != null ? costSettings.transfer_day_cents_kwh : 5.11);
      }
      return costSettings.transfer_cents_kwh || 4.50;
    };

    const helperAvgPower = (history, start, end) => {
      if (!history || history.length === 0) return 0;
      const pts = history.filter(p => p.recorded_at >= start && p.recorded_at <= end);
      if (pts.length > 0) {
        return pts.reduce((s, p) => s + (p.value || 0), 0) / pts.length;
      }
      // Only carry forward if reading was taken within the last 5 minutes before the slot start
      const prior = history.filter(p => p.recorded_at < start);
      if (prior.length > 0) {
        const latest = prior[prior.length - 1];
        if (start - latest.recorded_at <= 5 * 60 * 1000) {
          return latest.value || 0;
        }
      }
      return 0;
    };

    // Construct 15-min aligned series
    const series = [];
    let totalHouseKwh = 0;
    let totalHeatPumpKwh = 0;
    let totalHeatingKwh = 0;
    let totalDhwKwh = 0;
    let totalTapoKwh = 0;
    let totalHouseholdOtherKwh = 0;

    let totalHeatProdKwh = 0;
    let totalDhwProdKwh = 0;

    let totalHouseCostEur = 0;
    let totalHeatPumpCostEur = 0;
    let totalTapoCostEur = 0;
    let totalHouseholdOtherCostEur = 0;
    let totalDirectElectricCostEur = 0;

    let peakHousePowerKw = 0;
    let peakHousePowerTime = null;

    for (const h of herrforsRows) {
      const slotStart = h.start_time;
      const slotEnd = h.end_time;
      const durationHours = 0.25; // 15 min

      const houseKwh = h.consumption_kwh != null ? h.consumption_kwh : 0;
      const houseKw = houseKwh * 4; // instantaneous kW average

      if (houseKw > peakHousePowerKw) {
        peakHousePowerKw = houseKw;
        peakHousePowerTime = slotStart;
      }

      const heatPowerW = helperAvgPower(heatHistory, slotStart, slotEnd);
      const dhwPowerW = helperAvgPower(dhwHistory, slotStart, slotEnd);
      const coolPowerW = helperAvgPower(coolHistory, slotStart, slotEnd);

      const heatProdW = helperAvgPower(heatProdHistory, slotStart, slotEnd);
      const dhwProdW = helperAvgPower(dhwProdHistory, slotStart, slotEnd);

      let tapoPowerW = helperAvgPower(tapoTotalHistory, slotStart, slotEnd);
      if (tapoPowerW === 0) {
        tapoPowerW = helperAvgPower(tapoIsovarastoHistory, slotStart, slotEnd) +
                     helperAvgPower(tapoPikkuvarastoHistory, slotStart, slotEnd) +
                     helperAvgPower(tapoPesukoneHistory, slotStart, slotEnd) +
                     helperAvgPower(tapoKuivausrumpuHistory, slotStart, slotEnd);
      }

      const rawHeatKwh = (heatPowerW * durationHours) / 1000;
      const rawDhwKwh = (dhwPowerW * durationHours) / 1000;
      const rawCoolKwh = (coolPowerW * durationHours) / 1000;
      const rawHpKwh = rawHeatKwh + rawDhwKwh + rawCoolKwh;

      // The heat pump is a sub-circuit inside the main house meter;
      // its consumption in any given 15-min interval cannot exceed the house meter's total consumption.
      const hpTotalKwh = Math.min(houseKwh, rawHpKwh);
      const scale = rawHpKwh > houseKwh && rawHpKwh > 0 ? houseKwh / rawHpKwh : 1;
      const heatKwh = rawHeatKwh * scale;
      const dhwKwh = rawDhwKwh * scale;

      const heatProdSlotKwh = (heatProdW * durationHours) / 1000;
      const dhwProdSlotKwh = (dhwProdW * durationHours) / 1000;
      const totalProdSlotKwh = heatProdSlotKwh + dhwProdSlotKwh;

      // Remaining house electricity after heat pump
      const otherBeforeTapo = Math.max(0, houseKwh - hpTotalKwh);
      const rawTapoKwh = (tapoPowerW * durationHours) / 1000;
      const tapoKwh = Math.min(otherBeforeTapo, rawTapoKwh);
      const otherKwh = Math.max(0, otherBeforeTapo - tapoKwh);

      // Price: use Herrfors priceWithVat if available, else spot
      const priceWithVatCents = h.price_with_vat != null
        ? h.price_with_vat
        : (h.price != null ? h.price * vatMultiplier : 5.0);

      const transferCents = getTransferCents(slotStart);
      const fullPriceCentsKwh = priceWithVatCents + marginCents + transferCents;

      const houseCostEur = houseKwh * (fullPriceCentsKwh / 100);
      const hpCostEur = hpTotalKwh * (fullPriceCentsKwh / 100);
      const tapoCostEur = tapoKwh * (fullPriceCentsKwh / 100);
      const otherCostEur = otherKwh * (fullPriceCentsKwh / 100);
      const directElecCostEur = totalProdSlotKwh * (fullPriceCentsKwh / 100);

      totalHouseKwh += houseKwh;
      totalHeatPumpKwh += hpTotalKwh;
      totalHeatingKwh += heatKwh;
      totalDhwKwh += dhwKwh;
      totalTapoKwh += tapoKwh;
      totalHouseholdOtherKwh += otherKwh;

      totalHeatProdKwh += heatProdSlotKwh;
      totalDhwProdKwh += dhwProdSlotKwh;

      totalHouseCostEur += houseCostEur;
      totalHeatPumpCostEur += hpCostEur;
      totalTapoCostEur += tapoCostEur;
      totalHouseholdOtherCostEur += otherCostEur;
      totalDirectElectricCostEur += directElecCostEur;

      series.push({
        time: slotStart,
        date_str: h.date_str,
        house_kwh: Number(houseKwh.toFixed(3)),
        heatpump_kwh: Number(hpTotalKwh.toFixed(3)),
        heating_kwh: Number(heatKwh.toFixed(3)),
        dhw_kwh: Number(dhwKwh.toFixed(3)),
        tapo_kwh: Number(tapoKwh.toFixed(3)),
        other_kwh: Number(otherKwh.toFixed(3)),
        price_cents: Number(priceWithVatCents.toFixed(2)),
        full_price_cents: Number(fullPriceCentsKwh.toFixed(2)),
        house_power_kw: Number(houseKw.toFixed(2)),
        heatpump_power_kw: Number(((hpTotalKwh * 4)).toFixed(2)),
        tapo_power_kw: Number(((tapoKwh * 4)).toFixed(2)),
        other_power_kw: Number(((otherKwh * 4)).toFixed(2)),
        temperature: h.temperature != null ? Number(Number(h.temperature).toFixed(1)) : null,
      });
    }

    const heatingSharePercent = totalHouseKwh > 0
      ? Number(((totalHeatPumpKwh / totalHouseKwh) * 100).toFixed(1))
      : 0;
    const tapoSharePercent = totalHouseKwh > 0
      ? Number(((totalTapoKwh / totalHouseKwh) * 100).toFixed(1))
      : 0;
    const otherSharePercent = totalHouseKwh > 0
      ? Number(Math.max(0, 100 - heatingSharePercent - tapoSharePercent).toFixed(1))
      : 0;

    const totalProdKwh = totalHeatProdKwh + totalDhwProdKwh;
    const overallCop = totalHeatPumpKwh > 0 ? Number((totalProdKwh / totalHeatPumpKwh).toFixed(2)) : null;
    const estimatedSavingsEur = Number(Math.max(0, totalDirectElectricCostEur - totalHeatPumpCostEur).toFixed(2));
    const avgRealizedPriceCents = totalHouseKwh > 0
      ? Number(((totalHouseCostEur / totalHouseKwh) * 100).toFixed(2))
      : 0;

    // Daily breakdown
    const dailyMap = {};
    for (const pt of series) {
      if (!dailyMap[pt.date_str]) {
        dailyMap[pt.date_str] = {
          date: pt.date_str,
          timestamp: pt.time,
          house_kwh: 0,
          heatpump_kwh: 0,
          heating_kwh: 0,
          dhw_kwh: 0,
          tapo_kwh: 0,
          other_kwh: 0,
          house_cost_eur: 0,
          heatpump_cost_eur: 0,
          tapo_cost_eur: 0,
          other_cost_eur: 0,
          slot_count: 0,
          temps: [],
        };
      }
      const d = dailyMap[pt.date_str];
      d.house_kwh += pt.house_kwh;
      d.heatpump_kwh += pt.heatpump_kwh;
      d.heating_kwh += pt.heating_kwh;
      d.dhw_kwh += pt.dhw_kwh;
      d.tapo_kwh += pt.tapo_kwh || 0;
      d.other_kwh += pt.other_kwh;
      d.house_cost_eur += pt.house_kwh * (pt.full_price_cents / 100);
      d.heatpump_cost_eur += pt.heatpump_kwh * (pt.full_price_cents / 100);
      d.tapo_cost_eur += (pt.tapo_kwh || 0) * (pt.full_price_cents / 100);
      d.other_cost_eur += pt.other_kwh * (pt.full_price_cents / 100);
      d.slot_count++;
      if (pt.temperature != null && !isNaN(pt.temperature)) {
        d.temps.push(pt.temperature);
      }
    }

    const dailyBreakdown = Object.values(dailyMap).map(d => {
      const avgTemp = d.temps.length > 0 ? Number((d.temps.reduce((a, b) => a + b, 0) / d.temps.length).toFixed(1)) : null;
      const minTemp = d.temps.length > 0 ? Number(Math.min(...d.temps).toFixed(1)) : null;
      const maxTemp = d.temps.length > 0 ? Number(Math.max(...d.temps).toFixed(1)) : null;
      const dHeatingShare = d.house_kwh > 0 ? Number(((d.heatpump_kwh / d.house_kwh) * 100).toFixed(1)) : 0;
      const dTapoShare = d.house_kwh > 0 ? Number(((d.tapo_kwh / d.house_kwh) * 100).toFixed(1)) : 0;
      const dOtherShare = d.house_kwh > 0 ? Number(Math.max(0, 100 - dHeatingShare - dTapoShare).toFixed(1)) : 0;
      return {
        date: d.date,
        timestamp: d.timestamp,
        house_kwh: Number(d.house_kwh.toFixed(2)),
        heatpump_kwh: Number(d.heatpump_kwh.toFixed(2)),
        heating_kwh: Number(d.heating_kwh.toFixed(2)),
        dhw_kwh: Number(d.dhw_kwh.toFixed(2)),
        tapo_kwh: Number(d.tapo_kwh.toFixed(2)),
        other_kwh: Number(d.other_kwh.toFixed(2)),
        house_cost_eur: Number(d.house_cost_eur.toFixed(2)),
        heatpump_cost_eur: Number(d.heatpump_cost_eur.toFixed(2)),
        tapo_cost_eur: Number(d.tapo_cost_eur.toFixed(2)),
        other_cost_eur: Number(d.other_cost_eur.toFixed(2)),
        heating_share_percent: dHeatingShare,
        tapo_share_percent: dTapoShare,
        other_share_percent: dOtherShare,
        slot_count: d.slot_count,
        avg_temp: avgTemp,
        min_temp: minTemp,
        max_temp: maxTemp,
      };
    });

    const allTemps = series.map(s => s.temperature).filter(t => t != null && !isNaN(t));
    const overallAvgTemp = allTemps.length > 0 ? Number((allTemps.reduce((a, b) => a + b, 0) / allTemps.length).toFixed(1)) : null;
    const overallMinTemp = allTemps.length > 0 ? Number(Math.min(...allTemps).toFixed(1)) : null;
    const overallMaxTemp = allTemps.length > 0 ? Number(Math.max(...allTemps).toFixed(1)) : null;

    return {
      summary: {
        total_house_kwh: Number(totalHouseKwh.toFixed(2)),
        total_heatpump_kwh: Number(totalHeatPumpKwh.toFixed(2)),
        total_heating_kwh: Number(totalHeatingKwh.toFixed(2)),
        total_dhw_kwh: Number(totalDhwKwh.toFixed(2)),
        total_tapo_kwh: Number(totalTapoKwh.toFixed(2)),
        total_other_kwh: Number(totalHouseholdOtherKwh.toFixed(2)),
        heating_share_percent: heatingSharePercent,
        tapo_share_percent: tapoSharePercent,
        other_share_percent: otherSharePercent,
        total_house_cost_eur: Number(totalHouseCostEur.toFixed(2)),
        total_heatpump_cost_eur: Number(totalHeatPumpCostEur.toFixed(2)),
        total_tapo_cost_eur: Number(totalTapoCostEur.toFixed(2)),
        total_other_cost_eur: Number(totalHouseholdOtherCostEur.toFixed(2)),
        total_other_cost_eur: Number(totalHouseholdOtherCostEur.toFixed(2)),
        avg_realized_price_cents: avgRealizedPriceCents,
        cop: overallCop,
        savings_eur: estimatedSavingsEur,
        peak_power_kw: Number(peakHousePowerKw.toFixed(2)),
        peak_power_time: peakHousePowerTime,
        readings_count: herrforsRows.length,
        avg_temp: overallAvgTemp,
        min_temp: overallMinTemp,
        max_temp: overallMaxTemp,
      },
      daily: dailyBreakdown,
      series,
      from: effectiveFrom,
      to: effectiveTo,
    };
  }

  /**
   * Get client status
   */
  getStatus() {
    const settings = this.getSettings();
    const stats = db.getHerrforsStats();
    const refreshMinutes = settings.refresh_interval_minutes || 5;
    const lastRefresh = settings.last_refresh_at || 0;
    const nextRefresh = lastRefresh ? lastRefresh + refreshMinutes * 60 * 1000 : null;

    return {
      enabled: settings.enabled,
      configured: Boolean((settings.session_token || (settings.username && settings.password)) && settings.co_id),
      auto_login_configured: Boolean(settings.username && settings.password),
      session_active: Boolean(settings.token_expires && !this.lastError),
      co_id: settings.co_id,
      token_expires: settings.token_expires,
      last_refresh_at: settings.last_refresh_at,
      last_login_at: settings.last_login_at,
      next_refresh_at: nextRefresh,
      last_sync_at: settings.last_sync_at,
      last_sync_status: settings.last_sync_status,
      last_error: this.lastError,
      is_logging_in: this.isLoggingIn,
      is_refreshing: this.isRefreshing,
      is_syncing: this.isSyncing,
      stats,
    };
  }

  /**
   * Start periodic schedulers:
   * 1. Session token refresh (every ~4.5 minutes)
   * 2. Periodic reading sync (every 15 minutes)
   */
  startScheduler() {
    const settings = this.getSettings();
    if (!settings.enabled) {
      console.log('[HERRFORS] Integraatio pois päältä (HERRFORS_ENABLED=false)');
      return;
    }

    console.log('[HERRFORS] Käynnistetään Herrfors-asiakaspalvelu ja ajastimet...');

    // 1. Initial session refresh & 7-day sync on startup
    setTimeout(async () => {
      try {
        const refRes = await this.refreshSession();
        if (refRes.ok) {
          // Sync last 7 days
          await this.syncRecentDays(7);
        }
      } catch (err) {
        console.error('[HERRFORS] Startup sync error:', err.message);
      }
    }, 3000);

    // 2. Session refresh timer (every 4.5 minutes = 270,000 ms)
    const refreshIntervalMs = Math.max(2, (settings.refresh_interval_minutes || 5) - 0.5) * 60 * 1000;
    if (this.sessionTimer) clearInterval(this.sessionTimer);
    this.sessionTimer = setInterval(() => {
      this.refreshSession().catch(err => {
        console.error('[HERRFORS] Scheduled refresh error:', err.message);
      });
    }, refreshIntervalMs);

    // 3. Periodic reading sync (every 15 minutes, fetch past 48h to catch settled meter readings)
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.syncTimer = setInterval(() => {
      this.syncRecentDays(2).catch(err => {
        console.error('[HERRFORS] Scheduled sync error:', err.message);
      });
    }, 15 * 60 * 1000);
  }

  stopScheduler() {
    if (this.sessionTimer) clearInterval(this.sessionTimer);
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.sessionTimer = null;
    this.syncTimer = null;
  }
}

const herrforsClient = new HerrforsClient();
module.exports = herrforsClient;
