import type { HeishamonState, MqttStatus } from '../types/heishamon';
import type { ZigbeeRegistry } from '../types/zigbee';
import { StatusBar } from './StatusBar';
import { HeatpumpCard } from './HeatpumpCard';
import { DHWCard } from './DHWCard';
import { BufferTankCard } from './BufferTankCard';
import { PowerCard } from './PowerCard';
import { OutdoorCard } from './OutdoorCard';
import { ThreeWayValveCard } from './ThreeWayValveCard';
import { HistoryChart } from './HistoryChart';
import { ZigbeePanel } from './ZigbeePanel';
import { NordpoolPanel } from './NordpoolPanel';
import { WeatherPanel } from './WeatherPanel';

interface DashboardProps {
  state: HeishamonState;
  mqtt: MqttStatus;
  heishamonOnline: boolean | null;
  wsConnected: boolean;
  lastUpdate: number | null;
  zigbeeDevices: ZigbeeRegistry;
  zigbeeConnected: boolean;
}

export function Dashboard({ state, mqtt, heishamonOnline, wsConnected, lastUpdate, zigbeeDevices, zigbeeConnected }: DashboardProps) {
  const hasAnyData = Object.keys(state).length > 0;

  return (
    <div className="app-bg" style={{ minHeight: '100vh' }}>
      <StatusBar
        state={state}
        mqtt={mqtt}
        heishamonOnline={heishamonOnline}
        wsConnected={wsConnected}
        lastUpdate={lastUpdate}
      />

      <main style={{ maxWidth: 1600, margin: '0 auto', padding: '24px 24px 48px' }}>
        {/* Waiting for data */}
        {!hasAnyData && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            minHeight: 300, gap: 16, marginBottom: 32,
          }}>
            <div style={{ fontSize: 48 }}>🌡️</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-secondary)' }}>
              Connecting to Heishamon...
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
              Waiting for MQTT data from the Kotiäly broker
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: wsConnected ? 'var(--online)' : 'var(--offline)', boxShadow: wsConnected ? '0 0 8px var(--online)' : undefined }} />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  WebSocket: {wsConnected ? 'Connected' : 'Connecting...'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: zigbeeConnected ? 'var(--online)' : 'var(--offline)', boxShadow: zigbeeConnected ? '0 0 8px var(--online)' : undefined }} />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Zigbee: {zigbeeConnected ? 'Connected' : 'Connecting...'}
                </span>
              </div>
            </div>
          </div>
        )}
        {/* Always show Zigbee panel if we have any devices */}
        {!hasAnyData && Object.keys(zigbeeDevices).length > 0 && (
          <ZigbeePanel devices={zigbeeDevices} connected={zigbeeConnected} />
        )}


        {hasAnyData && (
          <>
            {/* Row 1: Main monitoring cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: 20,
              marginBottom: 20,
            }}>
              <HeatpumpCard state={state} />
              <DHWCard state={state} />
              <BufferTankCard state={state} />
              <PowerCard state={state} />
            </div>

            {/* Row 2: Outdoor + Valve — each card carries its own controls */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 20,
              marginBottom: 20,
            }}>
              <OutdoorCard state={state} />
              <ThreeWayValveCard state={state} />
            </div>

            {/* Row 3: History chart (full width) */}
            <HistoryChart />

            {/* Row 4: Electricity price + Weather */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 16, marginTop: 24 }}>
              <NordpoolPanel />
              <WeatherPanel />
            </div>

            {/* Row 5: Zigbee Sensors */}
            <div style={{ marginTop: 24 }}>
              <ZigbeePanel devices={zigbeeDevices} connected={zigbeeConnected} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
