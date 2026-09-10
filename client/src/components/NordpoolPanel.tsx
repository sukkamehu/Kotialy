import { useEffect, useMemo, useState } from 'react';
import type { NordpoolPrice, NordpoolStats, NordpoolWindow } from '../types/nordpool';
import type { WeatherForecast } from '../types/weather';

interface NordpoolData {
  current: (NordpoolPrice & { rank?: number }) | null;
  stats: NordpoolStats | null;
  cheapest3h: NordpoolWindow | null;
  cheapest6h: NordpoolWindow | null;
  prices: NordpoolPrice[];
  weather: WeatherForecast[];
  loading: boolean;
}

/** Prices arrive as €/MWh; the dashboard shows c/kWh. */
function cents(price: number) {
  return (price / 10).toFixed(1);
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
}

function fmtDateTime(ts: number) {
  return new Date(ts).toLocaleString('fi-FI', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

const LEVEL_META = {
  cheap:     { badge: 'badge-cheap',     label: 'Cheap',     color: 'var(--online)' },
  avg:       { badge: 'badge-off',       label: 'Average',   color: 'var(--text-primary)' },
  expensive: { badge: 'badge-expensive', label: 'Expensive', color: 'var(--offline)' },
  unknown:   { badge: 'badge-off',       label: 'No data',   color: 'var(--text-muted)' },
} as const;

type Level = keyof typeof LEVEL_META;

export function NordpoolPanel() {
  const [data, setData] = useState<NordpoolData>({
    current: null,
    stats: null,
    cheapest3h: null,
    cheapest6h: null,
    prices: [],
    weather: [],
    loading: true,
  });
  const [showWeather, setShowWeather] = useState(false);

  const fetchAll = async () => {
    try {
      const [curRes, statsRes, cheap3Res, cheap6Res, pricesRes, weatherRes] = await Promise.all([
        fetch('/api/nordpool/current'),
        fetch('/api/nordpool/stats'),
        fetch('/api/nordpool/cheapest?hours=3'),
        fetch('/api/nordpool/cheapest?hours=6'),
        fetch('/api/nordpool/prices'),
        fetch('/api/weather/forecast?hours=24'),
      ]);

      const current = await curRes.json();
      const stats = await statsRes.json();
      const cheapest3h = await cheap3Res.json();
      const cheapest6h = await cheap6Res.json();
      const pricesData = await pricesRes.json();
      const weatherData = await weatherRes.json();

      setData({
        current,
        stats,
        cheapest3h,
        cheapest6h,
        prices: pricesData.prices || [],
        weather: weatherData.forecast || [],
        loading: false,
      });
    } catch (err) {
      console.error('Nordpool fetch failed', err);
      // Clear the loading flag too, or the panel is stuck on "Loading..."
      setData((prev) => ({ ...prev, loading: false }));
    }
  };

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 60_000);
    return () => clearInterval(id);
  }, []);

  const todayMinMax = useMemo(() => {
    if (!data.stats || !data.stats.count) return null;
    return { min: data.stats.min, max: data.stats.max, avg: data.stats.avg };
  }, [data.stats]);

  const currentPrice = data.current?.price ?? null;

  const currentLevel: Level = useMemo(() => {
    if (currentPrice == null || !todayMinMax) return 'unknown';
    const range = todayMinMax.max - todayMinMax.min;
    if (range === 0) return 'avg';
    const pct = (currentPrice - todayMinMax.min) / range;
    if (pct < 0.33) return 'cheap';
    if (pct > 0.66) return 'expensive';
    return 'avg';
  }, [currentPrice, todayMinMax]);

  const level = LEVEL_META[currentLevel];

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-icon">⚡</span>
        <span className="card-title">Electricity Price · FI</span>
        {!data.loading && currentLevel !== 'unknown' && (
          <div className={`badge ${level.badge}`} style={{ marginLeft: 'auto' }}>
            {level.label}
          </div>
        )}
      </div>

      <div className="card-body">
        {data.loading ? (
          <p className="no-data">Loading prices…</p>
        ) : (
          <>
            {/* Now / today's range */}
            <div className="metrics-grid metrics-grid-4">
              <div className="metric metric-sm">
                <span className="metric-label">Now</span>
                <span className="metric-value" style={{ color: level.color }}>
                  {currentPrice != null ? cents(currentPrice) : '—'}
                  <span className="metric-unit">c/kWh</span>
                </span>
              </div>
              <div className="metric metric-sm">
                <span className="metric-label">Today min</span>
                <span className="metric-value" style={{ color: 'var(--online)' }}>
                  {todayMinMax ? cents(todayMinMax.min) : '—'}
                  <span className="metric-unit">c/kWh</span>
                </span>
              </div>
              <div className="metric metric-sm">
                <span className="metric-label">Today avg</span>
                <span className="metric-value">
                  {todayMinMax ? cents(todayMinMax.avg) : '—'}
                  <span className="metric-unit">c/kWh</span>
                </span>
              </div>
              <div className="metric metric-sm">
                <span className="metric-label">Today max</span>
                <span className="metric-value" style={{ color: 'var(--offline)' }}>
                  {todayMinMax ? cents(todayMinMax.max) : '—'}
                  <span className="metric-unit">c/kWh</span>
                </span>
              </div>
            </div>

            <div className="divider" />

            {/* Cheapest windows */}
            <div className="section-label" style={{ marginBottom: 8 }}>
              🎯 Cheapest windows from now
            </div>
            <div className="metrics-grid metrics-grid-2">
              <CheapestWindow label="Next 3 h" window={data.cheapest3h} />
              <CheapestWindow label="Next 6 h" window={data.cheapest6h} />
            </div>

            <div className="divider" />

            {/* Forecast chart */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span className="section-label">📊 Next 24 h</span>
              <div className="toggle-group" style={{ width: 'auto' }}>
                <button
                  className={`toggle-btn ${!showWeather ? 'active' : ''}`}
                  onClick={() => setShowWeather(false)}
                  id="btn-price-only"
                  style={{ fontSize: 11, padding: '3px 10px' }}
                >
                  Price
                </button>
                <button
                  className={`toggle-btn ${showWeather ? 'active' : ''}`}
                  onClick={() => setShowWeather(true)}
                  id="btn-price-weather"
                  style={{ fontSize: 11, padding: '3px 10px' }}
                >
                  + Weather
                </button>
              </div>
            </div>

            <PriceChart prices={data.prices} weather={showWeather ? data.weather : []} />
          </>
        )}
      </div>
    </div>
  );
}

function CheapestWindow({ label, window }: { label: string; window: NordpoolWindow | null }) {
  return (
    <div className="metric-box">
      <span className="metric-label">{label}</span>
      {window?.quarters ? (
        <>
          <span className="metric-value" style={{ color: 'var(--online)' }}>
            {cents(window.avgPrice)}
            <span className="metric-unit">c/kWh</span>
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {fmtDateTime(window.start)} – {fmtTime(window.end)}
          </span>
        </>
      ) : (
        <span className="metric-value" style={{ color: 'var(--text-muted)' }}>—</span>
      )}
    </div>
  );
}

function PriceChart({ prices, weather }: { prices: NordpoolPrice[]; weather: WeatherForecast[] }) {
  const values = prices.map((p) => p.price);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const range = max - min || 1;
  const width = 1000;
  const height = 200;
  const barWidth = prices.length ? width / prices.length : width;

  // Map each price x to nearest weather point within 30 min
  const weatherPoints = useMemo(() => {
    if (!weather.length) return [];
    return prices.map((p) => {
      const nearest = weather.reduce((best, w) => {
        const dist = Math.abs(w.time - p.start_time);
        const bestDist = Math.abs(best.time - p.start_time);
        return dist < bestDist ? w : best;
      }, weather[0]);
      if (Math.abs(nearest.time - p.start_time) > 30 * 60 * 1000) return null;
      return nearest;
    });
  }, [weather, prices]);

  const tempLine = useMemo(() => {
    if (!weatherPoints.length) return '';
    const temps = weatherPoints.filter(Boolean).map((w) => w!.temperature);
    const minTemp = Math.min(...temps);
    const maxTemp = Math.max(...temps);
    const tempRange = maxTemp - minTemp || 1;
    const points = weatherPoints.map((w, i) => {
      if (!w) return null;
      const x = i * barWidth + barWidth / 2;
      // Map temp to top 60% of chart area (reserve bottom for bars)
      const y = 20 + ((maxTemp - w.temperature) / tempRange) * (height * 0.5);
      return `${x},${y}`;
    }).filter(Boolean);
    return points.join(' ');
  }, [weatherPoints, barWidth]);

  // Must come after every hook — an early return above would change the hook
  // count between renders once prices arrive, which crashes React.
  if (!prices.length) return <p className="no-data">No price data yet</p>;

  const now = Date.now();

  return (
    <div className="chart-container" style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', minWidth: 600, height: 200 }}>
        {prices.map((p, i) => {
          const h = ((p.price - min) / range) * (height - 20) + 5;
          const isPast = p.end_time < now;
          const color = p.price === min ? 'var(--online)'
            : p.price === max ? 'var(--offline)'
            : 'var(--cool-primary)';
          return (
            <rect
              key={p.start_time}
              x={i * barWidth + 1}
              y={height - h}
              width={Math.max(barWidth - 2, 0.5)}
              height={h}
              rx={1.5}
              fill={color}
              opacity={isPast ? 0.25 : 0.9}
            />
          );
        })}
        {tempLine && (
          <>
            <polyline
              fill="none"
              stroke="var(--heat-primary)"
              strokeWidth={2.5}
              strokeLinejoin="round"
              points={tempLine}
            />
            <text x={width - 110} y={22} fill="var(--heat-primary)" fontSize={11} fontWeight={600}>
              Temperature °C
            </text>
          </>
        )}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          {fmtDateTime(prices[0].start_time)}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          {fmtDateTime(prices[prices.length - 1].end_time)}
        </span>
      </div>
    </div>
  );
}
