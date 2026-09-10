import type { HeishamonState } from '../types/heishamon';
import { numVal } from '../types/heishamon';
import { useCommand } from '../hooks/useCommand';
import { SegmentedControl, ToggleRow } from './SegmentedControl';

const OPERATING_MODES = [
  { value: 0, label: 'Heat' },
  { value: 1, label: 'Cool' },
  { value: 2, label: 'Auto' },
  { value: 3, label: 'DHW' },
  { value: 4, label: 'Heat+DHW' },
  { value: 5, label: 'Cool+DHW' },
  { value: 6, label: 'Auto+DHW' },
];

/* Powerful mode is sent as a slot index; each step is 30 minutes. */
const POWERFUL_TIMES = [
  { value: 0, label: 'Off' },
  { value: 1, label: '30m' },
  { value: 2, label: '60m' },
  { value: 3, label: '90m' },
];

interface HeatpumpCardProps {
  state: HeishamonState;
}

function CompressorRing({ freq, isOn }: { freq: number | null; isOn: boolean }) {
  const maxFreq = 120;
  const pct = freq ? Math.min((freq / maxFreq) * 100, 100) : 0;
  const circumference = 2 * Math.PI * 26;
  const strokeDash = (pct / 100) * circumference;

  return (
    <div style={{ position: 'relative', width: 72, height: 72, flexShrink: 0 }}>
      <svg width="72" height="72" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="36" cy="36" r="26" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
        {isOn && (
          <circle
            cx="36" cy="36" r="26"
            fill="none"
            stroke="#f59e0b"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${strokeDash} ${circumference}`}
            style={{ transition: 'stroke-dasharray 1s ease', filter: 'drop-shadow(0 0 4px #f59e0b)' }}
          />
        )}
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{
          fontSize: freq ? 15 : 12,
          fontWeight: 700,
          color: isOn ? 'var(--heat-primary)' : 'var(--text-muted)',
          lineHeight: 1,
        }}>
          {freq ?? '—'}
        </span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>Hz</span>
      </div>
    </div>
  );
}

function TempFlow({ inlet, outlet, target }: { inlet: number | null; outlet: number | null; target: number | null }) {
  const minTemp = 20, maxTemp = 70;
  const outletPct = outlet ? Math.max(0, Math.min(100, ((outlet - minTemp) / (maxTemp - minTemp)) * 100)) : 0;
  const targetPct = target ? Math.max(0, Math.min(100, ((target - minTemp) / (maxTemp - minTemp)) * 100)) : 0;

  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <div className="metric metric-sm">
          <span className="metric-label">Inlet</span>
          <span className="metric-value" style={{ color: 'var(--cool-primary)' }}>
            {inlet !== null ? inlet.toFixed(1) : '—'}
            <span className="metric-unit">°C</span>
          </span>
        </div>
        <div style={{ fontSize: 20, alignSelf: 'center', color: 'var(--text-muted)' }}>→</div>
        <div className="metric metric-sm" style={{ textAlign: 'right' }}>
          <span className="metric-label">Outlet</span>
          <span className="metric-value" style={{ color: 'var(--heat-primary)' }}>
            {outlet !== null ? outlet.toFixed(1) : '—'}
            <span className="metric-unit">°C</span>
          </span>
        </div>
      </div>
      <div className="temp-bar-container">
        <div className="temp-bar-fill" style={{ width: `${outletPct}%` }} />
        {target !== null && (
          <div className="temp-bar-target" style={{ left: `${targetPct}%` }} />
        )}
      </div>
      {target !== null && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 3 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Target: {target.toFixed(1)}°C
          </span>
        </div>
      )}
    </div>
  );
}

export function HeatpumpCard({ state }: HeatpumpCardProps) {
  const isOn = state['main/Heatpump_State']?.value === '1';
  const freq = numVal(state, 'main/Compressor_Freq');
  const inlet = numVal(state, 'main/Main_Inlet_Temp');
  const outlet = numVal(state, 'main/Main_Outlet_Temp');
  const target = numVal(state, 'main/Main_Target_Temp');
  const flow = numVal(state, 'main/Pump_Flow');
  const pumpSpeed = numVal(state, 'main/Pump_Speed');
  const highPress = numVal(state, 'main/High_Pressure');
  const lowPress = numVal(state, 'main/Low_Pressure');
  const defrost = state['main/Defrosting_State']?.value === '1';
  const opHours = numVal(state, 'main/Operations_Hours');
  const opCount = numVal(state, 'main/Operations_Counter');

  const operatingMode = numVal(state, 'main/Operating_Mode_State');
  const powerfulTime = numVal(state, 'main/Powerful_Mode_Time');
  const holidayOn = (numVal(state, 'main/Holiday_Mode_State') ?? 0) > 0;
  const internalHeater = state['main/Internal_Heater_State']?.value === '1';
  const externalHeater = state['main/External_Heater_State']?.value === '1';

  const { send, pending, error, success } = useCommand();

  return (
    <div className="card" style={{
      borderColor: isOn ? 'rgba(245,158,11,0.3)' : 'var(--border)',
      boxShadow: isOn ? 'var(--shadow-glow-heat)' : undefined,
    }}>
      <div className="card-header">
        <span className="card-icon">⚙️</span>
        <span className="card-title">Heat Pump · WH-MXC12J9E8 T-CAP J</span>
        {defrost && (
          <span className="badge" style={{ marginLeft: 'auto', background: 'rgba(34,211,238,0.15)', color: 'var(--cool-primary)', border: '1px solid rgba(34,211,238,0.3)', fontSize: 10 }}>
            ❄️ Defrost
          </span>
        )}
        <button
          className={`btn btn-sm ${isOn ? 'btn-primary' : 'btn-ghost'}`}
          style={{ marginLeft: defrost ? 4 : 'auto' }}
          onClick={() => send('commands/SetHeatpump', isOn ? 0 : 1, isOn ? 'Heat pump off' : 'Heat pump on')}
          disabled={pending}
          id="btn-heatpump-power"
          title="Turn the heat pump on or off"
        >
          {pending ? '…' : isOn ? '● On' : '○ Off'}
        </button>
      </div>
      <div className="card-body">
        {/* Compressor + Temps */}
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 20 }}>
          <CompressorRing freq={freq} isOn={isOn} />
          <TempFlow inlet={inlet} outlet={outlet} target={target} />
        </div>

        <div className="divider" />

        {/* Secondary metrics */}
        <div className="metrics-grid metrics-grid-3" style={{ marginTop: 16 }}>
          <div className="metric metric-sm">
            <span className="metric-label">Pump Flow</span>
            <span className="metric-value">
              {flow !== null ? flow.toFixed(1) : '—'}
              <span className="metric-unit">L/m</span>
            </span>
          </div>
          <div className="metric metric-sm">
            <span className="metric-label">Pump Speed</span>
            <span className="metric-value">
              {pumpSpeed !== null ? Math.round(pumpSpeed) : '—'}
              <span className="metric-unit">rpm</span>
            </span>
          </div>
          <div className="metric metric-sm">
            <span className="metric-label">High Press</span>
            <span className="metric-value">
              {highPress !== null ? highPress.toFixed(2) : '—'}
              <span className="metric-unit">kg</span>
            </span>
          </div>
        </div>

        <div className="metrics-grid metrics-grid-3" style={{ marginTop: 12 }}>
          <div className="metric metric-sm">
            <span className="metric-label">Low Press</span>
            <span className="metric-value">
              {lowPress !== null ? lowPress.toFixed(2) : '—'}
              <span className="metric-unit">kg</span>
            </span>
          </div>
          <div className="metric metric-sm">
            <span className="metric-label">Runtime</span>
            <span className="metric-value">
              {opHours !== null ? Math.round(opHours) : '—'}
              <span className="metric-unit">h</span>
            </span>
          </div>
          <div className="metric metric-sm">
            <span className="metric-label">Starts</span>
            <span className="metric-value">
              {opCount !== null ? Math.round(opCount) : '—'}
            </span>
          </div>
        </div>

        <div className="divider" />

        {/* Controls */}
        <div className="section-label" style={{ marginBottom: 10 }}>Controls</div>

        <SegmentedControl
          label="🔄 Operating mode"
          options={OPERATING_MODES}
          value={operatingMode === null ? null : Math.round(operatingMode)}
          onSelect={(v) => send('commands/SetOperationMode', v,
            `Mode: ${OPERATING_MODES.find((m) => m.value === v)?.label ?? v}`)}
          pending={pending}
          idPrefix="btn-mode"
        />

        <SegmentedControl
          label="⚡ Powerful mode"
          options={POWERFUL_TIMES}
          value={powerfulTime === null ? null : Math.round(powerfulTime)}
          onSelect={(v) => send('commands/SetPowerfulMode', v,
            v === 0 ? 'Powerful off' : `Powerful for ${v * 30} min`)}
          pending={pending}
          idPrefix="btn-powerful"
        />

        <ToggleRow
          label="🏖️ Holiday mode"
          description="Away setting — lowers demand"
          on={holidayOn}
          onToggle={() => send('commands/SetHolidayMode', holidayOn ? 0 : 1,
            holidayOn ? 'Holiday off' : 'Holiday on')}
          pending={pending}
          idPrefix="btn-holiday"
        />

        {(error || success) && (
          <div className={`control-msg ${error ? 'error' : 'ok'}`}>
            {error ? `⚠ ${error}` : `✓ ${success}`}
          </div>
        )}

        {/* Backup heater activity */}
        <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
          <span style={{ fontSize: 11, color: internalHeater ? 'var(--warning)' : 'var(--text-muted)' }}>
            {internalHeater ? '● ' : '○ '}Internal heater
          </span>
          <span style={{ fontSize: 11, color: externalHeater ? 'var(--warning)' : 'var(--text-muted)' }}>
            {externalHeater ? '● ' : '○ '}External heater
          </span>
        </div>
      </div>
    </div>
  );
}
