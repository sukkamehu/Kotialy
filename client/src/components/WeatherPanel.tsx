import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import type { WeatherForecast, DailyWeather } from '../types/weather';

interface WeatherData {
  current: WeatherForecast | null;
  forecast: WeatherForecast[];
  daily: DailyWeather[];
  loading: boolean;
}

/*
 * met.no symbols carry a variant suffix (clearsky_day, partlycloudy_night,
 * ...). Match on the base name and pick a night glyph where it differs.
 */
const SYMBOL_EMOJI: Record<string, string> = {
  clearsky: '☀️',
  fair: '🌤',
  partlycloudy: '⛅',
  cloudy: '☁️',
  rain: '🌧',
  lightrain: '🌦',
  heavyrain: '🌧',
  rainshowers: '🌦',
  lightrainshowers: '🌦',
  heavyrainshowers: '🌧',
  sleet: '🌨',
  sleetshowers: '🌨',
  snow: '❄️',
  snowshowers: '🌨',
  lightsnow: '🌨',
  heavysnow: '❄️',
  fog: '🌫',
  thunder: '⛈',
};

const NIGHT_EMOJI: Record<string, string> = {
  clearsky: '🌙',
  fair: '🌙',
  partlycloudy: '☁️',
};

function getEmoji(symbol: string) {
  if (!symbol) return '🌡';
  const isNight = symbol.endsWith('_night');
  // Strip the variant suffix, then any "...andthunder" compound.
  const base = symbol.replace(/_(day|night|polartwilight)$/, '');

  if (isNight && NIGHT_EMOJI[base]) return NIGHT_EMOJI[base];
  if (SYMBOL_EMOJI[base]) return SYMBOL_EMOJI[base];
  if (base.includes('thunder')) return '⛈';
  if (base.includes('snow')) return '❄️';
  if (base.includes('sleet')) return '🌨';
  if (base.includes('rain')) return '🌧';
  if (base.includes('cloud')) return '☁️';
  return '🌡';
}

function formatTemp(t: number) {
  return `${Math.round(t)}`;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
}

/** Match the outdoor-temperature colour scale used elsewhere on the dashboard. */
function tempColor(t: number) {
  if (t < 0) return '#38bdf8';
  if (t < 10) return 'var(--cool-primary)';
  if (t < 20) return '#34d399';
  if (t < 30) return 'var(--heat-primary)';
  return '#f87171';
}

export function WeatherPanel() {
  const [data, setData] = useState<WeatherData>({
    current: null,
    forecast: [],
    daily: [],
    loading: true,
  });

  const fetchAll = async () => {
    try {
      const [currentRes, forecastRes, dailyRes] = await Promise.all([
        apiFetch('/api/weather/current'),
        apiFetch('/api/weather/forecast?hours=24'),
        apiFetch('/api/weather/daily'),
      ]);
      const current = await currentRes.json();
      const forecastData = await forecastRes.json();
      const daily = await dailyRes.json();
      setData({
        current: current.message ? null : current,
        forecast: forecastData.forecast || [],
        daily: daily.days || [],
        loading: false,
      });
    } catch (err) {
      console.error('Weather fetch failed', err);
      // Clear the loading flag too, or the panel is stuck on "Loading..."
      setData((prev) => ({ ...prev, loading: false }));
    }
  };

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 10 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const current = data.current;

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-icon">{current ? getEmoji(current.symbol || '') : '🌤'}</span>
        <span className="card-title">Sää · Järvenpää</span>
        {current && (
          <div className="badge badge-cool" style={{ marginLeft: 'auto' }}>
            {formatTemp(current.temperature)}°C
          </div>
        )}
      </div>

      <div className="card-body">
        {data.loading ? (
          <p className="no-data">Ladataan säätietoja…</p>
        ) : (
          <>
            {/* Current conditions */}
            {current ? (
              <>
                <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                  <span style={{ fontSize: 48, lineHeight: 1, flexShrink: 0 }}>
                    {getEmoji(current.symbol || '')}
                  </span>
                  <div className="metric">
                    <span className="metric-label">Ulkolämpötila nyt</span>
                    <span
                      className="metric-value"
                      style={{ fontSize: 34, color: tempColor(current.temperature) }}
                    >
                      {formatTemp(current.temperature)}
                      <span className="metric-unit" style={{ fontSize: 16 }}>°C</span>
                    </span>
                  </div>
                </div>

                <div className="metrics-grid metrics-grid-3" style={{ marginTop: 16 }}>
                  <div className="metric metric-sm">
                    <span className="metric-label">Tuntuu kuin</span>
                    <span className="metric-value">
                      {current.feels_like != null ? formatTemp(current.feels_like) : '—'}
                      <span className="metric-unit">°C</span>
                    </span>
                  </div>
                  <div className="metric metric-sm">
                    <span className="metric-label">Tuuli</span>
                    <span className="metric-value">
                      {current.wind_speed != null ? current.wind_speed.toFixed(1) : '—'}
                      <span className="metric-unit">m/s</span>
                    </span>
                  </div>
                  <div className="metric metric-sm">
                    <span className="metric-label">Kosteus</span>
                    <span className="metric-value">
                      {current.humidity != null ? Math.round(current.humidity) : '—'}
                      <span className="metric-unit">%</span>
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <p className="no-data">Ei havaintotietoja</p>
            )}

            <div className="divider" />

            {/* Hourly */}
            <div className="section-label" style={{ marginBottom: 10 }}>Seuraavat tunnit</div>
            {data.forecast.length === 0 ? (
              <p className="no-data">Ei vielä ennustetta</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <div style={{ display: 'flex', gap: 8, minWidth: 'min-content' }}>
                  {data.forecast.slice(0, 12).map((f) => (
                    <div
                      key={f.time}
                      className="metric-box"
                      style={{ flex: '0 0 64px', textAlign: 'center', padding: 'var(--space-2)' }}
                    >
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{formatTime(f.time)}</div>
                      <div style={{ fontSize: 20, margin: '2px 0' }}>{getEmoji(f.symbol || '')}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: tempColor(f.temperature) }}>
                        {formatTemp(f.temperature)}°
                      </div>
                      {f.rain_mm > 0 && (
                        <div style={{ fontSize: 10, color: 'var(--cool-primary)' }}>{f.rain_mm} mm</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="divider" />

            {/* Daily */}
            <div className="section-label" style={{ marginBottom: 10 }}>Seuraavat päivät</div>
            {data.daily.length === 0 ? (
              <p className="no-data">Ei vielä päiväennustetta</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 8 }}>
                {data.daily.slice(0, 5).map((d) => {
                  const symbols = [...new Set(d.symbols?.split(',') || [])].filter(Boolean);
                  return (
                    <div key={d.day} className="metric-box" style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{d.day}</div>
                      <div style={{ fontSize: 22, margin: '2px 0' }}>{getEmoji(symbols[0] || '')}</div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        <span style={{ color: 'var(--heat-primary)' }}>{Math.round(d.maxTemp)}°</span>
                        <span style={{ color: 'var(--text-muted)' }}> / </span>
                        <span style={{ color: 'var(--cool-primary)' }}>{Math.round(d.minTemp)}°</span>
                      </div>
                      {d.avgRain > 0 && (
                        <div style={{ fontSize: 10, color: 'var(--cool-primary)' }}>{d.avgRain.toFixed(1)} mm</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
