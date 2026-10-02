import React from 'react';
import type { HeishamonState } from '../types/heishamon';
import { HeatpumpCard } from './HeatpumpCard';
import { DHWCard } from './DHWCard';
import { BufferTankCard } from './BufferTankCard';
import { OutdoorCard } from './OutdoorCard';
import { ThreeWayValveCard } from './ThreeWayValveCard';
import { CameraCard } from './CameraCard';
import { UnifiedForecastCard } from './UnifiedForecastCard';
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 36 }}>
      {/* Category Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>🔥</span> Lämmitysjärjestelmä
          </h2>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>
            Panasonic 12 kW T-CAP VILP, 284L käyttövesivaraaja, 100L puskurivaraaja ja teknisen tilan valvonta
          </div>
        </div>
      </div>

      {/* Row 1: Primary heat pump & tank status cards (Top 3 widgets) */}
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

      {/* Row 2: Outdoor + Valve + Camera (Next 3 widgets) */}
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
          <ThreeWayValveCard state={state} onOpenTrend={onOpenTrend} readOnly={readOnly} />
        </ErrorBoundary>
        <ErrorBoundary>
          <CameraCard />
        </ErrorBoundary>
      </div>

      {/* Row 3: Spot price forecast & APC heating directive */}
      <div>
        <ErrorBoundary>
          <UnifiedForecastCard onOpenApc={onOpenApc} />
        </ErrorBoundary>
      </div>
    </div>
  );
};
