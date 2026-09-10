import { useEffect, useState } from 'react';
import type { WeatherForecast, DailyWeather } from '../types/weather';

interface WeatherData {
  current: WeatherForecast | null;
  forecast: WeatherForecast[];
  daily: DailyWeather[];
  loading: boolean;
}

const SYMBOL_EMOJI: Record<string, string> = {
  clearsky: '☀️',
  fair: '🌤',
  partlycloudy: '⛅',
  cloudy: '☁️',
  rain: '🌧',
  lightrain: '🌦',
  rainshowers: '🌦',
  heavyrain: '🌧',
  sleet: '🌨',
  snow: '❄️',
  snowshowers: '🌨',
  fog: '🌫',
  thunder: '⛈',
};

function getEmoji(symbol: string) {
  return SYMBOL_EMOJI[symbol] || '🌡';
}

function formatTemp(t: number) {
  return `${Math.round(t)}°`;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
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
        fetch('/api/weather/current'),
        fetch('/api/weather/forecast?hours=24'),
        fetch('/api/weather/daily'),
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

  if (data.loading) {
    return (
      <div className="card">
        <h3>🌤 Järvenpää Nummenkylä</h3>
        <p>Loading weather...</p>
      </div>
    );
  }

  const current = data.current;

  return (
    <div className="card">
      <h3>🌤 Järvenpää Nummenkylä</h3>

      {current && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 48 }}>{getEmoji(current.symbol || '')}</div>
          <div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{formatTemp(current.temperature)}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Feels like {current.feels_like != null ? formatTemp(current.feels_like) : '—'} ·
              Wind {current.wind_speed} m/s · Humidity {Math.round(current.humidity)}%
            </div>
          </div>
        </div>
      )}

      <h4 style={{ fontSize: 14, marginBottom: 8 }}>Next 24 hours</h4>
      <div style={{ overflowX: 'auto', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, minWidth: 700 }}>
          {data.forecast.slice(0, 12).map((f) => (
            <div key={f.time} style={{ flex: '0 0 60px', textAlign: 'center', padding: 8, background: 'var(--bg)', borderRadius: 6 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatTime(f.time)}</div>
              <div style={{ fontSize: 20 }}>{getEmoji(f.symbol || '')}</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{formatTemp(f.temperature)}</div>
              {f.rain_mm > 0 && <div style={{ fontSize: 10, color: 'var(--primary)' }}>{f.rain_mm} mm</div>}
            </div>
          ))}
        </div>
      </div>

      <h4 style={{ fontSize: 14, marginBottom: 8 }}>Next days</h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8 }}>
        {data.daily.slice(0, 5).map((d) => {
          const symbols = [...new Set(d.symbols?.split(',') || [])].filter(Boolean);
          return (
            <div key={d.day} className="metric-box" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{d.day}</div>
              <div style={{ fontSize: 22 }}>{getEmoji(symbols[0] || '')}</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {Math.round(d.maxTemp)}° / {Math.round(d.minTemp)}°
              </div>
              {d.avgRain > 0 && <div style={{ fontSize: 10, color: 'var(--primary)' }}>{d.avgRain.toFixed(1)} mm</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
