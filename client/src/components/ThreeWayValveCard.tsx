import type { HeishamonState } from '../types/heishamon';
import { useCommand } from '../hooks/useCommand';
import type { TrendTopicTarget } from './VariableTrendModal';

interface ThreeWayValveCardProps {
  state: HeishamonState;
  onOpenTrend?: (target: TrendTopicTarget) => void;
}

export function ThreeWayValveCard({ state, onOpenTrend }: ThreeWayValveCardProps) {
  const valveState = state['main/ThreeWay_Valve_State'];
  const val = valveState?.value;
  const forceDHW = state['main/Force_DHW_State']?.value === '1';
  const isRoom = val === '0';
  const isDHW = val === '1';
  // Only 0/1 are meaningful; anything else is an unknown state, not "heating".
  const hasData = isRoom || isDHW;
  const isUnknown = val !== undefined && !hasData;

  const { send, pending, error, success } = useCommand();

  function setValveTarget(target: 'heating' | 'dhw') {
    const next = target === 'dhw' ? 1 : 0;
    send(
      'commands/SetForceDHW',
      next,
      target === 'dhw' ? '3-tieventtiili pakotettu käyttövedelle' : '3-tieventtiili palautettu lämmitykselle (Auto)'
    );
  }

  return (
    <div className="card" style={{
      borderColor: isDHW ? 'rgba(16,185,129,0.25)' : isRoom ? 'rgba(167,139,250,0.2)' : 'var(--border)',
    }}>
      <div className="card-header">
        <span className="card-icon">🔀</span>
        <span className="card-title">3-Tieventtiili</span>
        <div style={{ marginLeft: 'auto' }}>
          {!hasData ? (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {isUnknown ? `Tila ${val}` : 'Ei tietoa'}
            </span>
          ) : isDHW ? (
            <div className="badge badge-dhw">Käyttövesi</div>
          ) : (
            <div className="badge" style={{ background: 'var(--buffer-glow)', color: 'var(--buffer-primary)', border: '1px solid rgba(167,139,250,0.3)' }}>
              Lämmitys
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
          <svg width="140" height="80" viewBox="0 0 140 80" fill="none">
            {/* Heat pump supply side (left) - green */}
            <line
              x1="0" y1="40" x2="45" y2="40"
              stroke={hasData ? 'var(--dhw-primary)' : 'rgba(255,255,255,0.2)'}
              strokeWidth="8"
              strokeLinecap="round"
              style={{ transition: 'all 0.5s', filter: hasData ? 'drop-shadow(0 0 6px var(--dhw-glow))' : 'none' }}
            />
            <text x="4" y="34" fill={hasData ? 'var(--dhw-primary)' : 'rgba(255,255,255,0.4)'} fontSize="8" fontFamily="Inter,sans-serif">LP</text>

            {/* Valve body */}
            <circle cx="70" cy="40" r="22" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5"/>

            {/* DHW circuit (right) */}
            <line x1="92" y1="40" x2="140" y2="40"
              stroke={isDHW ? 'var(--dhw-primary)' : 'rgba(255,255,255,0.15)'}
              strokeWidth={isDHW ? 8 : 5}
              strokeLinecap="round"
              style={{ transition: 'all 0.5s', filter: isDHW ? 'drop-shadow(0 0 6px var(--dhw-primary))' : 'none' }}
            />
            <text x="114" y="34" fill={isDHW ? 'var(--dhw-primary)' : 'rgba(255,255,255,0.4)'}
              fontSize="8" fontFamily="Inter,sans-serif">KV</text>

            {/* Room / Heating circuit (bottom) */}
            <line x1="70" y1="62" x2="70" y2="80"
              stroke={isRoom ? 'var(--buffer-primary)' : 'rgba(255,255,255,0.15)'}
              strokeWidth={isRoom ? 8 : 5}
              strokeLinecap="round"
              style={{ transition: 'all 0.5s', filter: isRoom ? 'drop-shadow(0 0 6px var(--buffer-primary))' : 'none' }}
            />
            <text x="36" y="76" fill={isRoom ? 'var(--buffer-primary)' : 'rgba(255,255,255,0.4)'}
              fontSize="8" fontFamily="Inter,sans-serif">Lämpö</text>

            {/* Valve indicator dot */}
            <circle cx="70" cy="40" r="6"
              fill={isDHW ? 'var(--dhw-primary)' : isRoom ? 'var(--buffer-primary)' : 'rgba(255,255,255,0.3)'}
              style={{ transition: 'fill 0.5s' }}
            />

            {/* Flow direction arrow */}
            {hasData && (
              <text x={isDHW ? "80" : "60"} y={isDHW ? "43" : "52"}
                fill="rgba(255,255,255,0.7)" fontSize="10" fontFamily="Inter,sans-serif">
                {isDHW ? '→' : '↓'}
              </text>
            )}
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
                fontSize: 16, fontWeight: 600,
                color: isDHW ? 'var(--dhw-primary)' : 'var(--buffer-primary)',
                marginBottom: 4,
              }}>
                {isDHW ? 'Ohjaa käyttövesivaraajaan (DHW) ↗' : 'Ohjaa lämmityspiiriin (Lämpö) ↗'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                PAW-3WYVLV4HW · Tila {val}
              </div>
            </div>
          )}
        </div>

        <div className="divider" style={{ marginTop: 16 }} />

        {/* 3-Way Valve Controls */}
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Ohjaus / Pakotus
            </span>
            {forceDHW && (
              <span className="badge badge-dhw" style={{ fontSize: 10 }}>
                ⚡ Pakotettu KV
              </span>
            )}
          </div>

          <div className="toggle-group">
            <button
              className={`toggle-btn ${!forceDHW ? 'active' : ''}`}
              onClick={() => setValveTarget('heating')}
              disabled={pending}
              id="btn-valve-auto-heating"
            >
              🔄 Automaatti / Lämmitys
            </button>
            <button
              className={`toggle-btn ${forceDHW ? 'active' : ''}`}
              onClick={() => setValveTarget('dhw')}
              disabled={pending}
              id="btn-valve-force-dhw"
              style={forceDHW ? { background: 'var(--dhw-primary)', borderColor: 'var(--dhw-primary)', color: '#fff' } : undefined}
            >
              ⚡ Pakota käyttövesi
            </button>
          </div>

          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.4, textAlign: 'center' }}>
            {forceDHW
              ? 'Venttiili on pakotettu käyttövesivaraajalle (Force DHW).'
              : 'Venttiili seuraa lämpöpumpun normaalia automaattiohjausta.'}
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


