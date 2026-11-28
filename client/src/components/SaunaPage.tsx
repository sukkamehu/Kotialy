import React from 'react';
import { SaunaCard } from './SaunaCard';
import { SaunaLightsCard, isSaunaLightDevice } from './SaunaLightsCard';
import { PageHeader } from './PageHeader';
import { useTuya } from '../hooks/useTuya';
import { apiFetch } from '../lib/api';
import { ErrorBoundary } from './ErrorBoundary';

interface SaunaPageProps {
  readOnly?: boolean;
}

export const SaunaPage: React.FC<SaunaPageProps> = ({ readOnly = false }) => {
  const { devices, refreshDevices } = useTuya();
  const saunaLights = devices.filter((d) => d.type === 'light' && isSaunaLightDevice(d));

  const handleControlLight = async (deviceId: string | string[], params: Record<string, unknown>) => {
    if (readOnly) return;
    try {
      const isArray = Array.isArray(deviceId);
      await apiFetch('/api/tuya/light', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isArray ? { device_ids: deviceId } : { device_id: deviceId }),
          ...params,
        }),
      });
      refreshDevices();
    } catch (err) {
      console.error('Failed to control light:', err);
    }
  };

  return (
    <div className="page-stack">
      <PageHeader
        icon="🧖‍♂️"
        title="Sauna"
        subtitle="Kiukaan etäohjaus, turva-ajastin, saunan tunnelmavalaistus ja reaaliaikaiset mittaukset"
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: 20,
          alignItems: 'start',
        }}
      >
        <ErrorBoundary>
          <SaunaCard readOnly={readOnly} />
        </ErrorBoundary>

        <ErrorBoundary>
          <SaunaLightsCard
            saunaLights={saunaLights}
            onControlLight={handleControlLight}
            readOnly={readOnly}
          />
        </ErrorBoundary>
      </div>
    </div>
  );
};
