import React, { useEffect, useState, useMemo } from 'react';
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

type PriceTimeframe = 'today_tomorrow' | '24h' | '48h' | '7d';

interface HourlyPriceItem {
  timestamp: number;
  dateStr: string;
  hourStr: string;
  priceCents: number;
  level: 'cheap' | 'normal' | 'expensive';
  isCurrent: boolean;
  isPast: boolean;
}

export const ElectricityPriceModal: React.FC<ElectricityPriceModalProps> = ({
  isOpen,
  onClose,
  onOpenApc,
}) => {
  const [timeframe, setTimeframe] = useState<PriceTimeframe>('today_tomorrow');
  const [prices, setPrices] = useState<NordpoolPrice[]>([]);
  const [stats, setStats] = useState<NordpoolStats | null>(null);
  const [currentPriceEur, setCurrentPriceEur] = useState<number | null>(null);
  const [cheapest3h, setCheapest3h] = useState<NordpoolWindow | null>(null);
  const [cheapest6h, setCheapest6h] = useState<NordpoolWindow | null>(null);
  const [loading, setLoading] = useState(true);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Fetch prices and statistics
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);

    const nowTs = Date.now();
    // 7 days ago to 2 days future
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

        if (curJson && typeof curJson.price === 'number') {
          setCurrentPriceEur(curJson.price);
        }
        if (statsJson && typeof statsJson.count === 'number') {
          setStats(statsJson);
        }
        if (cheap3Json && cheap3Json.start) {
          setCheapest3h(cheap3Json);
        }
        if (cheap6Json && cheap6Json.start) {
          setCheapest6h(cheap6Json);
        }
        if (pricesJson && Array.isArray(pricesJson.prices)) {
          setPrices(pricesJson.prices);
        }
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

  // Filtered dataset for charts
  const filteredData = useMemo(() => {
    const nowTs = Date.now();
    const currentHourStart = new Date(nowTs).setMinutes(0, 0, 0);

    let startMs = nowTs;
    let endMs = nowTs;

    if (timeframe === 'today_tomorrow') {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      startMs = todayStart.getTime();
      endMs = nowTs + 48 * 3600_000;
    } else if (timeframe === '24h') {
      startMs = currentHourStart - 4 * 3600_000;
      endMs = currentHourStart + 20 * 3600_000;
    } else if (timeframe === '48h') {
      startMs = currentHourStart - 6 * 3600_000;
      endMs = currentHourStart + 42 * 3600_000;
    } else if (timeframe === '7d') {
      startMs = nowTs - 7 * 24 * 3600_000;
      endMs = nowTs + 36 * 3600_000;
    }

    const items: HourlyPriceItem[] = [];

    for (const p of prices) {
      const ts = p.start_time;
      if (ts < startMs || ts > endMs) continue;

      const priceCents = p.price / 10;
      const isCurrent = ts <= nowTs && nowTs < ts + 3600_000;
      const isPast = ts + 3600_000 <= nowTs;

      // Price level classification
      let level: 'cheap' | 'normal' | 'expensive' = 'normal';
      if (minPriceCents != null && maxPriceCents != null && maxPriceCents > minPriceCents) {
        const rel = (priceCents - minPriceCents) / (maxPriceCents - minPriceCents);
        if (rel <= 0.33) level = 'cheap';
        else if (rel >= 0.67) level = 'expensive';
      } else {
        if (priceCents < 5) level = 'cheap';
        else if (priceCents > 12) level = 'expensive';
      }

      const d = new Date(ts);
      const dateStr = d.toLocaleDateString('fi-FI', { weekday: 'short', day: 'numeric', month: 'numeric' });
      const hourStr = `${String(d.getHours()).padStart(2, '0')}:00`;

      items.push({
        timestamp: ts,
        dateStr,
        hourStr,
        priceCents,
        level,
        isCurrent,
        isPast,
      });
    }

    return items.sort((a, b) => a.timestamp - b.timestamp);
  }, [prices, timeframe, minPriceCents, maxPriceCents]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.82)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 999999,
        padding: '16px',
      }}
    >
      <div
        className="modal-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(165deg, #131d33 0%, #0a0f1d 100%)',
          border: '1px solid rgba(56, 189, 248, 0.35)',
          borderRadius: '20px',
          boxShadow: '0 25px 60px -10px rgba(0, 0, 0, 0.9), 0 0 50px rgba(56, 189, 248, 0.12)',
          maxWidth: '960px',
          width: '100%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'fadeIn 0.2s ease-out',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255, 255, 255, 0.02)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
                boxShadow: '0 0 20px rgba(56, 189, 248, 0.25)',
              }}
            >
              ⚡
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                Pörssisähkön Hinnankehitys & Ennuste
              </h3>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>
                Nord Pool Spot FI -tuntihinnat (sis. alv 25,5 %) · Reaaliaikainen seuranta ja hintaprofiili
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '50%',
              width: 36,
              height: 36,
              color: 'var(--text-secondary)',
              fontSize: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            title="Sulje modaali (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div
          style={{
            padding: '20px 24px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
            flex: 1,
          }}
        >
          {/* Top KPI Cards Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: 12,
            }}
          >
            {/* Current Price */}
            <div
              style={{
                background: 'linear-gradient(145deg, rgba(56, 189, 248, 0.12) 0%, rgba(15, 23, 42, 0.9) 100%)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                borderRadius: 14,
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div style={{ fontSize: 11, color: '#38bdf8', fontWeight: 600 }}>Hinta nyt</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                {currentPriceCents !== null ? `${currentPriceCents.toFixed(2)}` : '--'}
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 4 }}>snt/kWh</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                Tämänhetkinen pörssitunti
              </div>
            </div>

            {/* Average Price */}
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 14,
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Päivän keskiarvo</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#c4b5fd', letterSpacing: '-0.02em' }}>
                {avgPriceCents !== null ? `${avgPriceCents.toFixed(2)}` : '--'}
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 4 }}>snt/kWh</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                24h painottamaton ka.
              </div>
            </div>

            {/* Min Price */}
            <div
              style={{
                background: 'rgba(34, 197, 94, 0.08)',
                border: '1px solid rgba(34, 197, 94, 0.25)',
                borderRadius: 14,
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div style={{ fontSize: 11, color: '#4ade80', fontWeight: 600 }}>Päivän alin</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#4ade80', letterSpacing: '-0.02em' }}>
                {minPriceCents !== null ? `${minPriceCents.toFixed(2)}` : '--'}
                <span style={{ fontSize: 12, fontWeight: 500, color: 'rgba(74, 222, 128, 0.7)', marginLeft: 4 }}>snt/kWh</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                Vuorokauden halvin tunti
              </div>
            </div>

            {/* Max Price */}
            <div
              style={{
                background: 'rgba(244, 63, 94, 0.08)',
                border: '1px solid rgba(244, 63, 94, 0.25)',
                borderRadius: 14,
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div style={{ fontSize: 11, color: '#f43f5e', fontWeight: 600 }}>Päivän ylin</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#f43f5e', letterSpacing: '-0.02em' }}>
                {maxPriceCents !== null ? `${maxPriceCents.toFixed(2)}` : '--'}
                <span style={{ fontSize: 12, fontWeight: 500, color: 'rgba(244, 63, 94, 0.7)', marginLeft: 4 }}>snt/kWh</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                Hintahuippu
              </div>
            </div>

            {/* Cheapest Windows (3h & 6h) */}
            <div
              style={{
                background: 'rgba(250, 204, 21, 0.08)',
                border: '1px solid rgba(250, 204, 21, 0.25)',
                borderRadius: 14,
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 4,
              }}
            >
              <div style={{ fontSize: 11, color: '#facc15', fontWeight: 600 }}>Halvimmat jaksot</div>
              <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 700 }}>
                3h: {cheapest3h ? `${(cheapest3h.avgPrice / 10).toFixed(1)} snt (klo ${new Date(cheapest3h.start).getHours()}:00)` : '--'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                6h: {cheapest6h ? `${(cheapest6h.avgPrice / 10).toFixed(1)} snt (klo ${new Date(cheapest6h.start).getHours()}:00)` : '--'}
              </div>
            </div>
          </div>

          {/* Interactive Price Chart Toolbar */}
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.35)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 16,
              padding: '18px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>📊</span>
                <div>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                    Tuntihintojen Jakautuminen & Ennuste
                  </span>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    Vihreä = Edullinen (APC varaustunti) · Keltainen = Normaali · Punainen = Kallis (Huippu)
                  </div>
                </div>
              </div>

              {/* Timeframe selector */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { id: 'today_tomorrow' as PriceTimeframe, label: 'Tänään & Huominen' },
                  { id: '24h' as PriceTimeframe, label: '24h' },
                  { id: '48h' as PriceTimeframe, label: '48h' },
                  { id: '7d' as PriceTimeframe, label: '7 vrk' },
                ].map((t) => {
                  const isActive = timeframe === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTimeframe(t.id)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 600,
                        border: isActive ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                        background: isActive ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.03)',
                        color: isActive ? '#38bdf8' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Recharts Bar Chart */}
            <div style={{ width: '100%', height: 320, position: 'relative' }}>
              {loading && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', borderRadius: 8, zIndex: 10 }}>
                  <span style={{ fontSize: 13, color: '#38bdf8', fontWeight: 600 }}>Ladataan pörssihintoja...</span>
                </div>
              )}

              {filteredData.length === 0 && !loading ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  Ei hintatietoja saatavilla valitulta aikaväliltä.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={filteredData} margin={{ top: 15, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(ts) => {
                        const d = new Date(ts);
                        if (timeframe === '7d') {
                          return `${d.getDate()}.${d.getMonth() + 1}.`;
                        }
                        return `${String(d.getHours()).padStart(2, '0')}:00`;
                      }}
                      stroke="var(--text-muted)"
                      fontSize={11}
                    />
                    <YAxis
                      stroke="var(--text-muted)"
                      fontSize={11}
                      domain={[0, 'auto']}
                      tickFormatter={(v) => `${v} snt`}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const p = payload[0].payload as HourlyPriceItem;
                          const dateObj = new Date(p.timestamp);
                          const dateStr = dateObj.toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'numeric' });
                          const hourStr = `${String(dateObj.getHours()).padStart(2, '0')}:00 – ${String((dateObj.getHours() + 1) % 24).padStart(2, '0')}:00`;

                          const color = p.level === 'cheap' ? '#4ade80' : p.level === 'expensive' ? '#f43f5e' : '#facc15';
                          const levelLabel = p.level === 'cheap' ? 'Edullinen tunti' : p.level === 'expensive' ? 'Kallis huipputunti' : 'Normaalihintainen';

                          return (
                            <div
                              style={{
                                background: 'rgba(15, 23, 42, 0.96)',
                                border: `1px solid ${color}`,
                                borderRadius: 10,
                                padding: '10px 14px',
                                boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                              }}
                            >
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'capitalize' }}>
                                {dateStr}
                              </div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                                klo {hourStr} {p.isCurrent && <span style={{ color: '#38bdf8', marginLeft: 4 }}>• NYT</span>}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                <span style={{ fontSize: 18, fontWeight: 800, color }}>
                                  {p.priceCents.toFixed(2)} snt/kWh
                                </span>
                              </div>
                              <div style={{ fontSize: 11, color, fontWeight: 600, marginTop: 4 }}>
                                {levelLabel}
                              </div>
                              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 4, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 4 }}>
                                1 kW kuorman hinta: <strong>{p.priceCents.toFixed(2)} snt/h</strong>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    {avgPriceCents !== null && (
                      <ReferenceLine
                        y={avgPriceCents}
                        stroke="#c4b5fd"
                        strokeDasharray="4 4"
                        label={{
                          value: `Ka. ${avgPriceCents.toFixed(1)} snt`,
                          fill: '#c4b5fd',
                          fontSize: 11,
                          position: 'top',
                        }}
                      />
                    )}
                    <Bar dataKey="priceCents" radius={[4, 4, 0, 0]}>
                      {filteredData.map((entry) => {
                        let fill = entry.level === 'cheap' ? '#22c55e' : entry.level === 'expensive' ? '#f43f5e' : '#facc15';
                        if (entry.isCurrent) fill = '#38bdf8';
                        const opacity = entry.isPast && !entry.isCurrent ? 0.45 : 0.95;
                        return <Cell key={`cell-${entry.timestamp}`} fill={fill} fillOpacity={opacity} stroke={entry.isCurrent ? '#ffffff' : undefined} strokeWidth={entry.isCurrent ? 2 : 0} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* APC Automation Integration Prompt */}
          <div
            style={{
              background: 'linear-gradient(145deg, rgba(16, 185, 129, 0.1) 0%, rgba(15, 23, 42, 0.9) 100%)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: 14,
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 24 }}>⚡</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#4ade80' }}>
                  APC (Automaattinen Pörssiohjaus) on aktiivinen
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  VILP ja varaajat optimoivat kulutuksen edullisille tunneille ja laskevat pyyntiä kalliiden tuntien aikana
                </div>
              </div>
            </div>

            {onOpenApc && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  onClose();
                  onOpenApc();
                }}
                style={{
                  background: 'rgba(16, 185, 129, 0.2)',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  color: '#4ade80',
                  padding: '8px 16px',
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 12.5,
                  cursor: 'pointer',
                }}
              >
                Avaa APC-Strategia & Asetukset ▶
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
