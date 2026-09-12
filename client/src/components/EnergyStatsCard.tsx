import type { HeishamonState } from '../types/heishamon';
import { numVal } from '../types/heishamon';

import type { TrendTopicTarget } from './VariableTrendModal';

interface EnergyStatsCardProps {
  state: HeishamonState;
  onOpenTrend?: (target: TrendTopicTarget) => void;
}

export function EnergyStatsCard({ state, onOpenTrend }: EnergyStatsCardProps) {
  // Cumulative energies (prefer XTOP, fallback to main)
  const heatProd = numVal(state, 'extra/Heat_Energy_Production') ?? numVal(state, 'main/Heat_Energy_Production');
  const heatCons = numVal(state, 'extra/Heat_Energy_Consumption') ?? numVal(state, 'main/Heat_Energy_Consumption');
  const dhwProd = numVal(state, 'extra/DHW_Energy_Production') ?? numVal(state, 'main/DHW_Energy_Production');
  const dhwCons = numVal(state, 'extra/DHW_Energy_Consumption') ?? numVal(state, 'main/DHW_Energy_Consumption');
  const coolProd = numVal(state, 'main/Cool_Energy_Production');
  const coolCons = numVal(state, 'main/Cool_Energy_Consumption');

  const hasEnergyData = heatProd !== null || heatCons !== null || dhwProd !== null || dhwCons !== null;

  const totalProd = (heatProd ?? 0) + (dhwProd ?? 0) + (coolProd ?? 0);
  const totalCons = (heatCons ?? 0) + (dhwCons ?? 0) + (coolCons ?? 0);

  const totalCop = totalCons > 0 ? (totalProd / totalCons).toFixed(2) : null;
  const heatCop = heatCons && heatCons > 0 && heatProd ? (heatProd / heatCons).toFixed(2) : null;
  const dhwCop = dhwCons && dhwCons > 0 && dhwProd ? (dhwProd / dhwCons).toFixed(2) : null;

  const savedKwh = totalProd > totalCons ? Math.round(totalProd - totalCons) : null;

  // Operational hours and counters
  const opHours = numVal(state, 'main/Operations_Hours');
  const opCount = numVal(state, 'main/Operations_Counter');
  const heatHours = numVal(state, 'main/Heat_Hours');
  const dhwHours = numVal(state, 'main/DHW_Hours');
  const coolHours = numVal(state, 'main/Cool_Hours');
  const heaterHours = numVal(state, 'main/Internal_Heater_Operations_Hours');
  const pumpHours = numVal(state, 'main/Pump_Hours');
  const pumpCount = numVal(state, 'main/Pump_Counter');

  // Average cycle length in hours
  const avgCycleHours = opHours !== null && opCount && opCount > 0 ? (opHours / opCount) : null;

  // Total operating hours split percentage
  const totalModeHours = (heatHours ?? 0) + (dhwHours ?? 0) + (coolHours ?? 0);
  const heatPct = totalModeHours > 0 && heatHours ? Math.round((heatHours / totalModeHours) * 100) : null;
  const dhwPct = totalModeHours > 0 && dhwHours ? Math.round((dhwHours / totalModeHours) * 100) : null;

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-icon">⚡</span>
        <span className="card-title">Energiatase & Käyntianalytiikka</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {totalCop && (
            <div className="badge badge-heat" style={{ fontSize: 12, fontWeight: 700 }}>
              Kokonais-COP: {totalCop}
            </div>
          )}
        </div>
      </div>

      <div className="card-body">
        <div className="dashboard-grid dashboard-grid-sub" style={{ gap: 20, marginBottom: 0 }}>
          {/* Left Column: Cumulative Energy & COP */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Kumulatiivinen energia (kWh)
              </span>
              {savedKwh !== null && (
                <span style={{ fontSize: 11, color: 'var(--online)', fontWeight: 600 }}>
                  🌱 Säästö: ~{savedKwh.toLocaleString('fi-FI')} kWh
                </span>
              )}
            </div>

            {/* Total Energy KPI Tiles */}
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
                  {hasEnergyData ? `${Math.round(totalProd).toLocaleString('fi-FI')}` : '—'}
                  <span className="metric-unit">kWh</span>
                </span>
              </div>
              <div
                className="metric-box metric-clickable"
                title="Klikkaa nähdäksesi lämmityksen ottotehotrendi"
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
                  {hasEnergyData ? `${Math.round(totalCons).toLocaleString('fi-FI')}` : '—'}
                  <span className="metric-unit">kWh</span>
                </span>
              </div>
              <div className="metric-box">
                <span className="metric-label">Kokonais-COP</span>
                <span className="metric-value" style={{ color: 'var(--heat-primary)' }}>
                  {totalCop ?? '—'}
                </span>
              </div>
            </div>

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
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Tuotto: <strong style={{ color: 'var(--text-primary)' }}>{heatProd !== null ? `${Math.round(heatProd).toLocaleString('fi-FI')} kWh` : '—'}</strong>
                  </span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Kulutus: <strong style={{ color: 'var(--text-primary)' }}>{heatCons !== null ? `${Math.round(heatCons).toLocaleString('fi-FI')} kWh` : '—'}</strong>
                  </span>
                  <span style={{ color: 'var(--buffer-primary)', fontWeight: 700 }}>
                    COP {heatCop ?? '—'}
                  </span>
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
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Tuotto: <strong style={{ color: 'var(--text-primary)' }}>{dhwProd !== null ? `${Math.round(dhwProd).toLocaleString('fi-FI')} kWh` : '—'}</strong>
                  </span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Kulutus: <strong style={{ color: 'var(--text-primary)' }}>{dhwCons !== null ? `${Math.round(dhwCons).toLocaleString('fi-FI')} kWh` : '—'}</strong>
                  </span>
                  <span style={{ color: 'var(--dhw-primary)', fontWeight: 700 }}>
                    COP {dhwCop ?? '—'}
                  </span>
                </div>
              </div>
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
                  {avgCycleHours >= 1.5 ? '✓ Pitkät syklit (Optimaalinen)' : avgCycleHours >= 0.7 ? '● Normaalit syklit' : '⚠ Lyhyet syklit'}
                </span>
              )}
            </div>

            {/* Cycle KPI Tiles */}
            <div className="metrics-grid metrics-grid-3">
              <div className="metric-box">
                <span className="metric-label">Keskikäyntiaika</span>
                <span className="metric-value" style={{
                  color: avgCycleHours !== null && avgCycleHours >= 1.5 ? 'var(--online)' : 'var(--text-primary)',
                }}>
                  {avgCycleHours !== null ? `${avgCycleHours.toFixed(1)}` : '—'}
                  <span className="metric-unit">h / startti</span>
                </span>
              </div>
              <div className="metric-box">
                <span className="metric-label">Käyttötunnit</span>
                <span className="metric-value">
                  {opHours !== null ? `${Math.round(opHours).toLocaleString('fi-FI')}` : '—'}
                  <span className="metric-unit">h</span>
                </span>
              </div>
              <div className="metric-box">
                <span className="metric-label">Käynnistykset</span>
                <span className="metric-value">
                  {opCount !== null ? `${Math.round(opCount).toLocaleString('fi-FI')}` : '—'}
                  <span className="metric-unit">kpl</span>
                </span>
              </div>
            </div>

            {/* Mode Distribution & Backup Heater */}
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}>
              {/* Hours split */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Tuntijakauma:</span>
                <div style={{ display: 'flex', gap: 12 }}>
                  <span>
                    🔥 Lämmitys: <strong>{heatHours !== null ? `${Math.round(heatHours)} h` : '—'}</strong>
                    {heatPct !== null && <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>({heatPct}%)</span>}
                  </span>
                  <span>
                    🚿 Käyttövesi: <strong>{dhwHours !== null ? `${Math.round(dhwHours)} h` : '—'}</strong>
                    {dhwPct !== null && <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>({dhwPct}%)</span>}
                  </span>
                </div>
              </div>

              {/* Progress bar of split */}
              {heatPct !== null && dhwPct !== null && (
                <div style={{
                  height: 6,
                  borderRadius: 3,
                  background: 'rgba(255,255,255,0.08)',
                  overflow: 'hidden',
                  display: 'flex',
                }}>
                  <div style={{ width: `${heatPct}%`, background: 'var(--buffer-primary)', transition: 'width 0.5s' }} />
                  <div style={{ width: `${dhwPct}%`, background: 'var(--dhw-primary)', transition: 'width 0.5s' }} />
                </div>
              )}

              {/* Pump & Backup heater info */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', paddingTop: 4 }}>
                <span>
                  Kiertovesipumppu: {pumpHours !== null ? `${Math.round(pumpHours)} h` : '—'}
                  {pumpCount !== null && ` (${Math.round(pumpCount)} starttia)`}
                </span>
                <span style={{
                  color: heaterHours && heaterHours > 0 ? 'var(--warning)' : 'var(--online)',
                  fontWeight: 600,
                }}>
                  Varavastus: {heaterHours !== null ? `${Math.round(heaterHours)} h` : '0 h'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
