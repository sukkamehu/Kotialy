import type { HeishamonState } from '../types/heishamon';
import { numVal } from '../types/heishamon';

interface BufferTankCardProps {
  state: HeishamonState;
}

function BufferSvg({ temp, maxTemp = 70, minTemp = 20 }: {
  temp: number | null; maxTemp?: number; minTemp?: number;
}) {
  const fillPct = temp !== null
    ? Math.max(5, Math.min(95, ((temp - minTemp) / (maxTemp - minTemp)) * 100))
    : 5;

  const color = temp !== null && temp > 45 ? '#f59e0b' : '#a78bfa';
  const glow = temp !== null && temp > 45 ? 'rgba(245,158,11,0.3)' : 'rgba(167,139,250,0.3)';

  return (
    <svg width="50" height="80" viewBox="0 0 50 80" fill="none" style={{ flexShrink: 0 }}>
      {/* Cylinder body */}
      <rect x="5" y="10" width="40" height="58" rx="6" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5"/>
      {/* Fill */}
      <clipPath id="buf-clip"><rect x="6.5" y="11.5" width="37" height="55" rx="5.5" /></clipPath>
      <g clipPath="url(#buf-clip)">
        <rect
          x="6.5"
          y={11.5 + 55 * (1 - fillPct / 100)}
          width="37"
          height={55 * fillPct / 100}
          fill={color}
          opacity="0.2"
          style={{ transition: 'all 1s ease', filter: `drop-shadow(0 0 4px ${glow})` }}
        />
      </g>
      {/* Caps */}
      <ellipse cx="25" cy="10" rx="20" ry="5" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5"/>
      <ellipse cx="25" cy="68" rx="20" ry="5" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5"/>
      {/* Sensor indicator */}
      <circle cx="25" cy="39" r="3" fill={color} opacity="0.8" style={{ filter: `drop-shadow(0 0 3px ${glow})` }}/>
      <line x1="25" y1="11.5" x2="25" y2="36" stroke={color} strokeWidth="1" opacity="0.3" strokeDasharray="2,2"/>
      <line x1="25" y1="42" x2="25" y2="63" stroke={color} strokeWidth="1" opacity="0.3" strokeDasharray="2,2"/>
    </svg>
  );
}

export function BufferTankCard({ state }: BufferTankCardProps) {
  const bufferTemp = numVal(state, 'main/Buffer_Temp');
  const inletTemp = numVal(state, 'main/Main_Inlet_Temp');
  const outletTemp = numVal(state, 'main/Main_Outlet_Temp');

  const delta = inletTemp !== null && bufferTemp !== null
    ? (bufferTemp - inletTemp).toFixed(1)
    : null;

  const tempColor = bufferTemp !== null && bufferTemp > 45
    ? 'var(--heat-primary)'
    : 'var(--buffer-primary)';

  return (
    <div className="card" style={{
      borderColor: bufferTemp !== null && bufferTemp > 45
        ? 'rgba(245,158,11,0.25)'
        : 'rgba(167,139,250,0.2)',
    }}>
      <div className="card-header">
        <span className="card-icon">🗄️</span>
        <span className="card-title">Buffer Tank · 100L</span>
        <div style={{ marginLeft: 'auto' }}>
          {bufferTemp !== null && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {bufferTemp > 45 ? '🔥 Warm' : bufferTemp > 35 ? '🌡 Tepid' : '❄️ Cold'}
            </span>
          )}
        </div>
      </div>
      <div className="card-body">
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 16 }}>
          <BufferSvg temp={bufferTemp} />
          <div style={{ flex: 1 }}>
            <div className="metric">
              <span className="metric-label">Buffer Temperature</span>
              <span className="metric-value" style={{ fontSize: 34, color: tempColor }}>
                {bufferTemp !== null ? bufferTemp.toFixed(1) : '—'}
                <span className="metric-unit" style={{ fontSize: 16 }}>°C</span>
              </span>
            </div>
            {delta !== null && (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>ΔT vs inlet:</span>
                <span style={{
                  fontSize: 13, fontWeight: 600,
                  color: parseFloat(delta) > 0 ? 'var(--heat-primary)' : 'var(--cool-primary)',
                }}>
                  {parseFloat(delta) > 0 ? '+' : ''}{delta}°C
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="divider" />

        {/* Context temps */}
        <div className="metrics-grid metrics-grid-2" style={{ marginTop: 12 }}>
          <div className="metric metric-sm">
            <span className="metric-label">System Inlet</span>
            <span className="metric-value" style={{ color: 'var(--cool-primary)' }}>
              {inletTemp !== null ? inletTemp.toFixed(1) : '—'}
              <span className="metric-unit">°C</span>
            </span>
          </div>
          <div className="metric metric-sm">
            <span className="metric-label">System Outlet</span>
            <span className="metric-value" style={{ color: 'var(--heat-primary)' }}>
              {outletTemp !== null ? outletTemp.toFixed(1) : '—'}
              <span className="metric-unit">°C</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
