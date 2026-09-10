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

function fmtCents(price: number) {
  return `${(price / 10).toFixed(1)} c/kWh`;
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
}

function fmtDateTime(ts: number) {
  return new Date(ts).toLocaleString('fi-FI', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

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

  const currentLevel = useMemo(() => {
    if (currentPrice == null || !todayMinMax) return 'unknown';
    const range = todayMinMax.max - todayMinMax.min;
    if (range === 0) return 'avg';
    const pct = (currentPrice - todayMinMax.min) / range;
    if (pct < 0.33) return 'cheap';
    if (pct > 0.66) return 'expensive';
    return 'avg';
  }, [currentPrice, todayMinMax]);

  if (data.loading) {
    return (
      <div className="card">
        <h3>⚡ Nordpool FI</h3>
        <p>Loading prices...</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h3>⚡ Nordpool FI — 15 min spot</h3>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div className="metric-box" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Now</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: currentLevel === 'cheap' ? 'var(--success)' : currentLevel === 'expensive' ? 'var(--danger)' : 'inherit' }}>
            {currentPrice != null ? fmtCents(currentPrice) : '—'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {currentLevel === 'cheap' ? 'Cheap' : currentLevel === 'expensive' ? 'Expensive' : 'Average'}
          </div>
        </div>

        {todayMinMax && (
          <>
            <div className="metric-box" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Today min</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{fmtCents(todayMinMax.min)}</div>
            </div>
            <div className="metric-box" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Today avg</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{fmtCents(todayMinMax.avg)}</div>
            </div>
            <div className="metric-box" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Today max</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{fmtCents(todayMinMax.max)}</div>
            </div>
          </>
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        <h4 style={{ fontSize: 14, marginBottom: 8 }}>🎯 Cheapest windows (from now)</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="metric-box">
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Cheapest 3h</div>
            {data.cheapest3h?.quarters ? (
              <>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{fmtCents(data.cheapest3h.avgPrice)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {fmtDateTime(data.cheapest3h.start)} – {fmtTime(data.cheapest3h.end)}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13 }}>No data</div>
            )}
          </div>
          <div className="metric-box">
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Cheapest 6h</div>
            {data.cheapest6h?.quarters ? (
              <>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{fmtCents(data.cheapest6h.avgPrice)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {fmtDateTime(data.cheapest6h.start)} – {fmtTime(data.cheapest6h.end)}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13 }}>No data</div>
            )}
          </div>
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h4 style={{ fontSize: 14, margin: 0 }}>📊 Next 24 h</h4>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showWeather}
              onChange={(e) => setShowWeather(e.target.checked)}
            />
            Overlay weather (°C)
          </label>
        </div>
        <PriceChart prices={data.prices} weather={showWeather ? data.weather : []} />
      </div>
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
  }, [weather, prices, barWidth]);

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
  if (!prices.length) return <div style={{ fontSize: 13 }}>No price data</div>;

  return (
    <div style={{ overflowX: 'auto', marginTop: 8 }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', minWidth: 600, height: 200 }}>
        {prices.map((p, i) => {
          const h = ((p.price - min) / range) * (height - 20) + 5;
          const isPast = p.end_time < Date.now();
          const color = p.price === min ? 'var(--success)' : p.price === max ? 'var(--danger)' : isPast ? 'var(--text-muted)' : 'var(--primary)';
          return (
            <rect
              key={p.start_time}
              x={i * barWidth + 1}
              y={height - h}
              width={barWidth - 2}
              height={h}
              fill={color}
              opacity={isPast ? 0.4 : 0.9}
            />
          );
        })}
        {tempLine && (
          <>
            <polyline
              fill="none"
              stroke="#f59e0b"
              strokeWidth={3}
              points={tempLine}
            />
            <text x={width - 120} y={25} fill="#f59e0b" fontSize={12} fontWeight={600}>
              Temperature °C
            </text>
          </>
        )}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
        <span>{fmtDateTime(prices[0].start_time)}</span>
        <span>{fmtDateTime(prices[prices.length - 1].end_time)}</span>
      </div>
    </div>
  );
}
