import { useState, useEffect, useMemo } from 'react';
import { useTuya } from '../hooks/useTuya';
import { apiFetch } from '../lib/api';
import type { TuyaDevice } from '../types/tuya';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

function cleanTopicName(name: string): string {
  if (!name) return 'unknown';
  return name
    .toLowerCase()
    .replace(/ä|å/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function toLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

type SmartLifeHistoryPreset = 'today' | 'yesterday' | '2d' | '7d' | '14d' | '30d' | 'day';

interface SensorHistoryPoint {
  time: number;
  temperature?: number;
  humidity?: number;
}

export function SmartLifePanel() {
  const { devices, loading, refreshing, refreshDevices } = useTuya();
  const [selectedSensor, setSelectedSensor] = useState<TuyaDevice | null>(null);
  const [historyPreset, setHistoryPreset] = useState<SmartLifeHistoryPreset>('today');
  const [selectedDate, setSelectedDate] = useState<string>(() => toLocalDateString());
  const [historyData, setHistoryData] = useState<SensorHistoryPoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);

  const todayStr = useMemo(() => toLocalDateString(), []);

  const { fromMs, toMs, dateLabel, isSingleDay } = useMemo(() => {
    const nowMs = Date.now();
    if (historyPreset === 'today') {
      const [y, m, d] = todayStr.split('-').map(Number);
      const from = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
      return { fromMs: from, toMs: nowMs, dateLabel: 'Tänään', isSingleDay: true, effectiveDays: 1 };
    }
    if (historyPreset === 'yesterday') {
      const yest = new Date();
      yest.setDate(yest.getDate() - 1);
      const [y, m, d] = toLocalDateString(yest).split('-').map(Number);
      const from = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
      const to = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
      const dayName = new Date(from).toLocaleDateString('fi-FI', { weekday: 'short', day: 'numeric', month: 'numeric' });
      return { fromMs: from, toMs: to, dateLabel: `Eilen (${dayName})`, isSingleDay: true, effectiveDays: 1 };
    }
    if (historyPreset === '2d') {
      return { fromMs: nowMs - 2 * 24 * 3600 * 1000, toMs: nowMs, dateLabel: '2 päivää', isSingleDay: false, effectiveDays: 2 };
    }
    if (historyPreset === '7d') {
      return { fromMs: nowMs - 7 * 24 * 3600 * 1000, toMs: nowMs, dateLabel: '7 päivää', isSingleDay: false, effectiveDays: 7 };
    }
    if (historyPreset === '14d') {
      return { fromMs: nowMs - 14 * 24 * 3600 * 1000, toMs: nowMs, dateLabel: '14 päivää', isSingleDay: false, effectiveDays: 14 };
    }
    if (historyPreset === '30d') {
      return { fromMs: nowMs - 30 * 24 * 3600 * 1000, toMs: nowMs, dateLabel: '30 päivää', isSingleDay: false, effectiveDays: 30 };
    }

    // Single custom day mode
    const [y, m, d] = selectedDate.split('-').map(Number);
    const from = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
    const isSelectedToday = selectedDate === todayStr;
    const to = isSelectedToday ? nowMs : new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
    const dayName = new Date(from).toLocaleDateString('fi-FI', { weekday: 'short', day: 'numeric', month: 'numeric' });
    return { fromMs: from, toMs: to, dateLabel: isSelectedToday ? `Tänään (${dayName})` : dayName, isSingleDay: true, effectiveDays: 1 };
  }, [historyPreset, selectedDate, todayStr]);

  const handlePrevDay = () => {
    const base = historyPreset === 'today' ? todayStr : historyPreset === 'yesterday' ? (() => {
      const y = new Date(); y.setDate(y.getDate() - 1); return toLocalDateString(y);
    })() : selectedDate;
    const [y, m, d] = base.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    dateObj.setDate(dateObj.getDate() - 1);
    const prevStr = toLocalDateString(dateObj);
    setSelectedDate(prevStr);
    setHistoryPreset('day');
  };

  const handleNextDay = () => {
    const base = historyPreset === 'yesterday' ? (() => {
      const y = new Date(); y.setDate(y.getDate() - 1); return toLocalDateString(y);
    })() : selectedDate;
    const [y, m, d] = base.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    dateObj.setDate(dateObj.getDate() + 1);
    const nextStr = toLocalDateString(dateObj);
    if (nextStr > todayStr) return;
    setSelectedDate(nextStr);
    setHistoryPreset(nextStr === todayStr ? 'today' : 'day');
  };

  const handleGoToday = () => {
    setSelectedDate(todayStr);
    setHistoryPreset('today');
  };

  // Categorize devices
  const climateSensors = devices.filter((d) => d.type === 'climate');
  const waterLeakSensors = devices.filter((d) => d.type === 'water_leak');
  const lightDevices = devices.filter((d) => d.type === 'light');
  const doorSensors = devices.filter((d) => d.type === 'door');
  const otherDevices = devices.filter((d) => d.type !== 'climate' && d.type !== 'water_leak' && d.type !== 'door' && d.type !== 'light');

  const [showIndividualSaunaLights, setShowIndividualSaunaLights] = useState(false);

  // Group lights by room/function
  const isSaunaLight = (d: TuyaDevice) => {
    const n = (d.name || '').toLowerCase();
    return (
      n.includes('kattovalo 2') ||
      n.includes('kattovalo 3') ||
      n.includes('kattovalo2') ||
      n.includes('kattovalo3') ||
      n.includes('saunavalo') ||
      n.includes('sauna') ||
      d.id === 'bf13f2d77b1ba3f1cfhv4h' ||
      d.id === 'bf40483433d60b29d5xfe5'
    );
  };

  const isMancaveLight = (d: TuyaDevice) => {
    const n = (d.name || '').toLowerCase();
    return n.includes('kattovalo 4') || n.includes('kattovalo4') || n.includes('mancave') || n.includes('leffa') || d.id === 'bf38f4ea3b7b50b33fzoax';
  };

  const isWcLight = (d: TuyaDevice) => {
    const n = (d.name || '').toLowerCase();
    return (
      (n.includes('kattovalo') && !isSaunaLight(d) && !isMancaveLight(d)) ||
      n.includes('wc') ||
      d.id === 'bfefd134eb01593593vfd6'
    );
  };

  const saunaLights = lightDevices.filter(isSaunaLight);
  const wcLights = lightDevices.filter(isWcLight);
  const mancaveLights = lightDevices.filter(isMancaveLight);
  const otherLights = lightDevices.filter(d => !isSaunaLight(d) && !isWcLight(d) && !isMancaveLight(d));

  const handleControlLight = async (deviceId: string | string[], params: Record<string, any>) => {
    try {
      const isArray = Array.isArray(deviceId);
      await apiFetch('/api/tuya/light', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isArray ? { device_ids: deviceId } : { device_id: deviceId }),
          ...params,
        }),
      });
      refreshDevices();
    } catch (err) {
      console.error('Failed to control light:', err);
    }
  };

  // Auto-select first climate sensor if none selected
  useEffect(() => {
    if (!selectedSensor && climateSensors.length > 0) {
      setSelectedSensor(climateSensors[0]);
    }
  }, [climateSensors, selectedSensor]);

  // Fetch history when selected sensor or timeframe changes
  useEffect(() => {
    if (!selectedSensor) {
      setHistoryData([]);
      return;
    }

    let isMounted = true;
    setHistoryLoading(true);

    const slug = cleanTopicName(selectedSensor.name);
    const legacySlug = selectedSensor.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const tempTopic = `tuya/${slug}/temperature`;
    const humidTopic = `tuya/${slug}/humidity`;
    const legacyTempTopic = `tuya/${legacySlug}/temperature`;
    const legacyHumidTopic = `tuya/${legacySlug}/humidity`;

    const allTopics = Array.from(new Set([tempTopic, humidTopic, legacyTempTopic, legacyHumidTopic])).join(',');

    apiFetch(`/api/history/multi?topics=${encodeURIComponent(allTopics)}&from=${fromMs}&to=${toMs}`)
      .then((res) => res.json())
      .then((json) => {
        if (!isMounted) return;
        const dataMap = json.data || {};
        const tempRows = (dataMap[tempTopic] || dataMap[legacyTempTopic] || []);
        const humidRows = (dataMap[humidTopic] || dataMap[legacyHumidTopic] || []);

        const isSauna = selectedSensor.name.toLowerCase().includes('sauna');
        const timeMap = new Map<number, { temperature?: number; humidity?: number }>();

        for (const r of tempRows) {
          let v = Number(r.value);
          if (isNaN(v) || !isFinite(v)) continue;
          if (v > 100 && v <= 1000) v = v / 10;
          if (isSauna) {
            if (v < -20 || v > 130) continue;
          } else {
            if (v < -30 || v > 45) continue;
          }
          const t = Math.round(Number(r.recorded_at) / 60000) * 60000;
          const curr = timeMap.get(t) || {};
          curr.temperature = Math.round(v * 10) / 10;
          timeMap.set(t, curr);
        }

        for (const r of humidRows) {
          let v = Number(r.value);
          if (isNaN(v) || !isFinite(v)) continue;
          if (v > 100 && v <= 1000) v = v / 10;
          if (v > 100 && v <= 102) v = 100;
          if (v < 0 || v > 100) continue;
          const t = Math.round(Number(r.recorded_at) / 60000) * 60000;
          const curr = timeMap.get(t) || {};
          curr.humidity = Math.round(v);
          timeMap.set(t, curr);
        }

        let rawPoints: SensorHistoryPoint[] = Array.from(timeMap.entries())
          .map(([time, vals]) => ({ time, ...vals }))
          .sort((a, b) => a.time - b.time);

        // Outlier spike filter on sequential series
        if (!isSauna && rawPoints.length > 2) {
          rawPoints = rawPoints.map((pt, idx, arr) => {
            let temp = pt.temperature;
            let humid = pt.humidity;
            if (idx > 0 && idx < arr.length - 1) {
              const prev = arr[idx - 1];
              const next = arr[idx + 1];
              if (temp != null && prev.temperature != null && next.temperature != null) {
                const prevDiff = Math.abs(temp - prev.temperature);
                const nextDiff = Math.abs(temp - next.temperature);
                const baselineDiff = Math.abs(prev.temperature - next.temperature);
                // Isolated spike
                if (prevDiff >= 8 && nextDiff >= 8 && baselineDiff < 4) {
                  temp = Math.round(((prev.temperature + next.temperature) / 2) * 10) / 10;
                }
              }
              if (humid != null && prev.humidity != null && next.humidity != null) {
                const prevDiff = Math.abs(humid - prev.humidity);
                const nextDiff = Math.abs(humid - next.humidity);
                const baselineDiff = Math.abs(prev.humidity - next.humidity);
                if (prevDiff >= 30 && nextDiff >= 30 && baselineDiff < 15) {
                  humid = Math.round((prev.humidity + next.humidity) / 2);
                }
              }
            }
            return { ...pt, temperature: temp, humidity: humid };
          });
        }

        setHistoryData(rawPoints);
      })
      .catch((err) => {
        console.error('Failed to load sensor history:', err);
      })
      .finally(() => {
        if (isMounted) setHistoryLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedSensor, fromMs, toMs]);

  // Compute min/max/avg for history summary
  const temps = historyData.map((d) => d.temperature).filter((t): t is number => typeof t === 'number');
  const humids = historyData.map((d) => d.humidity).filter((h): h is number => typeof h === 'number');

  const minTemp = temps.length ? Math.min(...temps) : null;
  const maxTemp = temps.length ? Math.max(...temps) : null;
  const avgTemp = temps.length ? (temps.reduce((a, b) => a + b, 0) / temps.length) : null;

  const minHumid = humids.length ? Math.min(...humids) : null;
  const maxHumid = humids.length ? Math.max(...humids) : null;
  const avgHumid = humids.length ? (humids.reduce((a, b) => a + b, 0) / humids.length) : null;

  return (
    <div className="card">
      <div className="card-header" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="card-icon">📱</span>
          <div>
            <span className="card-title">Smart Life -anturit ja mittaushistoria</span>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              Yhteensä {devices.length} laitetta Tuya IoT -pilvestä reaaliaikaisella mittaushistorialla
            </div>
          </div>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={refreshDevices}
            disabled={refreshing || loading}
            style={{
              padding: '5px 12px',
              fontSize: 12,
              borderRadius: 8,
              border: '1px solid rgba(255, 255, 255, 0.1)',
              background: 'rgba(255, 255, 255, 0.04)',
              color: 'var(--text-primary)',
              cursor: refreshing ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>{refreshing ? '⏳' : '🔄'}</span>
            <span>{refreshing ? 'Synkronoidaan...' : 'Päivitä laitteet'}</span>
          </button>
        </div>
      </div>

      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* 1. Climate Sensors Grid */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#38bdf8', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🌡️</span> Lämpötila- ja kosteusanturit ({climateSensors.length} kpl)
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
              Valitse anturi nähdäksesi mittaushistorian
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {climateSensors.map((d: TuyaDevice) => {
              const isSelected = selectedSensor?.id === d.id;
              return (
                <div
                  key={d.id}
                  onClick={() => setSelectedSensor(d)}
                  style={{
                    background: isSelected ? 'rgba(56, 189, 248, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                    border: isSelected ? '2px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: 10,
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: isSelected ? '#38bdf8' : 'var(--text-primary)' }}>
                      {d.name}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {isSelected && (
                        <span style={{ fontSize: 10, color: '#38bdf8', background: 'rgba(56, 189, 248, 0.2)', padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>
                          📈 Valittu
                        </span>
                      )}
                      {d.online ? (
                        <span style={{ fontSize: 10, color: '#4ade80', background: 'rgba(34, 197, 94, 0.12)', padding: '2px 6px', borderRadius: 10 }}>Online</span>
                      ) : (
                        <span style={{ fontSize: 10, color: '#f87171', background: 'rgba(239, 68, 68, 0.12)', padding: '2px 6px', borderRadius: 10 }}>Offline</span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
                    <div>
                      <span style={{ fontSize: 20, fontWeight: 700, color: '#fb923c' }}>
                        {d.properties.temperature != null ? `${d.properties.temperature} °C` : '--'}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: '#38bdf8', fontWeight: 600 }}>
                      {d.properties.humidity != null ? `💧 ${d.properties.humidity} %` : ''}
                    </div>
                  </div>

                  {d.properties.battery != null && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 4, marginTop: 2 }}>
                      <span>🔋 Paristo:</span>
                      <span>{d.properties.battery} %</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 2. Interactive History Graph Section */}
        {selectedSensor && (
          <div style={{
            background: 'rgba(0, 0, 0, 0.3)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            borderRadius: 12,
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>📈</span>
                <div>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {selectedSensor.name} — Mittaushistoria
                  </span>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    Lämpötila (°C) ja kosteus (%) ajan funktiona
                  </div>
                </div>
              </div>

              {/* Timeframe Presets */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { preset: 'today' as SmartLifeHistoryPreset, label: 'Tänään' },
                  { preset: 'yesterday' as SmartLifeHistoryPreset, label: 'Eilen' },
                  { preset: '2d' as SmartLifeHistoryPreset, label: '2 pv' },
                  { preset: '7d' as SmartLifeHistoryPreset, label: '7 pv' },
                  { preset: '14d' as SmartLifeHistoryPreset, label: '14 pv' },
                  { preset: '30d' as SmartLifeHistoryPreset, label: '30 pv' },
                ].map(({ preset, label }) => {
                  const isSelected = historyPreset === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setHistoryPreset(preset)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 600,
                        border: isSelected ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.08)',
                        background: isSelected ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.03)',
                        color: isSelected ? '#38bdf8' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Day Navigator Stepper Bar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(255, 255, 255, 0.03)',
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid rgba(255, 255, 255, 0.06)',
              flexWrap: 'wrap',
              gap: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handlePrevDay}
                  title="Edellinen päivä"
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <span>◀</span>
                  <span>Edellinen</span>
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="date"
                    max={todayStr}
                    value={
                      historyPreset === 'today'
                        ? todayStr
                        : historyPreset === 'yesterday'
                        ? (() => {
                            const y = new Date();
                            y.setDate(y.getDate() - 1);
                            return toLocalDateString(y);
                          })()
                        : selectedDate
                    }
                    onChange={(e) => {
                      if (e.target.value) {
                        setSelectedDate(e.target.value);
                        setHistoryPreset(e.target.value === todayStr ? 'today' : 'day');
                      }
                    }}
                    style={{
                      background: 'rgba(0,0,0,0.4)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 6,
                      color: '#38bdf8',
                      padding: '3px 8px',
                      fontSize: 11,
                      fontWeight: 600,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                    }}
                  />

                  {historyPreset !== 'today' && selectedDate !== todayStr && (
                    <button
                      type="button"
                      onClick={handleGoToday}
                      style={{
                        padding: '3px 8px',
                        borderRadius: 6,
                        fontSize: 10,
                        background: 'rgba(56, 189, 248, 0.15)',
                        border: '1px solid rgba(56, 189, 248, 0.3)',
                        color: '#38bdf8',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      ⟲ Tänään
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleNextDay}
                  disabled={
                    historyPreset === 'today' ||
                    (historyPreset === 'day' && selectedDate >= todayStr)
                  }
                  title="Seuraava päivä"
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    background:
                      historyPreset === 'today' ||
                      (historyPreset === 'day' && selectedDate >= todayStr)
                        ? 'rgba(255, 255, 255, 0.02)'
                        : 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    color:
                      historyPreset === 'today' ||
                      (historyPreset === 'day' && selectedDate >= todayStr)
                        ? 'var(--text-muted)'
                        : 'var(--text-primary)',
                    cursor:
                      historyPreset === 'today' ||
                      (historyPreset === 'day' && selectedDate >= todayStr)
                        ? 'not-allowed'
                        : 'pointer',
                    opacity:
                      historyPreset === 'today' ||
                      (historyPreset === 'day' && selectedDate >= todayStr)
                        ? 0.4
                        : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <span>Seuraava</span>
                  <span>▶</span>
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  🗓️ {dateLabel}
                </span>
                {isSingleDay && (
                  <span style={{ fontSize: 10, background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.25)', color: '#38bdf8', padding: '1px 6px', borderRadius: 8 }}>
                    1 vrk
                  </span>
                )}
              </div>
            </div>

            {/* Summary Stat Pills */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
              <div style={{ background: 'rgba(251, 146, 60, 0.08)', border: '1px solid rgba(251, 146, 60, 0.2)', padding: '8px 12px', borderRadius: 8 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Lämpötila (Nyk / Min / Max)</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fb923c', marginTop: 2 }}>
                  {selectedSensor.properties.temperature ?? '--'} °C
                  <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', marginLeft: 6 }}>
                    ({minTemp != null ? minTemp.toFixed(1) : '--'} ... {maxTemp != null ? maxTemp.toFixed(1) : '--'} °C)
                  </span>
                </div>
              </div>

              <div style={{ background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.2)', padding: '8px 12px', borderRadius: 8 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Kosteus (Nyk / Min / Max)</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#38bdf8', marginTop: 2 }}>
                  {selectedSensor.properties.humidity ?? '--'} %
                  <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', marginLeft: 6 }}>
                    ({minHumid != null ? minHumid.toFixed(0) : '--'} ... {maxHumid != null ? maxHumid.toFixed(0) : '--'} %)
                  </span>
                </div>
              </div>

              {avgTemp != null && (
                <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)', padding: '8px 12px', borderRadius: 8 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Jakson keskiarvolämpö</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>
                    {avgTemp.toFixed(1)} °C {avgHumid != null ? `(ka. ${avgHumid.toFixed(0)} %)` : ''}
                  </div>
                </div>
              )}
            </div>

            {/* Recharts Curve */}
            {historyLoading ? (
              <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Ladataan mittaushistoriaa...</span>
              </div>
            ) : historyData.length === 0 ? (
              <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 24 }}>📊</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                  Mittaushistoriaa tallennetaan taustalla minuutin välein. Ensimmäiset pisteet kertyvät pian.
                </span>
              </div>
            ) : (
              <div style={{ height: 260, width: '100%', marginTop: 6 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={historyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis
                      dataKey="time"
                      type="number"
                      domain={['dataMin', 'dataMax']}
                      tickFormatter={(t) => {
                        const d = new Date(t);
                        return !isSingleDay
                          ? `${d.getDate()}.${d.getMonth() + 1}. ${d.getHours()}:00`
                          : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                      }}
                      stroke="rgba(255,255,255,0.3)"
                      fontSize={11}
                    />
                    <YAxis
                      yAxisId="temp"
                      domain={['auto', 'auto']}
                      unit="°C"
                      stroke="#fb923c"
                      fontSize={11}
                    />
                    <YAxis
                      yAxisId="humid"
                      orientation="right"
                      domain={[0, 100]}
                      unit="%"
                      stroke="#38bdf8"
                      fontSize={11}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'rgba(15,20,32,0.95)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      labelFormatter={(t) => new Date(Number(t)).toLocaleString('fi-FI', {
                        day: 'numeric',
                        month: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      formatter={(val: any, name: any) => [
                        typeof val === 'number' ? val.toFixed(1) : val,
                        name === 'temperature' ? 'Lämpötila (°C)' : 'Kosteus (%)',
                      ]}
                    />
                    <Line
                      yAxisId="temp"
                      type="monotone"
                      dataKey="temperature"
                      name="temperature"
                      stroke="#fb923c"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      yAxisId="humid"
                      type="monotone"
                      dataKey="humidity"
                      name="humidity"
                      stroke="#38bdf8"
                      strokeWidth={1.5}
                      strokeDasharray="3 3"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* 3. Water Leak Sensors */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#34d399', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>💧</span> Vesivuotohälyttimet ({waterLeakSensors.length} kpl)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {waterLeakSensors.map((d: TuyaDevice) => {
              const isLeak = Boolean(d.properties.leak_detected);
              return (
                <div
                  key={d.id}
                  style={{
                    background: isLeak ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                    border: isLeak ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: 10,
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{d.name}</span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 8,
                        background: isLeak ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.15)',
                        color: isLeak ? '#fca5a5' : '#4ade80',
                      }}
                    >
                      {isLeak ? '🚨 VUOTOHÄLYTYS!' : '🟢 OK (Kuiva)'}
                    </span>
                  </div>

                  {d.properties.battery != null && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                      <span>🔋 Paristo:</span>
                      <span>{d.properties.battery} %</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 4. Smart RGB & Ceiling Lights */}
        {lightDevices.length > 0 && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>💡</span> Älyvalot & Huonekohtaiset RGB-kattovalot ({lightDevices.length} kpl)
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
                Kiuashehku · Merelliset sävyt · Leffatilat
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* A. SAUNA: Yhdistetyt kattovalot 2 & 3 */}
              {saunaLights.length > 0 && (() => {
                const anySaunaOn = saunaLights.some((d) => Boolean(d.properties.switch_led));
                const allSaunaOnline = saunaLights.every((d) => Boolean(d.online));
                const avgBright = Math.round(
                  (saunaLights.reduce((acc, d) => acc + (d.properties.bright_value || 1000), 0) / (saunaLights.length || 1)) / 10
                );
                const saunaIds = saunaLights.map((d) => d.id);

                return (
                  <div
                    style={{
                      background: anySaunaOn ? 'rgba(245, 158, 11, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                      border: anySaunaOn ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: 14,
                      padding: '14px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                    }}
                  >
                    {/* Header & Master Switch */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 22 }}>{anySaunaOn ? '🔥' : '🧖‍♂️'}</span>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                              Saunan kattovalot (Valot 2 & 3)
                            </span>
                            <span style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: '#f59e0b',
                              background: 'rgba(245, 158, 11, 0.15)',
                              border: '1px solid rgba(245, 158, 11, 0.3)',
                              padding: '2px 6px',
                              borderRadius: 6,
                            }}>
                              ✨ Yhdistetty ryhmä
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                            {allSaunaOnline ? `${anySaunaOn ? `Päällä (${avgBright} %)` : 'Sammutettu'} · Kiuashehku aktivoituu automaattisesti kiukaan lämmetessä` : 'Osa valoista offline'}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => handleControlLight(saunaIds, { power: !anySaunaOn })}
                          style={{
                            background: anySaunaOn ? 'linear-gradient(135deg, #f97316, #ea580c)' : 'rgba(255,255,255,0.08)',
                            border: anySaunaOn ? '1px solid rgba(249, 115, 22, 0.6)' : '1px solid rgba(255,255,255,0.15)',
                            color: '#fff',
                            fontSize: 12,
                            fontWeight: 700,
                            padding: '6px 14px',
                            borderRadius: 8,
                            cursor: 'pointer',
                            boxShadow: anySaunaOn ? '0 2px 10px rgba(249, 115, 22, 0.35)' : 'none',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {anySaunaOn ? '🔥 Ryhmä Päällä' : 'Pois päältä'}
                        </button>
                      </div>
                    </div>

                    {/* Master Brightness Slider */}
                    {anySaunaOn && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(0,0,0,0.2)', padding: '6px 12px', borderRadius: 8 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 60 }}>Kirkkaus:</span>
                        <input
                          type="range"
                          min="10"
                          max="100"
                          value={avgBright}
                          onChange={(e) => handleControlLight(saunaIds, { power: true, brightness: Number(e.target.value) * 10 })}
                          style={{ flex: 1, accentColor: '#f97316', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#f97316', minWidth: 40, textAlign: 'right' }}>
                          {avgBright} %
                        </span>
                      </div>
                    )}

                    {/* Sauna Presets (Affects both lights simultaneously) */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 2 }}>Esiasetukset:</span>
                      <button
                        type="button"
                        onClick={() => handleControlLight(saunaIds, { power: true, mode: 'colour', colorHsv: { h: 20, s: 960, v: 500 } })}
                        title="Kiuashehku (syvä oranssi hiillos)"
                        style={{
                          background: 'rgba(234, 88, 12, 0.2)',
                          border: '1px solid rgba(234, 88, 12, 0.45)',
                          color: '#fb923c',
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '4px 10px',
                          borderRadius: 7,
                          cursor: 'pointer',
                        }}
                      >
                        🔥 Kiuashehku
                      </button>
                      <button
                        type="button"
                        onClick={() => handleControlLight(saunaIds, { power: true, mode: 'colour', colorHsv: { h: 38, s: 800, v: 900 } })}
                        title="Saunakulta (lämmin kultainen hehku)"
                        style={{
                          background: 'rgba(234, 179, 8, 0.2)',
                          border: '1px solid rgba(234, 179, 8, 0.45)',
                          color: '#facc15',
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '4px 10px',
                          borderRadius: 7,
                          cursor: 'pointer',
                        }}
                      >
                        ✨ Saunakulta
                      </button>
                      <button
                        type="button"
                        onClick={() => handleControlLight(saunaIds, { power: true, mode: 'colour', colorHsv: { h: 26, s: 920, v: 400 } })}
                        title="Savusauna (pehmeä syvä meripihka)"
                        style={{
                          background: 'rgba(180, 83, 9, 0.2)',
                          border: '1px solid rgba(180, 83, 9, 0.45)',
                          color: '#fde047',
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '4px 10px',
                          borderRadius: 7,
                          cursor: 'pointer',
                        }}
                      >
                        🌲 Savusauna
                      </button>
                      <button
                        type="button"
                        onClick={() => handleControlLight(saunaIds, { power: true, mode: 'white', colorTemp: 1000, brightness: 700 })}
                        title="Lämmin valkoinen"
                        style={{
                          background: 'rgba(255, 255, 255, 0.08)',
                          border: '1px solid rgba(255, 255, 255, 0.2)',
                          color: '#fff',
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '4px 10px',
                          borderRadius: 7,
                          cursor: 'pointer',
                        }}
                      >
                        ☀️ Lämmin valkoinen
                      </button>
                      <button
                        type="button"
                        onClick={() => handleControlLight(saunaIds, { power: true, mode: 'white', colorTemp: 0, brightness: 1000 })}
                        title="Kirkas siivousvalo"
                        style={{
                          background: 'rgba(147, 197, 253, 0.15)',
                          border: '1px solid rgba(147, 197, 253, 0.3)',
                          color: '#bfdbfe',
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '4px 10px',
                          borderRadius: 7,
                          cursor: 'pointer',
                        }}
                      >
                        ❄️ Siivousvalo
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowIndividualSaunaLights(!showIndividualSaunaLights)}
                        style={{
                          marginLeft: 'auto',
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted)',
                          fontSize: 11,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <span>{showIndividualSaunaLights ? 'Piilota yksittäiset' : 'Yksittäiset valot'}</span>
                        <span>{showIndividualSaunaLights ? '▲' : '▼'}</span>
                      </button>
                    </div>

                    {/* Optional Individual Sauna Lights Dropdown */}
                    {showIndividualSaunaLights && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, marginTop: 4, paddingTop: 8, borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
                        {saunaLights.map((d: TuyaDevice) => {
                          const isOn = Boolean(d.properties.switch_led);
                          const b = d.properties.bright_value ? Math.round(d.properties.bright_value / 10) : 100;
                          return (
                            <div key={d.id} style={{ background: 'rgba(0,0,0,0.25)', padding: '8px 10px', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 600 }}>{d.name}</div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{isOn ? `Päällä (${b} %)` : 'Pois'}</div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleControlLight(d.id, { power: !isOn })}
                                style={{
                                  background: isOn ? '#f97316' : 'rgba(255,255,255,0.1)',
                                  border: 'none',
                                  color: '#fff',
                                  fontSize: 10,
                                  fontWeight: 600,
                                  padding: '3px 8px',
                                  borderRadius: 5,
                                  cursor: 'pointer',
                                }}
                              >
                                {isOn ? 'Päällä' : 'Pois'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* B. YLÄKERRAN WC: Kattovalo 1 (Merelliset värit) */}
              {wcLights.map((d: TuyaDevice) => {
                const isOn = Boolean(d.properties.switch_led);
                const isOnline = Boolean(d.online);
                const mode = d.properties.work_mode || 'white';
                const colour = d.properties.colour_data;
                const bright = d.properties.bright_value ? Math.round(d.properties.bright_value / 10) : 100;

                return (
                  <div
                    key={d.id}
                    style={{
                      background: isOn ? 'rgba(14, 165, 233, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                      border: isOn ? '1px solid rgba(14, 165, 233, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: 14,
                      padding: '14px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 22 }}>{isOn ? '🌊' : '🚽'}</span>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                              Yläkerran WC ({d.name})
                            </span>
                            <span style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: '#38bdf8',
                              background: 'rgba(56, 189, 248, 0.15)',
                              border: '1px solid rgba(56, 189, 248, 0.3)',
                              padding: '2px 6px',
                              borderRadius: 6,
                            }}>
                              🌊 Merelliset sävyt
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: isOnline ? 'var(--text-muted)' : '#ef4444', marginTop: 2 }}>
                            {isOnline ? `${bright} % · ${mode === 'colour' ? `Väritila (H:${colour?.h ?? 0})` : 'Valkoinen valo'}` : 'Laite offline'}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleControlLight(d.id, { power: !isOn })}
                        style={{
                          background: isOn ? 'linear-gradient(135deg, #0284c7, #0369a1)' : 'rgba(255,255,255,0.08)',
                          border: isOn ? '1px solid rgba(2, 132, 199, 0.6)' : '1px solid rgba(255,255,255,0.15)',
                          color: '#fff',
                          fontSize: 12,
                          fontWeight: 700,
                          padding: '6px 14px',
                          borderRadius: 8,
                          cursor: 'pointer',
                          boxShadow: isOn ? '0 2px 10px rgba(2, 132, 199, 0.35)' : 'none',
                        }}
                      >
                        {isOn ? '🌊 Päällä' : 'Pois päältä'}
                      </button>
                    </div>

                    {/* Brightness Slider */}
                    {isOn && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(0,0,0,0.2)', padding: '6px 12px', borderRadius: 8 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 60 }}>Kirkkaus:</span>
                        <input
                          type="range"
                          min="10"
                          max="100"
                          value={bright}
                          onChange={(e) => handleControlLight(d.id, { power: true, brightness: Number(e.target.value) * 10 })}
                          style={{ flex: 1, accentColor: '#38bdf8', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8', minWidth: 40, textAlign: 'right' }}>
                          {bright} %
                        </span>
                      </div>
                    )}

                    {/* Oceanic Presets */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 2 }}>Merelliset sävyt:</span>
                      <button
                        type="button"
                        onClick={() => handleControlLight(d.id, { power: true, mode: 'colour', colorHsv: { h: 210, s: 900, v: 750 } })}
                        title="Merensininen"
                        style={{
                          background: 'rgba(14, 165, 233, 0.2)',
                          border: '1px solid rgba(14, 165, 233, 0.45)',
                          color: '#38bdf8',
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '4px 10px',
                          borderRadius: 7,
                          cursor: 'pointer',
                        }}
                      >
                        🐬 Merensininen
                      </button>
                      <button
                        type="button"
                        onClick={() => handleControlLight(d.id, { power: true, mode: 'colour', colorHsv: { h: 175, s: 850, v: 700 } })}
                        title="Aqua & Turkoosi"
                        style={{
                          background: 'rgba(20, 184, 166, 0.2)',
                          border: '1px solid rgba(20, 184, 166, 0.45)',
                          color: '#2dd4bf',
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '4px 10px',
                          borderRadius: 7,
                          cursor: 'pointer',
                        }}
                      >
                        🌊 Aqua / Turkoosi
                      </button>
                      <button
                        type="button"
                        onClick={() => handleControlLight(d.id, { power: true, mode: 'colour', colorHsv: { h: 155, s: 800, v: 700 } })}
                        title="Tyyni laguuni"
                        style={{
                          background: 'rgba(16, 185, 129, 0.2)',
                          border: '1px solid rgba(16, 185, 129, 0.45)',
                          color: '#34d399',
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '4px 10px',
                          borderRadius: 7,
                          cursor: 'pointer',
                        }}
                      >
                        🏝️ Tyyni laguuni
                      </button>
                      <button
                        type="button"
                        onClick={() => handleControlLight(d.id, { power: true, mode: 'colour', colorHsv: { h: 235, s: 950, v: 650 } })}
                        title="Syvä valtameri"
                        style={{
                          background: 'rgba(99, 102, 241, 0.2)',
                          border: '1px solid rgba(99, 102, 241, 0.45)',
                          color: '#818cf8',
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '4px 10px',
                          borderRadius: 7,
                          cursor: 'pointer',
                        }}
                      >
                        ⚓ Syvä meri
                      </button>
                      <button
                        type="button"
                        onClick={() => handleControlLight(d.id, { power: true, mode: 'white', colorTemp: 400, brightness: 800 })}
                        title="Raikas merituuli (viileä valkoinen)"
                        style={{
                          background: 'rgba(255, 255, 255, 0.08)',
                          border: '1px solid rgba(255, 255, 255, 0.2)',
                          color: '#e0f2fe',
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '4px 10px',
                          borderRadius: 7,
                          cursor: 'pointer',
                        }}
                      >
                        💨 Merituuli
                      </button>
                      <button
                        type="button"
                        onClick={() => handleControlLight(d.id, { power: true, mode: 'white', colorTemp: 1000, brightness: 700 })}
                        title="Lämmin valkoinen"
                        style={{
                          background: 'rgba(255, 255, 255, 0.08)',
                          border: '1px solid rgba(255, 255, 255, 0.2)',
                          color: '#fff',
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '4px 10px',
                          borderRadius: 7,
                          cursor: 'pointer',
                        }}
                      >
                        ☀️ Lämmin valkoinen
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* C. MANCAVE / VIDEOTYKKIHUONE: Kattovalo 4 (Himmeät leffasävyt) */}
              {mancaveLights.map((d: TuyaDevice) => {
                const isOn = Boolean(d.properties.switch_led);
                const isOnline = Boolean(d.online);
                const mode = d.properties.work_mode || 'white';
                const colour = d.properties.colour_data;
                const bright = d.properties.bright_value ? Math.round(d.properties.bright_value / 10) : 100;

                return (
                  <div
                    key={d.id}
                    style={{
                      background: isOn ? 'rgba(168, 85, 247, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                      border: isOn ? '1px solid rgba(168, 85, 247, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: 14,
                      padding: '14px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 22 }}>{isOn ? '🎬' : '🍿'}</span>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                              Mancave / Videotykkihuone ({d.name})
                            </span>
                            <span style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: '#c084fc',
                              background: 'rgba(192, 132, 252, 0.15)',
                              border: '1px solid rgba(192, 132, 252, 0.3)',
                              padding: '2px 6px',
                              borderRadius: 6,
                            }}>
                              🎬 Elokuvatila & Himmeät sävyt
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: isOnline ? 'var(--text-muted)' : '#ef4444', marginTop: 2 }}>
                            {isOnline ? `${bright} % · ${mode === 'colour' ? `Väritila (H:${colour?.h ?? 0})` : 'Valkoinen valo'}` : 'Laite offline'}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleControlLight(d.id, { power: !isOn })}
                        style={{
                          background: isOn ? 'linear-gradient(135deg, #9333ea, #7e22ce)' : 'rgba(255,255,255,0.08)',
                          border: isOn ? '1px solid rgba(147, 51, 234, 0.6)' : '1px solid rgba(255,255,255,0.15)',
                          color: '#fff',
                          fontSize: 12,
                          fontWeight: 700,
                          padding: '6px 14px',
                          borderRadius: 8,
                          cursor: 'pointer',
                          boxShadow: isOn ? '0 2px 10px rgba(147, 51, 234, 0.35)' : 'none',
                        }}
                      >
                        {isOn ? '🎬 Päällä' : 'Pois päältä'}
                      </button>
                    </div>

                    {/* Brightness Slider with fine control */}
                    {isOn && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(0,0,0,0.2)', padding: '6px 12px', borderRadius: 8 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 60 }}>Kirkkaus:</span>
                        <input
                          type="range"
                          min="1"
                          max="100"
                          value={bright}
                          onChange={(e) => handleControlLight(d.id, { power: true, brightness: Math.max(10, Number(e.target.value) * 10) })}
                          style={{ flex: 1, accentColor: '#c084fc', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#c084fc', minWidth: 40, textAlign: 'right' }}>
                          {bright} %
                        </span>
                      </div>
                    )}

                    {/* Cinema / Mancave Presets */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 2 }}>Elokuvatunnelmat:</span>
                      <button
                        type="button"
                        onClick={() => handleControlLight(d.id, { power: true, mode: 'colour', colorHsv: { h: 220, s: 750, v: 80 } })}
                        title="Leffatila: Ultrahimmeä 8% elokuvansininen"
                        style={{
                          background: 'rgba(59, 130, 246, 0.2)',
                          border: '1px solid rgba(59, 130, 246, 0.45)',
                          color: '#60a5fa',
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '4px 10px',
                          borderRadius: 7,
                          cursor: 'pointer',
                        }}
                      >
                        🎬 Leffatila (8%)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleControlLight(d.id, { power: true, mode: 'colour', colorHsv: { h: 30, s: 900, v: 100 } })}
                        title="Teatteri: Himmeä 10% meripihka"
                        style={{
                          background: 'rgba(217, 119, 6, 0.2)',
                          border: '1px solid rgba(217, 119, 6, 0.45)',
                          color: '#fbbf24',
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '4px 10px',
                          borderRadius: 7,
                          cursor: 'pointer',
                        }}
                      >
                        🍿 Teatteri (10%)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleControlLight(d.id, { power: true, mode: 'colour', colorHsv: { h: 0, s: 1000, v: 80 } })}
                        title="Stealth Red: Himmeä 8% pimeänäköpunainen"
                        style={{
                          background: 'rgba(239, 68, 68, 0.2)',
                          border: '1px solid rgba(239, 68, 68, 0.45)',
                          color: '#f87171',
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '4px 10px',
                          borderRadius: 7,
                          cursor: 'pointer',
                        }}
                      >
                        🔴 Stealth Red (8%)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleControlLight(d.id, { power: true, mode: 'colour', colorHsv: { h: 280, s: 900, v: 120 } })}
                        title="Cyberpunk: Himmeä 12% neon violetti"
                        style={{
                          background: 'rgba(168, 85, 247, 0.2)',
                          border: '1px solid rgba(168, 85, 247, 0.45)',
                          color: '#c084fc',
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '4px 10px',
                          borderRadius: 7,
                          cursor: 'pointer',
                        }}
                      >
                        🌌 Cyberpunk (12%)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleControlLight(d.id, { power: true, mode: 'white', colorTemp: 1000, brightness: 100 })}
                        title="Himmeä lämmin valkoinen 10%"
                        style={{
                          background: 'rgba(255, 255, 255, 0.08)',
                          border: '1px solid rgba(255, 255, 255, 0.2)',
                          color: '#fef08a',
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '4px 10px',
                          borderRadius: 7,
                          cursor: 'pointer',
                        }}
                      >
                        🕯️ Hämärä (10%)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleControlLight(d.id, { power: true, mode: 'white', colorTemp: 800, brightness: 1000 })}
                        title="Täysi valo"
                        style={{
                          background: 'rgba(255, 255, 255, 0.08)',
                          border: '1px solid rgba(255, 255, 255, 0.2)',
                          color: '#fff',
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '4px 10px',
                          borderRadius: 7,
                          cursor: 'pointer',
                        }}
                      >
                        💡 Täysi valo
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* D. Muut mahdolliset valot */}
              {otherLights.map((d: TuyaDevice) => {
                const isOn = Boolean(d.properties.switch_led);
                const isOnline = Boolean(d.online);
                const bright = d.properties.bright_value ? Math.round(d.properties.bright_value / 10) : 100;

                return (
                  <div
                    key={d.id}
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: 12,
                      padding: '12px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 18 }}>{isOn ? '💡' : '🌑'}</span>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{d.name}</div>
                          <div style={{ fontSize: 10, color: isOnline ? 'var(--text-muted)' : '#ef4444' }}>
                            {isOnline ? `${bright} %` : 'Offline'}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleControlLight(d.id, { power: !isOn })}
                        style={{
                          background: isOn ? 'var(--heat-primary, #f97316)' : 'rgba(255,255,255,0.1)',
                          border: 'none',
                          color: '#fff',
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '4px 10px',
                          borderRadius: 6,
                          cursor: 'pointer',
                        }}
                      >
                        {isOn ? 'Päällä' : 'Pois'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 5. Door Sensors & Others */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#a78bfa', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>🚪</span> Ovi- ja muut laitteet ({doorSensors.length + otherDevices.length} kpl)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {doorSensors.map((d: TuyaDevice) => (
              <div
                key={d.id}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 10,
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{d.name}</span>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 8,
                    background: d.properties.is_open ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.12)',
                    color: d.properties.is_open ? '#f87171' : '#4ade80',
                  }}>
                    {d.properties.is_open ? 'Auki' : 'Suljettu'}
                  </span>
                </div>
                {d.properties.battery != null && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                    <span>🔋 Paristo:</span>
                    <span>{d.properties.battery} %</span>
                  </div>
                )}
              </div>
            ))}

            {otherDevices.map((d: TuyaDevice) => (
              <div
                key={d.id}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 10,
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{d.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d.model || d.category}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  Tyyppi: {d.type === 'sauna_switch' ? 'Saunan 3-vaiherele' : d.type === 'gateway' ? 'Tuya Yhdyskäytävä' : d.type}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
