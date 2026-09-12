import type { HeishamonState } from '../types/heishamon';
import { numVal } from '../types/heishamon';
import { useCommand } from '../hooks/useCommand';
import { useElectricityPrice } from '../hooks/useElectricityPrice';
import { SetpointControl } from './SetpointControl';
import { ToggleRow } from './SegmentedControl';

import type { TrendTopicTarget } from './VariableTrendModal';

interface DHWCardProps {
  state: HeishamonState;
  onOpenTrend?: (target: TrendTopicTarget) => void;
  readOnly?: boolean;
}

function TankSvg({
  temp,
  target,
  maxTemp = 65,
  minTemp = 20,
  onOpenTrend,
}: {
  temp: number | null;
  target: number | null;
  maxTemp?: number;
  minTemp?: number;
  onOpenTrend?: (target: TrendTopicTarget) => void;
}) {
  const fillPct = temp !== null
    ? Math.max(5, Math.min(95, ((temp - minTemp) / (maxTemp - minTemp)) * 100))
    : 5;

  const waterColor = temp !== null && temp > 55
    ? '#f59e0b'
    : temp !== null && temp > 45
    ? '#fb923c'
    : '#22d3ee';

  const waterGlow = temp !== null && temp > 45 ? 'rgba(245,158,11,0.3)' : 'rgba(34,211,238,0.2)';

  return (
    <div
      className="gauge-clickable"
      title="Klikkaa nähdäksesi käyttöveden lämpötilatrendi"
      onClick={() =>
        onOpenTrend?.({
          topic: 'main/DHW_Temp',
          label: 'Käyttöveden lämpötila',
          unit: '°C',
          color: '#10b981',
          currentValue: temp,
        })
      }
      style={{ flexShrink: 0 }}
    >
      <svg
        width="56"
        height="90"
        viewBox="0 0 56 90"
        fill="none"
      >
        {/* Tank outline */}
        <rect x="6" y="8" width="44" height="72" rx="8" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5"/>
        {/* Water fill */}
        <clipPath id="tank-clip">
          <rect x="7.5" y="9.5" width="41" height="69" rx="7" />
        </clipPath>
        <g clipPath="url(#tank-clip)">
          <rect
            x="7.5"
            y={9.5 + 69 * (1 - fillPct / 100)}
            width="41"
            height={69 * fillPct / 100}
            fill={waterColor}
            opacity="0.25"
            style={{ transition: 'all 1s ease', filter: `drop-shadow(0 0 6px ${waterGlow})` }}
          />
        </g>
        {/* Target line */}
        {target !== null && (() => {
          const targetPct = Math.max(5, Math.min(95, ((target - minTemp) / (maxTemp - minTemp)) * 100));
          const y = 9.5 + 69 * (1 - targetPct / 100);
          return <line x1="7.5" y1={y} x2="48.5" y2={y} stroke="rgba(255,255,255,0.4)" strokeWidth="1" strokeDasharray="3,2" />;
        })()}
        {/* Tank caps */}
        <rect x="16" y="2" width="24" height="8" rx="4" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5"/>
        <rect x="16" y="80" width="24" height="8" rx="4" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5"/>
      </svg>
    </div>
  );
}

export function DHWCard({ state, onOpenTrend, readOnly = false }: DHWCardProps) {
  const temp = numVal(state, 'main/DHW_Temp');
  const target = numVal(state, 'main/DHW_Target_Temp');
  const forceDHW = state['main/Force_DHW_State']?.value === '1';
  const heaterEnabled = state['main/DHW_Heater_State']?.value === '1';
  const forceHeater = state['main/Force_Heater_State']?.value === '1';
  const internalHeater = state['main/Internal_Heater_State']?.value === '1';
  const externalHeater = state['main/External_Heater_State']?.value === '1';

  // Power – prefer XTOP, fallback to TOP
  const dhwProdXtop = numVal(state, 'extra/DHW_Power_Production');
  const dhwConsXtop = numVal(state, 'extra/DHW_Power_Consumption');
  const dhwProd = dhwProdXtop ?? numVal(state, 'main/DHW_Power_Production');
  const dhwCons = dhwConsXtop ?? numVal(state, 'main/DHW_Power_Consumption');

  const cop = dhwCons && dhwCons > 0 && dhwProd ? (dhwProd / dhwCons).toFixed(2) : null;

  const { send, pending, error, success } = useCommand();
  const { calcCostPerHour } = useElectricityPrice();
  const cost = calcCostPerHour(dhwCons);

  function toggleForceHeater() {
    send('commands/SetForceHeater', forceHeater ? 0 : 1,
      forceHeater ? 'Lisävastus pois' : 'Lisävastus pakotettu päälle');
  }

  function setDHWTarget(v: number) {
    send('commands/SetDHWTemp', v, `Käyttöveden tavoite asetettu ${v} °C`);
  }

  const tempColor = temp !== null && temp > 55 ? 'var(--heat-primary)' :
    temp !== null && temp > 45 ? 'var(--heat-secondary)' : 'var(--cool-primary)';

  return (
    <div className="card" style={{
      borderColor: forceDHW ? 'rgba(245,158,11,0.4)' : 'var(--border)',
      boxShadow: forceDHW ? '0 0 20px rgba(245,158,11,0.1)' : undefined,
    }}>
      <div className="card-header">
        <span className="card-icon">🚿</span>
        <span className="card-title">Käyttövesivaraaja</span>
        {forceDHW && (
          <div className="badge badge-heat" style={{ marginLeft: 'auto' }}>⚡ Tehostus</div>
        )}
      </div>
      <div className="card-body">
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 16 }}>
          <TankSvg temp={temp} target={target} onOpenTrend={onOpenTrend} />
          <div style={{ flex: 1 }}>
            <div
              className="metric metric-clickable"
              style={{ marginBottom: 8 }}
              title="Klikkaa nähdäksesi käyttöveden lämpötilatrendi"
              onClick={() =>
                onOpenTrend?.({
                  topic: 'main/DHW_Temp',
                  label: 'Käyttöveden lämpötila',
                  unit: '°C',
                  color: '#10b981',
                  currentValue: temp,
                })
              }
            >
              <span className="metric-label">Lämpötila ↗</span>
              <span className="metric-value" style={{ fontSize: 32, color: tempColor }}>
                {temp !== null ? temp.toFixed(1) : '—'}
                <span className="metric-unit" style={{ fontSize: 16 }}>°C</span>
              </span>
            </div>
            {target !== null && temp !== null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: temp >= target ? 'var(--online)' : 'var(--warning)' }}>
                  {temp >= target ? '✓ Tavoite saavutettu' : `${(target - temp).toFixed(1)} °C tavoitteeseen`}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="divider" />

        {/* Setpoint */}
        <div style={{ marginTop: 12 }}>
          <SetpointControl
            label="Käyttöveden tavoitelämpötila"
            value={target}
            min={40}
            max={75}
            step={1}
            accentColor="var(--dhw-primary)"
            pending={pending}
            disabled={readOnly}
            onCommit={setDHWTarget}
            idPrefix="dhw-target"
            hint="legionellakuumennus vaatii ≥60 °C"
          />
        </div>

        <div className="divider" style={{ marginTop: 16 }} />

        {/* Power & Cost */}
        <div className="metrics-grid metrics-grid-4" style={{ marginTop: 12 }}>
          <div className="metric metric-sm">
            <span className="metric-label">Tuotto</span>
            <span className="metric-value" style={{ color: 'var(--dhw-primary)' }}>
              {dhwProd !== null ? (dhwProd >= 1000 ? `${(dhwProd / 1000).toFixed(2)}kW` : `${Math.round(dhwProd)}W`) : '—'}
            </span>
          </div>
          <div className="metric metric-sm">
            <span className="metric-label">Kulutus</span>
            <span className="metric-value">
              {dhwCons !== null ? (dhwCons >= 1000 ? `${(dhwCons / 1000).toFixed(2)}kW` : `${Math.round(dhwCons)}W`) : '—'}
            </span>
          </div>
          <div className="metric metric-sm">
            <span className="metric-label">COP</span>
            <span className="metric-value" style={{ color: 'var(--dhw-primary)' }}>
              {cop ?? '—'}
            </span>
          </div>
          <div className="metric metric-sm">
            <span className="metric-label">Hinta / h</span>
            <span className="metric-value" style={{ color: 'var(--text-secondary)' }}>
              {cost.formatted}
            </span>
          </div>
        </div>

        <div className="divider" />

        {/* Controls */}
        <div style={{ marginTop: 12 }}>
          <ToggleRow
            label="🔥 Pakota lisävastus (Force Heater)"
            description="Käynnistää sähköisen varavastuksen"
            on={forceHeater}
            onToggle={toggleForceHeater}
            pending={pending}
            disabled={readOnly}
            idPrefix="btn-dhw-force-heater"
            onLabel="🔥 Pakotettu"
            offLabel="○ Pois"
            danger={true}
          />

          <div style={{ display: 'flex', gap: 16, marginTop: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: internalHeater ? 'var(--warning)' : 'var(--text-muted)' }}>
              {internalHeater ? '● ' : '○ '}Sisäinen vastus
            </span>
            <span style={{ fontSize: 11, color: externalHeater ? 'var(--warning)' : 'var(--text-muted)' }}>
              {externalHeater ? '● ' : '○ '}Ulkoinen vastus
            </span>
            <span style={{ fontSize: 11, color: heaterEnabled ? 'var(--dhw-primary)' : 'var(--text-muted)', marginLeft: 'auto' }}>
              Säiliövastus: {heaterEnabled ? 'Käytössä' : 'Pois'}
            </span>
          </div>
        </div>

        {(error || success) && (
          <div className={`control-msg ${error ? 'error' : 'ok'}`}>
            {error ? `⚠ ${error}` : `✓ ${success}`}
          </div>
        )}
      </div>
    </div>
  );
}

