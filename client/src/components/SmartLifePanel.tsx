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
  const doorSensors = devices.filter((d) => d.type === 'door');
  const otherDevices = devices.filter((d) => d.type !== 'climate' && d.type !== 'water_leak' && d.type !== 'door');

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

        const timeMap = new Map<number, { temperature?: number; humidity?: number }>();

        for (const r of tempRows) {
          const t = Math.round(Number(r.recorded_at) / 60000) * 60000;
          const curr = timeMap.get(t) || {};
          curr.temperature = Number(r.value);
          timeMap.set(t, curr);
        }

        for (const r of humidRows) {
          const t = Math.round(Number(r.recorded_at) / 60000) * 60000;
          const curr = timeMap.get(t) || {};
          curr.humidity = Number(r.value);
          timeMap.set(t, curr);
        }

        const points: SensorHistoryPoint[] = Array.from(timeMap.entries())
          .map(([time, vals]) => ({ time, ...vals }))
          .sort((a, b) => a.time - b.time);

        setHistoryData(points);
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

        {/* 4. Door Sensors & Others */}
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
