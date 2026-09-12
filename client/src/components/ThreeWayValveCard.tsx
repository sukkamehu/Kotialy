import type { HeishamonState } from '../types/heishamon';

interface ThreeWayValveCardProps {
  state: HeishamonState;
}

export function ThreeWayValveCard({ state }: ThreeWayValveCardProps) {
  const valveState = state['main/ThreeWay_Valve_State'];
  const val = valveState?.value;
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
        <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 16px' }}>
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

        <div style={{ textAlign: 'center' }}>
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
                {isDHW ? 'Ohjaa käyttövesivaraajaan (DHW)' : 'Ohjaa lämmityspiiriin (Lämpö)'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                PAW-3WYVLV4HW · Tila {val}
              </div>
            </div>
          )}
        </div>

        <div className="divider" style={{ marginTop: 16 }} />

        {/* Valve Info / Status explanation */}
        <div style={{ marginTop: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {isDHW
              ? 'Venttiili ohjaa lämmitysveden käyttövesivaraajan kierukkaan.'
              : isRoom
              ? 'Venttiili ohjaa lämmitysveden puskurivaraajaan ja tilojen lämmitykseen.'
              : 'Odotetaan venttiilin tilatietoa Heishamonilta.'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
            Lämpöpumppu ohjaa venttiiliä automaattisesti tarpeen mukaan.
          </div>
        </div>
      </div>
    </div>
  );
}

