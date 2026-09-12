import { useState } from 'react';
import type { HeishamonState, MqttStatus } from '../types/heishamon';
import type { ZigbeeRegistry } from '../types/zigbee';
import { StatusBar } from './StatusBar';
import { HeatpumpCard } from './HeatpumpCard';
import { DHWCard } from './DHWCard';
import { BufferTankCard } from './BufferTankCard';
import { OutdoorCard } from './OutdoorCard';
import { ThreeWayValveCard } from './ThreeWayValveCard';
import { EnergyStatsCard } from './EnergyStatsCard';
import { DailyCostsCard } from './DailyCostsCard';
import { HistoryChart } from './HistoryChart';
import { ZigbeePanel } from './ZigbeePanel';
import { NordpoolPanel } from './NordpoolPanel';
import { WeatherPanel } from './WeatherPanel';
import { VariableTrendModal, type TrendTopicTarget } from './VariableTrendModal';

interface DashboardProps {
  state: HeishamonState;
  mqtt: MqttStatus;
  heishamonOnline: boolean | null;
  wsConnected: boolean;
  lastUpdate: number | null;
  zigbeeDevices: ZigbeeRegistry;
  zigbeeConnected: boolean;
  isLocal?: boolean;
  authenticated?: boolean;
  username?: string | null;
  role?: 'admin' | 'viewer';
  onLogout?: () => void;
}

export function Dashboard({
  state,
  mqtt,
  heishamonOnline,
  wsConnected,
  lastUpdate,
  zigbeeDevices,
  zigbeeConnected,
  isLocal,
  authenticated,
  username,
  role,
  onLogout,
}: DashboardProps) {
  const hasAnyData = Object.keys(state).length > 0;
  const [trendTarget, setTrendTarget] = useState<TrendTopicTarget | null>(null);
  const readOnly = role === 'viewer';

  return (
    <div className="app-bg" style={{ minHeight: '100vh' }}>
      <StatusBar
        state={state}
        mqtt={mqtt}
        heishamonOnline={heishamonOnline}
        wsConnected={wsConnected}
        lastUpdate={lastUpdate}
        isLocal={isLocal}
        authenticated={authenticated}
        username={username}
        role={role}
        onLogout={onLogout}
      />

      <main className="dashboard-main">
        {/* Waiting for data */}
        {!hasAnyData && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            minHeight: 300, gap: 16, marginBottom: 32,
          }}>
            <div style={{ fontSize: 48 }}>🌡️</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-secondary)' }}>
              Yhdistetään Heishamoniin...
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-muted)', textAlign: 'center' }}>
              Odotetaan MQTT-tietoja Kotiäly-välittäjältä
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: wsConnected ? 'var(--online)' : 'var(--offline)', boxShadow: wsConnected ? '0 0 8px var(--online)' : undefined }} />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  WebSocket: {wsConnected ? 'Yhdistetty' : 'Yhdistetään...'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: zigbeeConnected ? 'var(--online)' : 'var(--offline)', boxShadow: zigbeeConnected ? '0 0 8px var(--online)' : undefined }} />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Zigbee: {zigbeeConnected ? 'Yhdistetty' : 'Yhdistetään...'}
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
            <div className="dashboard-grid dashboard-grid-main">
              <HeatpumpCard state={state} onOpenTrend={setTrendTarget} readOnly={readOnly} />
              <DHWCard state={state} onOpenTrend={setTrendTarget} readOnly={readOnly} />
              <BufferTankCard state={state} onOpenTrend={setTrendTarget} readOnly={readOnly} />
            </div>

            {/* Row 2: Outdoor + Valve — each card carries its own controls */}
            <div className="dashboard-grid dashboard-grid-sub">
              <OutdoorCard state={state} onOpenTrend={setTrendTarget} readOnly={readOnly} />
              <ThreeWayValveCard state={state} onOpenTrend={setTrendTarget} readOnly={readOnly} />
            </div>

            {/* Row 3: Daily Energy Costs & Savings */}
            <div style={{ marginBottom: 20 }}>
              <DailyCostsCard readOnly={readOnly} />
            </div>

            {/* Row 4: Energy & Lifecycle Analytics */}
            <div style={{ marginBottom: 20 }}>
              <EnergyStatsCard state={state} onOpenTrend={setTrendTarget} />
            </div>

            {/* Row 5: History chart (full width) */}
            <HistoryChart />

            {/* Row 4: Electricity price + Weather */}
            <div className="dashboard-grid dashboard-grid-sub" style={{ marginTop: 24 }}>
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

      {/* Quick Variable Daily Trend Modal */}
      <VariableTrendModal target={trendTarget} onClose={() => setTrendTarget(null)} />
    </div>
  );
}

