import { useEffect, useState } from 'react';
import type { HeishamonState, MqttStatus } from '../types/heishamon';
import { numVal } from '../types/heishamon';
import { useElectricityPrice } from '../hooks/useElectricityPrice';

interface StatusBarProps {
  state: HeishamonState;
  mqtt: MqttStatus;
  heishamonOnline: boolean | null;
  wsConnected: boolean;
  lastUpdate: number | null;
  isLocal?: boolean;
  authenticated?: boolean;
  username?: string | null;
  role?: 'admin' | 'viewer';
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
  role = 'admin',
  onLogout,
}: StatusBarProps) {
  // The clock and the "updated Xs ago" label are derived from Date.now(), so
  // they only advance if something re-renders. Tick once a second.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const { priceCentsKWh, avgPriceCentsKWh, minPriceCentsKWh, maxPriceCentsKWh, priceLevel } = useElectricityPrice();

  const hpState = state['main/Heatpump_State']?.value;
  const opMode = state['main/Operating_Mode_State']?.value;
  const isSterilizationActive = state['main/Sterilization_State']?.value === '1';
  const sterilizationTemp = state['main/Sterilization_Temp']?.value;
  const outsideTempNum = numVal(state, 'main/Outside_Temp');
  const error = state['main/Error']?.value;
  const hasError = Boolean(
    error &&
    error.trim() !== '' &&
    error !== '0' &&
    error.toUpperCase() !== 'H00' &&
    error.toLowerCase() !== 'no error' &&
    error.toLowerCase() !== 'ei virhettä'
  );

  const isOn = hpState === '1';

  // Daily consumption demand estimation based on outdoor temperature (heating degree approach)
  // Base DHW consumption: ~3.5 kWh / day
  // Space heating: (17 - Tout) * 0.85 kWh / day (0 if Tout >= 17)
  const heatingKwh = outsideTempNum !== null ? Math.max(0, (17 - outsideTempNum) * 0.85) : 0;
  const dhwKwh = 3.5;
  const estimatedDailyKwh = outsideTempNum !== null ? (Math.round((heatingKwh + dhwKwh) * 10) / 10).toFixed(1) : null;

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

  // Price colors
  const priceColor = priceLevel === 'cheap' ? '#10b981' : priceLevel === 'expensive' ? '#f43f5e' : '#facc15';
  const priceBg = priceLevel === 'cheap' ? 'rgba(16, 185, 129, 0.12)' : priceLevel === 'expensive' ? 'rgba(244, 63, 94, 0.12)' : 'rgba(250, 204, 21, 0.12)';
  const priceBorder = priceLevel === 'cheap' ? 'rgba(16, 185, 129, 0.3)' : priceLevel === 'expensive' ? 'rgba(244, 63, 94, 0.3)' : 'rgba(250, 204, 21, 0.3)';

  return (
    <header className="status-bar">
      <div className="status-bar-inner">
        {/* Logo (Click to scroll top) */}
        <div
          className="status-logo"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }}
          title="Takaisin alkuun (Sivun alku)"
          role="button"
          tabIndex={0}
        >
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

        {/* Combined Heat pump state & Operating mode badge */}
        <div className={`badge ${isOn ? 'badge-heat' : 'badge-off'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span>{isOn ? '🔥' : '⏹'}</span>
          <span>{isOn ? 'Käynnissä' : 'Valmiustila'}</span>
          {opMode !== undefined && (
            <>
              <span style={{ opacity: 0.4 }}>·</span>
              <span style={{ fontWeight: 600 }}>{MODE_LABELS[opMode] ?? `Tila ${opMode}`}</span>
            </>
          )}
        </div>

        {/* Legionella Sterilization Active badge */}
        {isSterilizationActive && (
          <div
            className="badge"
            style={{
              background: 'rgba(236, 72, 153, 0.18)',
              border: '1px solid rgba(236, 72, 153, 0.45)',
              color: '#f472b6',
              fontWeight: 700,
              fontSize: 11,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              boxShadow: '0 0 10px rgba(236, 72, 153, 0.25)',
            }}
            title={`Käyttöveden legionellatappo / sterilointiohjelma käynnissä${sterilizationTemp ? ` (Tavoite ${sterilizationTemp} °C)` : ''}`}
          >
            <span>🧼</span>
            <span>Sterilointi käynnissä {sterilizationTemp ? `(${sterilizationTemp}°C)` : ''}</span>
          </div>
        )}

        {/* Electricity Price (Now & Day Average) */}
        {priceCentsKWh !== null && (
          <div
            className="badge"
            style={{
              background: priceBg,
              border: `1px solid ${priceBorder}`,
              color: priceColor,
              fontSize: 12,
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 10px',
            }}
            title={`Sähkön pörssihinta nyt: ${priceCentsKWh.toFixed(2)} snt/kWh\nPäivän keskiarvo: ${avgPriceCentsKWh !== null ? avgPriceCentsKWh.toFixed(2) + ' snt/kWh' : '—'}\nMin: ${minPriceCentsKWh !== null ? minPriceCentsKWh.toFixed(2) + ' snt' : '—'} | Max: ${maxPriceCentsKWh !== null ? maxPriceCentsKWh.toFixed(2) + ' snt' : '—'}`}
          >
            <span>⚡</span>
            <span>{priceCentsKWh.toFixed(1)} <span style={{ fontSize: 10, opacity: 0.85 }}>snt/kWh</span></span>
            {avgPriceCentsKWh !== null && (
              <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.85, marginLeft: 2 }}>
                (ka. {avgPriceCentsKWh.toFixed(1)} snt)
              </span>
            )}
          </div>
        )}

        {/* Estimated Daily Consumption Demand */}
        {estimatedDailyKwh !== null && (
          <div
            className="badge status-hide-xs"
            style={{
              background: 'rgba(167, 139, 250, 0.12)',
              border: '1px solid rgba(167, 139, 250, 0.28)',
              color: '#c4b5fd',
              fontSize: 11,
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 9px',
            }}
            title={`Laskennallinen arvio vuorokauden sähköntarpeesta nykyisellä ulkolämpötilalla (${outsideTempNum?.toFixed(1)}°C):\n• Lämmitys: ~${heatingKwh.toFixed(1)} kWh\n• Lämmin käyttövesi: ~${dhwKwh.toFixed(1)} kWh\n= Yhteensä ~${estimatedDailyKwh} kWh/pv\n\n(Arviomalli tarkentuu automaattisesti lämmityskauden aikana kertyvän historiadatan myötä)`}
          >
            <span>🔋</span>
            <span>Arvio: ~{estimatedDailyKwh} <span style={{ fontSize: 10, opacity: 0.85 }}>kWh/pv</span></span>
          </div>
        )}

        {/* Role badge if viewer */}
        {role === 'viewer' && (
          <div
            className="badge"
            style={{
              background: 'rgba(56, 189, 248, 0.12)',
              color: '#38bdf8',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              fontSize: 11,
              fontWeight: 600,
            }}
            title="Vain luku -käyttöoikeus (asetusten muokkaus estetty)"
          >
            👁️ Vain luku
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
            👤 {username || (role === 'viewer' ? 'katsoja' : 'admin')} · Kirjaudu ulos
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


