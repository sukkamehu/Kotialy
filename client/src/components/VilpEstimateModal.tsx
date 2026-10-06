import React, { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { apiFetch } from '../lib/api';
import type { HeishamonState } from '../types/heishamon';
import { numVal } from '../types/heishamon';
import type { WeatherForecast } from '../types/weather';
import type { NordpoolPrice } from '../types/nordpool';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';

interface VilpEstimateModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: HeishamonState;
  onOpenTrends?: () => void;
  onOpenApc?: () => void;
}

interface HourlyEstimatePoint {
  time: number;
  hourStr: string;
  dateStr: string;
  outdoorTemp: number;
  heatDemandKw: number;
  cop: number;
  electricPowerKw: number;
  dhwElectricKw: number;
  totalElectricKw: number;
  priceCentsKWh: number | null;
  costCentsPerHour: number | null;
}

function calculateCop(outdoorTemp: number): number {
  // Panasonic Aquarea 12kW T-CAP COP curve approximation
  // +15C -> ~5.2, +7C -> ~4.7, +2C -> ~3.7, -7C -> ~2.8, -15C -> ~2.3, -25C -> ~1.85
  if (outdoorTemp >= 15) return 5.2;
  if (outdoorTemp >= 7) return 4.7 + (outdoorTemp - 7) * (0.5 / 8);
  if (outdoorTemp >= 2) return 3.7 + (outdoorTemp - 2) * (1.0 / 5);
  if (outdoorTemp >= -7) return 2.8 + (outdoorTemp - (-7)) * (0.9 / 9);
  if (outdoorTemp >= -15) return 2.3 + (outdoorTemp - (-15)) * (0.5 / 8);
  if (outdoorTemp >= -25) return 1.85 + (outdoorTemp - (-25)) * (0.45 / 10);
  return 1.7;
}

function calculateHeatDemandKw(outdoorTemp: number): number {
  // Building dimensioning: 9.2 kW at -26°C, heating threshold around +17°C
  // Delta T = 17 - (-26) = 43°C
  // kW per °C difference = 9.2 / 43 = ~0.214 kW/°C
  if (outdoorTemp >= 17) return 0;
  const delta = 17 - outdoorTemp;
  return Math.min(12, Math.max(0, delta * 0.214));
}

export const VilpEstimateModal: React.FC<VilpEstimateModalProps> = ({
  isOpen,
  onClose,
  state,
  onOpenTrends,
  onOpenApc,
}) => {
  const [forecastHours, setForecastHours] = useState<'24h' | '48h'>('24h');
  const [weatherForecast, setWeatherForecast] = useState<WeatherForecast[]>([]);
  const [prices, setPrices] = useState<NordpoolPrice[]>([]);
  const [loading, setLoading] = useState(true);

  const outsideTempNum = numVal(state, 'main/Outside_Temp');

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Fetch forecast and price series
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);

    const nowTs = Date.now();
    Promise.all([
      apiFetch('/api/weather/forecast?hours=54'),
      apiFetch(`/api/nordpool/prices?from=${nowTs - 2 * 3600_000}&to=${nowTs + 54 * 3600_000}`),
    ])
      .then(async ([weatherRes, pricesRes]) => {
        if (cancelled) return;
        const weatherJson = weatherRes.ok ? await weatherRes.json() : null;
        const pricesJson = pricesRes.ok ? await pricesRes.json() : null;

        if (weatherJson && Array.isArray(weatherJson.forecast)) {
          setWeatherForecast(weatherJson.forecast);
        }
        if (pricesJson && Array.isArray(pricesJson.prices)) {
          setPrices(pricesJson.prices);
        }
      })
      .catch((err) => {
        console.error('Failed to load VILP estimate forecast data:', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Current calculation numbers
  const currentTout = outsideTempNum ?? 10;
  const currentCop = calculateCop(currentTout);

  // Daily totals based on current outdoor temp
  const dailyHeatingElectricKwh = currentTout < 17 ? (17 - currentTout) * 0.85 : 0;
  const dailyDhwElectricKwh = 3.5;
  const dailyTotalElectricKwh = dailyHeatingElectricKwh + dailyDhwElectricKwh;
  const dailyProducedHeatKwh = dailyHeatingElectricKwh * currentCop + dailyDhwElectricKwh * 3.5;

  // Hourly timeline points combined from weather and price forecasts
  const hourlyData = useMemo(() => {
    const nowTs = Date.now();
    const maxHours = forecastHours === '24h' ? 24 : 48;
    const endTs = nowTs + maxHours * 3600_000;

    const points: HourlyEstimatePoint[] = [];

    // Map prices by hour timestamp
    const priceMap = new Map<number, number>();
    for (const p of prices) {
      const hourTs = new Date(p.start_time).setMinutes(0, 0, 0);
      priceMap.set(hourTs, p.price / 10);
    }

    for (const w of weatherForecast) {
      const t = new Date(w.time).getTime();
      if (t < nowTs - 1800_000 || t > endTs) continue;

      const outdoorTemp = w.temperature;
      const cop = calculateCop(outdoorTemp);
      const heatDemandKw = calculateHeatDemandKw(outdoorTemp);
      const electricPowerKw = cop > 0 ? heatDemandKw / cop : 0;
      const dhwElectricKw = 3.5 / 24;
      const totalElectricKw = electricPowerKw + dhwElectricKw;

      const hourTs = new Date(t).setMinutes(0, 0, 0);
      const priceCentsKWh = priceMap.get(hourTs) ?? null;
      const costCentsPerHour = priceCentsKWh !== null ? totalElectricKw * priceCentsKWh : null;

      const d = new Date(t);
      const hourStr = `${String(d.getHours()).padStart(2, '0')}:00`;
      const dateStr = d.toLocaleDateString('fi-FI', { weekday: 'short', day: 'numeric', month: 'numeric' });

      points.push({
        time: t,
        hourStr,
        dateStr,
        outdoorTemp: Math.round(outdoorTemp * 10) / 10,
        heatDemandKw: Math.round(heatDemandKw * 100) / 100,
        cop: Math.round(cop * 100) / 100,
        electricPowerKw: Math.round(electricPowerKw * 100) / 100,
        dhwElectricKw: Math.round(dhwElectricKw * 100) / 100,
        totalElectricKw: Math.round(totalElectricKw * 100) / 100,
        priceCentsKWh: priceCentsKWh !== null ? Math.round(priceCentsKWh * 100) / 100 : null,
        costCentsPerHour: costCentsPerHour !== null ? Math.round(costCentsPerHour * 10) / 10 : null,
      });
    }

    return points.sort((a, b) => a.time - b.time);
  }, [weatherForecast, prices, forecastHours]);

  // Projected 24h/48h electricity cost and energy
  const projectedStats = useMemo(() => {
    if (hourlyData.length === 0) return { totalKwh: 0, totalHeatKwh: 0, totalCostEur: 0, avgCop: 0 };

    let totalKwh = 0;
    let totalHeatKwh = 0;
    let totalCostCents = 0;
    let costHours = 0;

    for (const p of hourlyData) {
      totalKwh += p.totalElectricKw;
      totalHeatKwh += p.heatDemandKw + (p.dhwElectricKw * 3.5);
      if (p.costCentsPerHour !== null) {
        totalCostCents += p.costCentsPerHour;
        costHours++;
      }
    }

    const avgCop = totalKwh > 0 ? totalHeatKwh / totalKwh : currentCop;
    const totalCostEur = totalCostCents / 100;

    return {
      totalKwh: Math.round(totalKwh * 10) / 10,
      totalHeatKwh: Math.round(totalHeatKwh * 10) / 10,
      totalCostEur: Math.round(totalCostEur * 100) / 100,
      avgCop: Math.round(avgCop * 100) / 100,
      costHours,
    };
  }, [hourlyData, currentCop]);

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
          border: '1px solid rgba(167, 139, 250, 0.35)',
          borderRadius: '20px',
          boxShadow: '0 25px 60px -10px rgba(0, 0, 0, 0.9), 0 0 50px rgba(167, 139, 250, 0.12)',
          maxWidth: '980px',
          width: '100%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'fadeIn 0.2s ease-out',
        }}
      >
        {/* Header */}
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
                background: 'rgba(167, 139, 250, 0.15)',
                border: '1px solid rgba(167, 139, 250, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
                boxShadow: '0 0 20px rgba(167, 139, 250, 0.25)',
              }}
            >
              🔋
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                VILP-Kulutusarvio & Lämmöntarpeen Kehitys
              </h3>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>
                Mitoitus 9,2 kW / Rossipohja 250 m² · Lämmitysteho, COP ja kustannukset sääennusteen funktiona
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

        {/* Scrollable Modal Content */}
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
          {/* Top KPI Summary Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: 12,
            }}
          >
            {/* Daily Estimate */}
            <div
              style={{
                background: 'linear-gradient(145deg, rgba(167, 139, 250, 0.15) 0%, rgba(15, 23, 42, 0.9) 100%)',
                border: '1px solid rgba(167, 139, 250, 0.35)',
                borderRadius: 14,
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div style={{ fontSize: 11, color: '#c4b5fd', fontWeight: 600 }}>VILP Sähköarvio tänään</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#c4b5fd', letterSpacing: '-0.02em' }}>
                ~{dailyTotalElectricKwh.toFixed(1)}
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 4 }}>kWh/pv</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                Lämpönä ~{dailyProducedHeatKwh.toFixed(0)} kWh
              </div>
            </div>

            {/* Heating breakdown */}
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
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Tilojen lämmitys</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#f59e0b', letterSpacing: '-0.02em' }}>
                ~{dailyHeatingElectricKwh.toFixed(1)}
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 4 }}>kWh sähköä</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                Lattialämmitysverkosto
              </div>
            </div>

            {/* DHW breakdown */}
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
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Käyttövesi (LKV)</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#10b981', letterSpacing: '-0.02em' }}>
                ~{dailyDhwElectricKwh.toFixed(1)}
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 4 }}>kWh sähköä</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                284 L varaaja (~12 kWh lämpöä)
              </div>
            </div>

            {/* Estimated COP */}
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
              <div style={{ fontSize: 11, color: '#4ade80', fontWeight: 600 }}>Arvioitu COP nyt</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#4ade80', letterSpacing: '-0.02em' }}>
                ~{currentCop.toFixed(2)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                Ulkolämmöllä {currentTout.toFixed(1)} °C
              </div>
            </div>

            {/* Ennuste 24h sähkölaskulle */}
            <div
              style={{
                background: 'rgba(56, 189, 248, 0.08)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                borderRadius: 14,
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div style={{ fontSize: 11, color: '#38bdf8', fontWeight: 600 }}>24h Kustannusarvio</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#38bdf8', letterSpacing: '-0.02em' }}>
                {projectedStats.totalCostEur > 0 ? `${projectedStats.totalCostEur.toFixed(2)} €` : '--'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                Pörssisähköennusteella
              </div>
            </div>
          </div>

          {/* Interactive Forecast Chart */}
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
                <span style={{ fontSize: 20 }}>📈</span>
                <div>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                    Lämmitystarpeen & Sähkönkulutuksen Ennustekäyrä
                  </span>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    VILP ottoteho (kW), tuotettu lämpöteho (kW) ja ulkolämpötila (°C) tunneittain
                  </div>
                </div>
              </div>

              {/* Timeframe switch */}
              <div style={{ display: 'flex', gap: 6 }}>
                {[
                  { id: '24h' as const, label: '24h Ennuste' },
                  { id: '48h' as const, label: '48h Ennuste' },
                ].map((t) => {
                  const isActive = forecastHours === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setForecastHours(t.id)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 600,
                        border: isActive ? '1px solid #c4b5fd' : '1px solid rgba(255, 255, 255, 0.08)',
                        background: isActive ? 'rgba(167, 139, 250, 0.25)' : 'rgba(255, 255, 255, 0.03)',
                        color: isActive ? '#c4b5fd' : 'var(--text-secondary)',
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

            {/* Recharts Composed Chart */}
            <div style={{ width: '100%', height: 320, position: 'relative' }}>
              {loading && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', borderRadius: 8, zIndex: 10 }}>
                  <span style={{ fontSize: 13, color: '#c4b5fd', fontWeight: 600 }}>Lasketaan kulutusennustetta...</span>
                </div>
              )}

              {hourlyData.length === 0 && !loading ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  Ei ennustedataa saatavilla.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={hourlyData} margin={{ top: 15, right: 15, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis
                      dataKey="time"
                      tickFormatter={(ts) => {
                        const d = new Date(ts);
                        return `${String(d.getHours()).padStart(2, '0')}:00`;
                      }}
                      stroke="var(--text-muted)"
                      fontSize={11}
                    />
                    <YAxis
                      yAxisId="power"
                      orientation="left"
                      stroke="#a78bfa"
                      fontSize={11}
                      domain={[0, 'auto']}
                      tickFormatter={(v) => `${v} kW`}
                    />
                    <YAxis
                      yAxisId="temp"
                      orientation="right"
                      stroke="#38bdf8"
                      fontSize={11}
                      domain={['auto', 'auto']}
                      tickFormatter={(v) => `${v}°C`}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const p = payload[0].payload as HourlyEstimatePoint;
                          const dateObj = new Date(p.time);
                          const dateStr = dateObj.toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'numeric' });
                          const hourStr = `${String(dateObj.getHours()).padStart(2, '0')}:00`;

                          return (
                            <div
                              style={{
                                background: 'rgba(15, 23, 42, 0.96)',
                                border: '1px solid rgba(167, 139, 250, 0.35)',
                                borderRadius: 10,
                                padding: '12px 14px',
                                boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                              }}
                            >
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'capitalize' }}>
                                {dateStr} klo {hourStr}
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                                <div style={{ color: '#38bdf8', fontWeight: 600 }}>
                                  🌤️ Ulkolämpötila: <strong>{p.outdoorTemp} °C</strong>
                                </div>
                                <div style={{ color: '#4ade80', fontWeight: 600 }}>
                                  📈 Arvioitu COP: <strong>{p.cop}</strong>
                                </div>
                                <div style={{ color: '#fb923c', fontWeight: 600 }}>
                                  🔥 Lämmityksen tehotarve: <strong>{p.heatDemandKw} kW</strong>
                                </div>
                                <div style={{ color: '#a78bfa', fontWeight: 700, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 4, marginTop: 2 }}>
                                  ⚡ VILP Ottoteho (sähkö): <strong>{p.totalElectricKw} kW</strong> (~{p.totalElectricKw} kWh/h)
                                </div>
                                {p.priceCentsKWh !== null && (
                                  <div style={{ color: '#facc15', fontSize: 11.5, marginTop: 2 }}>
                                    💰 Pörssihinta: {p.priceCentsKWh} snt/kWh · Tuntikustannus: <strong>{p.costCentsPerHour} snt/h</strong>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend
                      verticalAlign="top"
                      height={36}
                      formatter={(val) => <span style={{ color: 'var(--text-secondary)', fontSize: 11.5 }}>{val}</span>}
                    />
                    <Bar
                      yAxisId="power"
                      dataKey="totalElectricKw"
                      fill="#a78bfa"
                      fillOpacity={0.85}
                      name="Ottoteho sähkö (kW)"
                      radius={[4, 4, 0, 0]}
                    />
                    <Line
                      yAxisId="power"
                      type="monotone"
                      dataKey="heatDemandKw"
                      stroke="#fb923c"
                      strokeWidth={2.5}
                      dot={false}
                      name="Tuotettu lämpö (kW)"
                    />
                    <Line
                      yAxisId="temp"
                      type="monotone"
                      dataKey="outdoorTemp"
                      stroke="#38bdf8"
                      strokeWidth={2}
                      dot={false}
                      name="Ulkolämpötila (°C)"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Action links */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {onOpenTrends && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  onClose();
                  onOpenTrends();
                }}
                style={{
                  background: 'rgba(192, 132, 252, 0.15)',
                  border: '1px solid rgba(192, 132, 252, 0.35)',
                  color: '#c084fc',
                  padding: '9px 16px',
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 12.5,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span>📈</span>
                <span>Avaa Trendit & Herrfors-kulutusseuranta ▶</span>
              </button>
            )}

            {onOpenApc && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  onClose();
                  onOpenApc();
                }}
                style={{
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  color: '#4ade80',
                  padding: '9px 16px',
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 12.5,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span>⚡</span>
                <span>Avaa APC-Pörssiohjaus ▶</span>
              </button>
            )}
          </div>

          {/* Mitoitus & Fysiikka -info */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.07)',
              borderRadius: 14,
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🏠</span> Kiinteistön ja Lämmitysjärjestelmän Mitoitustiedot
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
              <div>• <strong>Rakennus:</strong> Lautakoolattu rossipohja 250 m²</div>
              <div>• <strong>Mitoitusteho:</strong> 9,2 kW (-26 °C)</div>
              <div>• <strong>Mitoitusvirtaus:</strong> 870 l/h (14,5 l/min), ΔT 9,1 °C</div>
              <div>• <strong>Puskurivaraaja:</strong> 100 L (4-putkikytkentä)</div>
              <div>• <strong>LKV-varaaja:</strong> 284 L kierukalla</div>
              <div>• <strong>VILP:</strong> Panasonic T-CAP 12 kW Monobloc</div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
