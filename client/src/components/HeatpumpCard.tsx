import { useState } from 'react';
import type { HeishamonState } from '../types/heishamon';
import { numVal } from '../types/heishamon';
import { useCommand } from '../hooks/useCommand';
import { SegmentedControl, ToggleRow } from './SegmentedControl';
import { ConfirmModal } from './ConfirmModal';

const OPERATING_MODES = [
  { value: 0, label: 'Lämmitys' },
  { value: 1, label: 'Jäähdytys' },
  { value: 2, label: 'Auto' },
  { value: 3, label: 'Käyttövesi' },
  { value: 4, label: 'Lämmitys+KV' },
  { value: 5, label: 'Jäähdytys+KV' },
  { value: 6, label: 'Auto+KV' },
];

/* Powerful mode is sent as a slot index; each step is 30 minutes. */
const POWERFUL_TIMES = [
  { value: 0, label: 'Pois' },
  { value: 1, label: '30 min' },
  { value: 2, label: '60 min' },
  { value: 3, label: '90 min' },
];

import type { TrendTopicTarget } from './VariableTrendModal';

interface HeatpumpCardProps {
  state: HeishamonState;
  onOpenTrend?: (target: TrendTopicTarget) => void;
}

function CompressorRing({
  freq,
  isOn,
  onOpenTrend,
}: {
  freq: number | null;
  isOn: boolean;
  onOpenTrend?: (target: TrendTopicTarget) => void;
}) {
  const maxFreq = 120;
  const pct = freq ? Math.min((freq / maxFreq) * 100, 100) : 0;
  const circumference = 2 * Math.PI * 26;
  const strokeDash = (pct / 100) * circumference;

  return (
    <div
      className="gauge-clickable"
      title="Klikkaa nähdäksesi kompressorin taajuustrendi"
      onClick={() =>
        onOpenTrend?.({
          topic: 'main/Compressor_Freq',
          label: 'Kompressorin taajuus',
          unit: 'Hz',
          color: '#fb923c',
          currentValue: freq,
        })
      }
      style={{ position: 'relative', width: 72, height: 72, flexShrink: 0 }}
    >
      <svg width="72" height="72" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="36" cy="36" r="26" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
        {isOn && (
          <circle
            cx="36" cy="36" r="26"
            fill="none"
            stroke="#f59e0b"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${strokeDash} ${circumference}`}
            style={{ transition: 'stroke-dasharray 1s ease', filter: 'drop-shadow(0 0 4px #f59e0b)' }}
          />
        )}
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{
          fontSize: freq ? 15 : 12,
          fontWeight: 700,
          color: isOn ? 'var(--heat-primary)' : 'var(--text-muted)',
          lineHeight: 1,
        }}>
          {freq ?? '—'}
        </span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>Hz</span>
      </div>
    </div>
  );
}

function TempFlow({
  inlet,
  outlet,
  target,
  onOpenTrend,
}: {
  inlet: number | null;
  outlet: number | null;
  target: number | null;
  onOpenTrend?: (target: TrendTopicTarget) => void;
}) {
  const minTemp = 20, maxTemp = 70;
  const outletPct = outlet ? Math.max(0, Math.min(100, ((outlet - minTemp) / (maxTemp - minTemp)) * 100)) : 0;
  const targetPct = target ? Math.max(0, Math.min(100, ((target - minTemp) / (maxTemp - minTemp)) * 100)) : 0;

  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <div
          className="metric metric-sm metric-clickable"
          title="Klikkaa nähdäksesi tuloveden trendi"
          onClick={() =>
            onOpenTrend?.({
              topic: 'main/Main_Inlet_Temp',
              label: 'Tuloveden lämpötila',
              unit: '°C',
              color: 'var(--cool-primary)',
              currentValue: inlet,
            })
          }
        >
          <span className="metric-label">Tulo (Inlet) ↗</span>
          <span className="metric-value" style={{ color: 'var(--cool-primary)' }}>
            {inlet !== null ? inlet.toFixed(1) : '—'}
            <span className="metric-unit">°C</span>
          </span>
        </div>
        <div style={{ fontSize: 20, alignSelf: 'center', color: 'var(--text-muted)' }}>→</div>
        <div
          className="metric metric-sm metric-clickable"
          style={{ textAlign: 'right' }}
          title="Klikkaa nähdäksesi menoveden trendi"
          onClick={() =>
            onOpenTrend?.({
              topic: 'main/Main_Outlet_Temp',
              label: 'Menoveden lämpötila',
              unit: '°C',
              color: 'var(--heat-primary)',
              currentValue: outlet,
            })
          }
        >
          <span className="metric-label">Meno (Outlet) ↗</span>
          <span className="metric-value" style={{ color: 'var(--heat-primary)' }}>
            {outlet !== null ? outlet.toFixed(1) : '—'}
            <span className="metric-unit">°C</span>
          </span>
        </div>
      </div>
      <div className="temp-bar-container">
        <div className="temp-bar-fill" style={{ width: `${outletPct}%` }} />
        {target !== null && (
          <div className="temp-bar-target" style={{ left: `${targetPct}%` }} />
        )}
      </div>
      {target !== null && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 3 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Tavoite: {target.toFixed(1)}°C
          </span>
        </div>
      )}
    </div>
  );
}

export function HeatpumpCard({ state, onOpenTrend }: HeatpumpCardProps) {
  const isOn = state['main/Heatpump_State']?.value === '1';
  const freq = numVal(state, 'main/Compressor_Freq');
  const inlet = numVal(state, 'main/Main_Inlet_Temp');
  const outlet = numVal(state, 'main/Main_Outlet_Temp');
  const target = numVal(state, 'main/Main_Target_Temp');
  const flow = numVal(state, 'main/Pump_Flow');
  const pumpSpeed = numVal(state, 'main/Pump_Speed');
  const highPress = numVal(state, 'main/High_Pressure');
  const lowPress = numVal(state, 'main/Low_Pressure');
  const defrost = state['main/Defrosting_State']?.value === '1';
  const opHours = numVal(state, 'main/Operations_Hours');
  const opCount = numVal(state, 'main/Operations_Counter');

  const operatingMode = numVal(state, 'main/Operating_Mode_State');
  const powerfulTime = numVal(state, 'main/Powerful_Mode_Time');
  const holidayOn = (numVal(state, 'main/Holiday_Mode_State') ?? 0) > 0;

  const { send, pending, error, success } = useCommand();
  const [showPowerConfirm, setShowPowerConfirm] = useState(false);

  return (
    <>
      <div className="card" style={{
        borderColor: isOn ? 'rgba(245,158,11,0.3)' : 'var(--border)',
        boxShadow: isOn ? 'var(--shadow-glow-heat)' : undefined,
      }}>
        <div className="card-header">
          <span className="card-icon">⚙️</span>
          <span className="card-title">Lämpöpumppu · WH-MXC12J9E8 T-CAP J</span>
          {defrost && (
            <span className="badge" style={{ marginLeft: 'auto', background: 'rgba(34,211,238,0.15)', color: 'var(--cool-primary)', border: '1px solid rgba(34,211,238,0.3)', fontSize: 10 }}>
              ❄️ Sulatus
            </span>
          )}
          <button
            className={`btn btn-sm ${isOn ? 'btn-primary' : 'btn-ghost'}`}
            style={{ marginLeft: defrost ? 4 : 'auto' }}
            onClick={() => setShowPowerConfirm(true)}
            disabled={pending}
            id="btn-heatpump-power"
            title="Kytke lämpöpumppu päälle tai pois"
          >
            {pending ? '…' : isOn ? '● Päällä' : '○ Pois'}
          </button>
        </div>
      <div className="card-body">
        {/* Compressor + Temps */}
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 20 }}>
          <CompressorRing freq={freq} isOn={isOn} onOpenTrend={onOpenTrend} />
          <TempFlow inlet={inlet} outlet={outlet} target={target} onOpenTrend={onOpenTrend} />
        </div>

        <div className="divider" />

        {/* Secondary metrics */}
        <div className="metrics-grid metrics-grid-3" style={{ marginTop: 16 }}>
          <div
            className="metric metric-sm metric-clickable"
            title="Klikkaa nähdäksesi virtausnopeuden trendi"
            onClick={() =>
              onOpenTrend?.({
                topic: 'main/Pump_Flow',
                label: 'Kiertovesipumpun virtausnopeus',
                unit: 'L/min',
                color: '#34d399',
                currentValue: flow,
              })
            }
          >
            <span className="metric-label">Virtaus ↗</span>
            <span className="metric-value">
              {flow !== null ? flow.toFixed(1) : '—'}
              <span className="metric-unit">L/min</span>
            </span>
          </div>
          <div
            className="metric metric-sm metric-clickable"
            title="Klikkaa nähdäksesi pumpun pyörimisnopeuden trendi"
            onClick={() =>
              onOpenTrend?.({
                topic: 'main/Pump_Speed',
                label: 'Pumpun pyörimisnopeus',
                unit: 'rpm',
                color: '#60a5fa',
                currentValue: pumpSpeed,
              })
            }
          >
            <span className="metric-label">Pumpun nopeus ↗</span>
            <span className="metric-value">
              {pumpSpeed !== null ? Math.round(pumpSpeed) : '—'}
              <span className="metric-unit">rpm</span>
            </span>
          </div>
          <div
            className="metric metric-sm metric-clickable"
            title="Klikkaa nähdäksesi korkeapaineen trendi"
            onClick={() =>
              onOpenTrend?.({
                topic: 'main/High_Pressure',
                label: 'Korkeapaine',
                unit: 'kg',
                color: '#f87171',
                currentValue: highPress,
              })
            }
          >
            <span className="metric-label">Korkeapaine ↗</span>
            <span className="metric-value">
              {highPress !== null ? highPress.toFixed(2) : '—'}
              <span className="metric-unit">kg</span>
            </span>
          </div>
        </div>

        <div className="metrics-grid metrics-grid-3" style={{ marginTop: 12 }}>
          <div className="metric metric-sm">
            <span className="metric-label">Matalapaine</span>
            <span className="metric-value">
              {lowPress !== null ? lowPress.toFixed(2) : '—'}
              <span className="metric-unit">kg</span>
            </span>
          </div>
          <div className="metric metric-sm">
            <span className="metric-label">Käyntiaika</span>
            <span className="metric-value">
              {opHours !== null ? Math.round(opHours) : '—'}
              <span className="metric-unit">h</span>
            </span>
          </div>
          <div className="metric metric-sm">
            <span className="metric-label">Käynnistykset</span>
            <span className="metric-value">
              {opCount !== null ? Math.round(opCount) : '—'}
            </span>
          </div>
        </div>

        <div className="divider" />

        {/* Controls */}
        <div className="section-label" style={{ marginBottom: 10 }}>Ohjaus</div>

        <SegmentedControl
          label="🔄 Toimintatila"
          options={OPERATING_MODES}
          value={operatingMode === null ? null : Math.round(operatingMode)}
          onSelect={(v) => send('commands/SetOperationMode', v,
            `Toimintatila: ${OPERATING_MODES.find((m) => m.value === v)?.label ?? v}`)}
          pending={pending}
          idPrefix="btn-mode"
        />

        <SegmentedControl
          label="⚡ Tehotila"
          options={POWERFUL_TIMES}
          value={powerfulTime === null ? null : Math.round(powerfulTime)}
          onSelect={(v) => send('commands/SetPowerfulMode', v,
            v === 0 ? 'Tehotila pois' : `Tehotila päällä ${v * 30} min`)}
          pending={pending}
          idPrefix="btn-powerful"
        />

        <ToggleRow
          label="🏖️ Lomatila"
          description="Poissaoloasetus — säästää energiaa"
          on={holidayOn}
          onToggle={() => send('commands/SetHolidayMode', holidayOn ? 0 : 1,
            holidayOn ? 'Lomatila pois' : 'Lomatila päällä')}
          pending={pending}
          idPrefix="btn-holiday"
          onLabel="● Päällä"
          offLabel="○ Pois"
        />

        {(error || success) && (
          <div className={`control-msg ${error ? 'error' : 'ok'}`}>
            {error ? `⚠ ${error}` : `✓ ${success}`}
          </div>
        )}
      </div>
    </div>

    <ConfirmModal
      isOpen={showPowerConfirm}
      title={isOn ? 'Sammutetaanko lämpöpumppu?' : 'Käynnistetäänkö lämpöpumppu?'}
      message={
        isOn
          ? 'Lämpöpumpun sammuttaminen pysäyttää kompressorin, kiertovesipumpun sekä käyttöveden ja tilojen lämmityksen. Haluatko varmasti sammuttaa lämpöpumpun?'
          : 'Lämpöpumppu kytketään päälle ja se aloittaa lämmityksen valitun käyttötilan mukaisesti. Haluatko käynnistää lämpöpumpun?'
      }
      confirmLabel={isOn ? 'Kyllä, sammuta' : 'Kyllä, käynnistä'}
      cancelLabel="Peruuta"
      danger={isOn}
      pending={pending}
      onCancel={() => setShowPowerConfirm(false)}
      onConfirm={async () => {
        const ok = await send(
          'commands/SetHeatpump',
          isOn ? 0 : 1,
          isOn ? 'Lämpöpumppu sammutettu' : 'Lämpöpumppu käynnistetty'
        );
        if (ok) setShowPowerConfirm(false);
      }}
    />
  </>
  );
}

