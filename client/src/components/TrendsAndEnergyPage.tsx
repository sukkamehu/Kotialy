import React, { useState, useEffect } from 'react';
import type { HeishamonState } from '../types/heishamon';
import { ElectricityCalendarCard } from './ElectricityCalendarCard';
import { HerrforsAnalyticsCard } from './HerrforsAnalyticsCard';
import { DailyCostsCard } from './DailyCostsCard';
import { HistoryChart } from './HistoryChart';
import { EnergyStatsCard } from './EnergyStatsCard';
import { PageHeader } from './PageHeader';
import { SubTabBar } from './SubTabBar';
import { ErrorBoundary } from './ErrorBoundary';
import type { TrendTopicTarget } from './VariableTrendModal';

export type TrendsSubTab = 'calendar' | 'herrfors' | 'vilp' | 'sensors';

interface TrendsAndEnergyPageProps {
  state: HeishamonState;
  initialSubTab?: TrendsSubTab;
  onOpenTrend?: (target: TrendTopicTarget) => void;
  readOnly?: boolean;
}

const TAB_STORAGE_KEY = 'kotialy_trends_active_tab';

export const TrendsAndEnergyPage: React.FC<TrendsAndEnergyPageProps> = ({
  state,
  initialSubTab,
  onOpenTrend,
  readOnly = false,
}) => {
  const [activeTab, setActiveTab] = useState<TrendsSubTab>(() => {
    if (initialSubTab) return initialSubTab;
    try {
      const saved = localStorage.getItem(TAB_STORAGE_KEY) as TrendsSubTab;
      if (['calendar', 'herrfors', 'vilp', 'sensors'].includes(saved)) {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'calendar';
  });

  useEffect(() => {
    if (initialSubTab) {
      setActiveTab(initialSubTab);
      try {
        localStorage.setItem(TAB_STORAGE_KEY, initialSubTab);
      } catch {
        // ignore
      }
    }
  }, [initialSubTab]);

  const handleSelectTab = (tab: TrendsSubTab) => {
    setActiveTab(tab);
    try {
      localStorage.setItem(TAB_STORAGE_KEY, tab);
    } catch {
      // ignore
    }
  };

  return (
    <div className="page-stack">
      <PageHeader
        icon="📈"
        title="Trendit & Sähkönkulutus"
        subtitle="Asunnon kokonaissähkön kalenteri, SPOT-tuntianalyysit, VILP-hyötysuhde (COP) ja anturihistoria"
      />

      <SubTabBar<TrendsSubTab>
        activeTab={activeTab}
        onSelect={handleSelectTab}
        ariaLabel="Trendit ja kulutus"
        tabs={[
          { id: 'calendar', label: 'Kokonaissähkön kalenteri', icon: '📅', accentColor: '#c084fc' },
          { id: 'herrfors', label: 'Herrfors & SPOT', icon: '⚡', accentColor: '#facc15' },
          { id: 'vilp', label: 'VILP, COP & Tuotanto', icon: '🌡️', accentColor: '#f59e0b' },
          { id: 'sensors', label: 'Sensorit & Mittarihistoria', icon: '📉', accentColor: '#38bdf8' },
        ]}
      />

      {activeTab === 'calendar' && (
        <ErrorBoundary>
          <ElectricityCalendarCard />
        </ErrorBoundary>
      )}

      {activeTab === 'herrfors' && (
        <ErrorBoundary>
          <HerrforsAnalyticsCard readOnly={readOnly} />
        </ErrorBoundary>
      )}

      {activeTab === 'vilp' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <ErrorBoundary>
            <DailyCostsCard readOnly={readOnly} />
          </ErrorBoundary>
          <ErrorBoundary>
            <EnergyStatsCard state={state} onOpenTrend={onOpenTrend} />
          </ErrorBoundary>
        </div>
      )}

      {activeTab === 'sensors' && (
        <ErrorBoundary>
          <HistoryChart />
        </ErrorBoundary>
      )}
    </div>
  );
};
