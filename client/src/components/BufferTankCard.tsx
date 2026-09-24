import { useState } from 'react';
import type { HeishamonState } from '../types/heishamon';
import { numVal } from '../types/heishamon';
import { useCommand } from '../hooks/useCommand';
import { useElectricityPrice } from '../hooks/useElectricityPrice';
import { useApc } from '../hooks/useApc';
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
  curve: { min: -5, max: 5, label: 'Lämpökäyrän siirto', hint: 'siirtoarvo käyrästä', signed: true },
};

const MODE_KEY = 'kotialy.z1Mode';

function loadMode(): Z1Mode {
  try {
    const saved = localStorage.getItem(MODE_KEY);
    if (saved === 'direct' || saved === 'curve') return saved;
    return 'curve';
  } catch {
    return 'curve';
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
        <rect x="5" y="10" width="40" height="58" rx="6" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
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
        <ellipse cx="25" cy="10" rx="20" ry="5" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
        <ellipse cx="25" cy="68" rx="20" ry="5" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
        {/* Sensor indicator */}
        <circle cx="25" cy="39" r="3" fill={color} opacity="0.8" style={{ filter: `drop-shadow(0 0 3px ${glow})` }} />
        <line x1="25" y1="11.5" x2="25" y2="36" stroke={color} strokeWidth="1" opacity="0.3" strokeDasharray="2,2" />
        <line x1="25" y1="42" x2="25" y2="63" stroke={color} strokeWidth="1" opacity="0.3" strokeDasharray="2,2" />
      </svg>
    </div>
  );
}

export function BufferTankCard({ state, onOpenTrend, readOnly = false }: BufferTankCardProps) {
  const bufferTemp = numVal(state, 'main/Buffer_Temp');
  const inletTemp = numVal(state, 'main/Main_Inlet_Temp');
  const mainTargetTemp = numVal(state, 'main/Main_Target_Temp');
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
  const { status: apcStatus, updateSettings: updateApcSettings, setFloorPumpOverride } = useApc();
  const cost = calcCostPerHour(cons);

  const [mode, setMode] = useState<Z1Mode>(loadMode);
  const cfg = Z1_MODES[mode];

  const apcEnabled = apcStatus?.enabled ?? false;
  const baseZ1Shift = apcStatus?.settings?.base_z1_shift ?? 0;
  const directive = apcStatus?.currentDirective ?? 'NORMAL';

  // Lattialämmityksen toisiokiertovesipumpun (Sonoff) tila ja ohjaus
  const floorPumpRaw = state['lattialampopumppu/stat/POWER']?.value;
  const isFloorPumpRunning = floorPumpRaw === 'ON' || floorPumpRaw === '1' || floorPumpRaw === 'true';
  const floorPumpDevice = apcStatus?.devices?.find((d) => d.driver === 'floor_pump');
  const floorPumpOverrideActive = floorPumpDevice?.overrideActive ?? (apcStatus?.settings?.floor_pump_override_until ? apcStatus.settings.floor_pump_override_until > Date.now() : false);
  const floorPumpOverrideState = floorPumpDevice?.overrideState ?? apcStatus?.settings?.floor_pump_override_state;
  const floorPumpReason = floorPumpDevice?.reason || (isFloorPumpRunning ? 'Käynnissä (Lattialämmityskierto)' : 'Lepotilassa (Pois päältä)');
  const isAntiSeizeRunning = floorPumpDevice?.antiSeizeActive ?? false;

  const handleFloorPumpToggle = async (target: 'ON' | 'OFF' | null) => {
    if (readOnly) return;
    if (target === null) {
      await setFloorPumpOverride(null, 0);
    } else {
      await setFloorPumpOverride(target, 0);
    }
  };

  function changeMode(next: Z1Mode) {
    setMode(next);
    try { localStorage.setItem(MODE_KEY, next); } catch { /* private mode */ }
  }

  function setZ1(v: number) {
    if (apcEnabled && mode === 'curve') {
      updateApcSettings({ base_z1_shift: v });
    } else {
      send('commands/SetZ1HeatRequestTemperature', v,
        mode === 'curve' ? `Käyrän siirto asetettu: ${v > 0 ? '+' : ''}${v}` : `Tavoite asetettu: ${v} °C`);
    }
  }

  const delta = inletTemp !== null && bufferTemp !== null
    ? (bufferTemp - inletTemp).toFixed(1)
    : null;

  const heatHours = numVal(state, 'main/Heat_Hours');
  const opHours = numVal(state, 'main/Operations_Hours');

  const tempColor = bufferTemp !== null && bufferTemp > 45
    ? 'var(--heat-primary)'
    : 'var(--buffer-primary)';

  const getDirectiveBadge = () => {
    switch (directive) {
      case 'BOOST':
        return {
          icon: '🔥',
          label: 'APC Esilämmitys / Boost',
          tag: `+${apcStatus?.settings?.buffer_boost_c ?? 3}°C`,
          bg: 'rgba(245, 158, 11, 0.15)',
          border: 'rgba(245, 158, 11, 0.3)',
          color: '#f59e0b',
        };
      case 'SETBACK':
        return {
          icon: '❄️',
          label: 'APC Säästö / Setback',
          tag: `-${apcStatus?.settings?.buffer_setback_c ?? 3}°C`,
          bg: 'rgba(56, 189, 248, 0.15)',
          border: 'rgba(56, 189, 248, 0.3)',
          color: '#38bdf8',
        };
      case 'ECO':
        return {
          icon: '🌱',
          label: 'APC Eko-säästö',
          tag: '-1°C',
          bg: 'rgba(16, 185, 129, 0.15)',
          border: 'rgba(16, 185, 129, 0.3)',
          color: '#10b981',
        };
      default:
        return {
          icon: '⚖️',
          label: 'APC Normaali',
          tag: 'Perusasetus',
          bg: 'rgba(167, 139, 250, 0.15)',
          border: 'rgba(167, 139, 250, 0.3)',
          color: '#a78bfa',
        };
    }
  };

  const directiveBadge = getDirectiveBadge();

  return (
    <div className="card" style={{
      borderColor: bufferTemp !== null && bufferTemp > 45
        ? 'rgba(245,158,11,0.25)'
        : 'rgba(167,139,250,0.2)',
    }}>
      <div className="card-header">
        <span className="card-icon">🗄️</span>
        <span className="card-title">Puskurivaraaja · 100L</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {heatHours !== null ? (
            <span
              className="metric-clickable"
              title="Klikkaa nähdäksesi lämmitystuntien trendi"
              onClick={() =>
                onOpenTrend?.({
                  topic: 'main/Heat_Hours',
                  label: 'Lämmitystunnit',
                  unit: 'h',
                  color: 'var(--buffer-primary)',
                  currentValue: heatHours,
                })
              }
              style={{ fontSize: 11, color: 'var(--text-muted)' }}
            >
              ⏱ {Math.round(heatHours)} h
            </span>
          ) : opHours !== null ? (
            <span
              className="metric-clickable"
              title="Klikkaa nähdäksesi käyttötuntien trendi"
              onClick={() =>
                onOpenTrend?.({
                  topic: 'main/Operations_Hours',
                  label: 'Käyttötunnit',
                  unit: 'h',
                  color: 'var(--buffer-primary)',
                  currentValue: opHours,
                })
              }
              style={{ fontSize: 11, color: 'var(--text-muted)' }}
            >
              ⏱ {Math.round(opHours)} h
            </span>
          ) : null}
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



        {/* Lattialämmityksen kiertopumppu (Toisiopiiri · Sonoff) */}
        <div
          style={{
            background: isFloorPumpRunning ? 'rgba(34, 197, 94, 0.08)' : 'rgba(255, 255, 255, 0.02)',
            border: isFloorPumpRunning ? '1px solid rgba(34, 197, 94, 0.28)' : '1px solid rgba(255, 255, 255, 0.07)',
            borderRadius: 10,
            padding: '12px 14px',
            marginBottom: 14,
            transition: 'all 0.3s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: isFloorPumpRunning ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                border: isFloorPumpRunning ? '1.5px solid rgba(34, 197, 94, 0.3)' : '1.5px solid rgba(255, 255, 255, 0.07)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: isFloorPumpRunning ? '0 0 10px rgba(34, 197, 94, 0.25)' : 'none',
                flexShrink: 0,
              }}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={isFloorPumpRunning ? '#22c55e' : 'rgba(255, 255, 255, 0.4)'}
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={isFloorPumpRunning ? 'spinning' : ''}
                  style={{ transition: 'stroke 0.3s' }}
                >
                  <circle cx="12" cy="12" r="10" strokeDasharray="5 3" />
                  <path d="M12 7v5l3 3" />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span>Lattialämmityspumppu (Sonoff)</span>
                  <span className="badge" style={{
                    fontSize: 9,
                    padding: '1px 6px',
                    background: 'rgba(59, 130, 246, 0.15)',
                    color: '#60a5fa',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                  }}>
                    Toisiopiiri
                  </span>
                  {floorPumpOverrideActive && (
                    <span className="badge" style={{
                      fontSize: 9,
                      padding: '1px 6px',
                      background: 'rgba(245, 158, 11, 0.2)',
                      color: '#f59e0b',
                      border: '1px solid rgba(245, 158, 11, 0.4)',
                    }}>
                      ⚡ Pakotettu {floorPumpOverrideState || (isFloorPumpRunning ? 'ON' : 'OFF')}
                    </span>
                  )}
                  {isAntiSeizeRunning && (
                    <span className="badge" style={{
                      fontSize: 9,
                      padding: '1px 6px',
                      background: 'rgba(168, 85, 247, 0.2)',
                      color: '#c084fc',
                      border: '1px solid rgba(168, 85, 247, 0.4)',
                    }}>
                      🔄 Jumiutumissuoja
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {floorPumpReason}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: isFloorPumpRunning ? 'var(--online, #22c55e)' : 'var(--text-muted, #64748b)',
                  boxShadow: isFloorPumpRunning ? '0 0 8px var(--online, #22c55e)' : 'none',
                }}
              />
              <span style={{
                fontSize: 12,
                fontWeight: 600,
                color: isFloorPumpRunning ? 'var(--online, #22c55e)' : 'var(--text-muted, #64748b)',
              }}>
                {isFloorPumpRunning ? 'Käynnissä' : 'Pois päältä'}
              </span>
            </div>
          </div>

          {/* Quick override buttons */}
          <div style={{
            display: 'flex',
            gap: 6,
            marginTop: 8,
            paddingTop: 8,
            borderTop: '1px solid rgba(255, 255, 255, 0.05)',
            alignItems: 'center',
            justifyContent: 'flex-end',
            flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 'auto' }}>
              Pakkokytkentä:
            </span>
            <button
              className={`btn btn-xs ${!floorPumpOverrideActive ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => handleFloorPumpToggle(null)}
              disabled={readOnly || pending}
              title="Palauta älykäs automaattiohjaus"
              style={{ fontSize: 11, padding: '3px 9px', borderRadius: 6 }}
            >
              ⚡ Auto
            </button>
            <button
              className={`btn btn-xs ${floorPumpOverrideActive && (floorPumpOverrideState === 'ON' || (isFloorPumpRunning && !floorPumpOverrideState)) ? 'btn-success' : 'btn-ghost'}`}
              onClick={() => handleFloorPumpToggle('ON')}
              disabled={readOnly || pending}
              title="Pakota kiertovesipumppu päälle"
              style={{
                fontSize: 11,
                padding: '3px 9px',
                borderRadius: 6,
                color: isFloorPumpRunning ? '#22c55e' : undefined,
                border: floorPumpOverrideActive && floorPumpOverrideState === 'ON' ? '1px solid #22c55e' : undefined,
              }}
            >
              🟢 Pakota Päälle
            </button>
            <button
              className={`btn btn-xs ${floorPumpOverrideActive && (floorPumpOverrideState === 'OFF' || (!isFloorPumpRunning && !floorPumpOverrideState)) ? 'btn-danger' : 'btn-ghost'}`}
              onClick={() => handleFloorPumpToggle('OFF')}
              disabled={readOnly || pending}
              title="Pakota kiertovesipumppu pois päältä"
              style={{
                fontSize: 11,
                padding: '3px 9px',
                borderRadius: 6,
                color: !isFloorPumpRunning && floorPumpOverrideActive ? '#ef4444' : undefined,
                border: floorPumpOverrideActive && floorPumpOverrideState === 'OFF' ? '1px solid #ef4444' : undefined,
              }}
            >
              🔴 Pakota Pois
            </button>
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

          {/* 1. Active Moment Display when APC is controlling the curve */}
          {apcEnabled && mode === 'curve' && (
            <div style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 8,
              padding: '10px 12px',
              marginBottom: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
                  ⚡ Nykyhetken aktiivinen pyynti
                </span>
                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: directiveBadge.color,
                  backgroundColor: directiveBadge.bg,
                  border: `1px solid ${directiveBadge.border}`,
                  padding: '2px 7px',
                  borderRadius: 6,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}>
                  <span>{directiveBadge.icon}</span>
                  <span>{directiveBadge.tag}</span>
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Pumpulle lähetetty siirto:
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                  {z1Request !== null ? `${z1Request > 0 ? '+' : ''}${z1Request}` : '—'}
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 3 }}>
                    {mainTargetTemp !== null ? `(menovesi ~${mainTargetTemp.toFixed(1)}°C)` : ''}
                  </span>
                </div>
              </div>

              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                {directiveBadge.label} · Ohjataan automaattisesti sähkön hinnan mukaan
              </div>
            </div>
          )}

          {/* 2. Base Setting Stepper */}
          <SetpointControl
            label={apcEnabled && mode === 'curve' ? '🎯 Käyrän perusasetus (keskiarvo)' : cfg.label}
            value={apcEnabled && mode === 'curve' ? baseZ1Shift : z1Request}
            min={cfg.min}
            max={cfg.max}
            step={1}
            unit={mode === 'curve' ? ' °C (siirto)' : ' °C'}
            signed={cfg.signed}
            accentColor="var(--buffer-primary)"
            pending={pending}
            disabled={readOnly}
            onCommit={setZ1}
            idPrefix="z1-request"
            hint={
              mode === 'curve'
                ? apcEnabled
                  ? `0 = peruskäyrä (ei siirtoa) · Menoveden tavoite nyt ~${mainTargetTemp !== null ? mainTargetTemp.toFixed(1) : '—'} °C`
                  : `0 = peruskäyrä (ei siirtoa) · Menoveden tavoite nyt ~${mainTargetTemp !== null ? mainTargetTemp.toFixed(1) : '—'} °C`
                : cfg.hint
            }
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

