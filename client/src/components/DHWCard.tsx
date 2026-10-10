import { useState } from 'react';
import type { HeishamonState } from '../types/heishamon';
import { numVal } from '../types/heishamon';
import { useCommand } from '../hooks/useCommand';
import { useElectricityPrice } from '../hooks/useElectricityPrice';
import { useApc } from '../hooks/useApc';
import { useSterilization } from '../hooks/useSterilization';
import { SetpointControl } from './SetpointControl';
import { ToggleRow } from './SegmentedControl';

import type { TrendTopicTarget } from './VariableTrendModal';

interface DHWCardProps {
  state: HeishamonState;
  onOpenTrend?: (target: TrendTopicTarget) => void;
  readOnly?: boolean;
}

function TankSvg({
  temp,
  target,
  maxTemp = 65,
  minTemp = 20,
  onOpenTrend,
}: {
  temp: number | null;
  target: number | null;
  maxTemp?: number;
  minTemp?: number;
  onOpenTrend?: (target: TrendTopicTarget) => void;
}) {
  const fillPct = temp !== null
    ? Math.max(5, Math.min(95, ((temp - minTemp) / (maxTemp - minTemp)) * 100))
    : 5;

  const waterColor = temp !== null && temp > 55
    ? '#f59e0b'
    : temp !== null && temp > 45
    ? '#fb923c'
    : '#22d3ee';

  const waterGlow = temp !== null && temp > 45 ? 'rgba(245,158,11,0.3)' : 'rgba(34,211,238,0.2)';

  return (
    <div
      className="gauge-clickable"
      title="Klikkaa nähdäksesi käyttöveden lämpötilatrendi"
      onClick={() =>
        onOpenTrend?.({
          topic: 'main/DHW_Temp',
          label: 'Käyttöveden lämpötila',
          unit: '°C',
          color: '#10b981',
          currentValue: temp,
        })
      }
      style={{ flexShrink: 0 }}
    >
      <svg
        width="56"
        height="90"
        viewBox="0 0 56 90"
        fill="none"
      >
        {/* Tank outline */}
        <rect x="6" y="8" width="44" height="72" rx="8" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5"/>
        {/* Water fill */}
        <clipPath id="tank-clip">
          <rect x="7.5" y="9.5" width="41" height="69" rx="7" />
        </clipPath>
        <g clipPath="url(#tank-clip)">
          <rect
            x="7.5"
            y={9.5 + 69 * (1 - fillPct / 100)}
            width="41"
            height={69 * fillPct / 100}
            fill={waterColor}
            opacity="0.25"
            style={{ transition: 'all 1s ease', filter: `drop-shadow(0 0 6px ${waterGlow})` }}
          />
        </g>
        {/* Target line */}
        {target !== null && (() => {
          const targetPct = Math.max(5, Math.min(95, ((target - minTemp) / (maxTemp - minTemp)) * 100));
          const y = 9.5 + 69 * (1 - targetPct / 100);
          return <line x1="7.5" y1={y} x2="48.5" y2={y} stroke="rgba(255,255,255,0.4)" strokeWidth="1" strokeDasharray="3,2" />;
        })()}
        {/* Tank caps */}
        <rect x="16" y="2" width="24" height="8" rx="4" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5"/>
        <rect x="16" y="80" width="24" height="8" rx="4" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5"/>
      </svg>
    </div>
  );
}

export function DHWCard({ state, onOpenTrend, readOnly = false }: DHWCardProps) {
  const temp = numVal(state, 'main/DHW_Temp');
  const target = numVal(state, 'main/DHW_Target_Temp');
  const forceDHW = state['main/Force_DHW_State']?.value === '1';
  const heaterEnabled = state['main/DHW_Heater_State']?.value === '1';
  const forceHeater = state['main/Force_Heater_State']?.value === '1';
  const internalHeater = state['main/Internal_Heater_State']?.value === '1';
  const externalHeater = state['main/External_Heater_State']?.value === '1';

  // Power – prefer XTOP, fallback to TOP
  const dhwProdXtop = numVal(state, 'extra/DHW_Power_Production');
  const dhwConsXtop = numVal(state, 'extra/DHW_Power_Consumption');
  const dhwProd = dhwProdXtop ?? numVal(state, 'main/DHW_Power_Production');
  const dhwCons = dhwConsXtop ?? numVal(state, 'main/DHW_Power_Consumption');

  const cop = dhwCons && dhwCons > 0 && dhwProd ? (dhwProd / dhwCons).toFixed(2) : null;

  const { send, pending, error, success } = useCommand();
  const { calcCostPerHour } = useElectricityPrice();
  const { status: apcStatus, updateSettings: updateApcSettings } = useApc();
  const {
    status: sterStatus,
    actionPending: sterPending,
    startSterilization,
    cancelSterilization,
    updateSettings: updateSterSettings,
  } = useSterilization();

  const [showSterDetails, setShowSterDetails] = useState(false);

  const cost = calcCostPerHour(dhwCons);

  const apcEnabled = apcStatus?.enabled ?? false;
  const baseDhwTarget = apcStatus?.settings?.dhw_target_c ?? 55;
  const activeDhwSlot = apcStatus?.activeDhwSlot ?? false;

  function toggleForceHeater() {
    send('commands/SetForceHeater', forceHeater ? 0 : 1,
      forceHeater ? 'Varavastus pois' : 'Varavastus pakotettu päälle');
  }

  function setDHWTarget(v: number) {
    if (apcEnabled) {
      updateApcSettings({ dhw_target_c: v });
    } else {
      send('commands/SetDHWTemp', v, `Käyttöveden tavoite asetettu ${v} °C`);
    }
  }

  const isPanasonicSterilization = state['main/Sterilization_State']?.value === '1';
  const isKotiSterilization = sterStatus?.isActive ?? false;
  const isSterilization = isPanasonicSterilization || isKotiSterilization;
  const sterilizationTemp = state['main/Sterilization_Temp']?.value || sterStatus?.targetTemp;
  const dhwPumpState = state['main/DHW_Pump_State']?.value === '1';
  const dhwHours = numVal(state, 'main/DHW_Hours');

  const tempColor = temp !== null && temp > 55 ? 'var(--heat-primary)' :
    temp !== null && temp > 45 ? 'var(--heat-secondary)' : 'var(--cool-primary)';

  const daysSinceLastSter = sterStatus?.settings?.days_since_last ?? 0;
  const lastSterDateStr = sterStatus?.settings?.last_completed_at
    ? new Date(sterStatus.settings.last_completed_at).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })
    : null;

  return (
    <div className="card" style={{
      borderColor: isSterilization ? 'rgba(236,72,153,0.6)' : forceDHW ? 'rgba(245,158,11,0.4)' : 'var(--border)',
      boxShadow: isSterilization ? '0 0 24px rgba(236,72,153,0.2)' : forceDHW ? '0 0 20px rgba(245,158,11,0.1)' : undefined,
    }}>
      <div className="card-header">
        <span className="card-icon">🚿</span>
        <span className="card-title">Käyttövesivaraaja</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {isSterilization && (
            <div className="badge" style={{
              background: 'linear-gradient(135deg, rgba(236,72,153,0.25), rgba(168,85,247,0.25))',
              color: '#f472b6',
              border: '1px solid rgba(236,72,153,0.5)',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              animation: 'pulse 2s infinite',
            }}>
              <span>🧼 Sterilointi</span>
              <span>{sterilizationTemp ? `(${sterilizationTemp}°C)` : ''}</span>
            </div>
          )}
          {dhwHours !== null && (
            <span
              className="metric-clickable"
              title="Klikkaa nähdäksesi käyttövesituntien trendi"
              onClick={() =>
                onOpenTrend?.({
                  topic: 'main/DHW_Hours',
                  label: 'Käyttövesitunnit',
                  unit: 'h',
                  color: 'var(--dhw-primary)',
                  currentValue: dhwHours,
                })
              }
              style={{ fontSize: 11, color: 'var(--text-muted)' }}
            >
              ⏱ {Math.round(dhwHours)} h
            </span>
          )}
          {forceDHW && !isSterilization && (
            <div className="badge badge-heat">⚡ Tehostus</div>
          )}
        </div>
      </div>
      <div className="card-body">
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 16 }}>
          <TankSvg temp={temp} target={target} onOpenTrend={onOpenTrend} />
          <div style={{ flex: 1 }}>
            <div
              className="metric metric-clickable"
              style={{ marginBottom: 8 }}
              title="Klikkaa nähdäksesi käyttöveden lämpötilatrendi"
              onClick={() =>
                onOpenTrend?.({
                  topic: 'main/DHW_Temp',
                  label: 'Käyttöveden lämpötila',
                  unit: '°C',
                  color: '#10b981',
                  currentValue: temp,
                })
              }
            >
              <span className="metric-label">Lämpötila ↗</span>
              <span className="metric-value" style={{ fontSize: 32, color: tempColor }}>
                {temp !== null ? temp.toFixed(1) : '—'}
                <span className="metric-unit" style={{ fontSize: 16 }}>°C</span>
              </span>
            </div>
            {target !== null && temp !== null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: temp >= target ? 'var(--online)' : 'var(--warning)' }}>
                  {temp >= target ? '✓ Tavoite saavutettu' : `${(target - temp).toFixed(1)} °C tavoitteeseen`}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ─── ACTIVE STERILIZATION BANNER (WHEN RUNNING) ─── */}
        {isKotiSterilization && sterStatus && (
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.12), rgba(168, 85, 247, 0.12))',
              border: '1px solid rgba(236, 72, 153, 0.35)',
              borderRadius: 10,
              padding: '12px 14px',
              marginBottom: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14 }}>🧼</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#f472b6' }}>
                  {sterStatus.phase === 'PREHEATING' && 'Vaihe 1/3: Kompressorin esilämmitys'}
                  {sterStatus.phase === 'BOOSTING' && 'Vaihe 2/3: Sähkövastus-loppunousu (65°C)'}
                  {sterStatus.phase === 'HOLDING' && 'Vaihe 3/3: Desinfiointipitoaika'}
                  {sterStatus.phase === 'COMPLETED' && 'Sterilointi valmis!'}
                </span>
              </div>
              <button
                className="btn btn-sm btn-danger"
                onClick={() => cancelSterilization('Käyttäjä keskeytti UI:sta')}
                disabled={sterPending || readOnly}
                style={{ fontSize: 10, padding: '2px 8px' }}
              >
                {sterPending ? '…' : '⏹ Keskeytä'}
              </button>
            </div>

            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>
              {sterStatus.reason}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
              <span>Kesto: {sterStatus.totalElapsedMinutes} min</span>
              {sterStatus.phase === 'HOLDING' && (
                <span style={{ color: '#ec4899', fontWeight: 700 }}>
                  ⏳ Pitoaikaa jäljellä: {Math.floor(sterStatus.holdRemainingSeconds / 60)}m {sterStatus.holdRemainingSeconds % 60}s
                </span>
              )}
              <span>Tavoite: {sterStatus.targetTemp} °C</span>
            </div>
          </div>
        )}

        {/* DHW Upstairs Circulation Loop (LKV-kierto) */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: 10,
            padding: '10px 14px',
            marginBottom: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1.5px solid rgba(16, 185, 129, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--dhw-primary)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Käyttöveden kierto (Yläkerta)</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>(LKV)</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {dhwPumpState
                  ? 'Ohjattu lämpöpumpulta (DHW Pump)'
                  : 'Kokoaikainen kierto · 230V suorasyöttö'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--text-secondary)',
              background: 'rgba(255, 255, 255, 0.05)',
              padding: '2px 8px',
              borderRadius: 6,
            }}>
              Jatkuva
            </span>
          </div>
        </div>

        <div className="divider" />

        {/* Setpoints & APC Dual Target */}
        <div style={{ marginTop: 12 }}>
          {/* 1. Live target indicator if APC is enabled */}
          {apcEnabled && (() => {
            const nextDhwSlot = apcStatus?.plan?.find(s => s.is_dhw_slot && s.start_time > Date.now());
            const nextDhwTimeStr = nextDhwSlot ? new Date(nextDhwSlot.start_time).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' }) : null;

            return (
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
                    color: activeDhwSlot ? '#f59e0b' : '#38bdf8',
                    backgroundColor: activeDhwSlot ? 'rgba(245, 158, 11, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                    border: `1px solid ${activeDhwSlot ? 'rgba(245, 158, 11, 0.3)' : 'rgba(56, 189, 248, 0.3)'}`,
                    padding: '2px 7px',
                    borderRadius: 6,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}>
                    <span>{activeDhwSlot ? '🔥' : '🌡️'}</span>
                    <span>{activeDhwSlot ? `Tehokuumennus (${baseDhwTarget}°C)` : 'Ylläpitolämpö'}</span>
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Pumpun nykyinen tavoite:
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {target !== null ? `${target} °C` : '—'}
                  </div>
                </div>

                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                  {activeDhwSlot
                    ? `Halvan pörssijakson kuumennus käynnissä (${baseDhwTarget} °C)`
                    : nextDhwTimeStr
                    ? `Odottaa vuorokauden halvinta jaksoa · Seuraava täyskuumennus (${baseDhwTarget} °C) klo ${nextDhwTimeStr}`
                    : 'Ylläpitotila · Odottaa vuorokauden edullisinta latausjaksoa'}
                </div>
              </div>
            );
          })()}

          {/* 2. Base setting stepper */}
          <SetpointControl
            label={apcEnabled ? '🎯 Kuumennuksen perustavoite' : 'Käyttöveden tavoitelämpötila'}
            value={apcEnabled ? baseDhwTarget : target}
            min={40}
            max={75}
            step={1}
            accentColor="var(--dhw-primary)"
            pending={pending}
            disabled={readOnly}
            onCommit={setDHWTarget}
            idPrefix="dhw-target"
            hint={apcEnabled ? 'APC kuumentaa tähän lämpötilaan edullisena aikana' : 'legionellakuumennus vaatii ≥60 °C'}
          />
        </div>

        <div className="divider" style={{ marginTop: 16 }} />

        {/* ─── SMART STERILIZATION CONTROL SECTION ─── */}
        <div
          style={{
            background: 'rgba(236, 72, 153, 0.03)',
            border: '1px solid rgba(236, 72, 153, 0.15)',
            borderRadius: 10,
            padding: '12px 14px',
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 14 }}>🧼</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                Älykäs legionellasterilointi
              </span>
            </div>
            <span style={{
              fontSize: 10,
              fontWeight: 600,
              color: daysSinceLastSter >= 7 ? '#f59e0b' : 'var(--text-muted)',
              background: daysSinceLastSter >= 7 ? 'rgba(245, 158, 11, 0.12)' : 'rgba(255, 255, 255, 0.05)',
              border: `1px solid ${daysSinceLastSter >= 7 ? 'rgba(245, 158, 11, 0.3)' : 'rgba(255, 255, 255, 0.08)'}`,
              padding: '2px 6px',
              borderRadius: 6,
            }}>
              {lastSterDateStr ? `Edellinen: ${lastSterDateStr} (${Math.floor(daysSinceLastSter)} pv)` : 'Ei suoritettu'}
            </span>
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.4 }}>
            Kuumennus 65 °C asti (10 min pito). Käynnistyy automaattisesti negatiivisella pörssihinnalla (≥7 pv välein) tai säännöllisesti 14 pv välein halvimmalla tunnilla.
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn btn-sm"
              onClick={() => {
                if (isKotiSterilization) {
                  cancelSterilization();
                } else {
                  startSterilization('Käyttäjän manuaalinen käynnistys UI:sta');
                }
              }}
              disabled={sterPending || readOnly}
              style={{
                background: isKotiSterilization ? 'rgba(239,68,68,0.2)' : 'linear-gradient(135deg, #ec4899, #8b5cf6)',
                color: '#fff',
                border: 'none',
                fontWeight: 600,
                padding: '6px 12px',
                borderRadius: 6,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: isKotiSterilization ? undefined : '0 2px 8px rgba(236,72,153,0.3)',
              }}
            >
              {sterPending ? '…' : isKotiSterilization ? '⏹ Keskeytä sterilointi' : '⚡ Aja sterilointi nyt (65°C)'}
            </button>

            <button
              className="btn btn-sm btn-ghost"
              onClick={() => setShowSterDetails(!showSterDetails)}
              style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}
            >
              {showSterDetails ? '▲ Piilota asetukset' : '⚙ Asetukset ▼'}
            </button>
          </div>

          {showSterDetails && sterStatus && (
            <div style={{
              marginTop: 12,
              paddingTop: 10,
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Automaattinen pörssisterilointi</span>
                <button
                  className={`btn btn-sm ${sterStatus.settings.enabled ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ fontSize: 11, padding: '2px 8px' }}
                  onClick={() => updateSterSettings({ enabled: !sterStatus.settings.enabled })}
                  disabled={sterPending || readOnly}
                >
                  {sterStatus.settings.enabled ? '● Päällä' : '○ Pois'}
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
                <span>Minimiaika negatiivisen hinnan ajolle:</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>≥ {sterStatus.settings.min_interval_days} päivää</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
                <span>Maksimiaika (pakkoajo halvimmalla tunnilla):</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{sterStatus.settings.max_interval_days} päivää</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
                <span>Desinfiointilämpö & pitoaika:</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{sterStatus.settings.target_temp_c} °C ({sterStatus.settings.hold_duration_minutes} min)</span>
              </div>
            </div>
          )}
        </div>

        {/* Power & Cost */}
        <div className="metrics-grid metrics-grid-4" style={{ marginTop: 12 }}>
          <div className="metric metric-sm">
            <span className="metric-label">Tuotto</span>
            <span className="metric-value" style={{ color: 'var(--dhw-primary)' }}>
              {dhwProd !== null ? (dhwProd >= 1000 ? `${(dhwProd / 1000).toFixed(2)}kW` : `${Math.round(dhwProd)}W`) : '—'}
            </span>
          </div>
          <div className="metric metric-sm">
            <span className="metric-label">Kulutus</span>
            <span className="metric-value">
              {dhwCons !== null ? (dhwCons >= 1000 ? `${(dhwCons / 1000).toFixed(2)}kW` : `${Math.round(dhwCons)}W`) : '—'}
            </span>
          </div>
          <div className="metric metric-sm">
            <span className="metric-label">COP</span>
            <span className="metric-value" style={{ color: 'var(--dhw-primary)' }}>
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

        <div className="divider" />

        {/* Controls */}
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <ToggleRow
            label="🧼 Legionellasterilointi (65°C)"
            description="3-vaiheinen kuumennus: Kompressori 52°C + Vastus 65°C (10 min pito)"
            on={isKotiSterilization}
            onToggle={() => {
              if (isKotiSterilization) cancelSterilization();
              else startSterilization('Käyttäjän manuaalinen käynnistys');
            }}
            pending={sterPending}
            disabled={readOnly}
            idPrefix="btn-dhw-sterilization-toggle"
            onLabel="🧼 Käynnissä"
            offLabel="⚡ Aja nyt"
          />

          <ToggleRow
            label="🔥 Pakota varavastus (Force Heater)"
            description="Sähköinen hätävaralämmitys (kun kompressori ei riitä/vika)"
            on={forceHeater}
            onToggle={toggleForceHeater}
            pending={pending}
            disabled={readOnly}
            idPrefix="btn-dhw-force-heater"
            onLabel="🔥 Pakotettu"
            offLabel="○ Pois"
            danger={true}
          />

          <div style={{ display: 'flex', gap: 16, marginTop: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: internalHeater ? 'var(--warning)' : 'var(--text-muted)' }}>
              {internalHeater ? '● ' : '○ '}Sisäinen vastus
            </span>
            <span style={{ fontSize: 11, color: externalHeater ? 'var(--warning)' : 'var(--text-muted)' }}>
              {externalHeater ? '● ' : '○ '}Ulkoinen vastus
            </span>
            <span style={{ fontSize: 11, color: heaterEnabled ? 'var(--dhw-primary)' : 'var(--text-muted)', marginLeft: 'auto' }}>
              Säiliövastus: {heaterEnabled ? 'Käytössä' : 'Pois'}
            </span>
          </div>
        </div>

        {(error || success) && (
          <div className={`control-msg ${error ? 'error' : 'ok'}`}>
            {error ? `⚠ ${error}` : `✓ ${success}`}
          </div>
        )}
      </div>
    </div>
  );
}


