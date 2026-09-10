import type { HeishamonState, MqttStatus } from '../types/heishamon';

interface StatusBarProps {
  state: HeishamonState;
  mqtt: MqttStatus;
  heishamonOnline: boolean | null;
  wsConnected: boolean;
  lastUpdate: number | null;
}

function timeAgo(ts: number | null): string {
  if (!ts) return 'never';
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

const MODE_LABELS: Record<string, string> = {
  '0': 'Heat', '1': 'Cool', '2': 'Auto Heat',
  '3': 'DHW', '4': 'Heat+DHW', '5': 'Cool+DHW',
  '6': 'Auto+DHW', '7': 'Auto Cool', '8': 'Auto Cool+DHW',
};

export function StatusBar({ state, mqtt, heishamonOnline, wsConnected, lastUpdate }: StatusBarProps) {
  const hpState = state['main/Heatpump_State']?.value;
  const opMode = state['main/Operating_Mode_State']?.value;
  const outsideTemp = state['main/Outside_Temp'];
  const error = state['main/Error']?.value;
  const hasError = error && error !== '0' && error !== 'H00';

  const isOn = hpState === '1';

  return (
    <header style={{
      background: 'rgba(255,255,255,0.03)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderBottom: '1px solid rgba(255,255,255,0.07)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      <div style={{
        maxWidth: 1600,
        margin: '0 auto',
        padding: '0 24px',
        height: 56,
        display: 'flex',
        alignItems: 'center',
        gap: 24,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 22 }}>🏠</span>
          <span style={{
            fontSize: 16,
            fontWeight: 700,
            background: 'linear-gradient(135deg, #f59e0b, #22d3ee)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '-0.02em',
          }}>Kotiäly</span>
        </div>

        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)' }} />

        {/* WS connection */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className={`status-dot ${wsConnected ? 'online' : 'offline'}`} />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {wsConnected ? 'Live' : 'Disconnected'}
          </span>
        </div>

        {/* Heishamon online */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className={`status-dot ${mqtt.connected ? 'online' : 'offline'}`} />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Broker {mqtt.connected ? 'Online' : 'Offline'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className={`status-dot ${
            heishamonOnline === true ? 'online' :
            heishamonOnline === false ? 'offline' : 'warning'
          }`} />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Heishamon {heishamonOnline === true ? 'Online' : heishamonOnline === false ? 'Offline' : '—'}
          </span>
        </div>

        {/* Heat pump state */}
        <div className={`badge ${isOn ? 'badge-heat' : 'badge-off'}`}>
          {isOn ? '🔥' : '⏹'} {isOn ? 'Running' : 'Standby'}
        </div>

        {/* Operating mode */}
        {opMode !== undefined && (
          <div className="badge badge-heat" style={{ fontSize: 11 }}>
            {MODE_LABELS[opMode] ?? `Mode ${opMode}`}
          </div>
        )}

        {/* Outside temp */}
        {outsideTemp && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Outside</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--cool-primary)' }}>
              {parseFloat(outsideTemp.value).toFixed(1)}°C
            </span>
          </div>
        )}

        {/* Error */}
        {hasError && (
          <div className="badge" style={{
            background: 'rgba(239,68,68,0.15)',
            color: '#ef4444',
            border: '1px solid rgba(239,68,68,0.3)',
          }}>
            ⚠ {error}
          </div>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Last update */}
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Updated {timeAgo(lastUpdate)}
        </span>

        {/* Time */}
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
          {new Date().toLocaleTimeString('fi-FI')}
        </span>
      </div>
    </header>
  );
}
