import { useEffect, useState } from 'react';
import type { HeishamonState, MqttStatus } from '../types/heishamon';
import { numVal } from '../types/heishamon';

interface StatusBarProps {
  state: HeishamonState;
  mqtt: MqttStatus;
  heishamonOnline: boolean | null;
  wsConnected: boolean;
  lastUpdate: number | null;
  isLocal?: boolean;
  authenticated?: boolean;
  username?: string | null;
  onLogout?: () => void;
}

function timeAgo(ts: number | null, now: number): string {
  if (!ts) return 'ei koskaan';
  const sec = Math.floor((now - ts) / 1000);
  if (sec < 5) return 'juuri nyt';
  if (sec < 60) return `${sec} s sitten`;
  if (sec < 3600) return `${Math.floor(sec / 60)} min sitten`;
  return `${Math.floor(sec / 3600)} h sitten`;
}

const MODE_LABELS: Record<string, string> = {
  '0': 'Lämmitys', '1': 'Jäähdytys', '2': 'Auto (lämpö)',
  '3': 'Käyttövesi', '4': 'Lämmitys+KV', '5': 'Jäähdytys+KV',
  '6': 'Auto+KV', '7': 'Auto (viilennys)', '8': 'Auto (viilennys)+KV',
};

export function StatusBar({
  state,
  mqtt,
  heishamonOnline,
  wsConnected,
  lastUpdate,
  isLocal,
  authenticated,
  username,
  onLogout,
}: StatusBarProps) {
  // The clock and the "updated Xs ago" label are derived from Date.now(), so
  // they only advance if something re-renders. Tick once a second.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const hpState = state['main/Heatpump_State']?.value;
  const opMode = state['main/Operating_Mode_State']?.value;
  const outsideTempNum = numVal(state, 'main/Outside_Temp');
  const error = state['main/Error']?.value;
  const hasError = error && error !== '0' && error !== 'H00';

  const isOn = hpState === '1';

  // Unified connection status
  const isWarning = wsConnected && (!mqtt.connected || heishamonOnline === false);
  const connStatusClass = !wsConnected ? 'offline' : isWarning ? 'warning' : 'online';
  const connLabel = !wsConnected
    ? 'Ei yhteyttä'
    : !mqtt.connected
    ? 'Välittäjä poissa'
    : heishamonOnline === false
    ? 'Heishamon poissa'
    : 'Live';
  const connTooltip = `WebSocket: ${wsConnected ? 'OK' : 'Ei yhteyttä'} | MQTT-välittäjä: ${mqtt.connected ? 'OK' : 'Ei yhteyttä'} | Heishamon: ${heishamonOnline === true ? 'OK' : heishamonOnline === false ? 'Poissa' : 'Tuntematon'}`;

  return (
    <header className="status-bar">
      <div className="status-bar-inner">
        {/* Logo */}
        <div className="status-logo">
          <span style={{ fontSize: 22 }}>🏠</span>
          <span className="status-logo-text">Kotiäly</span>
        </div>

        <div className="status-divider status-hide-mobile" />

        {/* Single Status Indicator */}
        <div className="status-indicator" title={connTooltip}>
          <div className={`status-dot ${connStatusClass}`} />
          <span className="status-label status-hide-mobile">
            {connLabel}
          </span>
        </div>

        {/* Heat pump state badge */}
        <div className={`badge ${isOn ? 'badge-heat' : 'badge-off'}`}>
          {isOn ? '🔥' : '⏹'} {isOn ? 'Käynnissä' : 'Valmiustila'}
        </div>

        {/* Operating mode */}
        {opMode !== undefined && (
          <div className="badge badge-heat status-hide-xs" style={{ fontSize: 11 }}>
            {MODE_LABELS[opMode] ?? `Tila ${opMode}`}
          </div>
        )}

        {/* Outside temp */}
        {outsideTempNum !== null && (
          <div className="status-temp">
            <span className="status-label status-hide-xs">Ulkoilma</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--cool-primary)' }}>
              {outsideTempNum.toFixed(1)}°C
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

        {/* Auth status & Logout */}
        {!isLocal && authenticated && onLogout && (
          <button
            onClick={onLogout}
            className="btn btn-sm btn-ghost status-hide-xs"
            title="Kirjaudu ulos etäistunnosta"
            style={{ fontSize: 11, padding: '4px 8px', color: 'var(--text-muted)' }}
          >
            👤 {username || 'admin'} · Kirjaudu ulos
          </button>
        )}

        {/* Last update & Clock */}
        <div className="status-meta">
          <span className="status-hide-sm" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Päivitetty {timeAgo(lastUpdate, now)}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
            {new Date(now).toLocaleTimeString('fi-FI')}
          </span>
        </div>
      </div>
    </header>
  );
}


