import { useState, useEffect } from 'react';
import type { HeishamonState } from '../types/heishamon';
import { numVal } from '../types/heishamon';
import { useCompressorAnalytics } from '../hooks/useCompressorAnalytics';
import type { TrendTopicTarget } from './VariableTrendModal';
import { apiFetch } from '../lib/api';
import type { CostSummary } from '../types/costs';

interface EnergyStatsCardProps {
  state: HeishamonState;
  onOpenTrend?: (target: TrendTopicTarget) => void;
}

function parseHistoryDate(dateVal?: string | number): Date | null {
  if (dateVal === undefined || dateVal === null) return null;
  if (typeof dateVal === 'number') {
    const d = new Date(dateVal);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof dateVal === 'string') {
    const isoMatch = dateVal.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const d = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
      return isNaN(d.getTime()) ? null : d;
    }
    const fiMatch = dateVal.match(/^(\d{1,2})\.(\d{1,2})\.?(?:(\d{4}))?/);
    if (fiMatch) {
      const year = fiMatch[3] ? Number(fiMatch[3]) : new Date().getFullYear();
      const d = new Date(year, Number(fiMatch[2]) - 1, Number(fiMatch[1]));
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(dateVal);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

type EnergyViewMode = 'today' | 'month' | 'realtime' | 'lifetime';

export function EnergyStatsCard({ state, onOpenTrend }: EnergyStatsCardProps) {
  const { analytics } = useCompressorAnalytics();
  const [costSummary, setCostSummary] = useState<CostSummary | null>(null);
  const [viewMode, setViewMode] = useState<EnergyViewMode>('today');

  useEffect(() => {
    let mounted = true;
    const fetchSummary = async () => {
      try {
        const res = await apiFetch('/api/costs/summary');
        if (res.ok) {
          const data: CostSummary = await res.json();
          if (mounted) setCostSummary(data);
        }
      } catch {
        // ignore
      }
    };
    fetchSummary();
    const id = setInterval(fetchSummary, 60_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  // Hardware cumulative registers (if present on this heatpump)
  const hwHeatProd = numVal(state, 'extra/Heat_Energy_Production') ?? numVal(state, 'main/Heat_Energy_Production');
  const hwHeatCons = numVal(state, 'extra/Heat_Energy_Consumption') ?? numVal(state, 'main/Heat_Energy_Consumption');
  const hwDhwProd = numVal(state, 'extra/DHW_Energy_Production') ?? numVal(state, 'main/DHW_Energy_Production');
  const hwDhwCons = numVal(state, 'extra/DHW_Energy_Consumption') ?? numVal(state, 'main/DHW_Energy_Consumption');
  const hwCoolProd = numVal(state, 'main/Cool_Energy_Production');
  const hwCoolCons = numVal(state, 'main/Cool_Energy_Consumption');
  const hasHwCumulative = hwHeatProd !== null || hwHeatCons !== null || hwDhwProd !== null || hwDhwCons !== null;

  // Real-time instantaneous powers (Watts)
  const heatProdW = numVal(state, 'extra/Heat_Power_Production') ?? numVal(state, 'main/Heat_Power_Production');
  const heatConsW = numVal(state, 'extra/Heat_Power_Consumption') ?? numVal(state, 'main/Heat_Power_Consumption');
  const dhwProdW = numVal(state, 'extra/DHW_Power_Production') ?? numVal(state, 'main/DHW_Power_Production');
  const dhwConsW = numVal(state, 'extra/DHW_Power_Consumption') ?? numVal(state, 'main/DHW_Power_Consumption');
  const coolProdW = numVal(state, 'extra/Cool_Power_Production') ?? numVal(state, 'main/Cool_Power_Production');
  const coolConsW = numVal(state, 'extra/Cool_Power_Consumption') ?? numVal(state, 'main/Cool_Power_Consumption');

  const totalProdW = (heatProdW ?? 0) + (dhwProdW ?? 0) + (coolProdW ?? 0);
  const totalConsW = (heatConsW ?? 0) + (dhwConsW ?? 0) + (coolConsW ?? 0);
  const realtimeCop = totalConsW > 0 && totalProdW > 0 ? (totalProdW / totalConsW).toFixed(2) : null;
  const heatRealCop = heatConsW && heatConsW > 0 && heatProdW ? (heatProdW / heatConsW).toFixed(2) : null;
  const dhwRealCop = dhwConsW && dhwConsW > 0 && dhwProdW ? (dhwProdW / dhwConsW).toFixed(2) : null;

  // Operational sensors
  const compressorFreq = numVal(state, 'main/Compressor_Freq');
  const pumpFlow = numVal(state, 'main/Pump_Flow');
  const inletTemp = numVal(state, 'main/Main_Inlet_Temp');
  const outletTemp = numVal(state, 'main/Main_Outlet_Temp');
  const deltaT = inletTemp !== null && outletTemp !== null ? (outletTemp - inletTemp).toFixed(1) : null;

  // Operational hours and counters
  const opHours = numVal(state, 'main/Operations_Hours');
  const opCount = numVal(state, 'main/Operations_Counter');
  const heaterHours = numVal(state, 'main/Internal_Heater_Operations_Hours');

  // Lifetime average cycle length in hours
  const avgCycleHours = opHours !== null && opCount && opCount > 0 ? (opHours / opCount) : null;

  // Integrated energy data (from costSummary)
  const todayData = costSummary?.today;
  const monthData = costSummary?.month;

  const todayHeatProd = todayData?.heat_production_kwh ?? 0;
  const todayHeatCons = todayData?.heat_consumption_kwh ?? 0;
  const todayDhwProd = todayData?.dhw_production_kwh ?? 0;
  const todayDhwCons = todayData?.dhw_consumption_kwh ?? 0;
  const todayTotalProd = todayData?.total_production_kwh ?? (todayHeatProd + todayDhwProd);
  const todayTotalCons = todayData?.total_consumption_kwh ?? (todayHeatCons + todayDhwCons);
  const todayCop = todayData?.cop ? todayData.cop.toFixed(2) : todayTotalCons > 0 ? (todayTotalProd / todayTotalCons).toFixed(2) : null;
  const todayHeatCop = todayHeatCons > 0 ? (todayHeatProd / todayHeatCons).toFixed(2) : null;
  const todayDhwCop = todayDhwCons > 0 ? (todayDhwProd / todayDhwCons).toFixed(2) : null;
  const todaySavedKwh = todayTotalProd > todayTotalCons ? Math.round(todayTotalProd - todayTotalCons) : null;

  const monthTotalProd = monthData?.total_production_kwh ?? 0;
  const monthTotalCons = monthData?.total_consumption_kwh ?? 0;
  const monthCop = monthData?.cop ? monthData.cop.toFixed(2) : monthTotalCons > 0 ? (monthTotalProd / monthTotalCons).toFixed(2) : null;
  const monthSavingsEur = monthData?.savings_eur ?? 0;

  // Today cycle analytics
  const todayCycles = analytics?.today.cycles ?? 0;
  const todayHours = analytics?.today.hours ?? 0;
  const todayAvgCycle = analytics?.today.avgCycleHours;
  const todayForecastCycles = analytics?.today.forecastCycles;
  const todayForecastHours = analytics?.today.forecastHours;
  const avgCyclesPerDay = analytics?.dailyAverage.avgCyclesPerDay;
  const avgHoursPerDay = analytics?.dailyAverage.avgHoursPerDay;

  // Badge COP display based on active view
  const activeHeaderCop =
    viewMode === 'realtime'
      ? realtimeCop
      : viewMode === 'month'
      ? monthCop
      : todayCop;

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-icon">⚡</span>
        <span className="card-title">Energiatase & Käyntianalytiikka</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {activeHeaderCop && (
            <div className="badge badge-heat" style={{ fontSize: 12, fontWeight: 700 }}>
              {viewMode === 'realtime' ? 'Hetkellinen COP' : viewMode === 'month' ? 'Kuukauden COP' : 'Päivän COP'}: {activeHeaderCop}
            </div>
          )}
        </div>
      </div>

      <div className="card-body">
        <div className="dashboard-grid dashboard-grid-sub" style={{ gap: 20, marginBottom: 0 }}>
          {/* Left Column: Energy & Power Balance */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* View Mode Switcher Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'inline-flex', background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: 2, gap: 2 }}>
                <button
                  type="button"
                  onClick={() => setViewMode('today')}
                  style={{
                    border: 'none',
                    background: viewMode === 'today' ? 'var(--heat-primary, #f97316)' : 'transparent',
                    color: viewMode === 'today' ? '#fff' : 'var(--text-muted)',
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '3px 9px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Tänään
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('month')}
                  style={{
                    border: 'none',
                    background: viewMode === 'month' ? 'var(--heat-primary, #f97316)' : 'transparent',
                    color: viewMode === 'month' ? '#fff' : 'var(--text-muted)',
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '3px 9px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Kuluva kk
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('realtime')}
                  style={{
                    border: 'none',
                    background: viewMode === 'realtime' ? 'var(--heat-primary, #f97316)' : 'transparent',
                    color: viewMode === 'realtime' ? '#fff' : 'var(--text-muted)',
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '3px 9px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Hetkellinen teho
                </button>
                {hasHwCumulative && (
                  <button
                    type="button"
                    onClick={() => setViewMode('lifetime')}
                    style={{
                      border: 'none',
                      background: viewMode === 'lifetime' ? 'var(--heat-primary, #f97316)' : 'transparent',
                      color: viewMode === 'lifetime' ? '#fff' : 'var(--text-muted)',
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '3px 9px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    Elinkaari
                  </button>
                )}
              </div>

              {viewMode === 'today' && todaySavedKwh !== null && todaySavedKwh > 0 && (
                <span style={{ fontSize: 11, color: 'var(--online)', fontWeight: 600 }}>
                  🌱 Säästö: ~{todaySavedKwh} kWh
                </span>
              )}
              {viewMode === 'month' && monthSavingsEur > 0 && (
                <span style={{ fontSize: 11, color: 'var(--online)', fontWeight: 600 }}>
                  🌱 Säästö: ~{monthSavingsEur.toFixed(1)} €
                </span>
              )}
              {viewMode === 'realtime' && compressorFreq !== null && (
                <span style={{ fontSize: 11, color: compressorFreq > 0 ? 'var(--online)' : 'var(--text-muted)', fontWeight: 600 }}>
                  {compressorFreq > 0 ? `● Kompressori ${compressorFreq} Hz` : '○ Valmiustilassa'}
                </span>
              )}
            </div>

            {/* Main KPI Tiles */}
            {viewMode === 'today' && (
              <div className="metrics-grid metrics-grid-3">
                <div
                  className="metric-box metric-clickable"
                  title="Klikkaa nähdäksesi lämmitystehon tuottotrendi"
                  onClick={() =>
                    onOpenTrend?.({
                      topic: 'main/Heat_Power_Production',
                      label: 'Lämmitysteho (tuotto)',
                      unit: 'W',
                      color: 'var(--heat-primary)',
                    })
                  }
                >
                  <span className="metric-label">Tuotettu lämpö ↗</span>
                  <span className="metric-value" style={{ color: 'var(--heat-primary)' }}>
                    {todayTotalProd.toFixed(1)}
                    <span className="metric-unit">kWh</span>
                  </span>
                </div>
                <div
                  className="metric-box metric-clickable"
                  title="Klikkaa nähdäksesi ottotehon trendi"
                  onClick={() =>
                    onOpenTrend?.({
                      topic: 'main/Heat_Power_Consumption',
                      label: 'Ottoteho (lämmitys)',
                      unit: 'W',
                      color: '#f43f5e',
                    })
                  }
                >
                  <span className="metric-label">Käytetty sähkö ↗</span>
                  <span className="metric-value">
                    {todayTotalCons.toFixed(1)}
                    <span className="metric-unit">kWh</span>
                  </span>
                </div>
                <div className="metric-box">
                  <span className="metric-label">Päivän COP</span>
                  <span className="metric-value" style={{ color: 'var(--heat-primary)' }}>
                    {todayCop ?? '—'}
                  </span>
                </div>
              </div>
            )}

            {viewMode === 'month' && (
              <div className="metrics-grid metrics-grid-3">
                <div className="metric-box">
                  <span className="metric-label">Tuotettu lämpö (kk)</span>
                  <span className="metric-value" style={{ color: 'var(--heat-primary)' }}>
                    {Math.round(monthTotalProd).toLocaleString('fi-FI')}
                    <span className="metric-unit">kWh</span>
                  </span>
                </div>
                <div className="metric-box">
                  <span className="metric-label">Käytetty sähkö (kk)</span>
                  <span className="metric-value">
                    {Math.round(monthTotalCons).toLocaleString('fi-FI')}
                    <span className="metric-unit">kWh</span>
                  </span>
                </div>
                <div className="metric-box">
                  <span className="metric-label">Kuukauden COP</span>
                  <span className="metric-value" style={{ color: 'var(--heat-primary)' }}>
                    {monthCop ?? '—'}
                  </span>
                </div>
              </div>
            )}

            {viewMode === 'realtime' && (
              <div className="metrics-grid metrics-grid-3">
                <div
                  className="metric-box metric-clickable"
                  title="Klikkaa nähdäksesi lämmitystehon tuottotrendi"
                  onClick={() =>
                    onOpenTrend?.({
                      topic: 'main/Heat_Power_Production',
                      label: 'Lämmitysteho (tuotto)',
                      unit: 'W',
                      color: 'var(--heat-primary)',
                    })
                  }
                >
                  <span className="metric-label">Tuottoteho nyt ↗</span>
                  <span className="metric-value" style={{ color: 'var(--heat-primary)' }}>
                    {totalProdW >= 1000 ? (totalProdW / 1000).toFixed(2) : totalProdW}
                    <span className="metric-unit">{totalProdW >= 1000 ? 'kW' : 'W'}</span>
                  </span>
                </div>
                <div
                  className="metric-box metric-clickable"
                  title="Klikkaa nähdäksesi ottotehotrendi"
                  onClick={() =>
                    onOpenTrend?.({
                      topic: 'main/Heat_Power_Consumption',
                      label: 'Ottoteho (lämmitys)',
                      unit: 'W',
                      color: '#f43f5e',
                    })
                  }
                >
                  <span className="metric-label">Ottoteho nyt ↗</span>
                  <span className="metric-value">
                    {totalConsW >= 1000 ? (totalConsW / 1000).toFixed(2) : totalConsW}
                    <span className="metric-unit">{totalConsW >= 1000 ? 'kW' : 'W'}</span>
                  </span>
                </div>
                <div className="metric-box">
                  <span className="metric-label">Hetkellinen COP</span>
                  <span className="metric-value" style={{ color: 'var(--heat-primary)' }}>
                    {realtimeCop ?? '—'}
                  </span>
                </div>
              </div>
            )}

            {viewMode === 'lifetime' && (
              <div className="metrics-grid metrics-grid-3">
                <div className="metric-box">
                  <span className="metric-label">Koko elinkaari tuotto</span>
                  <span className="metric-value" style={{ color: 'var(--heat-primary)' }}>
                    {hwHeatProd !== null ? `${Math.round((hwHeatProd ?? 0) + (hwDhwProd ?? 0) + (hwCoolProd ?? 0)).toLocaleString('fi-FI')}` : '—'}
                    <span className="metric-unit">kWh</span>
                  </span>
                </div>
                <div className="metric-box">
                  <span className="metric-label">Koko elinkaari kulutus</span>
                  <span className="metric-value">
                    {hwHeatCons !== null ? `${Math.round((hwHeatCons ?? 0) + (hwDhwCons ?? 0) + (hwCoolCons ?? 0)).toLocaleString('fi-FI')}` : '—'}
                    <span className="metric-unit">kWh</span>
                  </span>
                </div>
                <div className="metric-box">
                  <span className="metric-label">Elinkaari COP</span>
                  <span className="metric-value" style={{ color: 'var(--heat-primary)' }}>
                    {hwHeatCons && (hwHeatCons + (hwDhwCons ?? 0)) > 0
                      ? (((hwHeatProd ?? 0) + (hwDhwProd ?? 0)) / (hwHeatCons + (hwDhwCons ?? 0))).toFixed(2)
                      : '—'}
                  </span>
                </div>
              </div>
            )}

            {/* Sub-breakdown: Heating vs DHW */}
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}>
              {/* Heating row */}
              <div
                className="metric-clickable"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                title="Klikkaa nähdäksesi lämmitystehon trendi"
                onClick={() =>
                  onOpenTrend?.({
                    topic: 'main/Heat_Power_Production',
                    label: 'Lämmitysteho (tuotto)',
                    unit: 'W',
                    color: 'var(--buffer-primary)',
                  })
                }
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--buffer-primary)' }} />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>Tilojen lämmitys ↗</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12 }}>
                  {viewMode === 'realtime' ? (
                    <>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        Tuotto: <strong style={{ color: 'var(--text-primary)' }}>{heatProdW !== null ? `${heatProdW} W` : '0 W'}</strong>
                      </span>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        Ottoteho: <strong style={{ color: 'var(--text-primary)' }}>{heatConsW !== null ? `${heatConsW} W` : '0 W'}</strong>
                      </span>
                      <span style={{ color: 'var(--buffer-primary)', fontWeight: 700 }}>
                        COP {heatRealCop ?? '—'}
                      </span>
                    </>
                  ) : (
                    <>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        Tuotto: <strong style={{ color: 'var(--text-primary)' }}>{todayHeatProd.toFixed(1)} kWh</strong>
                      </span>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        Kulutus: <strong style={{ color: 'var(--text-primary)' }}>{todayHeatCons.toFixed(1)} kWh</strong>
                      </span>
                      <span style={{ color: 'var(--buffer-primary)', fontWeight: 700 }}>
                        COP {todayHeatCop ?? '—'}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* DHW row */}
              <div
                className="metric-clickable"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                title="Klikkaa nähdäksesi käyttöveden tuottotehon trendi"
                onClick={() =>
                  onOpenTrend?.({
                    topic: 'main/DHW_Power_Production',
                    label: 'Käyttöveden tuottoteho',
                    unit: 'W',
                    color: 'var(--dhw-primary)',
                  })
                }
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--dhw-primary)' }} />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>Käyttövesi ↗</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12 }}>
                  {viewMode === 'realtime' ? (
                    <>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        Tuotto: <strong style={{ color: 'var(--text-primary)' }}>{dhwProdW !== null ? `${dhwProdW} W` : '0 W'}</strong>
                      </span>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        Ottoteho: <strong style={{ color: 'var(--text-primary)' }}>{dhwConsW !== null ? `${dhwConsW} W` : '0 W'}</strong>
                      </span>
                      <span style={{ color: 'var(--dhw-primary)', fontWeight: 700 }}>
                        COP {dhwRealCop ?? '—'}
                      </span>
                    </>
                  ) : (
                    <>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        Tuotto: <strong style={{ color: 'var(--text-primary)' }}>{todayDhwProd.toFixed(1)} kWh</strong>
                      </span>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        Kulutus: <strong style={{ color: 'var(--text-primary)' }}>{todayDhwCons.toFixed(1)} kWh</strong>
                      </span>
                      <span style={{ color: 'var(--dhw-primary)', fontWeight: 700 }}>
                        COP {todayDhwCop ?? '—'}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Operating Parameters: Flow, Delta T, Freq & Heater */}
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 8,
              fontSize: 11,
              color: 'var(--text-muted)',
            }}>
              <span>
                Virtaus: <strong style={{ color: 'var(--text-primary)' }}>{pumpFlow !== null ? `${pumpFlow.toFixed(1)} l/min` : '—'}</strong>
                {deltaT !== null && <span style={{ marginLeft: 6, color: 'var(--text-secondary)' }}>(ΔT {deltaT} °C)</span>}
              </span>
              <span>
                Taajuus: <strong style={{ color: compressorFreq && compressorFreq > 0 ? 'var(--online)' : 'var(--text-primary)' }}>
                  {compressorFreq !== null && compressorFreq > 0 ? `${compressorFreq} Hz` : '0 Hz'}
                </strong>
              </span>
              <span style={{
                color: heaterHours && heaterHours > 0 ? 'var(--warning)' : 'var(--online)',
                fontWeight: 600,
              }}>
                Varavastus: {heaterHours !== null ? `${Math.round(heaterHours)} h` : '0 h'}
              </span>
            </div>
          </div>

          {/* Right Column: Cycles & Operational Analytics */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Kompressorin syklit & Käyttöajat
              </span>
              {avgCycleHours !== null && (
                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: avgCycleHours >= 1.5 ? 'var(--online)' : avgCycleHours >= 0.7 ? 'var(--warning)' : 'var(--offline)',
                }}>
                  {avgCycleHours >= 1.5 ? '✓ Pitkät syklit' : avgCycleHours >= 0.7 ? '● Normaalit syklit' : '⚠ Lyhyet syklit'}
                </span>
              )}
            </div>

            {/* Cycle KPI Tiles: Tänään, Ennuste, Päiväkeskiarvo */}
            <div className="metrics-grid metrics-grid-3">
              {/* Tänään */}
              <div className="metric-box" style={{ position: 'relative', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="metric-label">Tänään (00:00 alkaen)</span>
                </div>
                <span className="metric-value" style={{ color: 'var(--text-primary)' }}>
                  {analytics ? todayCycles : '—'}
                  <span className="metric-unit">sykliä</span>
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {analytics ? `${todayHours.toFixed(1)} h` : '—'}
                  {todayAvgCycle !== null && todayAvgCycle !== undefined ? ` (~${todayAvgCycle.toFixed(1)} h/sykli)` : ''}
                </span>
              </div>

              {/* Tänään ennuste (24h) */}
              <div className="metric-box" style={{ position: 'relative', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="metric-label">Ennuste (24h)</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>tänään</span>
                </div>
                <span className="metric-value" style={{ color: 'var(--online)' }}>
                  {todayForecastCycles !== undefined ? `~${todayForecastCycles}` : '—'}
                  <span className="metric-unit">sykliä/vrk</span>
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {todayForecastHours !== undefined ? `~${todayForecastHours.toFixed(1)} h/vrk` : '—'}
                </span>
              </div>

              {/* Päiväkeskiarvo (7 pv) */}
              <div className="metric-box" style={{ position: 'relative', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="metric-label">Päiväkeskiarvo</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>7 pv</span>
                </div>
                <span className="metric-value" style={{ color: 'var(--heat-primary)' }}>
                  {avgCyclesPerDay !== null && avgCyclesPerDay !== undefined ? `~${avgCyclesPerDay.toFixed(1)}` : '—'}
                  <span className="metric-unit">sykliä/pv</span>
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {avgHoursPerDay !== null && avgHoursPerDay !== undefined ? `~${avgHoursPerDay.toFixed(1)} h/pv` : '—'}
                </span>
              </div>
            </div>

            {/* Lifetime totals box */}
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Koko elinkaari yhteensä
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  Keskikäyntiaika: <strong style={{ color: 'var(--text-primary)' }}>{avgCycleHours !== null ? `${avgCycleHours.toFixed(1)} h / startti` : '—'}</strong>
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                <div style={{ display: 'flex', gap: 16 }}>
                  <span>
                    Käyttötunnit: <strong style={{ color: 'var(--text-primary)' }}>{opHours !== null ? `${Math.round(opHours).toLocaleString('fi-FI')} h` : '—'}</strong>
                  </span>
                  <span>
                    Käynnistykset: <strong style={{ color: 'var(--text-primary)' }}>{opCount !== null ? `${Math.round(opCount).toLocaleString('fi-FI')} kpl` : '—'}</strong>
                  </span>
                </div>
              </div>
            </div>

            {/* 7-day mini-history breakdown if available */}
            {analytics?.history && analytics.history.length > 0 && (
              <div style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '10px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Viimeiset 7 päivää (syklit & käyntiaika)
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${analytics.history.length}, 1fr)`, gap: 6 }}>
                  {analytics.history.map((day, idx) => {
                    const parsedDate = parseHistoryDate(day.timestamp ?? day.date);
                    const dayName = parsedDate
                      ? parsedDate.toLocaleDateString('fi-FI', { weekday: 'short' })
                      : '—';
                    const dateLabel = parsedDate
                      ? parsedDate.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })
                      : day.date;

                    return (
                      <div
                        key={day.date || day.timestamp || idx}
                        style={{
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.05)',
                          borderRadius: 'var(--radius-sm, 6px)',
                          padding: '6px 4px',
                          textAlign: 'center',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 2,
                        }}
                        title={`${dateLabel} (${dayName}): ${day.cycles} sykliä, ${day.hours.toFixed(1)} h (ka. ${day.avgCycleHours ? day.avgCycleHours.toFixed(1) : 0} h/sykli)`}
                      >
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                          {dayName}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                          {day.cycles} <span style={{ fontSize: 9, fontWeight: 400, color: 'var(--text-muted)' }}>sykliä</span>
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                          {day.hours.toFixed(1)} h
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
