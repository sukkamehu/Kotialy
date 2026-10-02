import React, { useState } from 'react';
import type { HeishamonState } from '../types/heishamon';
import { HydraulicDiagramPage } from './HydraulicDiagramPage';
import { PanasonicSettingsCard } from './PanasonicSettingsCard';
import { ErrorBoundary } from './ErrorBoundary';

interface TechnicalAndSettingsPageProps {
  state: HeishamonState;
  readOnly?: boolean;
}

export const TechnicalAndSettingsPage: React.FC<TechnicalAndSettingsPageProps> = ({
  state,
  readOnly = false,
}) => {
  const [subTab, setSubTab] = useState<'hydraulics' | 'settings'>('hydraulics');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 36 }}>
      {/* Category Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>🛠️</span> Tekninen tila & Asetusmuistio
          </h2>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>
            Putkiston hydraulikaavio, reaaliaikaiset virtausanturit ja Panasonic Aquarea -asetusmuistio
          </div>
        </div>

        {/* Subtab Segmented Switcher */}
        <div
          style={{
            display: 'flex',
            background: 'rgba(0, 0, 0, 0.4)',
            padding: '4px',
            borderRadius: 12,
            border: '1px solid rgba(255, 255, 255, 0.08)',
            gap: 4,
          }}
        >
          <button
            type="button"
            onClick={() => setSubTab('hydraulics')}
            style={{
              padding: '7px 16px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              border: 'none',
              background: subTab === 'hydraulics' ? 'rgba(6, 182, 212, 0.25)' : 'transparent',
              color: subTab === 'hydraulics' ? '#22d3ee' : 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s ease',
            }}
          >
            <span>🛠️</span> Hydraulikaavio
          </button>

          <button
            type="button"
            onClick={() => setSubTab('settings')}
            style={{
              padding: '7px 16px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              border: 'none',
              background: subTab === 'settings' ? 'rgba(16, 185, 129, 0.25)' : 'transparent',
              color: subTab === 'settings' ? '#6ee7b7' : 'var(--text-secondary)',
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

      {/* View 1: Interactive Hydraulic Diagram */}
      {subTab === 'hydraulics' && (
        <ErrorBoundary>
          <HydraulicDiagramPage state={state} readOnly={readOnly} />
        </ErrorBoundary>
      )}

      {/* View 2: Panasonic Settings Memo */}
      {subTab === 'settings' && (
        <ErrorBoundary>
          <PanasonicSettingsCard />
        </ErrorBoundary>
      )}
    </div>
  );
};
