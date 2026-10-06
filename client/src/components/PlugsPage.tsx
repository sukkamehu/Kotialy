import React from 'react';
import { TapoPlugsCard } from './TapoPlugsCard';
import { OutdoorLightsCard } from './OutdoorLightsCard';
import { ErrorBoundary } from './ErrorBoundary';
import { useTapo } from '../hooks/useTapo';
import { useOutdoorLights } from '../hooks/useOutdoorLights';
import type { TrendTopicTarget } from './VariableTrendModal';

interface PlugsPageProps {
  onOpenTrend?: (target: TrendTopicTarget) => void;
  readOnly?: boolean;
}

export const PlugsPage: React.FC<PlugsPageProps> = ({
  onOpenTrend,
  readOnly = false,
}) => {
  const { devices: tapoDevices } = useTapo();
  const { status: outdoorLightsStatus } = useOutdoorLights();

  // Total monitored plug and smart switch power
  const tapoPower = tapoDevices.reduce((sum, d) => sum + (d.power_w || 0), 0);
  const relayPower = outdoorLightsStatus?.telemetry?.power_w ?? 0;
  const totalPowerW = tapoPower + relayPower;
  const activeTapoCount = tapoDevices.filter((d) => d.state === 'ON').length;
  const isRelayOn = outdoorLightsStatus?.isOn ?? false;
  const totalActiveDevices = activeTapoCount + (isRelayOn ? 1 : 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginBottom: 40 }}>
      {/* Category Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>🔌</span> Älypistorasiat & Kytkimet
          </h2>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 3 }}>
            Tapo P115 -älypistorasiat ja WiFi-mittausrele (ulkovalaistus) sähkönkulutuksen seurannalla ja pörssiohjauksella
          </div>
        </div>

        {/* Global Plug & Relay Load Badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: 'rgba(56, 189, 248, 0.08)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            borderRadius: 14,
            padding: '8px 16px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Yhteiskuorma nyt</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#38bdf8' }}>
              {totalPowerW.toFixed(0)} W
            </span>
          </div>
          <div style={{ width: 1, height: 24, background: 'rgba(255, 255, 255, 0.1)' }} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Päällä</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: totalActiveDevices > 0 ? '#4ade80' : 'var(--text-secondary)' }}>
              {totalActiveDevices} kpl
            </span>
          </div>
        </div>
      </div>

      {/* Tapo Smart Plugs Section */}
      <ErrorBoundary>
        <TapoPlugsCard onOpenTrend={onOpenTrend} readOnly={readOnly} />
      </ErrorBoundary>

      {/* WiFi Switch / Smart Metering Relay Section */}
      <div style={{ marginTop: 8 }}>
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>💡</span>
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            WiFi-Mittausrele (Ulkovalaistus)
          </h3>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>
            Tuya 1P-Mtrg WiFi Switch energiamittauksella
          </span>
        </div>
        <ErrorBoundary>
          <OutdoorLightsCard readOnly={readOnly} />
        </ErrorBoundary>
      </div>
    </div>
  );
};

