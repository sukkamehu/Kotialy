import { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ReferenceLine,
  Cell,
} from 'recharts';
import { apiFetch } from '../lib/api';
import type { NordpoolPrice, NordpoolStats, NordpoolWindow } from '../types/nordpool';
import type { WeatherForecast } from '../types/weather';
import type { ApcPlanSlot, ApcStatus } from '../types/apc';

interface UnifiedForecastCardProps {
  onOpenApc?: () => void;
}

interface UnifiedData {
  currentPrice: (NordpoolPrice & { rank?: number }) | null;
  stats: NordpoolStats | null;
  cheapest3h: NordpoolWindow | null;
  cheapest6h: NordpoolWindow | null;
  prices: NordpoolPrice[];
  weather: WeatherForecast[];
  currentWeather: WeatherForecast | null;
  apcPlan: ApcPlanSlot[];
  apcStatus: ApcStatus | null;
  loading: boolean;
}

const SYMBOL_EMOJI: Record<string, string> = {
  clearsky: '☀️',
  fair: '🌤️',
  partlycloudy: '⛅',
  cloudy: '☁️',
  rain: '🌧️',
  lightrain: '🌦️',
  heavyrain: '🌧️',
  rainshowers: '🌦️',
  lightrainshowers: '🌦️',
  heavyrainshowers: '🌧️',
  sleet: '🌨️',
  sleetshowers: '🌨️',
  snow: '❄️',
  snowshowers: '🌨️',
  lightsnow: '🌨️',
  heavysnow: '❄️',
  fog: '🌫️',
  thunder: '⛈️',
};

function getEmoji(symbol?: string | null) {
  if (!symbol) return '🌡️';
  const base = symbol.replace(/_(day|night|polartwilight)$/, '');
  if (SYMBOL_EMOJI[base]) return SYMBOL_EMOJI[base];
  if (base.includes('thunder')) return '⛈️';
  if (base.includes('snow')) return '❄️';
  if (base.includes('sleet')) return '🌨️';
  if (base.includes('rain')) return '🌧️';
  if (base.includes('cloud')) return '☁️';
  return '🌡️';
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
}

function fmtHour(ts: number) {
  const d = new Date(ts);
  return `${d.getHours()}:00`;
}

export function UnifiedForecastCard({ onOpenApc }: UnifiedForecastCardProps) {
  const [data, setData] = useState<UnifiedData>({
    currentPrice: null,
    stats: null,
    cheapest3h: null,
    cheapest6h: null,
    prices: [],
    weather: [],
    currentWeather: null,
    apcPlan: [],
    apcStatus: null,
    loading: true,
  });

  const [timeRange, setTimeRange] = useState<'24h' | 'all'>('24h');
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');

  const fetchAll = async () => {
    try {
      const nowTs = Date.now();
      const [curRes, statsRes, cheap3Res, cheap6Res, pricesRes, weatherRes, curWeatherRes, apcRes] = await Promise.all([
        apiFetch('/api/nordpool/current'),
        apiFetch('/api/nordpool/stats'),
        apiFetch('/api/nordpool/cheapest?hours=3'),
        apiFetch('/api/nordpool/cheapest?hours=6'),
        apiFetch(`/api/nordpool/prices?from=${nowTs - 4 * 3600_000}&to=${nowTs + 54 * 3600_000}`),
        apiFetch('/api/weather/forecast?hours=54'),
        apiFetch('/api/weather/current'),
        apiFetch('/api/apc/status'),
      ]);

      const currentPrice = await curRes.json();
      const stats = await statsRes.json();
      const cheapest3h = await cheap3Res.json();
      const cheapest6h = await cheap6Res.json();
      const pricesData = await pricesRes.json();
      const weatherData = await weatherRes.json();
      const currentWeather = await curWeatherRes.json();
      const apcData = await apcRes.json();

      setData({
        currentPrice: currentPrice?.message ? null : currentPrice,
        stats: stats?.count ? stats : null,
        cheapest3h: cheapest3h?.start ? cheapest3h : null,
        cheapest6h: cheapest6h?.start ? cheapest6h : null,
        prices: pricesData.prices || [],
        weather: weatherData.forecast || [],
        currentWeather: currentWeather?.temperature != null ? currentWeather : null,
        apcPlan: apcData?.plan || [],
        apcStatus: apcData?.enabled !== undefined ? apcData : null,
        loading: false,
      });
    } catch (err) {
      console.error('UnifiedForecast fetch failed', err);
      setData((prev) => ({ ...prev, loading: false }));
    }
  };

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 60_000);
    return () => clearInterval(interval);
  }, []);

  const now = Date.now();

  // Combine hourly price, weather, and APC plan data into unified timeline points
  const combinedSeries = useMemo(() => {
    if (!data.prices.length) return [];

    const nowStart = new Date();
    nowStart.setMinutes(0, 0, 0);
    const filterStart = nowStart.getTime() - 2 * 3600_000;
    const maxEnd = timeRange === '24h' ? now + 24 * 3600_000 : now + 50 * 3600_000;

    // Filter relevant prices
    const relevantPrices = data.prices.filter(p => p.start_time >= filterStart && p.start_time <= maxEnd);

    // Build map of weather by closest hour
    const weatherMap = new Map<number, WeatherForecast>();
    for (const w of data.weather) {
      const roundedTime = Math.round(w.time / 3600_000) * 3600_000;
      weatherMap.set(roundedTime, w);
    }

    const minPrice = data.stats?.min ? data.stats.min / 10 : 1.0;
    const maxPrice = data.stats?.max ? data.stats.max / 10 : 10.0;

    return relevantPrices.map((p) => {
      const pCents = Number((p.price / 10).toFixed(2));
      const roundedTime = Math.round(p.start_time / 3600_000) * 3600_000;
      const w = weatherMap.get(roundedTime) || data.weather.find(item => Math.abs(item.time - p.start_time) < 1800_000);

      // Match APC slot for this hour
      const matchingSlot = data.apcPlan.find(s => s.start_time <= p.start_time && s.end_time > p.start_time);
      const directive = matchingSlot?.directive || 'NORMAL';
      const isDhw = matchingSlot?.is_dhw_slot || directive === 'DHW_CYCLE';
      const reason = matchingSlot?.reason || 'Normaali peruslämmitys';

      const isCurrent = now >= p.start_time && now < p.end_time;
      const isPast = p.end_time < now;

      // Classify price level
      let level: 'cheap' | 'normal' | 'expensive' = 'normal';
      if (pCents <= minPrice + (maxPrice - minPrice) * 0.33) {
        level = 'cheap';
      } else if (pCents >= minPrice + (maxPrice - minPrice) * 0.66) {
        level = 'expensive';
      }

      // Check if within cheapest window
      const inCheap3h = Boolean(
        data.cheapest3h &&
        p.start_time >= data.cheapest3h.start &&
        p.start_time < data.cheapest3h.end
      );

      // Directive colors and labels
      let barColor = '#fbbf24'; // Default normal
      let opLabel = 'Normaali käynti (0°C)';
      let opShort = 'Normaali';
      let opIcon = '⚖️';

      if (directive === 'BOOST') {
        barColor = '#34d399'; // Green boost
        opLabel = '⚡ Esilämmitys / Lataus (+3°C)';
        opShort = 'Lataus +3°';
        opIcon = '⚡';
      } else if (isDhw) {
        barColor = '#38bdf8'; // Sky blue DHW
        opLabel = '🚿 Käyttövesilataus (55°C)';
        opShort = 'KV-lataus';
        opIcon = '🚿';
      } else if (directive === 'SETBACK') {
        barColor = '#f87171'; // Red setback
        opLabel = '💤 Säästötila / Setback (-2°C)';
        opShort = 'Säästö -2°';
        opIcon = '💤';
      } else if (directive === 'ECO') {
        barColor = '#f59e0b'; // Amber eco
        opLabel = '🌱 Ekotila (-1°C)';
        opShort = 'Eko -1°';
        opIcon = '🌱';
      }

      return {
        time: p.start_time,
        timeStr: fmtHour(p.start_time),
        fullDateStr: new Date(p.start_time).toLocaleString('fi-FI', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }),
        price_cents: pCents,
        level,
        isCurrent,
        isPast,
        inCheap3h,
        directive,
        isDhw,
        reason,
        barColor,
        opLabel,
        opShort,
        opIcon,
        temp: w?.temperature != null ? Number(w.temperature.toFixed(1)) : null,
        feels_like: w?.feels_like != null ? Number(w.feels_like.toFixed(1)) : null,
        wind_speed: w?.wind_speed != null ? Number(w.wind_speed.toFixed(1)) : null,
        rain_mm: w?.rain_mm != null ? Number(w.rain_mm.toFixed(1)) : null,
        symbol: w?.symbol || null,
        emoji: getEmoji(w?.symbol),
      };
    });
  }, [data.prices, data.weather, data.stats, data.cheapest3h, data.apcPlan, timeRange, now]);

  const curPriceCents = data.currentPrice ? (data.currentPrice.price / 10).toFixed(2) : '-';
  const curTemp = data.currentWeather?.temperature != null ? `${data.currentWeather.temperature > 0 ? '+' : ''}${data.currentWeather.temperature.toFixed(1)}` : '-';
  const curEmoji = getEmoji(data.currentWeather?.symbol);

  // Active current APC slot
  const currentSlot = data.apcPlan.find(s => s.start_time <= now && s.end_time > now);
  const currentDirective = currentSlot?.directive || data.apcStatus?.currentDirective || 'NORMAL';
  const currentReason = currentSlot?.reason || 'Normaali lämmityksen ohjauskäyrä';

  // Compact, Sleek Modern Recharts Tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const pt = payload[0]?.payload;
    if (!pt) return null;

    const levelColor = pt.level === 'cheap' ? '#4ade80' : pt.level === 'expensive' ? '#f87171' : '#fbbf24';

    return (
      <div style={{
        background: 'rgba(15, 23, 42, 0.96)',
        border: '1px solid rgba(255, 255, 255, 0.18)',
        borderRadius: 8,
        padding: '8px 12px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.65)',
        fontSize: 11,
        lineHeight: 1.4,
        maxWidth: 240,
        pointerEvents: 'none',
      }}>
        {/* Header line */}
        <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{pt.fullDateStr}</span>
          {pt.isCurrent && <span style={{ color: '#60a5fa', fontSize: 9, border: '1px solid #60a5fa', padding: '0 4px', borderRadius: 3 }}>NYT</span>}
        </div>

        {/* Spot Price */}
        <div style={{ display: 'flex', justifyContent: 'space-between', color: levelColor, marginBottom: 3 }}>
          <span>⚡ Pörssisähkö:</span>
          <strong>{pt.price_cents} c/kWh</strong>
        </div>

        {/* Heat Pump Operation Mode */}
        <div style={{ display: 'flex', justifyContent: 'space-between', color: pt.barColor, marginBottom: 3 }}>
          <span>🧠 Lämpöpumppu:</span>
          <strong>{pt.opShort}</strong>
        </div>

        {/* Weather */}
        {pt.temp != null && (
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#38bdf8' }}>
            <span>{pt.emoji} Sää:</span>
            <span>{pt.temp > 0 ? `+${pt.temp}` : pt.temp}°C {pt.wind_speed != null ? `(${pt.wind_speed} m/s)` : ''}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      {/* Real-time APC Status Banner integrated seamlessly at top */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.03)',
        borderBottom: '1px solid var(--border)',
        padding: '10px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            📌 TÄLLÄ HETKELLÄ:
          </span>
          <span style={{
            fontSize: 12,
            fontWeight: 600,
            color: currentDirective === 'BOOST' ? '#34d399' : currentDirective === 'SETBACK' ? '#f87171' : '#fbbf24',
            background: 'rgba(255, 255, 255, 0.06)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            padding: '3px 10px',
            borderRadius: 6,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <span>{currentDirective === 'BOOST' ? '⚡' : currentDirective === 'SETBACK' ? '💤' : '⚖️'}</span>
            <span>{currentReason}</span>
          </span>
        </div>

        {onOpenApc && (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={onOpenApc}
            style={{ fontSize: 11, padding: '3px 10px', color: 'var(--text-secondary)' }}
          >
            ⚙️ APC-asetukset & strategia →
          </button>
        )}
      </div>

      {/* Card Header & Controls */}
      <div className="card-header" style={{ flexWrap: 'wrap', gap: 10, padding: '14px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="card-icon">⚡</span>
          <div>
            <div className="card-title" style={{ fontSize: 16 }}>Älykäs Sähkö- & Sääennuste</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              Spot-hinnat, sääolosuhteet ja lämpöpumpun ohjausikkunat
            </div>
          </div>
        </div>

        {/* Legend pills */}
        <div style={{ display: 'flex', gap: 8, fontSize: 11, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: '#34d399' }} /> ⚡ Lataus (+3°)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: '#38bdf8' }} /> 🚿 KV (55°)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: '#f87171' }} /> 💤 Säästö (-2°)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: '#fbbf24' }} /> ⚖️ Normaali
          </span>
        </div>

        {/* Toolbar */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Time range toggle */}
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 2, border: '1px solid rgba(255,255,255,0.08)' }}>
            <button
              type="button"
              onClick={() => setTimeRange('24h')}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                border: 'none',
                background: timeRange === '24h' ? 'var(--accent-primary, #3b82f6)' : 'transparent',
                color: timeRange === '24h' ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              24h
            </button>
            <button
              type="button"
              onClick={() => setTimeRange('all')}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                border: 'none',
                background: timeRange === 'all' ? 'var(--accent-primary, #3b82f6)' : 'transparent',
                color: timeRange === 'all' ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              Kaikki (48h)
            </button>
          </div>

          {/* View mode toggle */}
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 2, border: '1px solid rgba(255,255,255,0.08)' }}>
            <button
              type="button"
              onClick={() => setViewMode('chart')}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                border: 'none',
                background: viewMode === 'chart' ? 'rgba(255,255,255,0.12)' : 'transparent',
                color: viewMode === 'chart' ? 'var(--text-primary)' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              📊 Kaavio
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                border: 'none',
                background: viewMode === 'table' ? 'rgba(255,255,255,0.12)' : 'transparent',
                color: viewMode === 'table' ? 'var(--text-primary)' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              📋 Taulukko
            </button>
          </div>
        </div>
      </div>

      <div className="card-body" style={{ padding: 18 }}>
        {/* Quick KPI Overview Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
          marginBottom: 18,
        }}>
          {/* Current Electricity Price */}
          <div style={{
            background: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            borderRadius: 10,
            padding: '12px 14px',
          }}>
            <div style={{ fontSize: 11, color: '#60a5fa', fontWeight: 600, marginBottom: 2 }}>
              ⚡ SÄHKÖN HINTA NYT
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>
              {curPriceCents} <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>c/kWh</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
              <span>Vuorokauden ka:</span>
              <strong>{data.stats?.avg ? (data.stats.avg / 10).toFixed(2) : '-'} c</strong>
            </div>
          </div>

          {/* Current Weather & Outdoor Temp */}
          <div style={{
            background: 'rgba(56, 189, 248, 0.08)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            borderRadius: 10,
            padding: '12px 14px',
          }}>
            <div style={{ fontSize: 11, color: '#38bdf8', fontWeight: 600, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>{curEmoji}</span> ULKOLÄMPÖTILA & SÄÄ
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>
              {curTemp} <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>°C</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
              <span>Tuuli / Kosteus:</span>
              <span>{data.currentWeather?.wind_speed ?? '-'} m/s • {data.currentWeather?.humidity ?? '-'}%</span>
            </div>
          </div>

          {/* Cheapest 3h Window */}
          <div style={{
            background: 'rgba(34, 197, 94, 0.08)',
            border: '1px solid rgba(34, 197, 94, 0.25)',
            borderRadius: 10,
            padding: '12px 14px',
          }}>
            <div style={{ fontSize: 11, color: '#4ade80', fontWeight: 600, marginBottom: 2 }}>
              🟢 HALVIN 3H JAKSO (LATAUS)
            </div>
            {data.cheapest3h ? (
              <>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {fmtTime(data.cheapest3h.start)} – {fmtTime(data.cheapest3h.end)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                  <span>Keskihinta:</span>
                  <strong style={{ color: '#4ade80' }}>{(data.cheapest3h.avgPrice / 10).toFixed(2)} c/kWh</strong>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Ei hintatietoja</div>
            )}
          </div>

          {/* Cheapest 6h Window */}
          <div style={{
            background: 'rgba(168, 85, 247, 0.08)',
            border: '1px solid rgba(168, 85, 247, 0.25)',
            borderRadius: 10,
            padding: '12px 14px',
          }}>
            <div style={{ fontSize: 11, color: '#c084fc', fontWeight: 600, marginBottom: 2 }}>
              🟣 HALVIN 6H IKKUNA (KÄYTTÖVESI)
            </div>
            {data.cheapest6h ? (
              <>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {fmtTime(data.cheapest6h.start)} – {fmtTime(data.cheapest6h.end)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                  <span>Keskihinta:</span>
                  <strong style={{ color: '#c084fc' }}>{(data.cheapest6h.avgPrice / 10).toFixed(2)} c/kWh</strong>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Ei hintatietoja</div>
            )}
          </div>
        </div>

        {/* Chart View */}
        {viewMode === 'chart' && combinedSeries.length > 0 && (
          <div style={{ width: '100%', height: 320, marginTop: 10 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={combinedSeries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="timeStr"
                  stroke="var(--text-muted)"
                  fontSize={11}
                  minTickGap={20}
                />
                <YAxis
                  yAxisId="left"
                  stroke="#fbbf24"
                  fontSize={11}
                  unit=" c"
                  domain={['auto', 'auto']}
                  label={{
                    value: 'Sähkö (c/kWh)',
                    angle: -90,
                    position: 'insideLeft',
                    fill: '#fbbf24',
                    fontSize: 10,
                  }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#38bdf8"
                  fontSize={11}
                  unit="°C"
                  label={{
                    value: 'Ulkolämpö (°C)',
                    angle: 90,
                    position: 'insideRight',
                    fill: '#38bdf8',
                    fontSize: 10,
                  }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 6 }} />

                {/* Reference line for 0 c / kWh */}
                <ReferenceLine yAxisId="left" y={0} stroke="rgba(255,255,255,0.2)" strokeDasharray="2 2" />

                {/* Electricity price bars colored by heat pump operation mode */}
                <Bar
                  yAxisId="left"
                  dataKey="price_cents"
                  name="Pörssisähkö (c/kWh)"
                  radius={[3, 3, 0, 0]}
                >
                  {combinedSeries.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.barColor} />
                  ))}
                </Bar>

                {/* Temperature forecast curve */}
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="temp"
                  name="Ulkolämpötila (°C)"
                  stroke="#38bdf8"
                  strokeWidth={2.5}
                  dot={{ r: 2, fill: '#38bdf8' }}
                  activeDot={{ r: 5 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Table View */}
        {viewMode === 'table' && combinedSeries.length > 0 && (
          <div style={{ overflowX: 'auto', marginTop: 10, maxHeight: 380 }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 12,
              textAlign: 'left',
            }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '8px 10px' }}>Kellonaika</th>
                  <th style={{ padding: '8px 10px' }}>Sähkön hinta</th>
                  <th style={{ padding: '8px 10px' }}>Lämpöpumpun ohjaus</th>
                  <th style={{ padding: '8px 10px' }}>Sää</th>
                  <th style={{ padding: '8px 10px' }}>Ulkolämpö</th>
                  <th style={{ padding: '8px 10px' }}>Tuuli</th>
                  <th style={{ padding: '8px 10px' }}>Perustelu</th>
                </tr>
              </thead>
              <tbody>
                {combinedSeries.map((pt) => {
                  const levelColor = pt.level === 'cheap' ? '#4ade80' : pt.level === 'expensive' ? '#f87171' : '#fbbf24';

                  return (
                    <tr
                      key={pt.time}
                      style={{
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                        background: pt.isCurrent ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '8px 10px', fontWeight: pt.isCurrent ? 700 : 500 }}>
                        {pt.fullDateStr} {pt.isCurrent && <span style={{ color: '#60a5fa', fontSize: 10 }}>[NYT]</span>}
                      </td>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: levelColor }}>
                        {pt.price_cents} c/kWh
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: pt.barColor,
                          background: 'rgba(255,255,255,0.06)',
                          padding: '2px 6px',
                          borderRadius: 4,
                          border: `1px solid ${pt.barColor}40`,
                        }}>
                          {pt.opLabel}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px', fontSize: 14 }}>
                        {pt.emoji}
                      </td>
                      <td style={{ padding: '8px 10px', color: '#38bdf8', fontWeight: 600 }}>
                        {pt.temp != null ? `${pt.temp > 0 ? '+' : ''}${pt.temp} °C` : '-'}
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>
                        {pt.wind_speed != null ? `${pt.wind_speed} m/s` : '-'}
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-secondary)', fontSize: 11 }}>
                        {pt.reason}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Empty state */}
        {!data.loading && combinedSeries.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Sähkön hinta-, sää- ja optimointitietoja ladataan...
          </div>
        )}
      </div>
    </div>
  );
}
