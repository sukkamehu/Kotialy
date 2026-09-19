import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { apiFetch } from '../lib/api';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';

export interface TrendTopicTarget {
  topic: string;
  label: string;
  unit: string;
  color?: string;
  currentValue?: number | string | null;
}

interface VariableTrendModalProps {
  target: TrendTopicTarget | null;
  onClose: () => void;
}

type TrendPreset = '6h' | '24h' | 'today' | 'yesterday' | '7d' | '30d' | 'custom_day' | 'custom_range';

interface HistoryPoint {
  time: number;
  value: number;
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

export function VariableTrendModal({ target, onClose }: VariableTrendModalProps) {
  const [preset, setPreset] = useState<TrendPreset>('24h');
  const todayStr = useMemo(() => toLocalDateString(new Date()), []);
  const [selectedDay, setSelectedDay] = useState<string>(todayStr);
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return toLocalDateString(d);
  });
  const [endDate, setEndDate] = useState<string>(todayStr);

  const [data, setData] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);

  // Compute fromMs and toMs
  const { fromMs, toMs, rangeDurationHours, formattedRangeLabel } = useMemo(() => {
    const now = Date.now();
    let from = now - 24 * 3600 * 1000;
    let to = now;
    let label = 'Viimeiset 24 tuntia';

    if (preset === '6h') {
      from = now - 6 * 3600 * 1000;
      to = now;
      label = 'Viimeiset 6 tuntia';
    } else if (preset === '24h') {
      from = now - 24 * 3600 * 1000;
      to = now;
      label = 'Viimeiset 24 tuntia';
    } else if (preset === 'today') {
      from = parseDateInput(todayStr, false);
      to = now;
      label = `Tänään (${new Date(from).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })})`;
    } else if (preset === 'yesterday') {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const yStr = toLocalDateString(y);
      from = parseDateInput(yStr, false);
      to = parseDateInput(yStr, true);
      label = `Eilen (${new Date(from).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })})`;
    } else if (preset === '7d') {
      from = now - 7 * 24 * 3600 * 1000;
      to = now;
      label = 'Viimeiset 7 päivää';
    } else if (preset === '30d') {
      from = now - 30 * 24 * 3600 * 1000;
      to = now;
      label = 'Viimeiset 30 päivää';
    } else if (preset === 'custom_day') {
      from = parseDateInput(selectedDay, false);
      const isToday = selectedDay === todayStr;
      to = isToday ? now : parseDateInput(selectedDay, true);
      const dObj = new Date(from);
      label = `Päivä: ${dObj.toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' })}`;
    } else if (preset === 'custom_range') {
      from = parseDateInput(startDate, false);
      const isToday = endDate === todayStr;
      to = isToday ? now : parseDateInput(endDate, true);
      const startObj = new Date(from);
      const endObj = new Date(to);
      label = `Aikajakso: ${startObj.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })} – ${endObj.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric', year: 'numeric' })}`;
    }

    const durationH = Math.max(1, (to - from) / (3600 * 1000));
    return { fromMs: from, toMs: to, rangeDurationHours: durationH, formattedRangeLabel: label };
  }, [preset, selectedDay, startDate, endDate, todayStr]);

  useEffect(() => {
    if (!target) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [target, onClose]);

  useEffect(() => {
    if (!target) return;

    let isMounted = true;
    setLoading(true);

    apiFetch(`/api/history?topic=${encodeURIComponent(target.topic)}&from=${fromMs}&to=${toMs}`)
      .then((res) => res.json())
      .then((json) => {
        if (!isMounted) return;
        const rows = (json.data || []).map((r: any) => ({
          time: Number(r.recorded_at),
          value: Number(r.value),
        }));
        setData(rows);
        setLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error('Failed to load topic history', err);
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [target, fromMs, toMs]);

  const stats = useMemo(() => {
    if (!data.length) return null;
    const values = data.map((d) => d.value).filter((v) => !isNaN(v));
    if (!values.length) return null;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const latest = data[data.length - 1]?.value ?? null;

    return { min, max, avg, latest, count: values.length };
  }, [data]);

  if (!target) return null;

  const color = target.color || '#38bdf8';
  const unit = target.unit || '';

  function stepDay(offset: number) {
    const cur = new Date(selectedDay);
    cur.setDate(cur.getDate() + offset);
    const newStr = toLocalDateString(cur);
    if (newStr <= todayStr) {
      setSelectedDay(newStr);
      setPreset('custom_day');
    }
  }

  const formatTimeTick = (ts: number) => {
    const d = new Date(ts);
    if (rangeDurationHours > 72) {
      return d.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' });
    }
    if (rangeDurationHours > 24) {
      return d.toLocaleDateString('fi-FI', { weekday: 'short', hour: '2-digit' });
    }
    return d.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const pt = payload[0];
    const val = pt.value;
    let formattedVal = typeof val === 'number' ? val.toFixed(1) : String(val);
    if (unit === 'W' && typeof val === 'number' && Math.abs(val) >= 1000) {
      formattedVal = `${(val / 1000).toFixed(2)} kW`;
    } else if (unit) {
      formattedVal = `${formattedVal} ${unit}`;
    }

    return (
      <div style={{
        background: 'rgba(15,20,32,0.95)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 10,
        padding: '10px 14px',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
      }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
          {new Date(label).toLocaleString('fi-FI')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{target.label}</span>
          <span style={{ fontSize: 14, fontWeight: 700, color, marginLeft: 'auto' }}>
            {formattedVal}
          </span>
        </div>
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
          maxWidth: 760,
          width: '100%',
          boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
          borderColor: 'rgba(255,255,255,0.15)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '92vh',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          className="card-header"
          style={{
            borderBottom: '1px solid var(--border)',
            padding: '14px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: color,
                  boxShadow: `0 0 10px ${color}`,
                }}
              />
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {target.label}
                </h3>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{target.topic}</span>
              </div>
            </div>

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
              title="Sulje"
            >
              ✕
            </button>
          </div>

          {/* Quick preset tabs */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            {[
              { id: '6h', label: '6h' },
              { id: '24h', label: '24h' },
              { id: 'today', label: 'Tänään' },
              { id: 'yesterday', label: 'Eilen' },
              { id: '7d', label: '7 pv' },
              { id: '30d', label: '30 pv' },
              { id: 'custom_range', label: '🗓️ Jakso' },
            ].map((p) => (
              <button
                key={p.id}
                className={`btn btn-sm ${preset === p.id ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setPreset(p.id as TrendPreset)}
                style={{
                  padding: '3px 9px',
                  fontSize: 11,
                  fontWeight: preset === p.id ? 700 : 500,
                  borderRadius: 6,
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Date Selector Toolbars */}
          {(preset === 'custom_day' || preset === 'today' || preset === 'yesterday') && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(255,255,255,0.03)',
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.06)',
              flexWrap: 'wrap',
              gap: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => stepDay(-1)}
                  style={{ padding: '2px 8px', fontSize: 11 }}
                >
                  ◀ Edellinen
                </button>
                
                <input
                  type="date"
                  max={todayStr}
                  value={preset === 'today' ? todayStr : preset === 'yesterday' ? (() => { const d = new Date(); d.setDate(d.getDate() - 1); return toLocalDateString(d); })() : selectedDay}
                  onChange={(e) => {
                    if (e.target.value) {
                      setSelectedDay(e.target.value);
                      setPreset('custom_day');
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
                  disabled={(preset === 'today' ? todayStr : selectedDay) >= todayStr}
                  style={{ padding: '2px 8px', fontSize: 11, opacity: (preset === 'today' ? todayStr : selectedDay) >= todayStr ? 0.3 : 1 }}
                >
                  Seuraava ▶
                </button>
              </div>

              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                📅 {formattedRangeLabel}
              </div>
            </div>
          )}

          {preset === 'custom_range' && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(255,255,255,0.03)',
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.06)',
              flexWrap: 'wrap',
              gap: 8,
            }}>
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

              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                📅 {formattedRangeLabel}
              </div>
            </div>
          )}
        </div>

        {/* Content Body */}
        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
          {/* Quick Statistics Banner */}
          {stats && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 8,
                background: 'rgba(255,255,255,0.02)',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Nykyinen</div>
                <div style={{ fontSize: 15, fontWeight: 700, color }}>
                  {stats.latest !== null ? stats.latest.toFixed(1) : '-'} {unit}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Minimi</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {stats.min.toFixed(1)} {unit}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Maksimi</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {stats.max.toFixed(1)} {unit}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Keskiarvo</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {stats.avg.toFixed(1)} {unit}
                </div>
              </div>
            </div>
          )}

          {/* Chart Area */}
          <div style={{ height: 280, width: '100%', position: 'relative' }}>
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
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Ladataan trenditietoja...</div>
              </div>
            ) : data.length === 0 ? (
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
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Ei historiatietoja valitulle aikajaksolle
                </span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`grad-${target.topic}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={color} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={color} stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis
                    dataKey="time"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={formatTimeTick}
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
                    tickFormatter={(val) => {
                      if (unit === 'W' && Math.abs(val) >= 1000) return `${(val / 1000).toFixed(0)}k`;
                      return String(Math.round(val * 10) / 10);
                    }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  {stats && (
                    <ReferenceLine
                      y={stats.avg}
                      stroke="rgba(255,255,255,0.25)"
                      strokeDasharray="3 3"
                      label={{
                        value: `Ka: ${stats.avg.toFixed(1)}`,
                        fill: 'var(--text-muted)',
                        fontSize: 10,
                        position: 'insideTopLeft',
                      }}
                    />
                  )}
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={color}
                    strokeWidth={2}
                    fillOpacity={1}
                    fill={`url(#grad-${target.topic})`}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
