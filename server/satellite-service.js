/**
 * Satellite Tracking & Weather Satellite Imagery Service
 * 
 * Provides orbital propagation & pass predictions for weather satellites
 * (NOAA-15, NOAA-18, NOAA-19, Meteor-M2-3, Meteor-M2-4) over Southern Finland,
 * plus proxying of live Nordic satellite & radar imagery (EUMETSAT & FMI).
 */

const satellite = require('satellite.js');

// Observer coordinates (Järvenpää / Southern Finland)
const OBSERVER_CONFIG = {
  name: 'Kotiäly (Etelä-Suomi)',
  latitude: 60.47,   // degrees N
  longitude: 25.09,  // degrees E
  altitudeKm: 0.05,  // 50m above sea level
};

// Monitored Weather Satellites
const SATELLITE_CATALOG = [
  {
    name: 'NOAA 19',
    noradId: 33591,
    frequency: '137.100 MHz',
    mode: 'APT (FM)',
    status: 'Aktiivinen',
    description: 'Viimeisin operatiivinen NOAA POES -sääsatelliitti. Lähettää analogista APT-kuvaa 137.100 MHz.',
    fallbackTle: [
      '1 33591U 09005A   26305.30530625  .00000010  00000+0  28978-4 0  9993',
      '2 33591  98.9388  16.1811 0013750   6.7700 353.3656 14.13491734913856',
    ],
  },
  {
    name: 'NOAA 18',
    noradId: 28654,
    frequency: '137.9125 MHz',
    mode: 'APT (FM)',
    status: 'Aktiivinen',
    description: 'Operatiivinen NOAA POES -satelliitti. Lähettää analogista APT-kuvaa 137.9125 MHz.',
    fallbackTle: [
      '1 28654U 05018A   26305.28185671  .00000042  00000+0  45160-4 0  9998',
      '2 28654  98.8019  22.8998 0015195 119.7077 240.5610 14.13751213105689',
    ],
  },
  {
    name: 'NOAA 15',
    noradId: 25338,
    frequency: '137.620 MHz',
    mode: 'APT (FM)',
    status: 'Osittain heikentynyt',
    description: 'Vanhin toimiva NOAA-satelliitti (1998). Lähettää 137.620 MHz, mutta AM-lähetinteho voi vaihdella.',
    fallbackTle: [
      '1 25338U 98030A   26305.31905609  .00000045  00000+0  35772-4 0  9996',
      '2 25338  98.5013 322.2166 0009311 309.5614  50.4744 14.27179680480857',
    ],
  },
  {
    name: 'METEOR-M2 3',
    noradId: 57166,
    frequency: '137.900 MHz',
    mode: 'LRPT (QPSK)',
    status: 'Aktiivinen',
    description: 'Venäläinen moderni digitaalinen polaariratasatelliitti (LRPT 72k/80k QPSK, korkea resoluutio).',
    fallbackTle: [
      '1 57166U 23091A   26305.25001294 -.00000024  00000+0  82011-5 0  9992',
      '2 57166  98.5918 357.3037 0004889 124.0054 236.1590 14.24055351174020',
    ],
  },
  {
    name: 'METEOR-M2 4',
    noradId: 59051,
    frequency: '137.100 MHz',
    mode: 'LRPT (QPSK)',
    status: 'Aktiivinen',
    description: 'Uusin Meteor-sarjan sääsatelliitti (laukaistu 2024). Lähettää digitaalista LRPT-dataa 137.100 MHz.',
    fallbackTle: [
      '1 59051U 24039A   26305.27936940  .00000002  00000+0  20834-4 0  9996',
      '2 59051  98.7220 262.9726 0007819 127.5468 232.6422 14.22441703138755',
    ],
  },
];

// In-memory TLE store
const tleData = {};
let lastTleFetch = 0;
const TLE_CACHE_TTL_MS = 24 * 3600 * 1000; // 24 hours

// In-memory pass cache
let cachedPasses = null;
let lastPassCalc = 0;
const PASS_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// Image proxy cache
const imageCache = new Map();
const IMAGE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Initialize TLE data from fallbacks
 */
function initTleStore() {
  for (const sat of SATELLITE_CATALOG) {
    tleData[sat.noradId] = {
      name: sat.name,
      line1: sat.fallbackTle[0],
      line2: sat.fallbackTle[1],
      updatedAt: Date.now(),
    };
  }
}

/**
 * Update TLEs from Celestrak
 */
async function refreshTlesFromCelestrak() {
  const now = Date.now();
  if (now - lastTleFetch < TLE_CACHE_TTL_MS && Object.keys(tleData).length >= SATELLITE_CATALOG.length) {
    return;
  }

  try {
    const urls = [
      'https://celestrak.org/NORAD/elements/gp.php?NAME=NOAA&FORMAT=tle',
      'https://celestrak.org/NORAD/elements/gp.php?NAME=METEOR&FORMAT=tle',
    ];

    for (const url of urls) {
      const res = await fetch(url, { headers: { 'User-Agent': 'Kotialy-SDR/1.0' } });
      if (!res.ok) continue;
      const text = await res.text();
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

      for (let i = 0; i < lines.length - 2; i += 3) {
        const satName = lines[i];
        const line1 = lines[i + 1];
        const line2 = lines[i + 2];

        if (!line1?.startsWith('1 ') || !line2?.startsWith('2 ')) continue;
        const noradId = parseInt(line1.substring(2, 7).trim(), 10);

        const match = SATELLITE_CATALOG.find((s) => s.noradId === noradId);
        if (match) {
          tleData[noradId] = {
            name: match.name,
            line1,
            line2,
            updatedAt: now,
          };
        }
      }
    }
    lastTleFetch = now;
    // Invalidate pass cache when new TLEs arrive
    cachedPasses = null;
  } catch (err) {
    console.warn('[satellite] Failed to refresh TLEs from Celestrak, using fallbacks:', err.message);
  }
}

/**
 * Format azimuth degrees to 16-point compass direction
 */
function degreesToCompass(deg) {
  const directions = [
    'Pohjoinen (N)', 'Pohjois-koillinen (NNE)', 'Koillinen (NE)', 'Itä-koillinen (ENE)',
    'Itä (E)', 'Itä-kaakko (ESE)', 'Kaakko (SE)', 'Etelä-kaakko (SSE)',
    'Etelä (S)', 'Etelä-lounas (SSW)', 'Lounas (SW)', 'Länsi-lounas (WSW)',
    'Länsi (W)', 'Länsi-luode (WNW)', 'Luode (NW)', 'Pohjois-luode (NNW)'
  ];
  const idx = Math.round(((deg % 360) / 22.5)) % 16;
  return directions[idx];
}

function shortCompass(deg) {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const idx = Math.round(((deg % 360) / 22.5)) % 16;
  return directions[idx];
}

/**
 * Calculate upcoming passes for all monitored satellites over the next 48 hours
 */
function calculatePasses(hoursAhead = 48) {
  const now = Date.now();
  if (cachedPasses && now - lastPassCalc < PASS_CACHE_TTL_MS) {
    return cachedPasses;
  }

  const obs = {
    longitude: satellite.degreesToRadians(OBSERVER_CONFIG.longitude),
    latitude: satellite.degreesToRadians(OBSERVER_CONFIG.latitude),
    height: OBSERVER_CONFIG.altitudeKm,
  };

  const passes = [];
  const endTime = now + hoursAhead * 3600 * 1000;
  const timeStepMs = 60 * 1000; // 1 minute resolution for pass detection
  const minElevationDeg = 10; // Only consider passes above 10 degrees

  for (const satMeta of SATELLITE_CATALOG) {
    const tle = tleData[satMeta.noradId];
    if (!tle) continue;

    let satrec;
    try {
      satrec = satellite.twoline2satrec(tle.line1, tle.line2);
    } catch {
      continue;
    }

    let inPass = false;
    let currentPass = null;

    for (let t = now - 15 * 60 * 1000; t < endTime; t += timeStepMs) {
      const d = new Date(t);
      const posVel = satellite.propagate(satrec, d);
      if (!posVel || !posVel.position) continue;

      const gmst = satellite.gstime(d);
      const lookAngles = satellite.ecfToLookAngles(obs, satellite.eciToEcf(posVel.position, gmst));
      const elDeg = satellite.radiansToDegrees(lookAngles.elevation);
      const azDeg = (satellite.radiansToDegrees(lookAngles.azimuth) + 360) % 360;

      if (elDeg >= minElevationDeg) {
        if (!inPass) {
          inPass = true;
          currentPass = {
            satellite: satMeta.name,
            noradId: satMeta.noradId,
            frequency: satMeta.frequency,
            mode: satMeta.mode,
            description: satMeta.description,
            aos: t,
            azAos: azDeg,
            maxElevation: elDeg,
            maxElTime: t,
            azMax: azDeg,
            los: t,
            azLos: azDeg,
          };
        } else {
          if (elDeg > currentPass.maxElevation) {
            currentPass.maxElevation = elDeg;
            currentPass.maxElTime = t;
            currentPass.azMax = azDeg;
          }
          currentPass.los = t;
          currentPass.azLos = azDeg;
        }
      } else {
        if (inPass && currentPass) {
          inPass = false;
          // Filter out very short glances
          const durationMin = (currentPass.los - currentPass.aos) / 60000;
          if (durationMin >= 4) {
            // Quality rating
            let quality = 'marginal';
            let qualityLabel = 'Kohtalainen';
            if (currentPass.maxElevation >= 45) {
              quality = 'excellent';
              qualityLabel = 'Erinomainen';
            } else if (currentPass.maxElevation >= 25) {
              quality = 'good';
              qualityLabel = 'Hyvä';
            }

            passes.push({
              ...currentPass,
              durationMin: Math.round(durationMin),
              maxElevation: Math.round(currentPass.maxElevation * 10) / 10,
              quality,
              qualityLabel,
              trajectory: `${shortCompass(currentPass.azAos)} → ${shortCompass(currentPass.azMax)} → ${shortCompass(currentPass.azLos)}`,
              azAosCompass: degreesToCompass(currentPass.azAos),
              azMaxCompass: degreesToCompass(currentPass.azMax),
              azLosCompass: degreesToCompass(currentPass.azLos),
            });
          }
          currentPass = null;
        }
      }
    }
  }

  // Sort chronologically by AOS
  passes.sort((a, b) => a.aos - b.aos);

  cachedPasses = passes;
  lastPassCalc = now;
  return passes;
}

/**
 * Get current overhead satellite if any
 */
function getCurrentOverheadPass() {
  const passes = calculatePasses(12);
  const now = Date.now();
  return passes.find((p) => now >= p.aos && now <= p.los) || null;
}

/**
 * Available satellite and radar image feeds
 */
const SATELLITE_IMAGE_FEEDS = {
  eumetsat_ir: {
    id: 'eumetsat_ir',
    title: 'EUMETSAT Infrapuna (IR 10.8 µm)',
    description: 'Euroopan sääsatelliitin reaaliaikainen lämpökamerakuva. Näyttää pilvet ja lämpötilat 24/7 (myös yöllä).',
    source: 'EUMETSAT EUMETView WMS',
    type: 'satellite_ir',
    url: 'https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetMap&layers=msg_fes:ir108,backgrounds:ne_10m_coastline,backgrounds:ne_boundary_lines_land&bbox=500000,7000000,3000000,11000000&width=900&height=1100&srs=EPSG:3857&styles=&format=image/png',
  },
  eumetsat_natural: {
    id: 'eumetsat_natural',
    title: 'EUMETSAT Natural Colour (RGB)',
    description: 'Päivänvalon RGB-satelliittikuva. Pilvet erottuvat valkoisina, maa vihreänä/ruskeana ja meri sinisenä.',
    source: 'EUMETSAT EUMETView WMS',
    type: 'satellite_rgb',
    url: 'https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetMap&layers=msg_fes:rgb_natural,backgrounds:ne_10m_coastline,backgrounds:ne_boundary_lines_land&bbox=500000,7000000,3000000,11000000&width=900&height=1100&srs=EPSG:3857&styles=&format=image/png',
  },
  fmi_radar: {
    id: 'fmi_radar',
    title: 'Ilmatieteen laitos (FMI) Sade- ja Tutkakomposiitti',
    description: 'Koko Suomen kattava säätutkakomposiitti ja sadealueet reaaliajassa Ilmatieteen laitoksen tutkaverkosta.',
    source: 'Ilmatieteen laitos (FMI Open WMS)',
    type: 'radar',
    url: 'http://openwms.fmi.fi/geoserver/wms?service=WMS&version=1.3.0&request=GetMap&layers=Basemaps:naturalearthgray,Radar:radar_finland_cappi_dbzh&styles=&bbox=19.0,59.0,32.0,70.5&width=800&height=1100&crs=CRS:84&format=image/png',
  },
};

/**
 * Proxy and cache remote satellite imagery to avoid CORS issues and reduce bandwidth
 */
async function fetchAndCacheImage(feedId) {
  const feed = SATELLITE_IMAGE_FEEDS[feedId];
  if (!feed) return null;

  const cached = imageCache.get(feedId);
  const now = Date.now();
  if (cached && now - cached.ts < IMAGE_CACHE_TTL_MS) {
    return cached;
  }

  try {
    const res = await fetch(feed.url, {
      headers: {
        'User-Agent': 'Kotialy/1.0 (Home Automation Weather Radar)',
        Accept: 'image/png,image/*,*/*',
      },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    const contentType = res.headers.get('content-type') || 'image/png';
    const buffer = await res.arrayBuffer();
    const data = Buffer.from(buffer);

    const entry = {
      data,
      contentType,
      ts: now,
      feedId,
      feedTitle: feed.title,
    };

    imageCache.set(feedId, entry);
    return entry;
  } catch (err) {
    console.error(`[satellite] Error fetching image feed ${feedId}:`, err.message);
    // Return stale cache if available
    if (cached) return cached;
    return null;
  }
}

// Initial setup
initTleStore();
refreshTlesFromCelestrak().catch(() => {});

module.exports = {
  OBSERVER_CONFIG,
  SATELLITE_CATALOG,
  calculatePasses,
  getCurrentOverheadPass,
  SATELLITE_IMAGE_FEEDS,
  fetchAndCacheImage,
  refreshTlesFromCelestrak,
};
