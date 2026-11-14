import React, { useState } from 'react';
import type { HeishamonState } from '../types/heishamon';
import { ElectricityCalendarCard } from './ElectricityCalendarCard';
import { HerrforsAnalyticsCard } from './HerrforsAnalyticsCard';
import { DailyCostsCard } from './DailyCostsCard';
import { HistoryChart } from './HistoryChart';
import { EnergyStatsCard } from './EnergyStatsCard';
import { ErrorBoundary } from './ErrorBoundary';
import type { TrendTopicTarget } from './VariableTrendModal';

interface TrendsAndEnergyPageProps {
  state: HeishamonState;
  onOpenTrend?: (target: TrendTopicTarget) => void;
  readOnly?: boolean;
}

type TrendsSubTab = 'calendar' | 'herrfors' | 'vilp' | 'sensors';

const TAB_STORAGE_KEY = 'kotialy_trends_active_tab';

export const TrendsAndEnergyPage: React.FC<TrendsAndEnergyPageProps> = ({
  state,
  onOpenTrend,
  readOnly = false,
}) => {
  const [activeTab, setActiveTab] = useState<TrendsSubTab>(() => {
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

  const handleSelectTab = (tab: TrendsSubTab) => {
    setActiveTab(tab);
    try {
      localStorage.setItem(TAB_STORAGE_KEY, tab);
    } catch {
      // ignore
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 36 }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>📈</span> Trendit & Sähkönkulutus
          </h2>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>
            Asunnon kokonaissähkön kalenteri, SPOT-tuntianalyysit, VILP-hyötysuhde (COP) ja mittarihistoria
          </div>
        </div>
      </div>

      {/* Thematic Category Tabs */}
      <div style={{
        display: 'flex',
        gap: 8,
        overflowX: 'auto',
        paddingBottom: 4,
        WebkitOverflowScrolling: 'touch',
      }}>
        <button
          className={`btn btn-sm ${activeTab === 'calendar' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => handleSelectTab('calendar')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            whiteSpace: 'nowrap',
            borderRadius: 10,
            padding: '8px 14px',
            fontWeight: activeTab === 'calendar' ? 700 : 500,
          }}
        >
          <span>📅</span> Kokonaissähkön Kalenteri
        </button>

        <button
          className={`btn btn-sm ${activeTab === 'herrfors' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => handleSelectTab('herrfors')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            whiteSpace: 'nowrap',
            borderRadius: 10,
            padding: '8px 14px',
            fontWeight: activeTab === 'herrfors' ? 700 : 500,
          }}
        >
          <span>⚡</span> Herrfors-erittelyt & SPOT
        </button>

        <button
          className={`btn btn-sm ${activeTab === 'vilp' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => handleSelectTab('vilp')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            whiteSpace: 'nowrap',
            borderRadius: 10,
            padding: '8px 14px',
            fontWeight: activeTab === 'vilp' ? 700 : 500,
          }}
        >
          <span>🌡️</span> VILP, COP & Tuotanto
        </button>

        <button
          className={`btn btn-sm ${activeTab === 'sensors' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => handleSelectTab('sensors')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            whiteSpace: 'nowrap',
            borderRadius: 10,
            padding: '8px 14px',
            fontWeight: activeTab === 'sensors' ? 700 : 500,
          }}
        >
          <span>📉</span> Sensorit & Mittarihistoria
        </button>
      </div>

      {/* Tab Contents */}

      {/* 1. Kokonaissähkön Kalenteri */}
      {activeTab === 'calendar' && (
        <ErrorBoundary>
          <ElectricityCalendarCard />
        </ErrorBoundary>
      )}

      {/* 2. Herrfors-erittelyt & SPOT-vertailu */}
      {activeTab === 'herrfors' && (
        <ErrorBoundary>
          <HerrforsAnalyticsCard readOnly={readOnly} />
        </ErrorBoundary>
      )}

      {/* 3. VILP, COP & Energiamittarit */}
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

      {/* 4. Sensorit & Mittarihistoria */}
      {activeTab === 'sensors' && (
        <ErrorBoundary>
          <HistoryChart />
        </ErrorBoundary>
      )}
    </div>
  );
};
