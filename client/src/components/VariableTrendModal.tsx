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

type TimeRange = '6h' | '24h' | '3d' | '7d';

const HOURS_MAP: Record<TimeRange, number> = {
  '6h': 6,
  '24h': 24,
  '3d': 72,
  '7d': 168,
};

interface HistoryPoint {
  time: number;
  value: number;
}

export function VariableTrendModal({ target, onClose }: VariableTrendModalProps) {
  const [range, setRange] = useState<TimeRange>('24h');
  const [data, setData] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);

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

    const hours = HOURS_MAP[range];
    apiFetch(`/api/history?topic=${encodeURIComponent(target.topic)}&hours=${hours}`)
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
  }, [target, range]);

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

  const formatTimeTick = (ts: number) => {
    const d = new Date(ts);
    if (range === '6h' || range === '24h') {
      return d.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('fi-FI', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
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

  if (!target) return null;

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
          maxWidth: 720,
          width: '100%',
          boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
          borderColor: 'rgba(255,255,255,0.15)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
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
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>📈</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>
                {target.label}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{target.topic}</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Time Range Selector */}
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: 2 }}>
              {(['6h', '24h', '3d', '7d'] as TimeRange[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  style={{
                    padding: '4px 10px',
                    fontSize: 12,
                    fontWeight: range === r ? 700 : 500,
                    borderRadius: 6,
                    border: 'none',
                    background: range === r ? color : 'transparent',
                    color: range === r ? '#000' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {r === '24h' ? '24h (Päivä)' : r}
                </button>
              ))}
            </div>

            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--text-muted)',
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: 16,
                marginLeft: 4,
              }}
              title="Sulje"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="card-body" style={{ padding: '16px 18px', overflowY: 'auto' }}>
          {/* KPI Summary Tiles */}
          {stats && (
            <div
              className="metrics-grid metrics-grid-4"
              style={{
                marginBottom: 16,
                gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                gap: 10,
              }}
            >
              <div className="metric-box" style={{ padding: '10px 12px' }}>
                <span className="metric-label" style={{ fontSize: 10 }}>Nykyinen / Viimeisin</span>
                <span className="metric-value" style={{ color, fontSize: 18 }}>
                  {stats.latest != null ? stats.latest.toFixed(1) : '—'}
                  {unit && <span className="metric-unit" style={{ fontSize: 12 }}>{unit}</span>}
                </span>
              </div>
              <div className="metric-box" style={{ padding: '10px 12px' }}>
                <span className="metric-label" style={{ fontSize: 10 }}>Minimi ({range})</span>
                <span className="metric-value" style={{ fontSize: 18 }}>
                  {stats.min.toFixed(1)}
                  {unit && <span className="metric-unit" style={{ fontSize: 12 }}>{unit}</span>}
                </span>
              </div>
              <div className="metric-box" style={{ padding: '10px 12px' }}>
                <span className="metric-label" style={{ fontSize: 10 }}>Maksimi ({range})</span>
                <span className="metric-value" style={{ fontSize: 18 }}>
                  {stats.max.toFixed(1)}
                  {unit && <span className="metric-unit" style={{ fontSize: 12 }}>{unit}</span>}
                </span>
              </div>
              <div className="metric-box" style={{ padding: '10px 12px' }}>
                <span className="metric-label" style={{ fontSize: 10 }}>Keskiarvo</span>
                <span className="metric-value" style={{ fontSize: 18 }}>
                  {stats.avg.toFixed(1)}
                  {unit && <span className="metric-unit" style={{ fontSize: 12 }}>{unit}</span>}
                </span>
              </div>
            </div>
          )}

          {/* Chart Container */}
          <div
            style={{
              height: 280,
              width: '100%',
              background: 'rgba(0,0,0,0.2)',
              borderRadius: 10,
              padding: '12px 10px 4px 0',
              position: 'relative',
            }}
          >
            {loading ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: 'var(--text-muted)',
                  fontSize: 13,
                }}
              >
                Ladataan trendiä...
              </div>
            ) : data.length === 0 ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: 'var(--text-muted)',
                  fontSize: 13,
                }}
              >
                Ei vielä mittausdataa tälle aikavälille ({range}).
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`gradient-${target.topic.replace(/[^a-zA-Z0-9]/g, '_')}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={color} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={color} stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="time"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={formatTimeTick}
                    stroke="var(--text-muted)"
                    fontSize={11}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="var(--text-muted)"
                    fontSize={11}
                    tickLine={false}
                    domain={['auto', 'auto']}
                    tickFormatter={(val) => (unit === 'W' && Math.abs(val) >= 1000 ? `${(val / 1000).toFixed(1)}k` : `${val}`)}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  {stats && (
                    <ReferenceLine
                      y={stats.avg}
                      stroke="rgba(255,255,255,0.2)"
                      strokeDasharray="4 4"
                      label={{
                        value: `K.a ${stats.avg.toFixed(1)}${unit}`,
                        fill: 'var(--text-muted)',
                        fontSize: 10,
                        position: 'right',
                      }}
                    />
                  )}
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={color}
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill={`url(#gradient-${target.topic.replace(/[^a-zA-Z0-9]/g, '_')})`}
                    dot={false}
                    activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2, fill: color }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            borderTop: '1px solid var(--border)',
            padding: '12px 18px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 12,
            color: 'var(--text-muted)',
          }}
        >
          <span>
            {stats ? `Yhteensä ${stats.count.toLocaleString('fi-FI')} mittauspistettä` : ''}
          </span>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            style={{ fontSize: 13, padding: '4px 14px' }}
          >
            Sulje
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
