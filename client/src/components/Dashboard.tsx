import { useState, useEffect } from 'react';
import type { HeishamonState, MqttStatus } from '../types/heishamon';
import type { ZigbeeRegistry } from '../types/zigbee';
import { StatusBar } from './StatusBar';
import { CategoryHub, type CategoryId } from './CategoryHub';
import { HeatingPage } from './HeatingPage';
import { SaunaPage } from './SaunaPage';
import { LightingPage } from './LightingPage';
import { PlugsPage } from './PlugsPage';
import { TrendsAndEnergyPage } from './TrendsAndEnergyPage';
import { TechnicalAndSettingsPage } from './TechnicalAndSettingsPage';
import { ApcStrategyPage } from './ApcStrategyPage';
import { TemperaturesPage } from './TemperaturesPage';
import { VariableTrendModal, type TrendTopicTarget } from './VariableTrendModal';
import { OutdoorWeatherModal } from './OutdoorWeatherModal';
import { ElectricityPriceModal } from './ElectricityPriceModal';
import { VilpEstimateModal } from './VilpEstimateModal';
import { NotificationsModal } from './NotificationsModal';
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

export type DashboardTab =
  | 'hub'
  | 'heating'
  | 'temperatures'
  | 'sauna'
  | 'lighting'
  | 'plugs'
  | 'trends'
  | 'technical'
  | 'apc';

const VALID_TABS: DashboardTab[] = [
  'hub',
  'heating',
  'temperatures',
  'sauna',
  'lighting',
  'plugs',
  'trends',
  'technical',
  'apc',
];

function normalizeTab(raw: string): DashboardTab {
  if (VALID_TABS.includes(raw as DashboardTab)) {
    return raw as DashboardTab;
  }
  // Backwards compatibility mappings
  if (raw === 'dashboard') return 'heating';
  if (raw === 'smartlife' || raw === 'temperature' || raw === 'climate') return 'temperatures';
  if (raw === 'herrfors' || raw === 'history') return 'trends';
  if (raw === 'hydraulics' || raw === 'heatpump_guide') return 'technical';
  if (raw === 'apc_strategy') return 'apc';
  return 'hub';
}

function getInitialTab(): DashboardTab {
  if (typeof window !== 'undefined') {
    const hash = window.location.hash.replace(/^#/, '');
    if (hash) {
      return normalizeTab(hash);
    }
    try {
      const saved = localStorage.getItem('kotialy_active_tab');
      if (saved) {
        return normalizeTab(saved);
      }
    } catch {
      // ignore
    }
  }
  return 'hub';
}

export function Dashboard({
  state,
  mqtt,
  heishamonOnline,
  wsConnected,
  lastUpdate,
  refresh,
  isLocal,
  authenticated,
  username,
  role,
  onLogout,
}: DashboardProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>(getInitialTab);
  const [trendTarget, setTrendTarget] = useState<TrendTopicTarget | null>(null);
  const [outdoorModalOpen, setOutdoorModalOpen] = useState(false);
  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const [vilpModalOpen, setVilpModalOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const readOnly = role === 'viewer';

  const handleTabChange = (tab: DashboardTab) => {
    setActiveTab(tab);
    try {
      localStorage.setItem('kotialy_active_tab', tab);
    } catch {
      // ignore
    }
    if (typeof window !== 'undefined') {
      const targetHash = tab === 'hub' ? '' : `#${tab}`;
      const currentHash = window.location.hash;
      if (currentHash !== targetHash) {
        window.history.replaceState(
          null,
          '',
          tab === 'hub' ? window.location.pathname + window.location.search : `#${tab}`
        );
      }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Synchronize on browser forward / back or hash navigation
  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace(/^#/, '');
      if (hash) {
        setActiveTab(normalizeTab(hash));
      } else {
        setActiveTab('hub');
      }
    };
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('popstate', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('popstate', onHashChange);
    };
  }, []);

  const navItems: { id: DashboardTab; label: string; icon: string; activeColor: string; activeBg: string }[] = [
    { id: 'hub', label: 'Koti (Hub)', icon: '🏠', activeColor: '#38bdf8', activeBg: 'rgba(56, 189, 248, 0.2)' },
    { id: 'heating', label: 'Lämmitys', icon: '🔥', activeColor: '#f59e0b', activeBg: 'rgba(245, 158, 11, 0.2)' },
    { id: 'temperatures', label: 'Lämpömittarit', icon: '🌡️', activeColor: '#38bdf8', activeBg: 'rgba(56, 189, 248, 0.2)' },
    { id: 'sauna', label: 'Sauna', icon: '🧖‍♂️', activeColor: '#fb923c', activeBg: 'rgba(251, 146, 60, 0.2)' },
    { id: 'lighting', label: 'Valaistus', icon: '💡', activeColor: '#facc15', activeBg: 'rgba(250, 204, 21, 0.2)' },
    { id: 'plugs', label: 'Älypistorasiat', icon: '🔌', activeColor: '#38bdf8', activeBg: 'rgba(56, 189, 248, 0.2)' },
    { id: 'trends', label: 'Trendit & Kulutus', icon: '📈', activeColor: '#c084fc', activeBg: 'rgba(192, 132, 252, 0.2)' },
    { id: 'technical', label: 'Tekninen tila', icon: '🛠️', activeColor: '#22d3ee', activeBg: 'rgba(34, 211, 238, 0.2)' },
    { id: 'apc', label: 'APC-Strategia', icon: '⚡', activeColor: '#10b981', activeBg: 'rgba(16, 185, 129, 0.2)' },
  ];

  return (
    <div className="app-bg" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
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
        onOpenPriceModal={() => setPriceModalOpen(true)}
        onOpenVilpModal={() => setVilpModalOpen(true)}
        onOpenNotifications={() => setNotificationsOpen(true)}
        onNavigateHome={() => handleTabChange('hub')}
        onOpenTrends={() => handleTabChange('trends')}
        onOpenApc={() => handleTabChange('apc')}
      />

      <PullToRefresh onRefresh={refresh || (() => window.location.reload())}>
        <main className="dashboard-main" style={{ flex: 1, paddingBottom: 60 }}>
          {/* Top category navigation tabs / pills (Responsive Horizontal Scroll) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: 20,
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              paddingBottom: 12,
              gap: 8,
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleTabChange(item.id)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 12,
                    fontSize: 13,
                    fontWeight: isActive ? 700 : 500,
                    border: isActive ? `1px solid ${item.activeColor}` : '1px solid rgba(255,255,255,0.08)',
                    background: isActive ? item.activeBg : 'rgba(255,255,255,0.03)',
                    color: isActive ? item.activeColor : 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s ease',
                    flexShrink: 0,
                  }}
                >
                  <span style={{ fontSize: 15 }}>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* VIEW: HUB (Category Launcher View) */}
          {activeTab === 'hub' && (
            <ErrorBoundary>
              <CategoryHub
                state={state}
                onSelectCategory={(cat: CategoryId) => handleTabChange(cat)}
              />
            </ErrorBoundary>
          )}

          {/* VIEW 1: LÄMMITYS (Top 6 Widgets + Forecast) */}
          {activeTab === 'heating' && (
            <ErrorBoundary>
              <HeatingPage
                state={state}
                onOpenTrend={setTrendTarget}
                onOpenOutdoorWeather={() => setOutdoorModalOpen(true)}
                onOpenApc={() => handleTabChange('apc')}
                readOnly={readOnly}
              />
            </ErrorBoundary>
          )}

          {/* VIEW 2: LÄMPÖMITTARIT & SISÄILMA */}
          {activeTab === 'temperatures' && (
            <ErrorBoundary>
              <TemperaturesPage state={state} readOnly={readOnly} />
            </ErrorBoundary>
          )}

          {/* VIEW 3: SAUNA (Heating Widget + Lighting + Climate Stats) */}
          {activeTab === 'sauna' && (
            <ErrorBoundary>
              <SaunaPage readOnly={readOnly} />
            </ErrorBoundary>
          )}

          {/* VIEW 4: VALAISTUS (Outdoor & Indoor Lighting) */}
          {activeTab === 'lighting' && (
            <ErrorBoundary>
              <LightingPage readOnly={readOnly} />
            </ErrorBoundary>
          )}

          {/* VIEW 5: ÄLYPISTORASIAT (Tapo Plugs & Isovarasto Temp Sensor) */}
          {activeTab === 'plugs' && (
            <ErrorBoundary>
              <PlugsPage onOpenTrend={setTrendTarget} readOnly={readOnly} />
            </ErrorBoundary>
          )}

          {/* VIEW 6: TRENDIT & SÄHKÖNKULUTUS (History, Herrfors, Daily Costs, Energy Stats) */}
          {activeTab === 'trends' && (
            <ErrorBoundary>
              <TrendsAndEnergyPage
                state={state}
                onOpenTrend={setTrendTarget}
                readOnly={readOnly}
              />
            </ErrorBoundary>
          )}

          {/* VIEW 7: TEKNINEN TILA & ASETUSMUISTIO (Hydraulics & Panasonic Settings) */}
          {activeTab === 'technical' && (
            <ErrorBoundary>
              <TechnicalAndSettingsPage state={state} readOnly={readOnly} />
            </ErrorBoundary>
          )}

          {/* VIEW 8: APC-AUTOMAATIOSTRATEGIA */}
          {activeTab === 'apc' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 32 }}>
              <ErrorBoundary>
                <ApcStrategyPage readOnly={readOnly} />
              </ErrorBoundary>
            </div>
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

      {/* Electricity Price Development & Forecast Modal */}
      <ElectricityPriceModal
        isOpen={priceModalOpen}
        onClose={() => setPriceModalOpen(false)}
        onOpenApc={() => handleTabChange('apc')}
      />

      {/* VILP Estimate & Heating Demand Development Modal */}
      <VilpEstimateModal
        isOpen={vilpModalOpen}
        onClose={() => setVilpModalOpen(false)}
        state={state}
        onOpenTrends={() => handleTabChange('trends')}
        onOpenApc={() => handleTabChange('apc')}
      />

      {/* Notifications & Push Alerts Modal */}
      {notificationsOpen && (
        <NotificationsModal onClose={() => setNotificationsOpen(false)} />
      )}
    </div>
  );
}
