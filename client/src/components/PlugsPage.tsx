import React from 'react';
import { TapoPlugsCard } from './TapoPlugsCard';
import { ErrorBoundary } from './ErrorBoundary';
import type { TrendTopicTarget } from './VariableTrendModal';

interface PlugsPageProps {
  onOpenTrend?: (target: TrendTopicTarget) => void;
  readOnly?: boolean;
}

export const PlugsPage: React.FC<PlugsPageProps> = ({
  onOpenTrend,
  readOnly = false,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 36 }}>
      {/* Category Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>🔌</span> Älypistorasiat
          </h2>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>
            Tapo P115 -pistorasioiden pörssisähköohjaus, käyntisyklisuojaus ja Isovaraston lämpötilavalvonta
          </div>
        </div>
      </div>

      <ErrorBoundary>
        <TapoPlugsCard onOpenTrend={onOpenTrend} readOnly={readOnly} />
      </ErrorBoundary>
    </div>
  );
};
