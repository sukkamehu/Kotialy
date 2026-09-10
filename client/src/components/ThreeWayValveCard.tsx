import type { HeishamonState } from '../types/heishamon';
import { useCommand } from '../hooks/useCommand';

interface ThreeWayValveCardProps {
  state: HeishamonState;
}

export function ThreeWayValveCard({ state }: ThreeWayValveCardProps) {
  const valveState = state['main/ThreeWay_Valve_State'];
  const val = valveState?.value;
  const forceDHW = state['main/Force_DHW_State']?.value === '1';
  const { send, pending, error, success } = useCommand();

  /*
   * Heishamon exposes no direct 3-way valve command — the valve follows
   * demand. Forcing DHW is what actually swings it to the tank, so that is
   * what this switch drives, and the card says so rather than pretending
   * to command the valve directly.
   */
  function switchTo(target: 'dhw' | 'heating') {
    const next = target === 'dhw' ? 1 : 0;
    send('commands/SetForceDHW', next,
      target === 'dhw' ? 'Forcing hot water' : 'Released to heating');
  }
  const isRoom = val === '0';
  const isDHW = val === '1';
  // Only 0/1 are meaningful; anything else is an unknown state, not "heating".
  const hasData = isRoom || isDHW;
  const isUnknown = val !== undefined && !hasData;

  return (
    <div className="card" style={{
      borderColor: isDHW ? 'rgba(16,185,129,0.25)' : isRoom ? 'rgba(167,139,250,0.2)' : 'var(--border)',
    }}>
      <div className="card-header">
        <span className="card-icon">🔀</span>
        <span className="card-title">3-Way Valve</span>
        <div style={{ marginLeft: 'auto' }}>
          {!hasData ? (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {isUnknown ? `State ${val}` : 'No data'}
            </span>
          ) : isDHW ? (
            <div className="badge badge-dhw">DHW</div>
          ) : (
            <div className="badge" style={{ background: 'var(--buffer-glow)', color: 'var(--buffer-primary)', border: '1px solid rgba(167,139,250,0.3)' }}>
              Heating
            </div>
          )}
        </div>
      </div>
      <div className="card-body">
        {/* Valve diagram */}
        <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 16px' }}>
          <svg width="140" height="80" viewBox="0 0 140 80" fill="none">
            {/* Heat pump side (left) */}
            <line x1="0" y1="40" x2="45" y2="40" stroke="rgba(255,255,255,0.2)" strokeWidth="8" strokeLinecap="round"/>
            <text x="4" y="34" fill="rgba(255,255,255,0.4)" fontSize="8" fontFamily="Inter,sans-serif">HP</text>

            {/* Valve body */}
            <circle cx="70" cy="40" r="22" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5"/>

            {/* Room circuit (right) */}
            <line x1="92" y1="40" x2="140" y2="40"
              stroke={isRoom ? 'var(--buffer-primary)' : 'rgba(255,255,255,0.15)'}
              strokeWidth={isRoom ? 8 : 5}
              strokeLinecap="round"
              style={{ transition: 'all 0.5s', filter: isRoom ? 'drop-shadow(0 0 6px var(--buffer-primary))' : 'none' }}
            />
            <text x="108" y="34" fill={isRoom ? 'var(--buffer-primary)' : 'rgba(255,255,255,0.4)'}
              fontSize="8" fontFamily="Inter,sans-serif">Heat</text>

            {/* DHW circuit (bottom) */}
            <line x1="70" y1="62" x2="70" y2="80"
              stroke={isDHW ? 'var(--dhw-primary)' : 'rgba(255,255,255,0.15)'}
              strokeWidth={isDHW ? 8 : 5}
              strokeLinecap="round"
              style={{ transition: 'all 0.5s', filter: isDHW ? 'drop-shadow(0 0 6px var(--dhw-primary))' : 'none' }}
            />
            <text x="56" y="80" fill={isDHW ? 'var(--dhw-primary)' : 'rgba(255,255,255,0.4)'}
              fontSize="8" fontFamily="Inter,sans-serif">DHW</text>

            {/* Valve indicator dot */}
            <circle cx="70" cy="40" r="6"
              fill={isDHW ? 'var(--dhw-primary)' : isRoom ? 'var(--buffer-primary)' : 'rgba(255,255,255,0.3)'}
              style={{ transition: 'fill 0.5s' }}
            />

            {/* Flow direction arrow */}
            {hasData && (
              <text x={isDHW ? "60" : "80"} y={isDHW ? "52" : "43"}
                fill="rgba(255,255,255,0.6)" fontSize="10" fontFamily="Inter,sans-serif">
                {isDHW ? '↓' : '→'}
              </text>
            )}
          </svg>
        </div>

        <div style={{ textAlign: 'center' }}>
          {!hasData ? (
            <p className="no-data">
              {isUnknown
                ? `Unrecognised valve state: ${val}`
                : 'Valve not wired yet — will show data when connected'}
            </p>
          ) : (
            <div>
              <div style={{
                fontSize: 16, fontWeight: 600,
                color: isDHW ? 'var(--dhw-primary)' : 'var(--buffer-primary)',
                marginBottom: 4,
              }}>
                {isDHW ? 'Directing to DHW Tank' : 'Directing to Heating Circuit'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                PAW-3WYVLV4HW · State {val}
              </div>
            </div>
          )}
        </div>

        <div className="divider" style={{ marginTop: 16 }} />

        {/* Switch: drives Force DHW, which is what moves the valve */}
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Request position
          </div>
          <div className="toggle-group">
            <button
              className={`toggle-btn ${!forceDHW ? 'active' : ''}`}
              onClick={() => switchTo('heating')}
              disabled={pending}
              id="btn-valve-heating"
            >
              Heating
            </button>
            <button
              className={`toggle-btn ${forceDHW ? 'active' : ''}`}
              onClick={() => switchTo('dhw')}
              disabled={pending}
              id="btn-valve-dhw"
            >
              Hot water
            </button>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.4 }}>
            The valve has no direct command — this forces hot water priority, and
            the valve follows. It may take a moment to move.
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
