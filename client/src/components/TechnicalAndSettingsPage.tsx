import React, { useState, useEffect } from 'react';
import type { HeishamonState } from '../types/heishamon';
import { HydraulicDiagramPage } from './HydraulicDiagramPage';
import { PanasonicSettingsCard } from './PanasonicSettingsCard';
import { BatteryDiagramPage } from './BatteryDiagramPage';
import { PageHeader } from './PageHeader';
import { SubTabBar } from './SubTabBar';
import { ErrorBoundary } from './ErrorBoundary';

export type TechnicalSubTab = 'hydraulics' | 'battery' | 'settings';

interface TechnicalAndSettingsPageProps {
  state: HeishamonState;
  initialSubTab?: TechnicalSubTab;
  readOnly?: boolean;
}

const STORAGE_KEY = 'kotialy_technical_active_tab';

export const TechnicalAndSettingsPage: React.FC<TechnicalAndSettingsPageProps> = ({
  state,
  initialSubTab,
  readOnly = false,
}) => {
  const [subTab, setSubTab] = useState<TechnicalSubTab>(() => {
    if (initialSubTab) return initialSubTab;
    if (typeof window !== 'undefined') {
      const h = (window.location.hash || '').toLowerCase();
      if (h.includes('setting') || h.includes('asetus')) return 'settings';
      if (h.includes('battery') || h.includes('akku')) return 'battery';
    }
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as TechnicalSubTab | null;
      if (saved === 'hydraulics' || saved === 'battery' || saved === 'settings') return saved;
    } catch {
      // ignore
    }
    return 'hydraulics';
  });

  useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  const handleSelectTab = (tab: TechnicalSubTab) => {
    setSubTab(tab);
    try {
      localStorage.setItem(STORAGE_KEY, tab);
    } catch {
      // ignore
    }
  };

  return (
    <div className="page-stack">
      <PageHeader
        icon="🛠️"
        title="Tekniikka & Akku"
        subtitle="Putkiston hydraulikaavio, 3-vaiheinen akkujärjestelmän sähkökaavio ja Panasonic-asetusmuistio"
      />

      <SubTabBar<TechnicalSubTab>
        activeTab={subTab}
        onSelect={handleSelectTab}
        ariaLabel="Teknisen tilan näkymät"
        tabs={[
          { id: 'hydraulics', label: 'Hydraulikaavio', icon: '🛠️', accentColor: '#22d3ee' },
          { id: 'battery', label: 'Sähkö- ja akkukaavio', icon: '🔋', accentColor: '#10b981' },
          { id: 'settings', label: 'Asetusmuistio', icon: '⚙️', accentColor: '#c084fc' },
        ]}
      />

      {subTab === 'hydraulics' && (
        <ErrorBoundary>
          <HydraulicDiagramPage state={state} readOnly={readOnly} />
        </ErrorBoundary>
      )}

      {subTab === 'battery' && (
        <ErrorBoundary>
          <BatteryDiagramPage />
        </ErrorBoundary>
      )}

      {subTab === 'settings' && (
        <ErrorBoundary>
          <PanasonicSettingsCard state={state} />
        </ErrorBoundary>
      )}
    </div>
  );
};
