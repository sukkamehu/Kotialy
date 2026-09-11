import type { ZigbeeRegistry, ZigbeeDeviceInfo } from '../types/zigbee';
import {
  getNumProp, getBoolProp, getProp,
  batteryColor, batteryIcon, signalBars, timeAgo
} from '../types/zigbee';

interface ZigbeePanelProps {
  devices: ZigbeeRegistry;
  connected: boolean;
}

// ─── Sub-components per sensor type ──────────────────────────────────────────

function BatteryBadge({ device }: { device: ZigbeeDeviceInfo }) {
  const batt = getNumProp(device, 'battery');
  if (batt === null) return null;
  const color = batteryColor(batt);
  return (
    <span style={{ fontSize: 11, color, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
      {batteryIcon(batt)} {batt.toFixed(0)}%
    </span>
  );
}

function SignalBadge({ device }: { device: ZigbeeDeviceInfo }) {
  const lq = getNumProp(device, 'linkquality');
  return (
    <span style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 1 }}>
      {signalBars(lq)}
    </span>
  );
}

function OnlineDot({ online }: { online: boolean | null }) {
  if (online === null) return null;
  return (
    <div className={`status-dot ${online ? 'online' : 'offline'}`}
      style={{ width: 6, height: 6, flexShrink: 0 }} />
  );
}

function DeviceCardShell({ device, accentColor, children, alert }: {
  device: ZigbeeDeviceInfo;
  accentColor: string;
  children: React.ReactNode;
  alert?: boolean;
}) {
  const updatedAt = Object.values(device.properties ?? {}).reduce(
    (max, p) => Math.max(max, p.updated_at || 0), 0
  );

  return (
    <div style={{
      background: alert ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${alert ? 'rgba(239,68,68,0.4)' : accentColor + '30'}`,
      borderRadius: 14,
      padding: '14px 16px',
      transition: 'all 0.3s',
      boxShadow: alert ? '0 0 20px rgba(239,68,68,0.15)' : undefined,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Accent glow line at top */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: 2, background: alert ? '#ef4444' : accentColor, opacity: 0.6,
        borderRadius: '14px 14px 0 0',
      }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <OnlineDot online={device.online} />
        <span style={{
          fontSize: 12, fontWeight: 600,
          color: device.online === false ? 'var(--text-muted)' : 'var(--text-secondary)',
          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {device.friendlyName}
        </span>
        <SignalBadge device={device} />
        <BatteryBadge device={device} />
      </div>

      {/* Content */}
      {children}

      {/* Last seen */}
      {updatedAt > 0 && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, textAlign: 'right' }}>
          {timeAgo(updatedAt)}
        </div>
      )}
    </div>
  );
}

// ─── Climate (Temperature + Humidity) ────────────────────────────────────────
function ClimateCard({ device }: { device: ZigbeeDeviceInfo }) {
  const temp = getNumProp(device, 'temperature');
  const hum  = getNumProp(device, 'humidity');
  const pres = getNumProp(device, 'pressure');

  const tempColor = temp === null ? 'var(--text-muted)'
    : temp < 10 ? '#38bdf8' : temp < 18 ? '#22d3ee'
    : temp < 24 ? '#34d399' : temp < 28 ? '#f59e0b' : '#f87171';

  return (
    <DeviceCardShell device={device} accentColor="#22d3ee">
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 700, color: tempColor, lineHeight: 1 }}>
            {temp !== null ? temp.toFixed(1) : '—'}
            <span style={{ fontSize: 14, color: 'var(--text-secondary)', marginLeft: 2 }}>°C</span>
          </div>
          {hum !== null && (
            <div style={{ fontSize: 12, color: '#38bdf8', marginTop: 4 }}>
              💧 {hum.toFixed(0)}%
            </div>
          )}
        </div>
        {pres !== null && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {pres.toFixed(0)} hPa
          </div>
        )}
      </div>
    </DeviceCardShell>
  );
}

// ─── Contact (Door/Window) ────────────────────────────────────────────────────
function ContactCard({ device }: { device: ZigbeeDeviceInfo }) {
  const contact = getBoolProp(device, 'contact');
  // contact=true means CLOSED (sensor magnets touching), contact=false means OPEN
  const isOpen = contact === false;
  const tamper = getBoolProp(device, 'tamper');

  return (
    <DeviceCardShell device={device} accentColor={isOpen ? '#ef4444' : '#22c55e'} alert={isOpen}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 28 }}>{isOpen ? '🚪' : '🔒'}</span>
        <div>
          <div style={{
            fontSize: 18, fontWeight: 700,
            color: isOpen ? '#ef4444' : '#22c55e',
          }}>
            {contact === null ? '—' : isOpen ? 'AUKI' : 'Suljettu'}
          </div>
          {tamper && (
            <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 2 }}>⚠ Peukaloitu</div>
          )}
        </div>
      </div>
    </DeviceCardShell>
  );
}

// ─── Thermostat / TRV ─────────────────────────────────────────────────────────
function ThermostatCard({ device }: { device: ZigbeeDeviceInfo }) {
  const localTemp  = getNumProp(device, 'local_temperature');
  const setpoint   = getNumProp(device, 'current_heating_setpoint');
  const heatDemand = getNumProp(device, 'pi_heating_demand');
  const systemMode = getProp(device, 'system_mode');

  const isHeating = heatDemand !== null && heatDemand > 0;

  return (
    <DeviceCardShell device={device} accentColor={isHeating ? '#f59e0b' : '#a78bfa'}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700, color: isHeating ? '#f59e0b' : 'var(--text-primary)', lineHeight: 1 }}>
            {localTemp !== null ? localTemp.toFixed(1) : '—'}
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', marginLeft: 2 }}>°C</span>
          </div>
          {setpoint !== null && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
              → {setpoint.toFixed(1)}°C tavoite
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          {heatDemand !== null && (
            <div style={{ fontSize: 14, fontWeight: 600, color: isHeating ? '#f59e0b' : 'var(--text-muted)' }}>
              {isHeating ? `🔥 ${heatDemand.toFixed(0)}%` : '○ Lepotilassa'}
            </div>
          )}
          {systemMode && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
              {systemMode}
            </div>
          )}
        </div>
      </div>
      {/* Heating demand bar */}
      {heatDemand !== null && (
        <div style={{ marginTop: 10, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 100, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${heatDemand}%`,
            background: 'linear-gradient(90deg, #a78bfa, #f59e0b)',
            transition: 'width 1s ease',
          }} />
        </div>
      )}
    </DeviceCardShell>
  );
}

// ─── Water Leak ────────────────────────────────────────────────────────────────
function WaterLeakCard({ device }: { device: ZigbeeDeviceInfo }) {
  const leak = getBoolProp(device, 'water_leak');

  return (
    <DeviceCardShell device={device} accentColor={leak ? '#ef4444' : '#22d3ee'} alert={leak === true}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 28 }}>{leak ? '🚨' : '💧'}</span>
        <div style={{
          fontSize: 18, fontWeight: 700,
          color: leak ? '#ef4444' : '#22c55e',
        }}>
          {leak === null ? 'Ei tietoa' : leak ? 'VUOTO HAVAITTU!' : 'Kuiva — OK'}
        </div>
      </div>
    </DeviceCardShell>
  );
}

// ─── Generic fallback ──────────────────────────────────────────────────────────
function GenericCard({ device }: { device: ZigbeeDeviceInfo }) {
  const props = Object.entries(device.properties ?? {})
    .filter(([k]) => !['battery', 'linkquality', '_availability', 'voltage'].includes(k))
    .slice(0, 4);

  return (
    <DeviceCardShell device={device} accentColor="rgba(255,255,255,0.2)">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {props.map(([key, data]) => (
          <div key={key}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {key.replace(/_/g, ' ')}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{data.value}</div>
          </div>
        ))}
        {props.length === 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Ei ominaisuustietoja</span>
        )}
      </div>
    </DeviceCardShell>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

function renderDevice(device: ZigbeeDeviceInfo) {
  switch (device.type) {
    case 'climate':    return <ClimateCard key={device.friendlyName} device={device} />;
    case 'contact':    return <ContactCard key={device.friendlyName} device={device} />;
    case 'thermostat': return <ThermostatCard key={device.friendlyName} device={device} />;
    case 'water_leak': return <WaterLeakCard key={device.friendlyName} device={device} />;
    default:           return <GenericCard key={device.friendlyName} device={device} />;
  }
}

export function ZigbeePanel({ devices, connected }: ZigbeePanelProps) {
  const deviceList = Object.values(devices);
  const hasDevices = deviceList.length > 0;

  // Group by type for rendering order
  const waterLeaks   = deviceList.filter(d => d.type === 'water_leak');
  const contacts     = deviceList.filter(d => d.type === 'contact');
  const climates     = deviceList.filter(d => d.type === 'climate');
  const thermostats  = deviceList.filter(d => d.type === 'thermostat');
  const others       = deviceList.filter(d => !['water_leak','contact','climate','thermostat'].includes(d.type));

  // Alerts: any water leak detected or door open
  const hasAlert = waterLeaks.some(d => getBoolProp(d, 'water_leak') === true)
    || contacts.some(d => getBoolProp(d, 'contact') === false);

  return (
    <div>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{
          height: 1, flex: 1,
          background: 'linear-gradient(90deg, rgba(255,255,255,0.15), transparent)',
        }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>📡</span>
          <span style={{
            fontSize: 13, fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: 'var(--text-secondary)',
          }}>
            Zigbee-anturit
          </span>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '2px 10px', borderRadius: 100,
            background: connected ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${connected ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
          }}>
            <div className={`status-dot ${connected ? 'online' : 'offline'}`}
              style={{ width: 6, height: 6 }} />
            <span style={{
              fontSize: 11, fontWeight: 600,
              color: connected ? 'var(--online)' : 'var(--offline)',
            }}>
              {connected ? `${deviceList.length} laitetta` : 'Ei yhteyttä'}
            </span>
          </div>
          {hasAlert && (
            <div style={{
              padding: '2px 10px', borderRadius: 100,
              background: 'rgba(239,68,68,0.15)',
              border: '1px solid rgba(239,68,68,0.4)',
              fontSize: 11, fontWeight: 700, color: '#ef4444',
              animation: 'pulse-amber 1.5s infinite',
            }}>
              ⚠ HÄLYTYS
            </div>
          )}
        </div>
        <div style={{
          height: 1, flex: 1,
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15))',
        }} />
      </div>

      {/* Not connected / no devices */}
      {!hasDevices && (
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📡</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
            {connected ? 'Ei vielä löydettyjä Zigbee-laitteita' : 'Yhdistetään Zigbee-yhdyskäytävään...'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Odotetaan MQTT-viestejä osoitteesta 192.168.68.51 · Aihe: zigbee2mqtt/#
          </div>
        </div>
      )}

      {/* Water leak alerts first */}
      {waterLeaks.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            💧 Vesivuotoanturit
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {waterLeaks.map(renderDevice)}
          </div>
        </div>
      )}

      {/* Contact sensors */}
      {contacts.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            🚪 Ovi- ja ikkuna-anturit
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {contacts.map(renderDevice)}
          </div>
        </div>
      )}

      {/* Climate sensors */}
      {climates.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            🌡️ Lämpötila ja kosteus
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {climates.map(renderDevice)}
          </div>
        </div>
      )}

      {/* Thermostats / TRVs */}
      {thermostats.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            🏠 Termostaatit ja patterit
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {thermostats.map(renderDevice)}
          </div>
        </div>
      )}

      {/* Other devices */}
      {others.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            📦 Muut laitteet
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {others.map(renderDevice)}
          </div>
        </div>
      )}
    </div>
  );
}
