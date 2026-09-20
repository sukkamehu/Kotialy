import type { HeishamonState } from '../types/heishamon';
import { numVal } from '../types/heishamon';
import { useCommand } from '../hooks/useCommand';
import { useApc } from '../hooks/useApc';
import { SegmentedControl } from './SegmentedControl';
import { SetpointControl } from './SetpointControl';
import type { TrendTopicTarget } from './VariableTrendModal';
import type { DefrostCableStatus } from '../types/apc';

/* Quiet mode throttles the outdoor fan/compressor, so it lives with the unit. */
const QUIET_LEVELS = [
  { value: 0, label: 'Pois' },
  { value: 1, label: 'Taso 1' },
  { value: 2, label: 'Taso 2' },
  { value: 3, label: 'Taso 3' },
];

interface OutdoorCardProps {
  state: HeishamonState;
  onOpenTrend?: (target: TrendTopicTarget) => void;
  onOpenOutdoorWeather?: () => void;
  readOnly?: boolean;
}

function ThermometerSvg({
  temp,
  onOpenTrend,
}: {
  temp: number | null;
  onOpenTrend?: (target: TrendTopicTarget) => void;
}) {
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
    <div
      className="gauge-clickable"
      title="Klikkaa nähdäksesi ulkolämpötilan trendi"
      onClick={() =>
        onOpenTrend?.({
          topic: 'main/Outside_Temp',
          label: 'Ulkoilman lämpötila',
          unit: '°C',
          color: '#22d3ee',
          currentValue: temp,
        })
      }
    >
      <svg
        width="28"
        height="90"
        viewBox="0 0 28 90"
        fill="none"
      >
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
    </div>
  );
}

export function OutdoorCard({ state, onOpenTrend, onOpenOutdoorWeather, readOnly = false }: OutdoorCardProps) {
  const outsideTemp = numVal(state, 'main/Outside_Temp');
  const outsidePipe = numVal(state, 'main/Outside_Pipe_Temp');
  const discharge = numVal(state, 'main/Discharge_Temp');
  const insidePipe = numVal(state, 'main/Inside_Pipe_Temp');
  const evaOutlet = numVal(state, 'main/Eva_Outlet_Temp');
  const ipmTemp = numVal(state, 'main/Ipm_Temp');
  const fan1 = numVal(state, 'main/Fan1_Motor_Speed');
  const fan2 = numVal(state, 'main/Fan2_Motor_Speed');
  const defrosting = state['main/Defrosting_State']?.value === '1';
  const baseHeater = state['main/Base_Pan_Heater']?.value === '1' ||
    state['main/Outdoor_Heater_State']?.value === '1' ||
    state['main/Internal_Heater_State']?.value === '1';
  const quietLevel = numVal(state, 'main/Quiet_Mode_Level');
  const heatingOffTemp = numVal(state, 'main/Heating_Off_Outdoor_Temp');

  const { send, pending, error, success } = useCommand();
  const { status: apcStatus, setDefrostCableOverride } = useApc();

  // Defrost cable live telemetry & APC status
  const defrostCableDevice = apcStatus?.devices?.find((d) => d.driver === 'defrost_cable') as DefrostCableStatus | undefined;
  const rawDefrostStat = state['sulanapito/stat/POWER']?.value || state['stat/sulanapito/POWER']?.value || defrostCableDevice?.currentState;
  const isDefrostCableRunning = rawDefrostStat === 'ON' || rawDefrostStat === '1';
  const defrostCableOverrideActive = defrostCableDevice?.overrideActive ?? (apcStatus?.settings?.defrost_cable_override_until ? apcStatus.settings.defrost_cable_override_until > Date.now() : false);
  const defrostCableOverrideState = defrostCableDevice?.overrideState ?? apcStatus?.settings?.defrost_cable_override_state;
  const defrostCableReason = defrostCableDevice?.reason || (isDefrostCableRunning ? 'Sulanapitokaapeli lämmittää' : 'Sulanapito lepotilassa');

  const tempColor = outsideTemp === null ? 'var(--text-muted)'
    : outsideTemp < 0 ? 'var(--cool-primary)'
    : outsideTemp < 15 ? 'var(--cool-secondary)'
    : 'var(--heat-primary)';

  return (
    <div className="card" style={{
      borderColor: defrosting ? 'rgba(34,211,238,0.3)' : baseHeater ? 'rgba(245,158,11,0.3)' : 'var(--border)',
      boxShadow: defrosting ? 'var(--shadow-glow-cool)' : baseHeater ? '0 0 20px rgba(245,158,11,0.08)' : undefined,
    }}>
      <div className="card-header">
        <span className="card-icon">🌤</span>
        <span className="card-title">Ulkoyksikkö</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          {onOpenOutdoorWeather && (
            <button
              className="badge"
              onClick={onOpenOutdoorWeather}
              style={{
                background: 'rgba(34,211,238,0.1)',
                color: '#22d3ee',
                border: '1px solid rgba(34,211,238,0.3)',
                fontSize: 10,
                cursor: 'pointer',
                padding: '2px 8px',
                transition: 'all 0.15s ease',
              }}
              title="Avaa ulkolämpötilan historia ja sääennuste"
            >
              📊 Sää & Historia
            </button>
          )}
          {baseHeater && (
            <div className="badge" style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--heat-primary)', border: '1px solid rgba(245,158,11,0.3)', fontSize: 10 }}>
              🔥 Pohjavastus
            </div>
          )}
          {defrosting && (
            <div className="badge" style={{ background: 'rgba(34,211,238,0.15)', color: 'var(--cool-primary)', border: '1px solid rgba(34,211,238,0.3)', fontSize: 10 }}>
              ❄️ Sulatus
            </div>
          )}
        </div>
      </div>
      <div className="card-body">
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 16 }}>
          <ThermometerSvg temp={outsideTemp} onOpenTrend={onOpenTrend} />
          <div
            className="metric metric-clickable"
            title="Klikkaa nähdäksesi ulkolämpötilan trendi"
            onClick={() =>
              onOpenTrend?.({
                topic: 'main/Outside_Temp',
                label: 'Ulkoilman lämpötila',
                unit: '°C',
                color: '#22d3ee',
                currentValue: outsideTemp,
              })
            }
          >
            <span className="metric-label">Ulkolämpötila ↗</span>
            <span className="metric-value" style={{ fontSize: 34, color: tempColor }}>
              {outsideTemp !== null ? outsideTemp.toFixed(1) : '—'}
              <span className="metric-unit" style={{ fontSize: 16 }}>°C</span>
            </span>
            {outsidePipe !== null && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                Ulkoputki: {outsidePipe.toFixed(1)} °C
              </span>
            )}
          </div>
        </div>

        <div className="divider" />

        <div className="metrics-grid metrics-grid-3" style={{ marginTop: 12 }}>
          <div
            className="metric metric-sm metric-clickable"
            title="Klikkaa nähdäksesi kuumakaasun trendi"
            onClick={() =>
              onOpenTrend?.({
                topic: 'main/Discharge_Temp',
                label: 'Kuumakaasun lämpötila',
                unit: '°C',
                color: '#f59e0b',
                currentValue: discharge,
              })
            }
          >
            <span className="metric-label">Kuumakaasu ↗</span>
            <span className="metric-value">
              {discharge !== null ? discharge.toFixed(1) : '—'}
              <span className="metric-unit">°C</span>
            </span>
          </div>
          <div
            className="metric metric-sm metric-clickable"
            title="Klikkaa nähdäksesi sisäputken trendi"
            onClick={() =>
              onOpenTrend?.({
                topic: 'main/Inside_Pipe_Temp',
                label: 'Sisäyksikön putkilämpötila',
                unit: '°C',
                color: '#38bdf8',
                currentValue: insidePipe,
              })
            }
          >
            <span className="metric-label">Sisäputki ↗</span>
            <span className="metric-value">
              {insidePipe !== null ? insidePipe.toFixed(1) : '—'}
              <span className="metric-unit">°C</span>
            </span>
          </div>
          <div
            className="metric metric-sm metric-clickable"
            title="Klikkaa nähdäksesi höyrystimen trendi"
            onClick={() =>
              onOpenTrend?.({
                topic: 'main/Eva_Outlet_Temp',
                label: 'Höyrystimen poistolämpötila',
                unit: '°C',
                color: '#22d3ee',
                currentValue: evaOutlet,
              })
            }
          >
            <span className="metric-label">Höyrystin ↗</span>
            <span className="metric-value">
              {evaOutlet !== null ? evaOutlet.toFixed(1) : '—'}
              <span className="metric-unit">°C</span>
            </span>
          </div>
        </div>

        <div className="metrics-grid metrics-grid-3" style={{ marginTop: 12 }}>
          <div className="metric metric-sm">
            <span className="metric-label">IPM-lämpö</span>
            <span className="metric-value">
              {ipmTemp !== null ? ipmTemp.toFixed(1) : '—'}
              <span className="metric-unit">°C</span>
            </span>
          </div>
          <div className="metric metric-sm">
            <span className="metric-label">Puhallin 1</span>
            <span className="metric-value">
              {fan1 !== null ? Math.round(fan1) : '—'}
              <span className="metric-unit">rpm</span>
            </span>
          </div>
          <div className="metric metric-sm">
            <span className="metric-label">Puhallin 2</span>
            <span className="metric-value">
              {fan2 !== null ? Math.round(fan2) : '—'}
              <span className="metric-unit">rpm</span>
            </span>
          </div>
        </div>

        <div className="divider" />

        {/* VILP Sulanapitokaapeli (Sonoff) & Pohjavastus -ohjausosio */}
        <div
          style={{
            background: isDefrostCableRunning ? 'rgba(245, 158, 11, 0.09)' : 'rgba(255, 255, 255, 0.02)',
            border: isDefrostCableRunning ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: 10,
            padding: '12px 14px',
            marginBottom: 14,
            transition: 'all 0.3s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: isDefrostCableRunning ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                border: isDefrostCableRunning ? '1.5px solid rgba(245, 158, 11, 0.4)' : '1.5px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: isDefrostCableRunning ? '0 0 12px rgba(245, 158, 11, 0.3)' : 'none',
                flexShrink: 0,
              }}>
                <span style={{ fontSize: 18, filter: isDefrostCableRunning ? 'drop-shadow(0 0 4px #f59e0b)' : 'grayscale(1)', transition: 'all 0.3s' }}>
                  {isDefrostCableRunning ? '🔥' : '♨️'}
                </span>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span>Sulanapitokaapeli (Sonoff)</span>
                  <span className="badge" style={{
                    fontSize: 9,
                    padding: '1px 6px',
                    background: 'rgba(245, 158, 11, 0.15)',
                    color: '#f59e0b',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                  }}>
                    Sulatusputki
                  </span>
                  {defrostCableOverrideActive && (
                    <span className="badge" style={{
                      fontSize: 9,
                      padding: '1px 6px',
                      background: 'rgba(239, 68, 68, 0.18)',
                      color: '#f87171',
                      border: '1px solid rgba(239, 68, 68, 0.35)',
                    }}>
                      ⚡ Pakotettu {defrostCableOverrideState || (isDefrostCableRunning ? 'ON' : 'OFF')}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {defrostCableReason}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: isDefrostCableRunning ? '#f59e0b' : 'var(--text-muted, #64748b)',
                  boxShadow: isDefrostCableRunning ? '0 0 8px #f59e0b' : 'none',
                }}
              />
              <span style={{
                fontSize: 12,
                fontWeight: 600,
                color: isDefrostCableRunning ? '#f59e0b' : 'var(--text-muted, #64748b)',
              }}>
                {isDefrostCableRunning ? 'Lämmittää' : 'Lepotilassa'}
              </span>
            </div>
          </div>

          {!readOnly && (
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setDefrostCableOverride('ON', 1)}
                style={{
                  flex: 1,
                  minWidth: 80,
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: isDefrostCableRunning && defrostCableOverrideActive ? '1px solid #f59e0b' : '1px solid rgba(255, 255, 255, 0.1)',
                  background: isDefrostCableRunning && defrostCableOverrideActive ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  color: isDefrostCableRunning && defrostCableOverrideActive ? '#f59e0b' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                🔥 Pakota 1h
              </button>

              <button
                type="button"
                onClick={() => setDefrostCableOverride('ON', 2)}
                style={{
                  flex: 1,
                  minWidth: 80,
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                🔥 Pakota 2h
              </button>

              <button
                type="button"
                onClick={() => setDefrostCableOverride('OFF', 1)}
                style={{
                  flex: 1,
                  minWidth: 80,
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                ⏸ Pakota Pois
              </button>

              {defrostCableOverrideActive && (
                <button
                  type="button"
                  onClick={() => setDefrostCableOverride(null, 0)}
                  style={{
                    flex: '1 1 100%',
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    background: 'rgba(34, 197, 94, 0.12)',
                    color: '#4ade80',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  ✓ Palauta Automaatille
                </button>
              )}
            </div>
          )}
        </div>

        {/* Pohjavastus -tilarivi */}
        {baseHeater && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            background: 'rgba(245,158,11,0.08)',
            border: '1px solid rgba(245,158,11,0.25)',
            borderRadius: 8,
            marginBottom: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>🔥</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--heat-primary)' }}>
                  Pohjavastus (Base Pan Heater)
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  VILP-sisäinen sulanapitovastus päällä
                </div>
              </div>
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--heat-primary)',
            }}>
              <div style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--heat-primary)',
                boxShadow: '0 0 8px var(--heat-primary)'
              }} />
              PÄÄLLÄ
            </div>
          </div>
        )}

        <SegmentedControl
          label="🤫 Hiljainen tila"
          options={QUIET_LEVELS}
          value={quietLevel === null ? null : Math.round(quietLevel)}
          onSelect={(v) => send('commands/SetQuietMode', v,
            v === 0 ? 'Hiljainen tila pois' : `Hiljainen tila: Taso ${v}`)}
          pending={pending}
          disabled={readOnly}
          idPrefix="btn-quiet"
          hint="korkeampi taso = hiljaisempi ääni, alempi maksimiteho"
        />

        <div className="divider" style={{ margin: '14px 0 10px' }} />

        {/* Heating cutoff outdoor temperature slider */}
        <SetpointControl
          label="Lämmityksen katkaisuraja (Ulkoilma)"
          value={heatingOffTemp}
          min={5}
          max={25}
          step={1}
          unit="°C"
          accentColor="var(--cool-primary)"
          hint="Pysäyttää tilojen lämmityksen tämän ulkolämmön yläpuolella (estää pätkäkäyntiä)"
          disabled={readOnly}
          pending={pending}
          onCommit={(v) =>
            send('commands/SetHeatingOffOutdoorTemp', v, `Lämmityksen ulkokatkaisurajaksi asetettu ${v} °C`)
          }
          idPrefix="heating-off-temp"
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

