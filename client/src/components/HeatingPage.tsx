import React from 'react';
import type { HeishamonState } from '../types/heishamon';
import { HeatpumpCard } from './HeatpumpCard';
import { DHWCard } from './DHWCard';
import { BufferTankCard } from './BufferTankCard';
import { OutdoorCard } from './OutdoorCard';
import { CameraCard } from './CameraCard';
import { MitsubishiCard } from './MitsubishiCard';
import { UnifiedForecastCard } from './UnifiedForecastCard';
import { PageHeader } from './PageHeader';
import { ErrorBoundary } from './ErrorBoundary';
import type { TrendTopicTarget } from './VariableTrendModal';

interface HeatingPageProps {
  state: HeishamonState;
  onOpenTrend: (target: TrendTopicTarget) => void;
  onOpenOutdoorWeather: () => void;
  onOpenApc: () => void;
  readOnly?: boolean;
}

export const HeatingPage: React.FC<HeatingPageProps> = ({
  state,
  onOpenTrend,
  onOpenOutdoorWeather,
  onOpenApc,
  readOnly = false,
}) => {
  return (
    <div className="page-stack">
      <PageHeader
        icon="🔥"
        title="Lämmitysjärjestelmä"
        subtitle="Panasonic 12 kW T-CAP VILP, 284 L käyttövesivaraaja, 100 L puskurivaraaja, Mitsubishi ILP ja teknisen tilan valvonta"
      />

      {/* Row 1: Primary heat pump & tank status cards */}
      <div className="dashboard-grid dashboard-grid-main">
        <ErrorBoundary>
          <HeatpumpCard state={state} onOpenTrend={onOpenTrend} readOnly={readOnly} />
        </ErrorBoundary>
        <ErrorBoundary>
          <DHWCard state={state} onOpenTrend={onOpenTrend} readOnly={readOnly} />
        </ErrorBoundary>
        <ErrorBoundary>
          <BufferTankCard state={state} onOpenTrend={onOpenTrend} readOnly={readOnly} />
        </ErrorBoundary>
      </div>

      {/* Row 2: Outdoor status + Technical room camera */}
      <div className="dashboard-grid dashboard-grid-sub">
        <ErrorBoundary>
          <OutdoorCard
            state={state}
            onOpenTrend={onOpenTrend}
            onOpenOutdoorWeather={onOpenOutdoorWeather}
            readOnly={readOnly}
          />
        </ErrorBoundary>
        <ErrorBoundary>
          <CameraCard />
        </ErrorBoundary>
      </div>

      {/* Row 3: Mitsubishi Air-to-Air Heat Pumps (ILP) */}
      <ErrorBoundary>
        <MitsubishiCard readOnly={readOnly} />
      </ErrorBoundary>

      {/* Row 4: Spot price forecast, weather & APC heating directive */}
      <ErrorBoundary>
        <UnifiedForecastCard onOpenApc={onOpenApc} />
      </ErrorBoundary>
    </div>
  );
};
