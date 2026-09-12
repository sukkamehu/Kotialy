import { useState } from 'react';
import type { HeishamonState } from '../types/heishamon';
import { numVal } from '../types/heishamon';
import { useCommand } from '../hooks/useCommand';
import { useElectricityPrice } from '../hooks/useElectricityPrice';
import { SetpointControl } from './SetpointControl';

/*
 * With a buffer tank the heating circuit target is the Z1 heat request
 * temperature. What that number means depends on the pump's configuration:
 *
 *   direct -> absolute water temperature
 *   curve  -> a shift applied to the compensation curve
 *
 * Nothing in the MQTT feed tells us which is active, so the user picks the
 * mode and the choice is remembered per browser.
 */
type Z1Mode = 'direct' | 'curve';

const Z1_MODES: Record<Z1Mode, { min: number; max: number; label: string; hint: string; signed: boolean }> = {
  direct: { min: 20, max: 60, label: 'Menoveden tavoitelämpötila', hint: 'absoluuttinen asetusarvo', signed: false },
  curve:  { min: -5, max: 5,  label: 'Lämpökäyrän siirto',         hint: 'siirtoarvo käyrästä',    signed: true },
};

const MODE_KEY = 'kotialy.z1Mode';

function loadMode(): Z1Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'curve' ? 'curve' : 'direct';
  } catch {
    return 'direct';
  }
}

import type { TrendTopicTarget } from './VariableTrendModal';

interface BufferTankCardProps {
  state: HeishamonState;
  onOpenTrend?: (target: TrendTopicTarget) => void;
  readOnly?: boolean;
}

function BufferSvg({
  temp,
  maxTemp = 70,
  minTemp = 20,
  onOpenTrend,
}: {
  temp: number | null;
  maxTemp?: number;
  minTemp?: number;
  onOpenTrend?: (target: TrendTopicTarget) => void;
}) {
  const fillPct = temp !== null
    ? Math.max(5, Math.min(95, ((temp - minTemp) / (maxTemp - minTemp)) * 100))
    : 5;

  const color = temp !== null && temp > 45 ? '#f59e0b' : '#a78bfa';
  const glow = temp !== null && temp > 45 ? 'rgba(245,158,11,0.3)' : 'rgba(167,139,250,0.3)';

  return (
    <div
      className="gauge-clickable"
      title="Klikkaa nähdäksesi puskurisäiliön lämpötilatrendi"
      onClick={() =>
        onOpenTrend?.({
          topic: 'main/Buffer_Temp',
          label: 'Puskurivaraajan lämpötila',
          unit: '°C',
          color: '#a78bfa',
          currentValue: temp,
        })
      }
      style={{ flexShrink: 0 }}
    >
      <svg
        width="50"
        height="80"
        viewBox="0 0 50 80"
        fill="none"
      >
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
    </div>
  );
}

export function BufferTankCard({ state, onOpenTrend, readOnly = false }: BufferTankCardProps) {
  const bufferTemp = numVal(state, 'main/Buffer_Temp');
  const inletTemp = numVal(state, 'main/Main_Inlet_Temp');
  const z1Request = numVal(state, 'main/Z1_Heat_Request_Temp');

  // Power – prefer XTOP values, fallback to main topics
  const heatProdXT = numVal(state, 'extra/Heat_Power_Production');
  const heatConsXT = numVal(state, 'extra/Heat_Power_Consumption');
  const coolProdXT = numVal(state, 'extra/Cool_Power_Production');
  const coolConsXT = numVal(state, 'extra/Cool_Power_Consumption');

  const heatProd = heatProdXT ?? numVal(state, 'main/Heat_Power_Production');
  const heatCons = heatConsXT ?? numVal(state, 'main/Heat_Power_Consumption');
  const coolProd = coolProdXT ?? numVal(state, 'main/Cool_Power_Production');
  const coolCons = coolConsXT ?? numVal(state, 'main/Cool_Power_Consumption');

  const isCooling = (coolCons ?? 0) > 0 || (coolProd ?? 0) > 0;
  const prod = isCooling ? coolProd : heatProd;
  const cons = isCooling ? coolCons : heatCons;

  const cop = cons && cons > 0 && prod ? (prod / cons).toFixed(2) : null;

  const { send, pending, error, success } = useCommand();
  const { calcCostPerHour } = useElectricityPrice();
  const cost = calcCostPerHour(cons);

  const [mode, setMode] = useState<Z1Mode>(loadMode);
  const cfg = Z1_MODES[mode];

  function changeMode(next: Z1Mode) {
    setMode(next);
    try { localStorage.setItem(MODE_KEY, next); } catch { /* private mode */ }
  }

  function setZ1(v: number) {
    send('commands/SetZ1HeatRequestTemperature', v,
      mode === 'curve' ? `Käyrän siirto asetettu: ${v > 0 ? '+' : ''}${v}` : `Tavoite asetettu: ${v} °C`);
  }

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
        <span className="card-title">Puskurivaraaja · 100L</span>
        <div style={{ marginLeft: 'auto' }}>
          {bufferTemp !== null && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {bufferTemp > 45 ? '🔥 Lämmin' : bufferTemp > 35 ? '🌡 Haalea' : '❄️ Viileä'}
            </span>
          )}
        </div>
      </div>
      <div className="card-body">
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 16 }}>
          <BufferSvg temp={bufferTemp} onOpenTrend={onOpenTrend} />
          <div style={{ flex: 1 }}>
            <div
              className="metric metric-clickable"
              title="Klikkaa nähdäksesi puskurisäiliön lämpötilatrendi"
              onClick={() =>
                onOpenTrend?.({
                  topic: 'main/Buffer_Temp',
                  label: 'Puskurivaraajan lämpötila',
                  unit: '°C',
                  color: '#a78bfa',
                  currentValue: bufferTemp,
                })
              }
            >
              <span className="metric-label">Puskurin lämpötila ↗</span>
              <span className="metric-value" style={{ fontSize: 34, color: tempColor }}>
                {bufferTemp !== null ? bufferTemp.toFixed(1) : '—'}
                <span className="metric-unit" style={{ fontSize: 16 }}>°C</span>
              </span>
            </div>
            {delta !== null && (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>ΔT vs tulo:</span>
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

        {/* Heating circuit setpoint (buffer target) */}
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Lämmityspiiri (Z1)
            </span>
            <div className="toggle-group" style={{ width: 'auto' }}>
              {(['direct', 'curve'] as Z1Mode[]).map((m) => (
                <button
                  key={m}
                  className={`toggle-btn ${mode === m ? 'active' : ''}`}
                  onClick={() => changeMode(m)}
                  id={`btn-z1-mode-${m}`}
                  style={{ fontSize: 11, padding: '3px 10px' }}
                >
                  {m === 'direct' ? 'Suora' : 'Käyrä'}
                </button>
              ))}
            </div>
          </div>

          <SetpointControl
            label={cfg.label}
            value={z1Request}
            min={cfg.min}
            max={cfg.max}
            step={1}
            unit={mode === 'curve' ? '' : '°C'}
            signed={cfg.signed}
            accentColor="var(--buffer-primary)"
            pending={pending}
            disabled={readOnly}
            onCommit={setZ1}
            idPrefix="z1-request"
            hint={cfg.hint}
          />

          {z1Request === null && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
              Odotetaan arvoa main/Z1_Heat_Request_Temp Heishamonilta
            </div>
          )}

          {(error || success) && (
            <div className={`control-msg ${error ? 'error' : 'ok'}`}>
              {error ? `⚠ ${error}` : `✓ ${success}`}
            </div>
          )}
        </div>

        <div className="divider" style={{ marginTop: 16 }} />

        {/* Power & Cost */}
        <div className="metrics-grid metrics-grid-4" style={{ marginTop: 12 }}>
          <div className="metric metric-sm">
            <span className="metric-label">{isCooling ? 'Jäähd. tuotto' : 'Tuotto'}</span>
            <span className="metric-value" style={{ color: isCooling ? 'var(--cool-primary)' : 'var(--heat-primary)' }}>
              {prod !== null ? (prod >= 1000 ? `${(prod / 1000).toFixed(2)}kW` : `${Math.round(prod)}W`) : '—'}
            </span>
          </div>
          <div className="metric metric-sm">
            <span className="metric-label">Kulutus</span>
            <span className="metric-value">
              {cons !== null ? (cons >= 1000 ? `${(cons / 1000).toFixed(2)}kW` : `${Math.round(cons)}W`) : '—'}
            </span>
          </div>
          <div className="metric metric-sm">
            <span className="metric-label">COP</span>
            <span className="metric-value" style={{ color: isCooling ? 'var(--cool-primary)' : 'var(--heat-primary)' }}>
              {cop ?? '—'}
            </span>
          </div>
          <div className="metric metric-sm">
            <span className="metric-label">Hinta / h</span>
            <span className="metric-value" style={{ color: 'var(--text-secondary)' }}>
              {cost.formatted}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

