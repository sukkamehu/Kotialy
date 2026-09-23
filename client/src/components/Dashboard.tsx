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
import { HerrforsAnalyticsCard } from './HerrforsAnalyticsCard';
import { UnifiedForecastCard } from './UnifiedForecastCard';
import { HistoryChart } from './HistoryChart';
import { ZigbeePanel } from './ZigbeePanel';
import { CameraCard } from './CameraCard';
import { VariableTrendModal, type TrendTopicTarget } from './VariableTrendModal';
import { OutdoorWeatherModal } from './OutdoorWeatherModal';
import { PanasonicSettingsCard } from './PanasonicSettingsCard';
import { ApcStrategyPage } from './ApcStrategyPage';
import { TapoPlugsCard } from './TapoPlugsCard';
import { HydraulicDiagramPage } from './HydraulicDiagramPage';
import { SaunaCard } from './SaunaCard';
import { SmartLifePanel } from './SmartLifePanel';
import { PullToRefresh } from './PullToRefresh';
import { ErrorBoundary } from './ErrorBoundary';

interface DashboardProps {
  state: HeishamonState;
  mqtt: MqttStatus;
  heishamonOnline: boolean | null;
  wsConnected: boolean;
  lastUpdate: number | null;
  zigbeeDevices: ZigbeeRegistry;
  zigbeeConnected: boolean;
  refresh?: () => Promise<void> | void;
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
  refresh,
  isLocal,
  authenticated,
  username,
  role,
  onLogout,
}: DashboardProps) {
  const hasAnyData = Object.keys(state).length > 0;
  const [activeTab, setActiveTab] = useState<'dashboard' | 'herrfors' | 'apc_strategy' | 'history' | 'smartlife' | 'hydraulics' | 'heatpump_guide'>('dashboard');
  const [trendTarget, setTrendTarget] = useState<TrendTopicTarget | null>(null);
  const [outdoorModalOpen, setOutdoorModalOpen] = useState(false);
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
        onOpenOutdoorModal={() => setOutdoorModalOpen(true)}
      />

      <PullToRefresh onRefresh={refresh || (() => window.location.reload())}>
        <main className="dashboard-main">
          {/* Top navigation tabs */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            paddingBottom: 12,
            gap: 12,
            flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setActiveTab('dashboard')}
                style={{
                  padding: '8px 16px',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  border: activeTab === 'dashboard' ? '1px solid var(--accent-primary, #3b82f6)' : '1px solid rgba(255,255,255,0.08)',
                  background: activeTab === 'dashboard' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.03)',
                  color: activeTab === 'dashboard' ? '#60a5fa' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease',
                }}
              >
                <span>📊</span> Kojelauta
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('smartlife')}
                style={{
                  padding: '8px 16px',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  border: activeTab === 'smartlife' ? '1px solid #f59e0b' : '1px solid rgba(255,255,255,0.08)',
                  background: activeTab === 'smartlife' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.03)',
                  color: activeTab === 'smartlife' ? '#fbbf24' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease',
                }}
              >
                <span>🧖‍♂️</span> Sauna & SmartLife
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('herrfors')}
                style={{
                  padding: '8px 16px',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  border: activeTab === 'herrfors' ? '1px solid #a855f7' : '1px solid rgba(255,255,255,0.08)',
                  background: activeTab === 'herrfors' ? 'rgba(168, 85, 247, 0.2)' : 'rgba(255,255,255,0.03)',
                  color: activeTab === 'herrfors' ? '#c084fc' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease',
                }}
              >
                <span>🔌</span> Sähkönkulutus
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('apc_strategy')}
                style={{
                  padding: '8px 16px',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  border: activeTab === 'apc_strategy' ? '1px solid #f59e0b' : '1px solid rgba(255,255,255,0.08)',
                  background: activeTab === 'apc_strategy' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.03)',
                  color: activeTab === 'apc_strategy' ? '#fbbf24' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease',
                }}
              >
                <span>⚡</span> APC-automaatio
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('history')}
                style={{
                  padding: '8px 16px',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  border: activeTab === 'history' ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.08)',
                  background: activeTab === 'history' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.03)',
                  color: activeTab === 'history' ? '#38bdf8' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease',
                }}
              >
                <span>📈</span> Historia & Trendit
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('hydraulics')}
                style={{
                  padding: '8px 16px',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  border: activeTab === 'hydraulics' ? '1px solid #06b6d4' : '1px solid rgba(255,255,255,0.08)',
                  background: activeTab === 'hydraulics' ? 'rgba(6, 182, 212, 0.2)' : 'rgba(255,255,255,0.03)',
                  color: activeTab === 'hydraulics' ? '#22d3ee' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease',
                }}
              >
                <span>🛠️</span> Tekninen tila
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('heatpump_guide')}
                style={{
                  padding: '8px 16px',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  border: activeTab === 'heatpump_guide' ? '1px solid #10b981' : '1px solid rgba(255,255,255,0.08)',
                  background: activeTab === 'heatpump_guide' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.03)',
                  color: activeTab === 'heatpump_guide' ? '#6ee7b7' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease',
                }}
              >
                <span>⚙️</span> Asetusmuistio
              </button>
            </div>
          </div>

          {/* TAB 1: Sähkönkulutus (Herrfors + Daily costs) */}
          {activeTab === 'herrfors' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 32 }}>
              <ErrorBoundary>
                <HerrforsAnalyticsCard readOnly={readOnly} />
              </ErrorBoundary>
              <ErrorBoundary>
                <DailyCostsCard readOnly={readOnly} />
              </ErrorBoundary>
            </div>
          )}

          {/* TAB 2: APC Automaatiostrategia & Ohjain */}
          {activeTab === 'apc_strategy' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 32 }}>
              <ErrorBoundary>
                <ApcStrategyPage readOnly={readOnly} />
              </ErrorBoundary>
            </div>
          )}

          {/* TAB 3: Historia & Trendit & Sensorit */}
          {activeTab === 'history' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 32 }}>
              <ErrorBoundary>
                <HistoryChart />
              </ErrorBoundary>
              <ErrorBoundary>
                <EnergyStatsCard state={state} onOpenTrend={setTrendTarget} />
              </ErrorBoundary>
              <ErrorBoundary>
                <ZigbeePanel devices={zigbeeDevices} connected={zigbeeConnected} />
              </ErrorBoundary>
            </div>
          )}

          {/* TAB 4: Smart Life & Sauna */}
          {activeTab === 'smartlife' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 32 }}>
              <ErrorBoundary>
                <SaunaCard readOnly={readOnly} />
              </ErrorBoundary>
              <ErrorBoundary>
                <SmartLifePanel />
              </ErrorBoundary>
            </div>
          )}

          {/* TAB 5: Hydraulikaavio */}
          {activeTab === 'hydraulics' && (
            <div style={{ marginBottom: 32 }}>
              <ErrorBoundary>
                <HydraulicDiagramPage state={state} readOnly={readOnly} />
              </ErrorBoundary>
            </div>
          )}

          {/* TAB 6: Lämpöpumpun asetusmuistio */}
          {activeTab === 'heatpump_guide' && (
            <div style={{ marginBottom: 32 }}>
              <ErrorBoundary>
                <PanasonicSettingsCard />
              </ErrorBoundary>
            </div>
          )}

          {/* MAIN TAB: Kojelauta (Reaaliaikainen tila + APC-tilanne + Yhdistetty Sähkö & Sää) */}
          {activeTab === 'dashboard' && (
            <>
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

              {hasAnyData && (
                <>
                  {/* Row 1: Primary heat pump & tank status cards */}
                  <div className="dashboard-grid dashboard-grid-main">
                    <ErrorBoundary>
                      <HeatpumpCard state={state} onOpenTrend={setTrendTarget} readOnly={readOnly} />
                    </ErrorBoundary>
                    <ErrorBoundary>
                      <DHWCard state={state} onOpenTrend={setTrendTarget} readOnly={readOnly} />
                    </ErrorBoundary>
                    <ErrorBoundary>
                      <BufferTankCard state={state} onOpenTrend={setTrendTarget} readOnly={readOnly} />
                    </ErrorBoundary>
                  </div>

                  {/* Row 2: Outdoor + Valve + Camera */}
                  <div className="dashboard-grid dashboard-grid-sub">
                    <ErrorBoundary>
                      <OutdoorCard
                        state={state}
                        onOpenTrend={setTrendTarget}
                        onOpenOutdoorWeather={() => setOutdoorModalOpen(true)}
                        readOnly={readOnly}
                      />
                    </ErrorBoundary>
                    <ErrorBoundary>
                      <ThreeWayValveCard state={state} onOpenTrend={setTrendTarget} readOnly={readOnly} />
                    </ErrorBoundary>
                    <ErrorBoundary>
                      <CameraCard />
                    </ErrorBoundary>
                  </div>

                  {/* Row 3: Sauna WiFi Control & Safety Timer */}
                  <div style={{ marginBottom: 24 }}>
                    <ErrorBoundary>
                      <SaunaCard readOnly={readOnly} />
                    </ErrorBoundary>
                  </div>

                  {/* Row 4: Tapo P115 Smart Plugs & Power Monitoring */}
                  <div style={{ marginBottom: 24 }}>
                    <ErrorBoundary>
                      <TapoPlugsCard onOpenTrend={setTrendTarget} readOnly={readOnly} />
                    </ErrorBoundary>
                  </div>

                  {/* UNIFIED FORECAST CARD with integrated real-time APC directive */}
                  <div style={{ marginBottom: 24 }}>
                    <ErrorBoundary>
                      <UnifiedForecastCard onOpenApc={() => setActiveTab('apc_strategy')} />
                    </ErrorBoundary>
                  </div>
                </>
              )}
            </>
          )}
        </main>
      </PullToRefresh>

      {/* Quick Variable Daily Trend Modal */}
      <VariableTrendModal target={trendTarget} onClose={() => setTrendTarget(null)} />

      {/* Outdoor Temperature & Weather Combined Forecast Modal */}
      <OutdoorWeatherModal
        isOpen={outdoorModalOpen}
        onClose={() => setOutdoorModalOpen(false)}
        state={state}
      />
    </div>
  );
}

