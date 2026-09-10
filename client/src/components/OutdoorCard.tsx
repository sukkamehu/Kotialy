import type { HeishamonState } from '../types/heishamon';
import { numVal } from '../types/heishamon';
import { useCommand } from '../hooks/useCommand';
import { SegmentedControl } from './SegmentedControl';

/* Quiet mode throttles the outdoor fan/compressor, so it lives with the unit. */
const QUIET_LEVELS = [
  { value: 0, label: 'Off' },
  { value: 1, label: 'L1' },
  { value: 2, label: 'L2' },
  { value: 3, label: 'L3' },
];

interface OutdoorCardProps {
  state: HeishamonState;
}

function ThermometerSvg({ temp }: { temp: number | null }) {
  const minT = -30, maxT = 40;
  const pct = temp !== null
    ? Math.max(0, Math.min(100, ((temp - minT) / (maxT - minT)) * 100))
    : 0;
  const height = 56;
  const fillH = (pct / 100) * height;
  const color = temp === null ? '#555'
    : temp < 0 ? '#38bdf8'
    : temp < 10 ? '#22d3ee'
    : temp < 20 ? '#34d399'
    : temp < 30 ? '#f59e0b'
    : '#f87171';

  return (
    <svg width="28" height="90" viewBox="0 0 28 90" fill="none">
      {/* Stem */}
      <rect x="10" y="4" width="8" height="64" rx="4" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5"/>
      {/* Fill */}
      <clipPath id="therm-clip"><rect x="11.5" y="5.5" width="5" height="61" rx="2.5"/></clipPath>
      <g clipPath="url(#therm-clip)">
        <rect
          x="11.5" y={5.5 + 61 * (1 - fillH / height)}
          width="5" height={fillH}
          fill={color}
          opacity="0.8"
          style={{ transition: 'all 1s ease' }}
        />
      </g>
      {/* Bulb */}
      <circle cx="14" cy="76" r="10" fill={color} opacity="0.25" style={{ filter: `drop-shadow(0 0 6px ${color})` }}/>
      <circle cx="14" cy="76" r="7" fill={color} opacity="0.6"/>
      {/* Tick marks */}
      {[0, 25, 50, 75, 100].map((p) => (
        <line key={p} x1="10" y1={5.5 + 61 * (1 - p / 100)} x2="7" y2={5.5 + 61 * (1 - p / 100)}
          stroke="rgba(255,255,255,0.2)" strokeWidth="1"/>
      ))}
    </svg>
  );
}

export function OutdoorCard({ state }: OutdoorCardProps) {
  const outsideTemp = numVal(state, 'main/Outside_Temp');
  const outsidePipe = numVal(state, 'main/Outside_Pipe_Temp');
  const discharge = numVal(state, 'main/Discharge_Temp');
  const insidePipe = numVal(state, 'main/Inside_Pipe_Temp');
  const evaOutlet = numVal(state, 'main/Eva_Outlet_Temp');
  const ipmTemp = numVal(state, 'main/Ipm_Temp');
  const fan1 = numVal(state, 'main/Fan1_Motor_Speed');
  const fan2 = numVal(state, 'main/Fan2_Motor_Speed');
  const defrosting = state['main/Defrosting_State']?.value === '1';
  const quietLevel = numVal(state, 'main/Quiet_Mode_Level');

  const { send, pending, error, success } = useCommand();

  const tempColor = outsideTemp === null ? 'var(--text-muted)'
    : outsideTemp < 0 ? '#38bdf8'
    : outsideTemp < 10 ? '#22d3ee'
    : outsideTemp < 20 ? '#34d399'
    : 'var(--heat-primary)';

  return (
    <div className="card" style={{
      borderColor: defrosting ? 'rgba(34,211,238,0.3)' : 'var(--border)',
      boxShadow: defrosting ? 'var(--shadow-glow-cool)' : undefined,
    }}>
      <div className="card-header">
        <span className="card-icon">🌤</span>
        <span className="card-title">Outdoor Unit</span>
        {defrosting && (
          <div className="badge" style={{ marginLeft: 'auto', background: 'rgba(34,211,238,0.15)', color: 'var(--cool-primary)', border: '1px solid rgba(34,211,238,0.3)' }}>
            ❄️ Defrosting
          </div>
        )}
      </div>
      <div className="card-body">
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 16 }}>
          <ThermometerSvg temp={outsideTemp} />
          <div className="metric">
            <span className="metric-label">Outdoor Temperature</span>
            <span className="metric-value" style={{ fontSize: 34, color: tempColor }}>
              {outsideTemp !== null ? outsideTemp.toFixed(1) : '—'}
              <span className="metric-unit" style={{ fontSize: 16 }}>°C</span>
            </span>
            {outsidePipe !== null && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                Outdoor pipe: {outsidePipe.toFixed(1)}°C
              </span>
            )}
          </div>
        </div>

        <div className="divider" />

        <div className="metrics-grid metrics-grid-3" style={{ marginTop: 12 }}>
          <div className="metric metric-sm">
            <span className="metric-label">Discharge</span>
            <span className="metric-value">
              {discharge !== null ? discharge.toFixed(1) : '—'}
              <span className="metric-unit">°C</span>
            </span>
          </div>
          <div className="metric metric-sm">
            <span className="metric-label">Inside Pipe</span>
            <span className="metric-value">
              {insidePipe !== null ? insidePipe.toFixed(1) : '—'}
              <span className="metric-unit">°C</span>
            </span>
          </div>
          <div className="metric metric-sm">
            <span className="metric-label">Eva Outlet</span>
            <span className="metric-value">
              {evaOutlet !== null ? evaOutlet.toFixed(1) : '—'}
              <span className="metric-unit">°C</span>
            </span>
          </div>
        </div>

        <div className="metrics-grid metrics-grid-3" style={{ marginTop: 12 }}>
          <div className="metric metric-sm">
            <span className="metric-label">IPM Temp</span>
            <span className="metric-value">
              {ipmTemp !== null ? ipmTemp.toFixed(1) : '—'}
              <span className="metric-unit">°C</span>
            </span>
          </div>
          <div className="metric metric-sm">
            <span className="metric-label">Fan 1</span>
            <span className="metric-value">
              {fan1 !== null ? Math.round(fan1) : '—'}
              <span className="metric-unit">rpm</span>
            </span>
          </div>
          <div className="metric metric-sm">
            <span className="metric-label">Fan 2</span>
            <span className="metric-value">
              {fan2 !== null ? Math.round(fan2) : '—'}
              <span className="metric-unit">rpm</span>
            </span>
          </div>
        </div>

        <div className="divider" />

        <SegmentedControl
          label="🤫 Quiet mode"
          options={QUIET_LEVELS}
          value={quietLevel === null ? null : Math.round(quietLevel)}
          onSelect={(v) => send('commands/SetQuietMode', v,
            v === 0 ? 'Quiet mode off' : `Quiet level ${v}`)}
          pending={pending}
          idPrefix="btn-quiet"
          hint="higher level = quieter, lower output"
        />

        {(error || success) && (
          <div className={`control-msg ${error ? 'error' : 'ok'}`}>
            {error ? `⚠ ${error}` : `✓ ${success}`}
          </div>
        )}
      </div>
    </div>
  );
}
