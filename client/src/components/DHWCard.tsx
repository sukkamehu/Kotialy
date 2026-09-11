import type { HeishamonState } from '../types/heishamon';
import { numVal } from '../types/heishamon';
import { useCommand } from '../hooks/useCommand';
import { SetpointControl } from './SetpointControl';

interface DHWCardProps {
  state: HeishamonState;
}

function TankSvg({ temp, target, maxTemp = 65, minTemp = 20 }: {
  temp: number | null; target: number | null; maxTemp?: number; minTemp?: number;
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
    <svg width="56" height="90" viewBox="0 0 56 90" fill="none" style={{ flexShrink: 0 }}>
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
  );
}

export function DHWCard({ state }: DHWCardProps) {
  const temp = numVal(state, 'main/DHW_Temp');
  const target = numVal(state, 'main/DHW_Target_Temp');
  const forceDHW = state['main/Force_DHW_State']?.value === '1';
  const heaterEnabled = state['main/DHW_Heater_State']?.value === '1';
  const forceHeater = state['main/Force_Heater_State']?.value === '1';

  // Power – prefer XTOP, fallback to TOP
  const dhwProdXtop = numVal(state, 'extra/DHW_Power_Production');
  const dhwConsXtop = numVal(state, 'extra/DHW_Power_Consumption');
  const dhwProd = dhwProdXtop ?? numVal(state, 'main/DHW_Power_Production');
  const dhwCons = dhwConsXtop ?? numVal(state, 'main/DHW_Power_Consumption');

  const cop = dhwCons && dhwCons > 0 && dhwProd ? (dhwProd / dhwCons).toFixed(2) : null;

  const { send, pending, error, success } = useCommand();

  function toggleForceDHW() {
    send('commands/SetForceDHW', forceDHW ? 0 : 1,
      forceDHW ? 'Tehostus lopetettu' : 'Tehostus aloitettu');
  }

  function toggleForceHeater() {
    send('commands/SetForceHeater', forceHeater ? 0 : 1,
      forceHeater ? 'Lisävastus pois päältä' : 'Lisävastus pakotettu päälle');
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
          <TankSvg temp={temp} target={target} />
          <div style={{ flex: 1 }}>
            <div className="metric" style={{ marginBottom: 8 }}>
              <span className="metric-label">Lämpötila</span>
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
            onCommit={setDHWTarget}
            idPrefix="dhw-target"
            hint="legionellakuumennus vaatii ≥60 °C"
          />
        </div>

        <div className="divider" style={{ marginTop: 16 }} />

        {/* Power */}
        <div className="metrics-grid metrics-grid-3" style={{ marginTop: 12 }}>
          <div className="metric metric-sm">
            <span className="metric-label">Tuotto</span>
            <span className="metric-value" style={{ color: 'var(--dhw-primary)' }}>
              {dhwProd !== null ? Math.round(dhwProd) : '—'}
              <span className="metric-unit">W</span>
            </span>
          </div>
          <div className="metric metric-sm">
            <span className="metric-label">Kulutus</span>
            <span className="metric-value">
              {dhwCons !== null ? Math.round(dhwCons) : '—'}
              <span className="metric-unit">W</span>
            </span>
          </div>
          <div className="metric metric-sm">
            <span className="metric-label">COP</span>
            <span className="metric-value" style={{ color: 'var(--dhw-primary)' }}>
              {cop ?? '—'}
            </span>
          </div>
        </div>

        <div className="divider" />

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Lisävastus {heaterEnabled ? 'käytössä' : 'pois'}
            </span>
            <button
              className={`btn btn-sm ${forceHeater ? 'btn-danger' : 'btn-ghost'}`}
              onClick={toggleForceHeater}
              disabled={pending}
              id="btn-force-heater"
              title="Pakota sähkövastus päälle"
            >
              {forceHeater ? '🔥 Pakotettu' : 'Pakota vastus'}
            </button>
          </div>
          <button
            className={`btn btn-sm ${forceDHW ? 'btn-danger' : 'btn-ghost'}`}
            onClick={toggleForceDHW}
            disabled={pending}
            id="btn-force-dhw"
          >
            {pending ? '...' : forceDHW ? '⏹ Lopeta tehostus' : '⚡ Pakota KV'}
          </button>
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

