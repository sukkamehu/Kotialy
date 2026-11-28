import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { apiFetch } from '../lib/api';
import type { NordpoolPrice, NordpoolStats, NordpoolWindow } from '../types/nordpool';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Cell,
} from 'recharts';

interface ElectricityPriceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenApc?: () => void;
}

type PriceTimeframe = 'today' | 'tomorrow' | 'today_tomorrow' | '7d';
type PriceResolution = '1h' | '15m';
type PriceViewMode = 'chart' | 'list';

interface PriceSlotItem {
  timestamp: number;
  endTimestamp: number;
  dateStr: string;
  timeRangeStr: string;
  tickLabel: string;
  priceCents: number;
  minCents?: number;
  maxCents?: number;
  level: 'cheap' | 'normal' | 'expensive';
  isCurrent: boolean;
  isPast: boolean;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatHm(ts: number): string {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function getLevelMeta(level: 'cheap' | 'normal' | 'expensive') {
  if (level === 'cheap') return { color: '#4ade80', barFill: '#22c55e', label: 'Edullinen' };
  if (level === 'expensive') return { color: '#f43f5e', barFill: '#f43f5e', label: 'Kallis huippu' };
  return { color: '#facc15', barFill: '#facc15', label: 'Normaali' };
}

/**
 * Syncs Recharts hover, tap, and touch-scrubbing events to the pinned readout bar above
 * the chart without ever rendering a floating tooltip over the bars.
 */
const TooltipSync: React.FC<{
  active?: boolean;
  payload?: Array<{ payload?: PriceSlotItem }>;
  onSelect: (ts: number) => void;
}> = ({ active, payload, onSelect }) => {
  const ts = active && payload?.[0]?.payload?.timestamp ? payload[0].payload.timestamp : null;
  useEffect(() => {
    if (ts !== null) {
      onSelect(ts);
    }
  }, [ts, onSelect]);
  return null;
};

export const ElectricityPriceModal: React.FC<ElectricityPriceModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const [timeframe, setTimeframe] = useState<PriceTimeframe>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'today' : 'today_tomorrow'
  );
  const [resolution, setResolution] = useState<PriceResolution>('1h');
  const [viewMode, setViewMode] = useState<PriceViewMode>('chart');
  const [prices, setPrices] = useState<NordpoolPrice[]>([]);
  const [stats, setStats] = useState<NordpoolStats | null>(null);
  const [currentPriceEur, setCurrentPriceEur] = useState<number | null>(null);
  const [cheapest3h, setCheapest3h] = useState<NordpoolWindow | null>(null);
  const [cheapest6h, setCheapest6h] = useState<NordpoolWindow | null>(null);
  const [loading, setLoading] = useState(true);

  // Inspected / tapped slot displayed in the non-overlapping pinned bar above the chart
  const [inspectedTs, setInspectedTs] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Reset inspected slot when switching timeframe/resolution
  useEffect(() => {
    setInspectedTs(null);
  }, [timeframe, resolution]);

  // Fetch prices and statistics
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);

    const nowTs = Date.now();
    const fromMs = nowTs - 7 * 24 * 3600_000;
    const toMs = nowTs + 54 * 3600_000;

    Promise.all([
      apiFetch('/api/nordpool/current'),
      apiFetch('/api/nordpool/stats'),
      apiFetch('/api/nordpool/cheapest?hours=3'),
      apiFetch('/api/nordpool/cheapest?hours=6'),
      apiFetch(`/api/nordpool/prices?from=${fromMs}&to=${toMs}`),
    ])
      .then(async ([curRes, statsRes, cheap3Res, cheap6Res, pricesRes]) => {
        if (cancelled) return;
        const curJson = curRes.ok ? await curRes.json() : null;
        const statsJson = statsRes.ok ? await statsRes.json() : null;
        const cheap3Json = cheap3Res.ok ? await cheap3Res.json() : null;
        const cheap6Json = cheap6Res.ok ? await cheap6Res.json() : null;
        const pricesJson = pricesRes.ok ? await pricesRes.json() : null;

        if (curJson && typeof curJson.price === 'number') setCurrentPriceEur(curJson.price);
        if (statsJson && typeof statsJson.count === 'number') setStats(statsJson);
        if (cheap3Json && cheap3Json.start) setCheapest3h(cheap3Json);
        if (cheap6Json && cheap6Json.start) setCheapest6h(cheap6Json);
        if (pricesJson && Array.isArray(pricesJson.prices)) setPrices(pricesJson.prices);
      })
      .catch((err) => {
        console.error('Failed to fetch electricity prices in modal:', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const currentPriceCents = currentPriceEur !== null ? currentPriceEur / 10 : null;
  const avgPriceCents = stats?.avg != null ? stats.avg / 10 : null;
  const minPriceCents = stats?.min != null ? stats.min / 10 : null;
  const maxPriceCents = stats?.max != null ? stats.max / 10 : null;

  // Detect whether Nord Pool feed has 15-minute slots
  const has15MinData = useMemo(() => {
    if (prices.length < 2) return false;
    const sorted = [...prices].sort((a, b) => a.start_time - b.start_time);
    for (let i = 1; i < Math.min(sorted.length, 20); i++) {
      const diff = sorted[i].start_time - sorted[i - 1].start_time;
      if (diff > 0 && diff <= 20 * 60_000) return true;
    }
    return false;
  }, [prices]);

  // Check if tomorrow's prices are already published
  const hasTomorrowData = useMemo(() => {
    const tomorrowStart = new Date();
    tomorrowStart.setHours(24, 0, 0, 0);
    return prices.some((p) => p.start_time >= tomorrowStart.getTime());
  }, [prices]);

  // Effective resolution: 7d is always 1h (otherwise 672 bars!)
  const effectiveResolution: PriceResolution =
    timeframe === '7d' || !has15MinData ? '1h' : resolution;

  const classifyLevel = useCallback(
    (priceCents: number): 'cheap' | 'normal' | 'expensive' => {
      if (minPriceCents != null && maxPriceCents != null && maxPriceCents > minPriceCents) {
        const rel = (priceCents - minPriceCents) / (maxPriceCents - minPriceCents);
        if (rel <= 0.33) return 'cheap';
        if (rel >= 0.67) return 'expensive';
        return 'normal';
      }
      if (priceCents < 5) return 'cheap';
      if (priceCents > 12) return 'expensive';
      return 'normal';
    },
    [minPriceCents, maxPriceCents]
  );

  // Filtered & optionally hourly-aggregated dataset
  const filteredData = useMemo<PriceSlotItem[]>(() => {
    const nowTs = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartMs = todayStart.getTime();
    const tomorrowStartMs = todayStartMs + 24 * 3600_000;
    const tomorrowEndMs = todayStartMs + 48 * 3600_000;

    let startMs = todayStartMs;
    let endMs = tomorrowEndMs;

    if (timeframe === 'today') {
      startMs = todayStartMs;
      endMs = tomorrowStartMs - 1;
    } else if (timeframe === 'tomorrow') {
      startMs = tomorrowStartMs;
      endMs = tomorrowEndMs - 1;
    } else if (timeframe === 'today_tomorrow') {
      startMs = todayStartMs;
      endMs = tomorrowEndMs - 1;
    } else if (timeframe === '7d') {
      startMs = nowTs - 7 * 24 * 3600_000;
      endMs = tomorrowEndMs - 1;
    }

    const inRange = prices
      .filter((p) => p.start_time >= startMs && p.start_time <= endMs)
      .sort((a, b) => a.start_time - b.start_time);

    if (inRange.length === 0) return [];

    // Aggregate to 1h buckets when in hourly mode
    if (effectiveResolution === '1h') {
      const buckets = new Map<number, number[]>();
      for (const p of inRange) {
        const d = new Date(p.start_time);
        d.setMinutes(0, 0, 0);
        const hourTs = d.getTime();
        const arr = buckets.get(hourTs) || [];
        arr.push(p.price / 10);
        buckets.set(hourTs, arr);
      }

      const items: PriceSlotItem[] = [];
      for (const [hourTs, vals] of Array.from(buckets.entries()).sort((a, b) => a[0] - b[0])) {
        const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
        const minV = Math.min(...vals);
        const maxV = Math.max(...vals);
        const endTs = hourTs + 3600_000;
        const d = new Date(hourTs);
        const dateStr = d.toLocaleDateString('fi-FI', { weekday: 'short', day: 'numeric', month: 'numeric' });
        items.push({
          timestamp: hourTs,
          endTimestamp: endTs,
          dateStr,
          timeRangeStr: `${formatHm(hourTs)}–${formatHm(endTs)}`,
          tickLabel: timeframe === '7d' ? `${d.getDate()}.${d.getMonth() + 1}.` : `${pad2(d.getHours())}:00`,
          priceCents: avg,
          minCents: vals.length > 1 ? minV : undefined,
          maxCents: vals.length > 1 ? maxV : undefined,
          level: classifyLevel(avg),
          isCurrent: hourTs <= nowTs && nowTs < endTs,
          isPast: endTs <= nowTs,
        });
      }
      return items;
    }

    // 15-minute resolution (exact slot duration)
    const slotDurationMs = 15 * 60_000;
    return inRange.map((p) => {
      const ts = p.start_time;
      const endTs = ts + slotDurationMs;
      const priceCents = p.price / 10;
      const d = new Date(ts);
      const dateStr = d.toLocaleDateString('fi-FI', { weekday: 'short', day: 'numeric', month: 'numeric' });
      return {
        timestamp: ts,
        endTimestamp: endTs,
        dateStr,
        timeRangeStr: `${formatHm(ts)}–${formatHm(endTs)}`,
        tickLabel: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
        priceCents,
        level: classifyLevel(priceCents),
        isCurrent: ts <= nowTs && nowTs < endTs,
        isPast: endTs <= nowTs,
      };
    });
  }, [prices, timeframe, effectiveResolution, classifyLevel]);

  // Currently displayed item in the pinned inspector bar above the chart
  const activeItem = useMemo<PriceSlotItem | null>(() => {
    if (filteredData.length === 0) return null;
    if (inspectedTs !== null) {
      const found = filteredData.find((d) => d.timestamp === inspectedTs);
      if (found) return found;
    }
    return filteredData.find((d) => d.isCurrent) || filteredData[0];
  }, [filteredData, inspectedTs]);

  // Horizontal scroll min-width on mobile when showing dense bar series (48h / 15m / 7d)
  const chartMinWidth = useMemo(() => {
    if (!isMobile) return undefined;
    if (filteredData.length <= 28) return undefined; // Fits comfortably on portrait phone without scrolling!
    const pxPerBar = effectiveResolution === '15m' ? 7 : 12;
    return Math.min(1400, Math.max(420, filteredData.length * pxPerBar));
  }, [isMobile, filteredData.length, effectiveResolution]);

  // Keep Recharts tooltip cursor active while updating the pinned readout bar (never rendering an overlapping box)
  const handleChartPointer = useCallback((state: any) => {
    const payloadItem = state?.activePayload?.[0]?.payload as PriceSlotItem | undefined;
    if (payloadItem?.timestamp) {
      setInspectedTs(payloadItem.timestamp);
    }
  }, []);

  if (!isOpen) return null;

  const activeMeta = activeItem ? getLevelMeta(activeItem.level) : null;

  return createPortal(
    <div className="price-modal-overlay" onClick={onClose}>
      <div className="price-modal-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="price-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div
              style={{
                width: isMobile ? 34 : 40,
                height: isMobile ? 34 : 40,
                borderRadius: 11,
                background: 'rgba(56, 189, 248, 0.14)',
                border: '1px solid rgba(56, 189, 248, 0.32)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: isMobile ? 17 : 20,
                flexShrink: 0,
              }}
            >
              ⚡
            </div>
            <h3
              style={{
                margin: 0,
                fontSize: isMobile ? '1rem' : '1.2rem',
                fontWeight: 800,
                color: 'var(--text-primary)',
                letterSpacing: '-0.015em',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              Pörssisähkö & Ennuste
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="modal-close-btn"
            style={{ borderRadius: '50%', flexShrink: 0 }}
            title="Sulje (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="price-modal-body">
          {/* Top KPI Cards */}
          <div className="price-kpi-grid">
            {/* Current Price */}
            <div
              className="price-kpi-card"
              style={{
                background: 'linear-gradient(145deg, rgba(56, 189, 248, 0.12) 0%, rgba(15, 23, 42, 0.9) 100%)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
              }}
            >
              <div style={{ fontSize: 11, color: '#38bdf8', fontWeight: 600 }}>Hinta nyt</div>
              <div className="price-kpi-value" style={{ color: 'var(--text-primary)' }}>
                {currentPriceCents !== null ? currentPriceCents.toFixed(2) : '--'}
                <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 3 }}>snt</span>
              </div>
              <div className="price-kpi-sub" style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                Tämänhetkinen jakso
              </div>
            </div>

            {/* Average */}
            <div
              className="price-kpi-card"
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Päivän ka.</div>
              <div className="price-kpi-value" style={{ color: '#c4b5fd' }}>
                {avgPriceCents !== null ? avgPriceCents.toFixed(2) : '--'}
                <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 3 }}>snt</span>
              </div>
              <div className="price-kpi-sub" style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                24h keskiarvo
              </div>
            </div>

            {/* Min */}
            <div
              className="price-kpi-card"
              style={{
                background: 'rgba(34, 197, 94, 0.08)',
                border: '1px solid rgba(34, 197, 94, 0.25)',
              }}
            >
              <div style={{ fontSize: 11, color: '#4ade80', fontWeight: 600 }}>Päivän alin</div>
              <div className="price-kpi-value" style={{ color: '#4ade80' }}>
                {minPriceCents !== null ? minPriceCents.toFixed(2) : '--'}
                <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(74, 222, 128, 0.7)', marginLeft: 3 }}>snt</span>
              </div>
              <div className="price-kpi-sub" style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                Vuorokauden halvin
              </div>
            </div>

            {/* Max */}
            <div
              className="price-kpi-card"
              style={{
                background: 'rgba(244, 63, 94, 0.08)',
                border: '1px solid rgba(244, 63, 94, 0.25)',
              }}
            >
              <div style={{ fontSize: 11, color: '#f43f5e', fontWeight: 600 }}>Päivän ylin</div>
              <div className="price-kpi-value" style={{ color: '#f43f5e' }}>
                {maxPriceCents !== null ? maxPriceCents.toFixed(2) : '--'}
                <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(244, 63, 94, 0.7)', marginLeft: 3 }}>snt</span>
              </div>
              <div className="price-kpi-sub" style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                Hintahuippu
              </div>
            </div>

            {/* Cheapest Windows */}
            <div
              className="price-kpi-card price-kpi-windows"
              style={{
                background: 'rgba(250, 204, 21, 0.08)',
                border: '1px solid rgba(250, 204, 21, 0.25)',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ fontSize: 11, color: '#facc15', fontWeight: 600 }}>Halvimmat jaksot</div>
              <div style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: isMobile ? 12 : 2, flexWrap: 'wrap', fontVariantNumeric: 'tabular-nums' }}>
                <div style={{ fontSize: 12.5, color: 'var(--text-primary)', fontWeight: 700 }}>
                  3h: {cheapest3h ? `${(cheapest3h.avgPrice / 10).toFixed(1)} snt (klo ${new Date(cheapest3h.start).getHours()}:00)` : '--'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  6h: {cheapest6h ? `${(cheapest6h.avgPrice / 10).toFixed(1)} snt (klo ${new Date(cheapest6h.start).getHours()}:00)` : '--'}
                </div>
              </div>
            </div>
          </div>

          {/* Chart & List Panel */}
          <div className="price-chart-panel">
            {/* Controls Row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              {/* Timeframe Buttons */}
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                {(
                  [
                    { id: 'today' as PriceTimeframe, label: 'Tänään' },
                    ...(hasTomorrowData ? [{ id: 'tomorrow' as PriceTimeframe, label: 'Huominen' }] : []),
                    { id: 'today_tomorrow' as PriceTimeframe, label: isMobile ? '48h' : 'Tänään & Huominen' },
                    { id: '7d' as PriceTimeframe, label: '7 vrk' },
                  ] as { id: PriceTimeframe; label: string }[]
                ).map((t) => {
                  const isActive = timeframe === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTimeframe(t.id)}
                      className={`btn btn-xs ${isActive ? 'btn-primary' : 'btn-secondary'}`}
                      style={
                        isActive
                          ? { background: 'rgba(56, 189, 248, 0.22)', color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.55)' }
                          : undefined
                      }
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {/* Right controls: Resolution (1h / 15m) + View mode (Chart / List) */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                {has15MinData && timeframe !== '7d' && (
                  <div
                    style={{
                      display: 'inline-flex',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 8,
                      padding: 2,
                      gap: 2,
                    }}
                  >
                    {(['1h', '15m'] as PriceResolution[]).map((res) => (
                      <button
                        key={res}
                        type="button"
                        onClick={() => setResolution(res)}
                        style={{
                          padding: '3px 8px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          border: 'none',
                          cursor: 'pointer',
                          background: effectiveResolution === res ? 'rgba(56, 189, 248, 0.25)' : 'transparent',
                          color: effectiveResolution === res ? '#38bdf8' : 'var(--text-muted)',
                        }}
                      >
                        {res === '1h' ? '1h' : '15 min'}
                      </button>
                    ))}
                  </div>
                )}

                <div
                  style={{
                    display: 'inline-flex',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    padding: 2,
                    gap: 2,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setViewMode('chart')}
                    style={{
                      padding: '3px 8px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      border: 'none',
                      cursor: 'pointer',
                      background: viewMode === 'chart' ? 'rgba(255,255,255,0.14)' : 'transparent',
                      color: viewMode === 'chart' ? 'var(--text-primary)' : 'var(--text-muted)',
                    }}
                  >
                    📊 Kaavio
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    style={{
                      padding: '3px 8px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      border: 'none',
                      cursor: 'pointer',
                      background: viewMode === 'list' ? 'rgba(255,255,255,0.14)' : 'transparent',
                      color: viewMode === 'list' ? 'var(--text-primary)' : 'var(--text-muted)',
                    }}
                  >
                    📋 Lista
                  </button>
                </div>
              </div>
            </div>

            {/* Pinned Non-Overlapping Inspector Readout Bar (replaces blocking hover tooltip!) */}
            {viewMode === 'chart' && activeItem && activeMeta && (
              <div
                className="price-inspector-bar"
                style={{ borderColor: `${activeMeta.color}55` }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: activeItem.isCurrent ? '#38bdf8' : activeMeta.color,
                      boxShadow: `0 0 8px ${activeItem.isCurrent ? '#38bdf8' : activeMeta.color}`,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                    {activeItem.dateStr} · klo {activeItem.timeRangeStr}
                  </span>
                  {activeItem.isCurrent && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        padding: '1px 6px',
                        borderRadius: 6,
                        background: 'rgba(56, 189, 248, 0.22)',
                        color: '#38bdf8',
                        border: '1px solid rgba(56, 189, 248, 0.4)',
                      }}
                    >
                      NYT
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      padding: '1px 7px',
                      borderRadius: 6,
                      background: `${activeMeta.color}1c`,
                      color: activeMeta.color,
                    }}
                  >
                    {activeMeta.label}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginLeft: 'auto', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: isMobile ? 17 : 19, fontWeight: 800, color: activeMeta.color }}>
                    {activeItem.priceCents.toFixed(2)}{' '}
                    <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)' }}>snt/kWh</span>
                  </span>
                  {activeItem.minCents !== undefined && activeItem.maxCents !== undefined && activeItem.maxCents - activeItem.minCents >= 0.05 && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      (15 min: {activeItem.minCents.toFixed(1)}–{activeItem.maxCents.toFixed(1)})
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Chart View */}
            {viewMode === 'chart' ? (
              <div
                style={{
                  width: '100%',
                  overflowX: chartMinWidth ? 'auto' : 'hidden',
                  WebkitOverflowScrolling: 'touch',
                }}
              >
                <div
                  className="price-chart-canvas"
                  style={chartMinWidth ? { minWidth: chartMinWidth } : undefined}
                >
                  {loading && filteredData.length === 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(0,0,0,0.4)',
                        borderRadius: 8,
                        zIndex: 10,
                      }}
                    >
                      <span style={{ fontSize: 13, color: '#38bdf8', fontWeight: 600 }}>Ladataan pörssihintoja...</span>
                    </div>
                  )}

                  {filteredData.length === 0 && !loading ? (
                    <div
                      style={{
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--text-muted)',
                        fontSize: 13,
                      }}
                    >
                      Ei hintatietoja saatavilla valitulta aikaväliltä.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={filteredData}
                        margin={{ top: 14, right: 6, left: -16, bottom: 2 }}
                        onMouseMove={handleChartPointer}
                        onClick={handleChartPointer}
                        onMouseLeave={() => {
                          if (!isMobile) setInspectedTs(null);
                        }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                        <XAxis
                          dataKey="timestamp"
                          tickFormatter={(ts) => {
                            const d = new Date(ts);
                            if (timeframe === '7d') return `${d.getDate()}.${d.getMonth() + 1}.`;
                            return `${pad2(d.getHours())}:00`;
                          }}
                          minTickGap={isMobile ? 22 : 28}
                          stroke="var(--text-muted)"
                          fontSize={isMobile ? 10 : 11}
                          tickLine={false}
                        />
                        <YAxis
                          stroke="var(--text-muted)"
                          fontSize={isMobile ? 10 : 11}
                          width={46}
                          domain={[0, 'auto']}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v) => `${v}`}
                        />
                        {/* Render cursor highlight ONLY — readout lives in the non-overlapping bar above */}
                        <Tooltip
                          cursor={{ fill: 'rgba(255, 255, 255, 0.08)' }}
                          content={<TooltipSync onSelect={setInspectedTs} />}
                        />
                        {avgPriceCents !== null && (
                          <ReferenceLine
                            y={avgPriceCents}
                            stroke="#c4b5fd"
                            strokeDasharray="4 4"
                            label={{
                              value: `Ka. ${avgPriceCents.toFixed(1)}`,
                              fill: '#c4b5fd',
                              fontSize: 10.5,
                              position: 'insideTopRight',
                            }}
                          />
                        )}
                        <Bar
                          dataKey="priceCents"
                          radius={effectiveResolution === '15m' ? [2, 2, 0, 0] : [4, 4, 0, 0]}
                          isAnimationActive={false}
                        >
                          {filteredData.map((entry) => {
                            const meta = getLevelMeta(entry.level);
                            const isInspected = activeItem?.timestamp === entry.timestamp;
                            let fill = meta.barFill;
                            if (entry.isCurrent) fill = '#38bdf8';
                            const opacity = isInspected ? 1 : entry.isPast && !entry.isCurrent ? 0.42 : 0.88;
                            return (
                              <Cell
                                key={`cell-${entry.timestamp}`}
                                fill={fill}
                                fillOpacity={opacity}
                                stroke={isInspected || entry.isCurrent ? '#ffffff' : undefined}
                                strokeWidth={isInspected ? 2 : entry.isCurrent ? 1.5 : 0}
                              />
                            );
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            ) : (
              /* Compact Scrollable Price List View (great for quick scanning on portrait phones) */
              <div
                style={{
                  maxHeight: isMobile ? 300 : 340,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  paddingRight: 2,
                }}
              >
                {(() => {
                  const maxBar = Math.max(...filteredData.map((d) => d.priceCents), 1);
                  return filteredData.map((item) => {
                    const meta = getLevelMeta(item.level);
                    const pct = Math.max(4, Math.min(100, (item.priceCents / maxBar) * 100));
                    return (
                      <div
                        key={item.timestamp}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '94px 1fr 78px',
                          alignItems: 'center',
                          gap: 10,
                          padding: '6px 10px',
                          borderRadius: 8,
                          background: item.isCurrent ? 'rgba(56, 189, 248, 0.14)' : 'rgba(255, 255, 255, 0.025)',
                          border: item.isCurrent
                            ? '1px solid rgba(56, 189, 248, 0.45)'
                            : '1px solid rgba(255, 255, 255, 0.05)',
                          opacity: item.isPast && !item.isCurrent ? 0.55 : 1,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: item.isCurrent ? 800 : 600, color: item.isCurrent ? '#38bdf8' : 'var(--text-primary)' }}>
                          {item.timeRangeStr}
                          {timeframe !== 'today' && timeframe !== 'tomorrow' && (
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>{item.dateStr}</div>
                          )}
                        </div>
                        <div style={{ height: 8, borderRadius: 99, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${pct}%`,
                              height: '100%',
                              borderRadius: 99,
                              background: item.isCurrent ? '#38bdf8' : meta.barFill,
                            }}
                          />
                        </div>
                        <div style={{ textAlign: 'right', fontSize: 12.5, fontWeight: 800, color: item.isCurrent ? '#38bdf8' : meta.color }}>
                          {item.priceCents.toFixed(2)} <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-muted)' }}>snt</span>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}

            {/* Compact Legend & Hint Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6, fontSize: 10.5, color: 'var(--text-muted)' }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <span>🟢 Edullinen</span>
                <span>🟡 Normaali</span>
                <span>🔴 Kallis</span>
                <span>🔵 Nyt</span>
              </div>
              {viewMode === 'chart' && (
                <span>
                  {chartMinWidth ? '← Pyyhkäise sivulle · ' : ''}
                  {isMobile ? 'Napauta pylvästä nähdäksesi hinnan ylhäällä' : 'Vie kursori pylväiden päälle'}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
