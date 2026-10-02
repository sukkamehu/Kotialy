import React from 'react';
import type { HeishamonState } from '../types/heishamon';
import { HistoryChart } from './HistoryChart';
import { HerrforsAnalyticsCard } from './HerrforsAnalyticsCard';
import { DailyCostsCard } from './DailyCostsCard';
import { EnergyStatsCard } from './EnergyStatsCard';
import { ErrorBoundary } from './ErrorBoundary';
import type { TrendTopicTarget } from './VariableTrendModal';

interface TrendsAndEnergyPageProps {
  state: HeishamonState;
  onOpenTrend?: (target: TrendTopicTarget) => void;
  readOnly?: boolean;
}

export const TrendsAndEnergyPage: React.FC<TrendsAndEnergyPageProps> = ({
  state,
  onOpenTrend,
  readOnly = false,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginBottom: 36 }}>
      {/* Category Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>📈</span> Trendit & Sähkönkulutus
          </h2>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>
            Herrfors-sähkönkulutus, tuntitason SPOT-analyysit, VILP-hyötysuhde (COP) ja mittarihistoria
          </div>
        </div>
      </div>

      {/* 1. Multi-variable Interactive History Chart */}
      <ErrorBoundary>
        <HistoryChart />
      </ErrorBoundary>

      {/* 2. Herrfors Electricity Consumption & Cost Analytics */}
      <ErrorBoundary>
        <HerrforsAnalyticsCard readOnly={readOnly} />
      </ErrorBoundary>

      {/* 3. Daily Energy & COP Costs */}
      <ErrorBoundary>
        <DailyCostsCard readOnly={readOnly} />
      </ErrorBoundary>

      {/* 4. Total Energy Production & Consumption Stats */}
      <ErrorBoundary>
        <EnergyStatsCard state={state} onOpenTrend={onOpenTrend} />
      </ErrorBoundary>
    </div>
  );
};
