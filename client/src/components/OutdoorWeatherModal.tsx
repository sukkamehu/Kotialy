import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { apiFetch } from '../lib/api';
import type { HeishamonState } from '../types/heishamon';
import { numVal } from '../types/heishamon';
import type { WeatherForecast, DailyWeather } from '../types/weather';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from 'recharts';

interface OutdoorWeatherModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: HeishamonState;
}

type ModalViewTab = 'combined' | 'history' | 'forecast';
type CombinedPreset = '24h_24h' | '48h_48h' | '7d_3d';
type HistoryPreset = '6h' | '24h' | '48h' | 'today' | 'yesterday' | '7d' | '30d' | 'custom_day' | 'custom_range';

interface CombinedDataPoint {
  time: number;
  measuredTemp: number | null;
  forecastTemp: number | null;
  feelsLike: number | null;
  rainMm: number | null;
  symbol: string | null;
  windSpeed: number | null;
  isForecast: boolean;
}

interface HistoryDataPoint {
  time: number;
  outsideTemp: number | null;
  outsidePipeTemp?: number | null;
  evaOutletTemp?: number | null;
}

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

function toLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateInput(str: string, endOfDay = false): number {
  if (!str) return Date.now();
  const [y, m, d] = str.split('-').map(Number);
  const date = new Date(y, m - 1, d, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  return date.getTime();
}

function tempColor(t: number | null): string {
  if (t === null) return 'var(--text-muted)';
  if (t < -10) return '#60a5fa';
  if (t < 0) return '#38bdf8';
  if (t < 10) return 'var(--cool-primary, #22d3ee)';
  if (t < 20) return '#34d399';
  if (t < 25) return '#fbbf24';
  return '#f87171';
}

export function OutdoorWeatherModal({ isOpen, onClose, state }: OutdoorWeatherModalProps) {
  const [activeTab, setActiveTab] = useState<ModalViewTab>('combined');

  // Combined preset
  const [combinedPreset, setCombinedPreset] = useState<CombinedPreset>('24h_24h');

  // History preset
  const [historyPreset, setHistoryPreset] = useState<HistoryPreset>('24h');
  const todayStr = useMemo(() => toLocalDateString(new Date()), []);
  const [selectedDay, setSelectedDay] = useState<string>(todayStr);
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return toLocalDateString(d);
  });
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [includePipeTemp, setIncludePipeTemp] = useState(false);

  // Data states
  const [loading, setLoading] = useState(true);
  const [historyData, setHistoryData] = useState<HistoryDataPoint[]>([]);
  const [weatherCurrent, setWeatherCurrent] = useState<WeatherForecast | null>(null);
  const [weatherForecast, setWeatherForecast] = useState<WeatherForecast[]>([]);
  const [weatherDaily, setWeatherDaily] = useState<DailyWeather[]>([]);

  // Live heatpump sensor values
  const currentHeatpumpTemp = numVal(state, 'main/Outside_Temp');
  const currentPipeTemp = numVal(state, 'main/Outside_Pipe_Temp');
  const isDefrosting = state['main/Defrosting_State']?.value === '1';
  const isBaseHeater = state['main/Base_Pan_Heater']?.value === '1' || state['main/Outdoor_Heater_State']?.value === '1';

  // Listen for Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Compute History timeframe
  const { historyFromMs, historyToMs, historyDurationHours, formattedHistoryLabel } = useMemo(() => {
    const now = Date.now();
    let from = now - 24 * 3600 * 1000;
    let to = now;
    let label = 'Viimeiset 24 tuntia';

    if (historyPreset === '6h') {
      from = now - 6 * 3600 * 1000;
      label = 'Viimeiset 6 tuntia';
    } else if (historyPreset === '24h') {
      from = now - 24 * 3600 * 1000;
      label = 'Viimeiset 24 tuntia';
    } else if (historyPreset === '48h') {
      from = now - 48 * 3600 * 1000;
      label = 'Viimeiset 48 tuntia (2 vrk)';
    } else if (historyPreset === 'today') {
      from = parseDateInput(todayStr, false);
      label = `Tänään (${new Date(from).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })})`;
    } else if (historyPreset === 'yesterday') {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const yStr = toLocalDateString(y);
      from = parseDateInput(yStr, false);
      to = parseDateInput(yStr, true);
      label = `Eilen (${new Date(from).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })})`;
    } else if (historyPreset === '7d') {
      from = now - 7 * 24 * 3600 * 1000;
      label = 'Viimeiset 7 päivää';
    } else if (historyPreset === '30d') {
      from = now - 30 * 24 * 3600 * 1000;
      label = 'Viimeiset 30 päivää';
    } else if (historyPreset === 'custom_day') {
      from = parseDateInput(selectedDay, false);
      const isToday = selectedDay === todayStr;
      to = isToday ? now : parseDateInput(selectedDay, true);
      const dObj = new Date(from);
      label = `Päivä: ${dObj.toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' })}`;
    } else if (historyPreset === 'custom_range') {
      from = parseDateInput(startDate, false);
      const isToday = endDate === todayStr;
      to = isToday ? now : parseDateInput(endDate, true);
      const startObj = new Date(from);
      const endObj = new Date(to);
      label = `Aikajakso: ${startObj.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })} – ${endObj.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric', year: 'numeric' })}`;
    }

    const durationH = Math.max(1, (to - from) / (3600 * 1000));
    return { historyFromMs: from, historyToMs: to, historyDurationHours: durationH, formattedHistoryLabel: label };
  }, [historyPreset, selectedDay, startDate, endDate, todayStr]);

  // Compute Combined timeframe
  const { combinedPastHours, combinedFutureHours, combinedLabel } = useMemo(() => {
    if (combinedPreset === '24h_24h') {
      return { combinedPastHours: 24, combinedFutureHours: 24, combinedLabel: '24h historia + 24h ennuste (48h kokonaisuus)' };
    }
    if (combinedPreset === '48h_48h') {
      return { combinedPastHours: 48, combinedFutureHours: 48, combinedLabel: '48h historia + 48h ennuste (4 vrk kokonaisuus)' };
    }
    return { combinedPastHours: 7 * 24, combinedFutureHours: 72, combinedLabel: '7 pv historia + 3 pv ennuste (10 vrk kokonaisuus)' };
  }, [combinedPreset]);

  // Fetch data
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    setLoading(true);

    const now = Date.now();
    const historyFrom = activeTab === 'combined' ? now - combinedPastHours * 3600 * 1000 : historyFromMs;
    const historyTo = activeTab === 'combined' ? now : historyToMs;

    const topicsToFetch = includePipeTemp && activeTab === 'history'
      ? ['main/Outside_Temp', 'main/Outside_Pipe_Temp']
      : ['main/Outside_Temp'];

    const historyPromise = topicsToFetch.length > 1
      ? apiFetch(`/api/history/multi?topics=${encodeURIComponent(topicsToFetch.join(','))}&from=${historyFrom}&to=${historyTo}`).then((r) => r.json())
      : apiFetch(`/api/history?topic=main/Outside_Temp&from=${historyFrom}&to=${historyTo}`).then((r) => r.json());

    const weatherForecastPromise = apiFetch('/api/weather/forecast?hours=72').then((r) => r.json()).catch(() => ({ forecast: [] }));
    const weatherCurrentPromise = apiFetch('/api/weather/current').then((r) => r.json()).catch(() => null);
    const weatherDailyPromise = apiFetch('/api/weather/daily').then((r) => r.json()).catch(() => ({ days: [] }));

    Promise.all([historyPromise, weatherForecastPromise, weatherCurrentPromise, weatherDailyPromise])
      .then(([historyRes, forecastRes, currentRes, dailyRes]) => {
        if (!isMounted) return;

        // Process history
        if (topicsToFetch.length > 1) {
          const multi = historyRes.data || {};
          const outsideRows = multi['main/Outside_Temp'] || [];
          const pipeRows = multi['main/Outside_Pipe_Temp'] || [];
          
          // Map timestamps
          const timeMap = new Map<number, HistoryDataPoint>();
          for (const r of outsideRows) {
            const t = Math.round(Number(r.recorded_at) / 60000) * 60000;
            timeMap.set(t, { time: Number(r.recorded_at), outsideTemp: Number(r.value), outsidePipeTemp: null });
          }
          for (const r of pipeRows) {
            const t = Math.round(Number(r.recorded_at) / 60000) * 60000;
            const existing = timeMap.get(t);
            if (existing) {
              existing.outsidePipeTemp = Number(r.value);
            } else {
              timeMap.set(t, { time: Number(r.recorded_at), outsideTemp: null, outsidePipeTemp: Number(r.value) });
            }
          }
          const sorted = Array.from(timeMap.values()).sort((a, b) => a.time - b.time);
          setHistoryData(sorted);
        } else {
          const rows = (historyRes.data || []).map((r: any) => ({
            time: Number(r.recorded_at),
            outsideTemp: Number(r.value),
          }));
          setHistoryData(rows);
        }

        setWeatherForecast(forecastRes.forecast || []);
        setWeatherCurrent(currentRes?.message ? null : currentRes);
        setWeatherDaily(dailyRes.days || []);
        setLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error('Failed to load outdoor weather modal data', err);
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, activeTab, combinedPastHours, historyFromMs, historyToMs, historyDurationHours, includePipeTemp]);

  // Combined timeline data assembly
  const combinedTimelineData = useMemo(() => {
    const now = Date.now();
    const pastCutoff = now - combinedPastHours * 3600 * 1000;
    const futureCutoff = now + combinedFutureHours * 3600 * 1000;

    const points: CombinedDataPoint[] = [];

    // Add history points
    for (const h of historyData) {
      if (h.time >= pastCutoff && h.time <= now) {
        points.push({
          time: h.time,
          measuredTemp: h.outsideTemp,
          forecastTemp: null,
          feelsLike: null,
          rainMm: null,
          symbol: null,
          windSpeed: null,
          isForecast: false,
        });
      }
    }

    // Connect the seam at 'now'
    const latestMeasured = historyData.length > 0 ? historyData[historyData.length - 1].outsideTemp : currentHeatpumpTemp;
    if (points.length > 0 && latestMeasured !== null) {
      const lastPt = points[points.length - 1];
      lastPt.forecastTemp = latestMeasured;
    }

    // Add forecast points
    for (const f of weatherForecast) {
      if (f.time >= now - 15 * 60 * 1000 && f.time <= futureCutoff) {
        points.push({
          time: f.time,
          measuredTemp: null,
          forecastTemp: f.temperature,
          feelsLike: f.feels_like,
          rainMm: f.rain_mm > 0 ? f.rain_mm : null,
          symbol: f.symbol,
          windSpeed: f.wind_speed,
          isForecast: true,
        });
      }
    }

    return points.sort((a, b) => a.time - b.time);
  }, [historyData, weatherForecast, combinedPastHours, combinedFutureHours, currentHeatpumpTemp]);

  // Stats calculation for history
  const historyStats = useMemo(() => {
    const valid = historyData.map((d) => d.outsideTemp).filter((v): v is number => v !== null && !isNaN(v));
    if (!valid.length) return null;
    const min = Math.min(...valid);
    const max = Math.max(...valid);
    const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
    const latest = valid[valid.length - 1];
    const first = valid[0];
    const diff = latest - first;
    return { min, max, avg, latest, diff, count: valid.length };
  }, [historyData]);

  // Stats calculation for combined view (past vs forecast)
  const combinedStats = useMemo(() => {
    const pastValues = combinedTimelineData
      .filter((d) => !d.isForecast && d.measuredTemp !== null)
      .map((d) => d.measuredTemp as number);
    
    const futureForecasts = combinedTimelineData
      .filter((d) => d.isForecast && d.forecastTemp !== null);
    const futureValues = futureForecasts.map((d) => d.forecastTemp as number);
    const totalRainMm = futureForecasts.reduce((sum, d) => sum + (d.rainMm || 0), 0);

    const pastMin = pastValues.length ? Math.min(...pastValues) : null;
    const pastMax = pastValues.length ? Math.max(...pastValues) : null;
    const pastAvg = pastValues.length ? pastValues.reduce((a, b) => a + b, 0) / pastValues.length : null;

    const futureMin = futureValues.length ? Math.min(...futureValues) : null;
    const futureMax = futureValues.length ? Math.max(...futureValues) : null;
    const futureAvg = futureValues.length ? futureValues.reduce((a, b) => a + b, 0) / futureValues.length : null;

    return { pastMin, pastMax, pastAvg, futureMin, futureMax, futureAvg, totalRainMm };
  }, [combinedTimelineData]);

  if (!isOpen) return null;

  function stepDay(offset: number) {
    const cur = new Date(selectedDay);
    cur.setDate(cur.getDate() + offset);
    const newStr = toLocalDateString(cur);
    if (newStr <= todayStr) {
      setSelectedDay(newStr);
      setHistoryPreset('custom_day');
    }
  }

  const formatTickTime = (ts: number, durationHours: number) => {
    const d = new Date(ts);
    if (durationHours > 72) {
      return d.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' });
    }
    if (durationHours > 24) {
      return d.toLocaleDateString('fi-FI', { weekday: 'short', hour: '2-digit' });
    }
    return d.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
  };

  const CombinedTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const pt = payload[0]?.payload as CombinedDataPoint;
    if (!pt) return null;

    const isFut = pt.isForecast;

    return (
      <div
        style={{
          background: 'rgba(15,20,32,0.96)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 10,
          padding: '10px 14px',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          minWidth: 180,
        }}
      >
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
          {new Date(label).toLocaleString('fi-FI', {
            weekday: 'short',
            day: 'numeric',
            month: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
          <span
            style={{
              marginLeft: 6,
              padding: '1px 5px',
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 700,
              background: isFut ? 'rgba(167,139,250,0.2)' : 'rgba(34,211,238,0.2)',
              color: isFut ? '#c4b5fd' : '#22d3ee',
            }}
          >
            {isFut ? 'Ennuste' : 'Mitattu historia'}
          </span>
        </div>

        {pt.measuredTemp !== null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: '#22d3ee' }} />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Lämpöpumppu anturi:</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#22d3ee', marginLeft: 'auto' }}>
              {pt.measuredTemp.toFixed(1)} °C
            </span>
          </div>
        )}

        {pt.forecastTemp !== null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: '#a78bfa' }} />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Sääennuste (met.no):</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#a78bfa', marginLeft: 'auto' }}>
              {pt.forecastTemp.toFixed(1)} °C
            </span>
          </div>
        )}

        {pt.feelsLike !== null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Tuntuu kuin:</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginLeft: 'auto' }}>
              {pt.feelsLike.toFixed(1)} °C
            </span>
          </div>
        )}

        {pt.rainMm !== null && pt.rainMm > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <span style={{ fontSize: 11, color: '#38bdf8' }}>🌧️ Sade:</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#38bdf8', marginLeft: 'auto' }}>
              {pt.rainMm.toFixed(1)} mm
            </span>
          </div>
        )}

        {pt.windSpeed !== null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>💨 Tuuli:</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 'auto' }}>
              {pt.windSpeed.toFixed(1)} m/s
            </span>
          </div>
        )}
      </div>
    );
  };

  const HistoryTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;

    return (
      <div
        style={{
          background: 'rgba(15,20,32,0.96)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 10,
          padding: '10px 14px',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          minWidth: 160,
        }}
      >
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
          {new Date(label).toLocaleString('fi-FI')}
        </div>
        {payload.map((p: any) => (
          <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.name}:</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: p.color, marginLeft: 'auto' }}>
              {typeof p.value === 'number' ? `${p.value.toFixed(1)} °C` : p.value}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        padding: 16,
        animation: 'fadeIn 0.15s ease-out',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: 880,
          width: '100%',
          boxShadow: '0 24px 60px rgba(0,0,0,0.75)',
          borderColor: 'rgba(34,211,238,0.25)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '94vh',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          className="card-header"
          style={{
            borderBottom: '1px solid var(--border)',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: 'rgba(34,211,238,0.12)',
                  border: '1px solid rgba(34,211,238,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                  boxShadow: '0 0 12px rgba(34,211,238,0.15)',
                }}
              >
                🌤️
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                    Ulkolämpötila & Sääennuste
                  </h3>
                  {isBaseHeater && (
                    <span className="badge" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontSize: 10 }}>
                      🔥 Pohjavastus
                    </span>
                  )}
                  {isDefrosting && (
                    <span className="badge" style={{ background: 'rgba(34,211,238,0.15)', color: '#22d3ee', fontSize: 10 }}>
                      ❄️ Sulatus
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  Järvenpää · Panasonic lämpöpumpun anturi & Ilmatieteen laitos (Met.no)
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* Quick live indicator */}
              {currentHeatpumpTemp !== null && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    padding: '4px 10px',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Ulkolämpö nyt</span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: tempColor(currentHeatpumpTemp) }}>
                    {currentHeatpumpTemp.toFixed(1)} °C
                  </span>
                  {currentPipeTemp !== null && (
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                      Putki: {currentPipeTemp.toFixed(1)} °C
                    </span>
                  )}
                </div>
              )}

              <button
                onClick={onClose}
                className="btn btn-ghost"
                style={{
                  width: 32,
                  height: 32,
                  padding: 0,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                  color: 'var(--text-muted)',
                }}
                title="Sulje (Esc)"
              >
                ✕
              </button>
            </div>
          </div>

          {/* View Selection Tabs */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 10 }}>
            <button
              className={`btn btn-sm ${activeTab === 'combined' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('combined')}
              style={{
                padding: '6px 14px',
                fontSize: 13,
                fontWeight: activeTab === 'combined' ? 700 : 500,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>📊</span> Yhdistetty (Historia + Ennuste)
            </button>

            <button
              className={`btn btn-sm ${activeTab === 'history' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('history')}
              style={{
                padding: '6px 14px',
                fontSize: 13,
                fontWeight: activeTab === 'history' ? 700 : 500,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>📈</span> Tarkka mittaushistoria
            </button>

            <button
              className={`btn btn-sm ${activeTab === 'forecast' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('forecast')}
              style={{
                padding: '6px 14px',
                fontSize: 13,
                fontWeight: activeTab === 'forecast' ? 700 : 500,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>🌤️</span> Tuntiennuste & 7 vrk sää
            </button>
          </div>

          {/* Sub Controls: Combined View Presets */}
          {activeTab === 'combined' && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 2 }}>Aikajana:</span>
                {[
                  { id: '24h_24h', label: '24h historia + 24h ennuste' },
                  { id: '48h_48h', label: '48h historia + 48h ennuste' },
                  { id: '7d_3d', label: '7 pv historia + 3 pv ennuste' },
                ].map((p) => (
                  <button
                    key={p.id}
                    className={`btn btn-sm ${combinedPreset === p.id ? 'btn-secondary' : 'btn-ghost'}`}
                    onClick={() => setCombinedPreset(p.id as CombinedPreset)}
                    style={{
                      padding: '3px 10px',
                      fontSize: 11,
                      fontWeight: combinedPreset === p.id ? 700 : 500,
                      borderRadius: 6,
                      background: combinedPreset === p.id ? 'rgba(34,211,238,0.2)' : undefined,
                      borderColor: combinedPreset === p.id ? 'rgba(34,211,238,0.4)' : undefined,
                      color: combinedPreset === p.id ? '#22d3ee' : undefined,
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                🗓️ {combinedLabel}
              </div>
            </div>
          )}

          {/* Sub Controls: History View Presets */}
          {activeTab === 'history' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                  {[
                    { id: '6h', label: '6h' },
                    { id: '24h', label: '24h' },
                    { id: '48h', label: '48h' },
                    { id: 'today', label: 'Tänään' },
                    { id: 'yesterday', label: 'Eilen' },
                    { id: '7d', label: '7 pv' },
                    { id: '30d', label: '30 pv' },
                    { id: 'custom_range', label: '🗓️ Jakso' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      className={`btn btn-sm ${historyPreset === p.id ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setHistoryPreset(p.id as HistoryPreset)}
                      style={{
                        padding: '3px 9px',
                        fontSize: 11,
                        fontWeight: historyPreset === p.id ? 700 : 500,
                        borderRadius: 6,
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}>
                  <input
                    type="checkbox"
                    checked={includePipeTemp}
                    onChange={(e) => setIncludePipeTemp(e.target.checked)}
                    style={{ accentColor: '#38bdf8' }}
                  />
                  <span>Näytä myös ulkoputki</span>
                </label>
              </div>

              {/* Date pickers */}
              {(historyPreset === 'custom_day' || historyPreset === 'today' || historyPreset === 'yesterday') && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'rgba(255,255,255,0.03)',
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.06)',
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button className="btn btn-sm btn-ghost" onClick={() => stepDay(-1)} style={{ padding: '2px 8px', fontSize: 11 }}>
                      ◀ Edellinen
                    </button>
                    <input
                      type="date"
                      max={todayStr}
                      value={historyPreset === 'today' ? todayStr : historyPreset === 'yesterday' ? (() => { const d = new Date(); d.setDate(d.getDate() - 1); return toLocalDateString(d); })() : selectedDay}
                      onChange={(e) => {
                        if (e.target.value) {
                          setSelectedDay(e.target.value);
                          setHistoryPreset('custom_day');
                        }
                      }}
                      style={{
                        background: 'rgba(0,0,0,0.4)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: 4,
                        color: '#60a5fa',
                        padding: '2px 6px',
                        fontSize: 12,
                        fontWeight: 600,
                        fontFamily: 'inherit',
                      }}
                    />
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => stepDay(1)}
                      disabled={(historyPreset === 'today' ? todayStr : selectedDay) >= todayStr}
                      style={{ padding: '2px 8px', fontSize: 11, opacity: (historyPreset === 'today' ? todayStr : selectedDay) >= todayStr ? 0.3 : 1 }}
                    >
                      Seuraava ▶
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>📅 {formattedHistoryLabel}</div>
                </div>
              )}

              {historyPreset === 'custom_range' && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'rgba(255,255,255,0.03)',
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.06)',
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Alkaen:</span>
                    <input
                      type="date"
                      max={endDate || todayStr}
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      style={{
                        background: 'rgba(0,0,0,0.4)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: 4,
                        color: '#60a5fa',
                        padding: '2px 6px',
                        fontSize: 11,
                        fontWeight: 600,
                        fontFamily: 'inherit',
                      }}
                    />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Päättyen:</span>
                    <input
                      type="date"
                      min={startDate}
                      max={todayStr}
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      style={{
                        background: 'rgba(0,0,0,0.4)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: 4,
                        color: '#60a5fa',
                        padding: '2px 6px',
                        fontSize: 11,
                        fontWeight: 600,
                        fontFamily: 'inherit',
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>📅 {formattedHistoryLabel}</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Body */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
          {/* TAB 1: COMBINED (HISTORIA + ENNUSTE) */}
          {activeTab === 'combined' && (
            <>
              {/* Summary Statistics Comparison */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 10,
                }}
              >
                <div
                  style={{
                    background: 'rgba(34,211,238,0.06)',
                    border: '1px solid rgba(34,211,238,0.2)',
                    padding: '10px 14px',
                    borderRadius: 8,
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#22d3ee', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22d3ee' }} />
                    Menneisyys (Mitattu)
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12 }}>
                    <span style={{ color: 'var(--text-muted)' }}>Min / Max:</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {combinedStats.pastMin !== null ? `${combinedStats.pastMin.toFixed(1)}°` : '—'} /{' '}
                      {combinedStats.pastMax !== null ? `${combinedStats.pastMax.toFixed(1)}°` : '—'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2, fontSize: 12 }}>
                    <span style={{ color: 'var(--text-muted)' }}>Keskiarvo:</span>
                    <span style={{ fontWeight: 600, color: '#22d3ee' }}>
                      {combinedStats.pastAvg !== null ? `${combinedStats.pastAvg.toFixed(1)} °C` : '—'}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    background: 'rgba(167,139,250,0.06)',
                    border: '1px solid rgba(167,139,250,0.2)',
                    padding: '10px 14px',
                    borderRadius: 8,
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#c4b5fd', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#c4b5fd' }} />
                    Tulevaisuus (Ennuste)
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12 }}>
                    <span style={{ color: 'var(--text-muted)' }}>Min / Max:</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {combinedStats.futureMin !== null ? `${combinedStats.futureMin.toFixed(1)}°` : '—'} /{' '}
                      {combinedStats.futureMax !== null ? `${combinedStats.futureMax.toFixed(1)}°` : '—'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2, fontSize: 12 }}>
                    <span style={{ color: 'var(--text-muted)' }}>Keskiarvo / Sade:</span>
                    <span style={{ fontWeight: 600, color: '#c4b5fd' }}>
                      {combinedStats.futureAvg !== null ? `${combinedStats.futureAvg.toFixed(1)} °C` : '—'}{' '}
                      <span style={{ color: '#38bdf8', fontSize: 11 }}>({combinedStats.totalRainMm.toFixed(1)} mm)</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Combined Chart Area */}
              <div style={{ height: 320, width: '100%', position: 'relative' }}>
                {loading ? (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'rgba(15, 23, 42, 0.4)',
                      backdropFilter: 'blur(2px)',
                      borderRadius: 8,
                    }}
                  >
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Ladataan yhdistettyä aikajanaa...</div>
                  </div>
                ) : combinedTimelineData.length === 0 ? (
                  <div
                    style={{
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                    }}
                  >
                    <span style={{ fontSize: 24 }}>📉</span>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Ei tietoja valitulle aikajanalle</span>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={combinedTimelineData} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradMeasured" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.0} />
                        </linearGradient>
                        <linearGradient id="gradForecast" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#a78bfa" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                      <XAxis
                        dataKey="time"
                        type="number"
                        domain={['dataMin', 'dataMax']}
                        tickFormatter={(ts) => formatTickTime(ts, combinedPastHours + combinedFutureHours)}
                        stroke="var(--text-muted)"
                        fontSize={11}
                        tickLine={false}
                        axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                      />
                      <YAxis
                        yAxisId="temp"
                        stroke="var(--text-muted)"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        domain={['auto', 'auto']}
                        tickFormatter={(v) => `${Math.round(v * 10) / 10}°`}
                      />
                      <YAxis
                        yAxisId="rain"
                        orientation="right"
                        stroke="#38bdf8"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        domain={[0, 'auto']}
                        tickFormatter={(v) => `${v}mm`}
                        hide={combinedStats.totalRainMm === 0}
                      />
                      <Tooltip content={<CombinedTooltip />} />
                      <Legend
                        verticalAlign="top"
                        height={30}
                        iconType="circle"
                        wrapperStyle={{ fontSize: 11, paddingBottom: 6 }}
                      />
                      
                      {/* Now Reference Line */}
                      <ReferenceLine
                        x={Date.now()}
                        yAxisId="temp"
                        stroke="rgba(255,255,255,0.6)"
                        strokeDasharray="4 4"
                        label={{
                          value: 'Nyt 📍',
                          fill: '#ffffff',
                          fontSize: 11,
                          fontWeight: 700,
                          position: 'insideTopLeft',
                        }}
                      />

                      {/* 0°C Freezing Line */}
                      <ReferenceLine
                        y={0}
                        yAxisId="temp"
                        stroke="rgba(56, 189, 248, 0.4)"
                        strokeDasharray="2 2"
                        label={{
                          value: '0 °C',
                          fill: 'rgba(56, 189, 248, 0.7)',
                          fontSize: 10,
                          position: 'insideBottomRight',
                        }}
                      />

                      {/* Rain Bars */}
                      <Bar
                        yAxisId="rain"
                        dataKey="rainMm"
                        fill="rgba(56, 189, 248, 0.4)"
                        name="Sade-ennuste (mm)"
                        isAnimationActive={false}
                      />

                      {/* Measured History Area */}
                      <Area
                        yAxisId="temp"
                        type="monotone"
                        dataKey="measuredTemp"
                        stroke="#22d3ee"
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#gradMeasured)"
                        name="Mitattu (Lämpöpumppu)"
                        connectNulls={false}
                        isAnimationActive={false}
                      />

                      {/* Forecast Area */}
                      <Area
                        yAxisId="temp"
                        type="monotone"
                        dataKey="forecastTemp"
                        stroke="#a78bfa"
                        strokeWidth={2.5}
                        strokeDasharray="5 5"
                        fillOpacity={1}
                        fill="url(#gradForecast)"
                        name="Sääennuste (Met.no)"
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>
            </>
          )}

          {/* TAB 2: DETAILED SENSOR HISTORY */}
          {activeTab === 'history' && (
            <>
              {/* Quick History Statistics Banner */}
              {historyStats && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                    gap: 8,
                    background: 'rgba(255,255,255,0.02)',
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Nykyinen</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#22d3ee' }}>
                      {historyStats.latest !== null ? `${historyStats.latest.toFixed(1)} °C` : '-'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Minimi</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {historyStats.min.toFixed(1)} °C
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Maksimi</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {historyStats.max.toFixed(1)} °C
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Keskiarvo</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {historyStats.avg.toFixed(1)} °C
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Muutos jaksolla</div>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        color: historyStats.diff > 0 ? '#f87171' : historyStats.diff < 0 ? '#38bdf8' : 'var(--text-secondary)',
                      }}
                    >
                      {historyStats.diff > 0 ? `+${historyStats.diff.toFixed(1)}` : historyStats.diff.toFixed(1)} °C
                    </div>
                  </div>
                </div>
              )}

              {/* History Chart */}
              <div style={{ height: 300, width: '100%', position: 'relative' }}>
                {loading ? (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'rgba(15, 23, 42, 0.4)',
                      backdropFilter: 'blur(2px)',
                      borderRadius: 8,
                    }}
                  >
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Ladataan historiadatan tietoja...</div>
                  </div>
                ) : historyData.length === 0 ? (
                  <div
                    style={{
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                    }}
                  >
                    <span style={{ fontSize: 24 }}>📉</span>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Ei historiatietoja valitulle jaksolle</span>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={historyData} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradHistoryOnly" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                      <XAxis
                        dataKey="time"
                        type="number"
                        domain={['dataMin', 'dataMax']}
                        tickFormatter={(ts) => formatTickTime(ts, historyDurationHours)}
                        stroke="var(--text-muted)"
                        fontSize={11}
                        tickLine={false}
                        axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                      />
                      <YAxis
                        stroke="var(--text-muted)"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        domain={['auto', 'auto']}
                        tickFormatter={(v) => `${Math.round(v * 10) / 10}°`}
                      />
                      <Tooltip content={<HistoryTooltip />} />
                      {historyStats && (
                        <ReferenceLine
                          y={historyStats.avg}
                          stroke="rgba(255,255,255,0.25)"
                          strokeDasharray="3 3"
                          label={{
                            value: `Ka: ${historyStats.avg.toFixed(1)}°`,
                            fill: 'var(--text-muted)',
                            fontSize: 10,
                            position: 'insideTopLeft',
                          }}
                        />
                      )}
                      <ReferenceLine
                        y={0}
                        stroke="rgba(56, 189, 248, 0.4)"
                        strokeDasharray="2 2"
                      />
                      <Area
                        type="monotone"
                        dataKey="outsideTemp"
                        name="Ulkoilma (Outside_Temp)"
                        stroke="#22d3ee"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#gradHistoryOnly)"
                        isAnimationActive={false}
                      />
                      {includePipeTemp && (
                        <Line
                          type="monotone"
                          dataKey="outsidePipeTemp"
                          name="Ulkoputki (Pipe_Temp)"
                          stroke="#f59e0b"
                          strokeWidth={1.5}
                          dot={false}
                          isAnimationActive={false}
                        />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>
            </>
          )}

          {/* TAB 3: WEATHER FORECAST & 7-DAY OUTLOOK */}
          {activeTab === 'forecast' && (
            <>
              {/* Current Weather Station Summary */}
              {weatherCurrent && (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'rgba(255,255,255,0.03)',
                    padding: '14px 18px',
                    borderRadius: 10,
                    border: '1px solid rgba(255,255,255,0.08)',
                    gap: 16,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <span style={{ fontSize: 44, lineHeight: 1 }}>{getEmoji(weatherCurrent.symbol || '')}</span>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Met.no Havaintoasema (Järvenpää)</div>
                      <div style={{ fontSize: 26, fontWeight: 700, color: tempColor(weatherCurrent.temperature) }}>
                        {weatherCurrent.temperature.toFixed(1)} <span style={{ fontSize: 16 }}>°C</span>
                      </div>
                      {weatherCurrent.feels_like !== null && (
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          Tuntuu kuin {weatherCurrent.feels_like.toFixed(1)} °C
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, minWidth: 260 }}>
                    <div className="metric metric-sm">
                      <span className="metric-label">Tuuli</span>
                      <span className="metric-value">
                        {weatherCurrent.wind_speed != null ? `${weatherCurrent.wind_speed.toFixed(1)}` : '—'}
                        <span className="metric-unit">m/s</span>
                      </span>
                    </div>
                    <div className="metric metric-sm">
                      <span className="metric-label">Kosteus</span>
                      <span className="metric-value">
                        {weatherCurrent.humidity != null ? `${Math.round(weatherCurrent.humidity)}` : '—'}
                        <span className="metric-unit">%</span>
                      </span>
                    </div>
                    <div className="metric metric-sm">
                      <span className="metric-label">Ilmanpaine</span>
                      <span className="metric-value">
                        {weatherCurrent.pressure != null ? `${Math.round(weatherCurrent.pressure)}` : '—'}
                        <span className="metric-unit">hPa</span>
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Hourly Forecast Strip */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>⏱️</span> Tuntiennuste (seuraavat 24h)
                </div>
                {weatherForecast.length === 0 ? (
                  <p className="no-data">Ei ennustedataa saatavilla</p>
                ) : (
                  <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
                    <div style={{ display: 'flex', gap: 8, minWidth: 'min-content' }}>
                      {weatherForecast.slice(0, 24).map((f) => {
                        const d = new Date(f.time);
                        const timeStr = d.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
                        return (
                          <div
                            key={f.time}
                            className="metric-box"
                            style={{
                              flex: '0 0 68px',
                              textAlign: 'center',
                              padding: '10px 6px',
                              borderRadius: 8,
                              background: 'rgba(255,255,255,0.03)',
                              border: '1px solid rgba(255,255,255,0.06)',
                            }}
                          >
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{timeStr}</div>
                            <div style={{ fontSize: 22, margin: '4px 0' }}>{getEmoji(f.symbol || '')}</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: tempColor(f.temperature) }}>
                              {Math.round(f.temperature)}°
                            </div>
                            {f.rain_mm > 0 ? (
                              <div style={{ fontSize: 10, color: '#38bdf8', fontWeight: 600, marginTop: 2 }}>
                                {f.rain_mm.toFixed(1)} mm
                              </div>
                            ) : (
                              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>0 mm</div>
                            )}
                            {f.wind_speed != null && (
                              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                                {f.wind_speed.toFixed(0)} m/s
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* 7-Day Forecast Grid */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>📅</span> 7 vuorokauden sääkatsaus
                </div>
                {weatherDaily.length === 0 ? (
                  <p className="no-data">Ei päiväennustetta saatavilla</p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(105px, 1fr))', gap: 8 }}>
                    {weatherDaily.slice(0, 7).map((d) => {
                      const symbols = [...new Set(d.symbols?.split(',') || [])].filter(Boolean);
                      const dayDate = new Date(d.day);
                      const dayName = isNaN(dayDate.getTime()) ? d.day : dayDate.toLocaleDateString('fi-FI', { weekday: 'short', day: 'numeric', month: 'numeric' });
                      return (
                        <div
                          key={d.day}
                          className="metric-box"
                          style={{
                            textAlign: 'center',
                            padding: '12px 8px',
                            borderRadius: 8,
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.06)',
                          }}
                        >
                          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>{dayName}</div>
                          <div style={{ fontSize: 24, margin: '6px 0' }}>{getEmoji(symbols[0] || '')}</div>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>
                            <span style={{ color: tempColor(d.maxTemp) }}>{Math.round(d.maxTemp)}°</span>
                            <span style={{ color: 'var(--text-muted)', margin: '0 2px' }}>/</span>
                            <span style={{ color: tempColor(d.minTemp) }}>{Math.round(d.minTemp)}°</span>
                          </div>
                          {d.avgRain > 0 ? (
                            <div style={{ fontSize: 10, color: '#38bdf8', fontWeight: 600, marginTop: 4 }}>
                              ~{d.avgRain.toFixed(1)} mm
                            </div>
                          ) : (
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>Poutaa</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
