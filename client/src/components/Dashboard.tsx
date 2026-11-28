import { useState, useEffect } from 'react';
import type { HeishamonState, MqttStatus } from '../types/heishamon';
import type { ZigbeeRegistry } from '../types/zigbee';
import { StatusBar } from './StatusBar';
import { CategoryHub, type CategoryId } from './CategoryHub';
import { HeatingPage } from './HeatingPage';
import { SaunaPage } from './SaunaPage';
import { DevicesControlPage, type ControlsSubTab } from './DevicesControlPage';
import { TrendsAndEnergyPage, type TrendsSubTab } from './TrendsAndEnergyPage';
import { TechnicalAndSettingsPage, type TechnicalSubTab } from './TechnicalAndSettingsPage';
import { ApcStrategyPage } from './ApcStrategyPage';
import { TemperaturesPage } from './TemperaturesPage';
import { VariableTrendModal, type TrendTopicTarget } from './VariableTrendModal';
import { OutdoorWeatherModal } from './OutdoorWeatherModal';
import { ElectricityPriceModal } from './ElectricityPriceModal';
import { VilpEstimateModal } from './VilpEstimateModal';
import { NotificationsModal } from './NotificationsModal';
import { PullToRefresh } from './PullToRefresh';
import { ErrorBoundary } from './ErrorBoundary';
import { ExperimentalRadioPage } from './ExperimentalRadioPage';

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
  | 'controls'
  | 'trends'
  | 'apc'
  | 'technical'
  | 'experimental';

const VALID_TABS: DashboardTab[] = [
  'hub',
  'heating',
  'temperatures',
  'sauna',
  'controls',
  'trends',
  'apc',
  'technical',
  'experimental',
];

function resolveRoute(raw: string): {
  tab: DashboardTab;
  controlsSubTab?: ControlsSubTab;
  technicalSubTab?: TechnicalSubTab;
} {
  const key = raw.toLowerCase().trim();
  if (key === 'lighting' || key === 'valot' || key === 'valaistus') {
    return { tab: 'controls', controlsSubTab: 'lighting' };
  }
  if (key === 'plugs' || key === 'pistorasiat') {
    return { tab: 'controls', controlsSubTab: 'plugs' };
  }
  if (key === 'battery' || key === 'akku' || key === 'sahkokaavio' || key === 'akkujarjestelma') {
    return { tab: 'technical', technicalSubTab: 'battery' };
  }
  if (key === 'settings' || key === 'asetukset' || key === 'asetusmuistio') {
    return { tab: 'technical', technicalSubTab: 'settings' };
  }
  if (key === 'hydraulics' || key === 'heatpump_guide') {
    return { tab: 'technical', technicalSubTab: 'hydraulics' };
  }
  if (VALID_TABS.includes(key as DashboardTab)) {
    return { tab: key as DashboardTab };
  }
  if (key === 'dashboard') return { tab: 'heating' };
  if (key === 'smartlife' || key === 'temperature' || key === 'climate') return { tab: 'temperatures' };
  if (key === 'herrfors' || key === 'history') return { tab: 'trends' };
  if (key === 'apc_strategy') return { tab: 'apc' };
  if (key === 'radio' || key === 'sdr' || key === 'satellite' || key === 'satelliitti') return { tab: 'experimental' };
  return { tab: 'hub' };
}

function getInitialRoute() {
  if (typeof window !== 'undefined') {
    const hash = window.location.hash.replace(/^#/, '');
    if (hash) return resolveRoute(hash);
    try {
      const saved = localStorage.getItem('kotialy_active_tab');
      if (saved) return resolveRoute(saved);
    } catch {
      // ignore
    }
  }
  return { tab: 'hub' as DashboardTab };
}

const NAV_ITEMS: { id: DashboardTab; label: string; icon: string; activeColor: string; activeBg: string }[] = [
  { id: 'hub', label: 'Koti', icon: '🏠', activeColor: '#38bdf8', activeBg: 'rgba(56, 189, 248, 0.16)' },
  { id: 'heating', label: 'Lämmitys', icon: '🔥', activeColor: '#f59e0b', activeBg: 'rgba(245, 158, 11, 0.16)' },
  { id: 'temperatures', label: 'Lämpömittarit', icon: '🌡️', activeColor: '#38bdf8', activeBg: 'rgba(56, 189, 248, 0.16)' },
  { id: 'sauna', label: 'Sauna', icon: '🧖‍♂️', activeColor: '#fb923c', activeBg: 'rgba(251, 146, 60, 0.16)' },
  { id: 'controls', label: 'Valot & Pistorasiat', icon: '🔌', activeColor: '#facc15', activeBg: 'rgba(250, 204, 21, 0.16)' },
  { id: 'trends', label: 'Trendit & Kulutus', icon: '📈', activeColor: '#c084fc', activeBg: 'rgba(192, 132, 252, 0.16)' },
  { id: 'apc', label: 'APC-Strategia', icon: '⚡', activeColor: '#10b981', activeBg: 'rgba(16, 185, 129, 0.16)' },
  { id: 'technical', label: 'Tekniikka & Akku', icon: '🛠️', activeColor: '#22d3ee', activeBg: 'rgba(34, 211, 238, 0.16)' },
];

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
  const initialRoute = getInitialRoute();
  const [activeTab, setActiveTab] = useState<DashboardTab>(initialRoute.tab);
  const [controlsSubTab, setControlsSubTab] = useState<ControlsSubTab | undefined>(initialRoute.controlsSubTab);
  const [technicalSubTab, setTechnicalSubTab] = useState<TechnicalSubTab | undefined>(initialRoute.technicalSubTab);
  const [trendsSubTab, setTrendsSubTab] = useState<TrendsSubTab | undefined>(undefined);

  const [trendTarget, setTrendTarget] = useState<TrendTopicTarget | null>(null);
  const [outdoorModalOpen, setOutdoorModalOpen] = useState(false);
  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const [vilpModalOpen, setVilpModalOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const readOnly = role === 'viewer';

  const handleTabChange = (
    tab: DashboardTab,
    options?: {
      controlsSubTab?: ControlsSubTab;
      technicalSubTab?: TechnicalSubTab;
      trendsSubTab?: TrendsSubTab;
    }
  ) => {
    setActiveTab(tab);
    if (options?.controlsSubTab) setControlsSubTab(options.controlsSubTab);
    if (options?.technicalSubTab) setTechnicalSubTab(options.technicalSubTab);
    if (options?.trendsSubTab) setTrendsSubTab(options.trendsSubTab);

    try {
      localStorage.setItem('kotialy_active_tab', tab);
    } catch {
      // ignore
    }
    if (typeof window !== 'undefined') {
      const targetHash = tab === 'hub' ? '' : `#${tab}`;
      if (window.location.hash !== targetHash) {
        window.history.replaceState(
          null,
          '',
          tab === 'hub' ? window.location.pathname + window.location.search : `#${tab}`
        );
      }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Navigate to Trends -> Sensor history with a specific topic added
  const handleOpenInTrends = (topicKey: string) => {
    try {
      const storageKey = 'kotialy_trend_selected_topics_v2';
      const saved = localStorage.getItem(storageKey);
      const parsed: string[] = saved ? JSON.parse(saved) : [];
      const next = Array.isArray(parsed)
        ? Array.from(new Set([...parsed, topicKey]))
        : [topicKey];
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // ignore
    }
    handleTabChange('trends', { trendsSubTab: 'sensors' });
  };

  // Synchronize on browser forward / back or hash navigation
  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace(/^#/, '');
      if (hash) {
        const resolved = resolveRoute(hash);
        setActiveTab(resolved.tab);
        if (resolved.controlsSubTab) setControlsSubTab(resolved.controlsSubTab);
        if (resolved.technicalSubTab) setTechnicalSubTab(resolved.technicalSubTab);
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
        <main className="dashboard-main" style={{ flex: 1, paddingBottom: 60, minWidth: 0, width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
          {/* Unified Top Navigation Bar */}
          <nav className="dashboard-nav" aria-label="Päävalikko">
            {NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleTabChange(item.id)}
                  className={`dashboard-nav-btn ${isActive ? 'is-active' : ''}`}
                  style={
                    isActive
                      ? {
                          borderColor: `${item.activeColor}88`,
                          background: item.activeBg,
                          color: item.activeColor,
                        }
                      : undefined
                  }
                >
                  <span style={{ fontSize: 15 }}>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* VIEW: HUB */}
          {activeTab === 'hub' && (
            <ErrorBoundary>
              <CategoryHub
                state={state}
                onSelectCategory={(cat: CategoryId) => handleTabChange(cat)}
              />
            </ErrorBoundary>
          )}

          {/* VIEW: LÄMMITYS */}
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

          {/* VIEW: LÄMPÖMITTARIT & SISÄILMA */}
          {activeTab === 'temperatures' && (
            <ErrorBoundary>
              <TemperaturesPage
                state={state}
                readOnly={readOnly}
                onOpenInTrends={handleOpenInTrends}
                onNavigateTab={(tab) => {
                  const resolved = resolveRoute(tab);
                  handleTabChange(resolved.tab, {
                    controlsSubTab: resolved.controlsSubTab,
                    technicalSubTab: resolved.technicalSubTab,
                  });
                }}
              />
            </ErrorBoundary>
          )}

          {/* VIEW: SAUNA */}
          {activeTab === 'sauna' && (
            <ErrorBoundary>
              <SaunaPage readOnly={readOnly} />
            </ErrorBoundary>
          )}

          {/* VIEW: VALOT & PISTORASIAT (Unified Controls) */}
          {activeTab === 'controls' && (
            <ErrorBoundary>
              <DevicesControlPage
                initialSubTab={controlsSubTab}
                onOpenTrend={setTrendTarget}
                readOnly={readOnly}
              />
            </ErrorBoundary>
          )}

          {/* VIEW: TRENDIT & SÄHKÖNKULUTUS */}
          {activeTab === 'trends' && (
            <ErrorBoundary>
              <TrendsAndEnergyPage
                state={state}
                initialSubTab={trendsSubTab}
                onOpenTrend={setTrendTarget}
                readOnly={readOnly}
              />
            </ErrorBoundary>
          )}

          {/* VIEW: APC-AUTOMAATIOSTRATEGIA */}
          {activeTab === 'apc' && (
            <ErrorBoundary>
              <ApcStrategyPage readOnly={readOnly} />
            </ErrorBoundary>
          )}

          {/* VIEW: TEKNIIKKA & AKKU */}
          {activeTab === 'technical' && (
            <ErrorBoundary>
              <TechnicalAndSettingsPage
                state={state}
                initialSubTab={technicalSubTab}
                readOnly={readOnly}
              />
            </ErrorBoundary>
          )}

          {/* VIEW: EXPERIMENTAL SDR & SATELLIITTI (hash route #experimental) */}
          {activeTab === 'experimental' && (
            <ErrorBoundary>
              <ExperimentalRadioPage />
            </ErrorBoundary>
          )}
        </main>
      </PullToRefresh>

      {/* Modals */}
      <VariableTrendModal target={trendTarget} onClose={() => setTrendTarget(null)} />
      <OutdoorWeatherModal isOpen={outdoorModalOpen} onClose={() => setOutdoorModalOpen(false)} state={state} />
      <ElectricityPriceModal
        isOpen={priceModalOpen}
        onClose={() => setPriceModalOpen(false)}
        onOpenApc={() => handleTabChange('apc')}
      />
      <VilpEstimateModal
        isOpen={vilpModalOpen}
        onClose={() => setVilpModalOpen(false)}
        state={state}
        onOpenTrends={() => handleTabChange('trends')}
        onOpenApc={() => handleTabChange('apc')}
      />
      {notificationsOpen && <NotificationsModal onClose={() => setNotificationsOpen(false)} />}
    </div>
  );
}
