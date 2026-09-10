import { useState } from 'react';
import type { HeishamonState } from '../types/heishamon';
import { numVal } from '../types/heishamon';

interface ControlPanelProps {
  state: HeishamonState;
}

async function sendCommand(setTopic: string, value: number) {
  const res = await fetch('/api/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ setTopic, value }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `Command failed (${res.status})`);
  }
}

export function ControlPanel({ state }: ControlPanelProps) {
  const quietLevel = numVal(state, 'main/Quiet_Mode_Level') ?? 0;
  const powerfulTime = numVal(state, 'main/Powerful_Mode_Time') ?? 0;
  const forceDHW = state['main/Force_DHW_State']?.value === '1';
  const holidayMode = numVal(state, 'main/Holiday_Mode_State') ?? 0;
  const internalHeater = state['main/Internal_Heater_State']?.value === '1';
  const externalHeater = state['main/External_Heater_State']?.value === '1';

  const [quietLoading, setQuietLoading] = useState(false);
  const [powerfulLoading, setPowerfulLoading] = useState(false);
  const [dhwLoading, setDhwLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  function showFeedback(msg: string) {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 2500);
  }

  async function setQuiet(level: number) {
    setQuietLoading(true);
    try {
      await sendCommand('commands/SetQuietMode', level);
      showFeedback(`Quiet mode set to ${level === 0 ? 'Off' : `Level ${level}`}`);
    } catch (err) { showFeedback(err instanceof Error ? err.message : 'Command failed'); }
    finally { setQuietLoading(false); }
  }

  async function setPowerful(time: number) {
    setPowerfulLoading(true);
    try {
      await sendCommand('commands/SetPowerfulMode', time);
      showFeedback(time === 0 ? 'Powerful mode off' : `Powerful mode: ${time * 30}min`);
    } catch (err) { showFeedback(err instanceof Error ? err.message : 'Command failed'); }
    finally { setPowerfulLoading(false); }
  }

  async function toggleForceDHW() {
    setDhwLoading(true);
    try {
      await sendCommand('commands/SetForceDHW', forceDHW ? 0 : 1);
      showFeedback(forceDHW ? 'DHW boost stopped' : 'DHW boost started');
    } catch (err) { showFeedback(err instanceof Error ? err.message : 'Command failed'); }
    finally { setTimeout(() => setDhwLoading(false), 1000); }
  }

  const heatpumpOn = state['main/Heatpump_State']?.value === '1';
  const [heatpumpLoading, setHeatpumpLoading] = useState(false);

  async function toggleHeatpump() {
    setHeatpumpLoading(true);
    try {
      await sendCommand('commands/SetHeatpump', heatpumpOn ? 0 : 1);
      showFeedback(heatpumpOn ? 'Heat pump turned off' : 'Heat pump turned on');
    } catch (err) { showFeedback(err instanceof Error ? err.message : 'Command failed'); }
    finally { setHeatpumpLoading(false); }
  }

  const operatingMode = numVal(state, 'main/Operating_Mode_State') ?? 0;
  const [modeLoading, setModeLoading] = useState(false);
  const modeLabels = ['Heat', 'Cool', 'Auto', 'DHW', 'Heat+DHW', 'Cool+DHW', 'Auto+DHW'];

  async function setMode(mode: number) {
    setModeLoading(true);
    try {
      await sendCommand('commands/SetOperationMode', mode);
      showFeedback(`Operating mode set to ${modeLabels[mode] ?? `Mode ${mode}`}`);
    } catch (err) { showFeedback(err instanceof Error ? err.message : 'Command failed'); }
    finally { setModeLoading(false); }
  }

  const holidayModeVal = numVal(state, 'main/Holiday_Mode_State') ?? 0;
  const [holidayLoading, setHolidayLoading] = useState(false);

  async function toggleHoliday() {
    setHolidayLoading(true);
    try {
      await sendCommand('commands/SetHolidayMode', holidayModeVal > 0 ? 0 : 1);
      showFeedback(holidayModeVal > 0 ? 'Holiday mode off' : 'Holiday mode on');
    } catch (err) { showFeedback(err instanceof Error ? err.message : 'Command failed'); }
    finally { setHolidayLoading(false); }
  }

  const forceHeater = state['main/Force_Heater_State']?.value === '1';
  const [heaterLoading, setHeaterLoading] = useState(false);

  async function toggleHeater() {
    setHeaterLoading(true);
    try {
      await sendCommand('commands/SetForceHeater', forceHeater ? 0 : 1);
      showFeedback(forceHeater ? 'Force heater off' : 'Force heater on');
    } catch (err) { showFeedback(err instanceof Error ? err.message : 'Command failed'); }
    finally { setHeaterLoading(false); }
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-icon">🎛️</span>
        <span className="card-title">Controls</span>
        {feedback && (
          <div style={{
            marginLeft: 'auto',
            fontSize: 12,
            color: 'var(--dhw-primary)',
            background: 'var(--dhw-glow)',
            padding: '2px 10px',
            borderRadius: 100,
            border: '1px solid rgba(16,185,129,0.3)',
          }}>
            ✓ {feedback}
          </div>
        )}
      </div>
      <div className="card-body">
        {/* Quiet Mode */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
              🤫 Quiet Mode
            </span>
            {quietLoading && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sending...</span>}
          </div>
          <div className="toggle-group">
            {['Off', 'L1', 'L2', 'L3'].map((label, i) => (
              <button
                key={i}
                className={`toggle-btn ${Math.round(quietLevel) === i ? 'active' : ''}`}
                onClick={() => setQuiet(i)}
                disabled={quietLoading}
                id={`btn-quiet-${i}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Powerful Mode */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
              ⚡ Powerful Mode
            </span>
            {powerfulLoading && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sending...</span>}
          </div>
          <div className="toggle-group">
            {['Off', '30m', '60m', '90m'].map((label, i) => (
              <button
                key={i}
                className={`toggle-btn ${Math.round(powerfulTime) === i ? 'active' : ''}`}
                onClick={() => setPowerful(i)}
                disabled={powerfulLoading}
                id={`btn-powerful-${i}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Force DHW */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 2 }}>
                🚿 Force DHW Boost
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Prioritize hot water heating
              </div>
            </div>
            <button
              className={`btn btn-sm ${forceDHW ? 'btn-primary' : 'btn-ghost'}`}
              onClick={toggleForceDHW}
              disabled={dhwLoading}
              id="btn-control-force-dhw"
            >
              {dhwLoading ? '...' : forceDHW ? '● Active' : '○ Off'}
            </button>
          </div>
        </div>

        {/* Heat Pump On/Off */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 2 }}>
                🔛 Heat Pump Power
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Turn the heat pump on or off
              </div>
            </div>
            <button
              className={`btn btn-sm ${heatpumpOn ? 'btn-primary' : 'btn-ghost'}`}
              onClick={toggleHeatpump}
              disabled={heatpumpLoading}
              id="btn-control-heatpump"
            >
              {heatpumpLoading ? '...' : heatpumpOn ? '● On' : '○ Off'}
            </button>
          </div>
        </div>

        {/* Operating Mode */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
              🔄 Operating Mode
            </span>
            {modeLoading && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sending...</span>}
          </div>
          <div className="toggle-group">
            {modeLabels.map((label, i) => (
              <button
                key={i}
                className={`toggle-btn ${Math.round(operatingMode) === i ? 'active' : ''}`}
                onClick={() => setMode(i)}
                disabled={modeLoading}
                id={`btn-mode-${i}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Holiday Mode */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 2 }}>
                🏖️ Holiday Mode
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Enable holiday mode
              </div>
            </div>
            <button
              className={`btn btn-sm ${holidayModeVal > 0 ? 'btn-primary' : 'btn-ghost'}`}
              onClick={toggleHoliday}
              disabled={holidayLoading}
              id="btn-control-holiday"
            >
              {holidayLoading ? '...' : holidayModeVal > 0 ? '● On' : '○ Off'}
            </button>
          </div>
        </div>

        {/* Force Heater */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 2 }}>
                🔥 Force Heater
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Emergency heater control
              </div>
            </div>
            <button
              className={`btn btn-sm ${forceHeater ? 'btn-primary' : 'btn-ghost'}`}
              onClick={toggleHeater}
              disabled={heaterLoading}
              id="btn-control-heater"
            >
              {heaterLoading ? '...' : forceHeater ? '● Active' : '○ Off'}
            </button>
          </div>
        </div>

        <div className="divider" />

        {/* Status info */}
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            System Status
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--text-muted)' }}>Internal heater</span>
              <span style={{ color: internalHeater ? 'var(--warning)' : 'var(--text-muted)', fontWeight: internalHeater ? 600 : 400 }}>
                {internalHeater ? '● Active' : '○ Inactive'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--text-muted)' }}>External heater</span>
              <span style={{ color: externalHeater ? 'var(--warning)' : 'var(--text-muted)', fontWeight: externalHeater ? 600 : 400 }}>
                {externalHeater ? '● Active' : '○ Inactive'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--text-muted)' }}>Holiday mode</span>
              <span style={{ color: holidayMode > 0 ? 'var(--cool-primary)' : 'var(--text-muted)' }}>
                {holidayMode === 0 ? '○ Off' : holidayMode === 1 ? '○ Scheduled' : '● Active'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
