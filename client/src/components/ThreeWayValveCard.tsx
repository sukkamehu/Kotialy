import type { HeishamonState } from '../types/heishamon';
import { numVal } from '../types/heishamon';
import { useCommand } from '../hooks/useCommand';
import type { TrendTopicTarget } from './VariableTrendModal';

interface ThreeWayValveCardProps {
  state: HeishamonState;
  onOpenTrend?: (target: TrendTopicTarget) => void;
  readOnly?: boolean;
}

export function ThreeWayValveCard({ state, onOpenTrend, readOnly = false }: ThreeWayValveCardProps) {
  const valveState = state['main/ThreeWay_Valve_State'];
  const val = valveState?.value;
  const forceDHW = state['main/Force_DHW_State']?.value === '1';
  const pumpFlow = numVal(state, 'main/Pump_Flow');
  const isRoom = val === '0';
  const isDHW = val === '1';
  // Only 0/1 are meaningful; anything else is an unknown state, not "heating".
  const hasData = isRoom || isDHW;
  const isUnknown = val !== undefined && !hasData;

  const { send, pending, error, success } = useCommand();

  const currentModeRaw = state['main/Operating_Mode_State']?.value;
  const isHeatingOnlyMode = currentModeRaw === '0';
  const isDhwOnlyMode = currentModeRaw === '3';
  const isAutoMode = currentModeRaw === '4' && !forceDHW;
  const isDhwForced = forceDHW || isDhwOnlyMode;

  async function setValveTarget(target: 'auto' | 'heating' | 'dhw') {
    if (readOnly || pending) return;
    if (target === 'dhw') {
      await send('commands/SetForceDHW', 0);
      await send(
        'commands/SetOperationMode',
        3,
        'Käyttötila: Vain käyttövesi (3-tieventtiili käännetty LKV-varaajalle)'
      );
    } else if (target === 'heating') {
      await send('commands/SetForceDHW', 0);
      await send(
        'commands/SetOperationMode',
        0,
        'Käyttötila: Vain lämmitys (3-tieventtiili käännetty puskurivaraajalle)'
      );
    } else {
      await send('commands/SetForceDHW', 0);
      await send(
        'commands/SetOperationMode',
        4,
        'Käyttötila: Lämmitys + KV (3-tieventtiili automaatilla)'
      );
    }
  }

  return (
    <div className="card" style={{
      borderColor: isDHW ? 'rgba(16,185,129,0.25)' : isRoom ? 'rgba(167,139,250,0.2)' : 'var(--border)',
    }}>
      <div className="card-header">
        <span className="card-icon">🔀</span>
        <span className="card-title">3-Tieventtiili</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          {forceDHW && (
            <div className="badge badge-dhw" style={{ fontSize: 10, padding: '2px 8px' }}>
              ⚡ Pakotettu KV
            </div>
          )}
          {!hasData ? (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {isUnknown ? `Tila ${val}` : 'Ei tietoa'}
            </span>
          ) : isDHW ? (
            <div className="badge badge-dhw">Käyttövesi (1)</div>
          ) : (
            <div className="badge" style={{ background: 'var(--buffer-glow)', color: 'var(--buffer-primary)', border: '1px solid rgba(167,139,250,0.3)' }}>
              Lämmitys (0)
            </div>
          )}
        </div>
      </div>
      <div className="card-body">
        {/* Valve diagram */}
        <div
          className="gauge-clickable"
          title="Klikkaa nähdäksesi 3-tieventtiilin asennon trendi"
          onClick={() =>
            onOpenTrend?.({
              topic: 'main/ThreeWay_Valve_State',
              label: '3-tieventtiilin asento (0=Lämpö, 1=KV)',
              unit: '',
              color: isDHW ? 'var(--dhw-primary)' : 'var(--buffer-primary)',
              currentValue: val === '1' ? 'Käyttövesi (1)' : 'Lämmitys (0)',
            })
          }
          style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 16px' }}
        >
          <svg width="180" height="100" viewBox="0 0 180 100" fill="none">
            {/* Heating circuit (Left) - Buffer tank */}
            <line
              x1="62" y1="36" x2="10" y2="36"
              stroke={isRoom ? 'var(--buffer-primary)' : 'rgba(255,255,255,0.15)'}
              strokeWidth={isRoom ? 8 : 4}
              strokeLinecap="round"
              style={{ transition: 'all 0.5s', filter: isRoom ? 'drop-shadow(0 0 6px var(--buffer-primary))' : 'none' }}
            />
            <text x="8" y="22" fill={isRoom ? 'var(--buffer-primary)' : 'rgba(255,255,255,0.4)'} fontSize="9" fontWeight="600" fontFamily="Inter,sans-serif">
              Lämmitys (Puskuri)
            </text>
            {isRoom && (
              <text x="32" y="32" fill="#fff" fontSize="10" fontWeight="700" fontFamily="Inter,sans-serif">◄</text>
            )}

            {/* DHW circuit (Right) - Domestic Hot Water */}
            <line
              x1="118" y1="36" x2="170" y2="36"
              stroke={isDHW ? 'var(--dhw-primary)' : 'rgba(255,255,255,0.15)'}
              strokeWidth={isDHW ? 8 : 4}
              strokeLinecap="round"
              style={{ transition: 'all 0.5s', filter: isDHW ? 'drop-shadow(0 0 6px var(--dhw-primary))' : 'none' }}
            />
            <text x="172" y="22" fill={isDHW ? 'var(--dhw-primary)' : 'rgba(255,255,255,0.4)'} fontSize="9" fontWeight="600" textAnchor="end" fontFamily="Inter,sans-serif">
              Käyttövesi (LKV)
            </text>
            {isDHW && (
              <text x="140" y="32" fill="#fff" fontSize="10" fontWeight="700" fontFamily="Inter,sans-serif">►</text>
            )}

            {/* Heat pump supply side (Bottom) - VILP Inflow */}
            <line
              x1="90" y1="56" x2="90" y2="82"
              stroke={hasData ? '#f59e0b' : 'rgba(255,255,255,0.2)'}
              strokeWidth="8"
              strokeLinecap="round"
              style={{ transition: 'all 0.5s', filter: hasData ? 'drop-shadow(0 0 6px rgba(245,158,11,0.35))' : 'none' }}
            />
            <text x="90" y="96" fill={hasData ? '#f59e0b' : 'rgba(255,255,255,0.4)'} fontSize="9" fontWeight="600" textAnchor="middle" fontFamily="Inter,sans-serif">
              ▲ VILP (Tulo)
            </text>

            {/* Valve body */}
            <circle cx="90" cy="36" r="20" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />

            {/* Internal active flow path indicator */}
            {isRoom && (
              <path
                d="M 90 52 Q 90 36 68 36"
                stroke="var(--buffer-primary)"
                strokeWidth="6"
                fill="none"
                strokeLinecap="round"
                style={{ filter: 'drop-shadow(0 0 4px var(--buffer-primary))' }}
              />
            )}
            {isDHW && (
              <path
                d="M 90 52 Q 90 36 112 36"
                stroke="var(--dhw-primary)"
                strokeWidth="6"
                fill="none"
                strokeLinecap="round"
                style={{ filter: 'drop-shadow(0 0 4px var(--dhw-primary))' }}
              />
            )}

            {/* Valve center hub */}
            <circle
              cx="90"
              cy="36"
              r="6"
              fill={isDHW ? 'var(--dhw-primary)' : isRoom ? 'var(--buffer-primary)' : 'rgba(255,255,255,0.3)'}
              style={{ transition: 'fill 0.5s' }}
            />
          </svg>
        </div>

        <div
          className="metric-clickable"
          style={{ textAlign: 'center' }}
          title="Klikkaa nähdäksesi 3-tieventtiilin asennon trendi"
          onClick={() =>
            onOpenTrend?.({
              topic: 'main/ThreeWay_Valve_State',
              label: '3-tieventtiilin asento (0=Lämpö, 1=KV)',
              unit: '',
              color: isDHW ? 'var(--dhw-primary)' : 'var(--buffer-primary)',
              currentValue: val === '1' ? 'Käyttövesi (1)' : 'Lämmitys (0)',
            })
          }
        >
          {!hasData ? (
            <p className="no-data">
              {isUnknown
                ? `Tuntematon venttiilitila: ${val}`
                : 'Venttiili ei kytketty — tiedot näkyvät yhdistettäessä'}
            </p>
          ) : (
            <div>
              <div style={{
                fontSize: 15, fontWeight: 600,
                color: isDHW ? 'var(--dhw-primary)' : 'var(--buffer-primary)',
                marginBottom: 4,
              }}>
                {isDHW
                  ? `Käyttövesikierto ${pumpFlow !== null && pumpFlow >= 0.3 ? `(${pumpFlow.toFixed(1)} L/min)` : ''} ↗`
                  : `Lämmityskierto ${pumpFlow !== null && pumpFlow >= 0.3 ? `(${pumpFlow.toFixed(1)} L/min)` : ''} ↗`}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {isDHW
                  ? 'Virtaus ohjautuu LKV-varaajan kierukan kautta puskurivaraajalle'
                  : 'Virtaus ohjautuu suoraan puskurivaraajaan ja lattialämmitykseen'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                PAW-3WYVLV4HW · Fyysinen asento {val} ({isDHW ? 'Käyttövesi' : 'Lämmitys'})
              </div>
            </div>
          )}
        </div>

        {isDhwOnlyMode && (
          <div style={{
            marginTop: 10,
            padding: '6px 10px',
            borderRadius: 6,
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            fontSize: 11,
            color: '#60a5fa',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <span>ℹ️</span> Pumppu on tilassa <strong>Vain käyttövesi</strong>.
          </div>
        )}

        <div className="divider" style={{ marginTop: 14 }} />

        {/* 3-Way Valve Controls */}
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Ohjaus / Pakotus
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {forceDHW ? '⚡ Pikakäyttövesi päällä' : isDhwOnlyMode ? '💧 Vain käyttövesi' : isHeatingOnlyMode ? '🏠 Vain lämmitys' : '🔄 Automaatti'}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            <button
              className={`btn btn-sm ${isAutoMode ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setValveTarget('auto')}
              disabled={pending || readOnly}
              id="btn-valve-auto"
              title="Lämpöpumppu säätää venttiiliä automaattisesti (Lämmitys + KV)"
              style={{ fontSize: 12, padding: '8px 6px', textAlign: 'center' }}
            >
              🔄 Auto
            </button>
            <button
              className={`btn btn-sm ${isDhwForced ? 'btn-success' : 'btn-ghost'}`}
              onClick={() => setValveTarget('dhw')}
              disabled={pending || readOnly}
              id="btn-valve-force-dhw"
              title="Käännä venttiili käyttövesivaraajalle (Vain käyttövesi)"
              style={{
                fontSize: 12,
                padding: '8px 6px',
                textAlign: 'center',
                background: isDhwForced ? 'var(--dhw-primary)' : undefined,
                borderColor: isDhwForced ? 'var(--dhw-primary)' : undefined,
                color: isDhwForced ? '#fff' : undefined,
              }}
            >
              💧 Käyttövesi
            </button>
            <button
              className={`btn btn-sm ${isHeatingOnlyMode ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setValveTarget('heating')}
              disabled={pending || readOnly}
              id="btn-valve-force-heating"
              title="Käännä venttiili puskurivaraajaan (Vain lämmitys)"
              style={{
                fontSize: 12,
                padding: '8px 6px',
                textAlign: 'center',
                background: isHeatingOnlyMode ? 'var(--buffer-primary)' : undefined,
                borderColor: isHeatingOnlyMode ? 'var(--buffer-primary)' : undefined,
                color: isHeatingOnlyMode ? '#fff' : undefined,
              }}
            >
              🏠 Lämmitys
            </button>
          </div>

          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.4, textAlign: 'center' }}>
            {isDhwOnlyMode
              ? 'Tila: Vain käyttövesi — virtaus ohjataan LKV-varaajalle.'
              : isHeatingOnlyMode
              ? 'Tila: Vain lämmitys — virtaus ohjataan puskurivaraajalle.'
              : forceDHW
              ? 'Pikakäyttövesi (Force DHW) pakotettu päälle.'
              : 'Automaattinen lämmitys ja käyttöveden lämmitys tarpeen mukaan.'}
          </div>

          {(error || success) && (
            <div className={`control-msg ${error ? 'error' : 'ok'}`}>
              {error ? `⚠ ${error}` : `✓ ${success}`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


