import React, { useState, useEffect } from 'react';
import { TapoPlugsCard } from './TapoPlugsCard';
import { OutdoorLightsCard } from './OutdoorLightsCard';
import { SaunaLightsCard, isSaunaLightDevice } from './SaunaLightsCard';
import { PageHeader } from './PageHeader';
import { SubTabBar } from './SubTabBar';
import { ErrorBoundary } from './ErrorBoundary';
import { useTapo } from '../hooks/useTapo';
import { useTuyaPlug } from '../hooks/useTuyaPlug';
import { useOutdoorLights } from '../hooks/useOutdoorLights';
import { useTuya } from '../hooks/useTuya';
import { apiFetch } from '../lib/api';
import type { TuyaDevice } from '../types/tuya';
import type { TrendTopicTarget } from './VariableTrendModal';

export type ControlsSubTab = 'plugs' | 'lighting';

interface DevicesControlPageProps {
  initialSubTab?: ControlsSubTab;
  onOpenTrend?: (target: TrendTopicTarget) => void;
  readOnly?: boolean;
}

const STORAGE_KEY = 'kotialy_controls_active_tab';

export const DevicesControlPage: React.FC<DevicesControlPageProps> = ({
  initialSubTab,
  onOpenTrend,
  readOnly = false,
}) => {
  const [subTab, setSubTab] = useState<ControlsSubTab>(() => {
    if (initialSubTab) return initialSubTab;
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as ControlsSubTab | null;
      if (saved === 'plugs' || saved === 'lighting') return saved;
    } catch {
      // ignore
    }
    return 'plugs';
  });

  useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  const handleSelectTab = (tab: ControlsSubTab) => {
    setSubTab(tab);
    try {
      localStorage.setItem(STORAGE_KEY, tab);
    } catch {
      // ignore
    }
  };

  // Plugs & Relay telemetry
  const { devices: tapoDevices } = useTapo();
  const { status: tuyaPlugStatus } = useTuyaPlug();
  const { status: outdoorLightsStatus } = useOutdoorLights();

  const tapoPower = tapoDevices.reduce((sum, d) => sum + (d.power_w || 0), 0);
  const tuyaPower = tuyaPlugStatus?.telemetry?.power_w ?? 0;
  const relayPower = outdoorLightsStatus?.telemetry?.power_w ?? 0;
  const totalPowerW = tapoPower + tuyaPower + relayPower;

  const activeTapoCount = tapoDevices.filter((d) => d.state === 'ON').length;
  const isTuyaOn = tuyaPlugStatus?.isOn ?? false;
  const isRelayOn = outdoorLightsStatus?.isOn ?? false;
  const totalActivePlugs = activeTapoCount + (isTuyaOn ? 1 : 0) + (isRelayOn ? 1 : 0);

  // Indoor lights
  const { devices: tuyaDevices, refreshDevices } = useTuya();
  const lightDevices = tuyaDevices.filter((d) => d.type === 'light');

  const isMancaveLight = (d: TuyaDevice) => {
    const n = (d.name || '').toLowerCase();
    return (
      n.includes('kattovalo 4') ||
      n.includes('kattovalo4') ||
      n.includes('mancave') ||
      n.includes('leffa') ||
      d.id === 'bf38f4ea3b7b50b33fzoax'
    );
  };

  const isWcLight = (d: TuyaDevice) => {
    const n = (d.name || '').toLowerCase();
    return (
      (n.includes('kattovalo') && !isSaunaLightDevice(d) && !isMancaveLight(d)) ||
      n.includes('wc') ||
      d.id === 'bfefd134eb01593593vfd6'
    );
  };

  const saunaLights = lightDevices.filter(isSaunaLightDevice);
  const wcLights = lightDevices.filter(isWcLight);
  const mancaveLights = lightDevices.filter(isMancaveLight);
  const otherLights = lightDevices.filter(
    (d) => !isSaunaLightDevice(d) && !isWcLight(d) && !isMancaveLight(d)
  );

  const activeIndoorLightsCount = lightDevices.filter((d) => Boolean(d.properties.switch_led)).length;
  const activeLightsTotal = activeIndoorLightsCount + (isRelayOn ? 1 : 0);

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
        icon="🔌"
        title="Valot & Pistorasiat"
        subtitle="Älypistorasioiden kuormat ja pörssiohjaus, ulkovalojen hämäräkytkin sekä kodin sisävalaistus"
        actions={
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              background: 'rgba(56, 189, 248, 0.08)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderRadius: 12,
              padding: '7px 14px',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Kuorma nyt</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: '#38bdf8', fontVariantNumeric: 'tabular-nums' }}>
                {totalPowerW > 0 ? totalPowerW.toFixed(1) : '0'} W
              </span>
            </div>
            <div style={{ width: 1, height: 22, background: 'rgba(255, 255, 255, 0.1)' }} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Aktiivisia</span>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: totalActivePlugs > 0 ? '#4ade80' : 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                {totalActivePlugs} kytkintä · {activeLightsTotal} valoa
              </span>
            </div>
          </div>
        }
      />

      <SubTabBar<ControlsSubTab>
        activeTab={subTab}
        onSelect={handleSelectTab}
        ariaLabel="Valot ja pistorasiat"
        tabs={[
          {
            id: 'plugs',
            label: 'Älypistorasiat & Kuormat',
            icon: '🔌',
            badge: `${totalPowerW > 0 ? Math.round(totalPowerW) : 0} W`,
            accentColor: '#38bdf8',
          },
          {
            id: 'lighting',
            label: 'Ulko- ja sisävalaistus',
            icon: '💡',
            badge: activeLightsTotal > 0 ? `${activeLightsTotal} päällä` : undefined,
            accentColor: '#facc15',
          },
        ]}
      />

      {/* SUBTAB 1: SMART PLUGS & METERING RELAY */}
      {subTab === 'plugs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <ErrorBoundary>
            <TapoPlugsCard onOpenTrend={onOpenTrend} readOnly={readOnly} />
          </ErrorBoundary>

          {/* WiFi Metering Relay summary (links seamlessly to Lighting tab) */}
          <div className="card">
            <div className="card-header" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="card-icon">⚡</span>
                <span className="card-title">WiFi-Mittausrele (Ulkovalaistus)</span>
              </div>
              <button
                type="button"
                className="btn btn-xs btn-secondary"
                onClick={() => handleSelectTab('lighting')}
              >
                💡 Avaa ulkovalojen ohjaus →
              </button>
            </div>
            <div className="card-body">
              <div className="metrics-grid metrics-grid-4">
                <div className="metric-box">
                  <span className="metric-label">Hetkellinen teho</span>
                  <span className="metric-value" style={{ color: '#38bdf8' }}>
                    {outdoorLightsStatus?.telemetry?.power_w != null
                      ? `${outdoorLightsStatus.telemetry.power_w.toFixed(1)} W`
                      : '—'}
                  </span>
                </div>
                <div className="metric-box">
                  <span className="metric-label">Kokonaissähkö</span>
                  <span className="metric-value" style={{ color: '#4ade80' }}>
                    {outdoorLightsStatus?.telemetry?.energy_kwh != null
                      ? `${outdoorLightsStatus.telemetry.energy_kwh.toFixed(2)} kWh`
                      : '—'}
                  </span>
                </div>
                <div className="metric-box">
                  <span className="metric-label">Jännite & Virta</span>
                  <span className="metric-value" style={{ fontSize: 16 }}>
                    {outdoorLightsStatus?.telemetry?.voltage_v != null
                      ? `${outdoorLightsStatus.telemetry.voltage_v.toFixed(1)} V`
                      : '—'}
                    <span className="metric-unit">
                      ({outdoorLightsStatus?.telemetry?.current_a != null
                        ? `${outdoorLightsStatus.telemetry.current_a.toFixed(2)} A`
                        : '—'})
                    </span>
                  </span>
                </div>
                <div className="metric-box">
                  <span className="metric-label">Releen tila</span>
                  <span
                    className="metric-value"
                    style={{
                      fontSize: 15,
                      color: outdoorLightsStatus?.isOn ? '#4ade80' : 'var(--text-muted)',
                    }}
                  >
                    {outdoorLightsStatus?.isOn ? '⚡ Kytketty' : 'Pois päältä'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 2: OUTDOOR & INDOOR LIGHTING */}
      {subTab === 'lighting' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div>
            <div className="section-label" style={{ marginBottom: 10, color: '#facc15', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🏡</span> Ulkovalaistus
            </div>
            <ErrorBoundary>
              <OutdoorLightsCard readOnly={readOnly} />
            </ErrorBoundary>
          </div>

          <div>
            <div className="section-label" style={{ marginBottom: 12, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🏠</span> Sisävalot ({lightDevices.length} kpl)
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
              {/* A. Yläkerran WC */}
              {wcLights.map((d) => {
                const isOn = Boolean(d.properties.switch_led);
                const isOnline = Boolean(d.online);
                const bright = d.properties.bright_value ? Math.round(d.properties.bright_value / 10) : 100;

                return (
                  <div
                    key={d.id}
                    className="card"
                    style={{
                      background: isOn
                        ? 'linear-gradient(145deg, rgba(14, 165, 233, 0.12) 0%, rgba(15, 23, 42, 0.85) 100%)'
                        : 'linear-gradient(145deg, rgba(30, 41, 59, 0.65) 0%, rgba(15, 23, 42, 0.85) 100%)',
                      border: isOn ? '1px solid rgba(14, 165, 233, 0.45)' : '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: 16,
                      padding: 18,
                      boxShadow: isOn ? '0 8px 28px rgba(14, 165, 233, 0.14)' : 'none',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 10,
                            background: isOn ? 'rgba(14, 165, 233, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                            border: isOn ? '1px solid rgba(14, 165, 233, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 20,
                          }}
                        >
                          {isOn ? '🌊' : '🚽'}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                              Yläkerran WC ({d.name})
                            </span>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: '#38bdf8',
                                background: 'rgba(56, 189, 248, 0.15)',
                                border: '1px solid rgba(56, 189, 248, 0.3)',
                                padding: '2px 6px',
                                borderRadius: 6,
                              }}
                            >
                              🌊 Merelliset sävyt
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: isOnline ? 'var(--text-muted)' : '#ef4444', marginTop: 2 }}>
                            {isOnline ? (isOn ? `Päällä (${bright} %)` : 'Sammutettu') : 'Offline'}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => handleControlLight(d.id, { power: !isOn })}
                        style={{
                          background: isOn ? 'linear-gradient(135deg, #0284c7, #0369a1)' : 'rgba(255,255,255,0.08)',
                          border: isOn ? '1px solid rgba(2, 132, 199, 0.6)' : '1px solid rgba(255,255,255,0.15)',
                          color: '#fff',
                          fontSize: 12,
                          fontWeight: 700,
                          padding: '6px 16px',
                          borderRadius: 8,
                          cursor: readOnly ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {isOn ? '🌊 Päällä' : 'Pois päältä'}
                      </button>
                    </div>

                    {isOn && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(0,0,0,0.25)', padding: '8px 12px', borderRadius: 8 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 60 }}>Kirkkaus:</span>
                        <input
                          type="range"
                          min="10"
                          max="100"
                          value={bright}
                          disabled={readOnly}
                          onChange={(e) => handleControlLight(d.id, { power: true, brightness: Number(e.target.value) * 10 })}
                          style={{ flex: 1, accentColor: '#38bdf8', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: '#38bdf8', minWidth: 40, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {bright} %
                        </span>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 2 }}>Esiasetukset:</span>
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => handleControlLight(d.id, { power: true, mode: 'colour', colorHsv: { h: 210, s: 900, v: 750 } })}
                        style={{ background: 'rgba(14, 165, 233, 0.2)', border: '1px solid rgba(14, 165, 233, 0.45)', color: '#38bdf8', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 7, cursor: 'pointer' }}
                      >
                        🐬 Merensininen
                      </button>
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => handleControlLight(d.id, { power: true, mode: 'colour', colorHsv: { h: 175, s: 850, v: 700 } })}
                        style={{ background: 'rgba(20, 184, 166, 0.2)', border: '1px solid rgba(20, 184, 166, 0.45)', color: '#2dd4bf', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 7, cursor: 'pointer' }}
                      >
                        🏝️ Turkoosi
                      </button>
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => handleControlLight(d.id, { power: true, mode: 'white', colorTemp: 1000, brightness: 700 })}
                        style={{ background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.2)', color: '#fff', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 7, cursor: 'pointer' }}
                      >
                        ☀️ Lämmin
                      </button>
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => handleControlLight(d.id, { power: true, mode: 'white', colorTemp: 1000, brightness: 100 })}
                        style={{ background: 'rgba(251, 146, 60, 0.15)', border: '1px solid rgba(251, 146, 60, 0.3)', color: '#fb923c', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 7, cursor: 'pointer' }}
                      >
                        🌙 Yövalo 10%
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* B. Mancave / Leffahuone */}
              {mancaveLights.map((d) => {
                const isOn = Boolean(d.properties.switch_led);
                const isOnline = Boolean(d.online);
                const bright = d.properties.bright_value ? Math.round(d.properties.bright_value / 10) : 100;

                return (
                  <div
                    key={d.id}
                    className="card"
                    style={{
                      background: isOn
                        ? 'linear-gradient(145deg, rgba(168, 85, 247, 0.12) 0%, rgba(15, 23, 42, 0.85) 100%)'
                        : 'linear-gradient(145deg, rgba(30, 41, 59, 0.65) 0%, rgba(15, 23, 42, 0.85) 100%)',
                      border: isOn ? '1px solid rgba(168, 85, 247, 0.45)' : '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: 16,
                      padding: 18,
                      boxShadow: isOn ? '0 8px 28px rgba(168, 85, 247, 0.14)' : 'none',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 10,
                            background: isOn ? 'rgba(168, 85, 247, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                            border: isOn ? '1px solid rgba(168, 85, 247, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 20,
                          }}
                        >
                          🎬
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                              Mancave / Työhuone ({d.name})
                            </span>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: '#c084fc',
                                background: 'rgba(192, 132, 252, 0.15)',
                                border: '1px solid rgba(192, 132, 252, 0.3)',
                                padding: '2px 6px',
                                borderRadius: 6,
                              }}
                            >
                              🍿 Leffa & Työ
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: isOnline ? 'var(--text-muted)' : '#ef4444', marginTop: 2 }}>
                            {isOnline ? (isOn ? `Päällä (${bright} %)` : 'Sammutettu') : 'Offline'}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => handleControlLight(d.id, { power: !isOn })}
                        style={{
                          background: isOn ? 'linear-gradient(135deg, #a855f7, #9333ea)' : 'rgba(255,255,255,0.08)',
                          border: isOn ? '1px solid rgba(168, 85, 247, 0.6)' : '1px solid rgba(255,255,255,0.15)',
                          color: '#fff',
                          fontSize: 12,
                          fontWeight: 700,
                          padding: '6px 16px',
                          borderRadius: 8,
                          cursor: readOnly ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {isOn ? '🎬 Päällä' : 'Pois päältä'}
                      </button>
                    </div>

                    {isOn && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(0,0,0,0.25)', padding: '8px 12px', borderRadius: 8 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 60 }}>Kirkkaus:</span>
                        <input
                          type="range"
                          min="10"
                          max="100"
                          value={bright}
                          disabled={readOnly}
                          onChange={(e) => handleControlLight(d.id, { power: true, brightness: Number(e.target.value) * 10 })}
                          style={{ flex: 1, accentColor: '#c084fc', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: '#c084fc', minWidth: 40, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {bright} %
                        </span>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 2 }}>Esiasetukset:</span>
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => handleControlLight(d.id, { power: true, mode: 'colour', colorHsv: { h: 280, s: 900, v: 400 } })}
                        style={{ background: 'rgba(168, 85, 247, 0.2)', border: '1px solid rgba(168, 85, 247, 0.45)', color: '#c084fc', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 7, cursor: 'pointer' }}
                      >
                        🍿 Leffatila
                      </button>
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => handleControlLight(d.id, { power: true, mode: 'colour', colorHsv: { h: 340, s: 850, v: 600 } })}
                        style={{ background: 'rgba(244, 63, 94, 0.2)', border: '1px solid rgba(244, 63, 94, 0.45)', color: '#fb7185', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 7, cursor: 'pointer' }}
                      >
                        👾 Neon Magenta
                      </button>
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => handleControlLight(d.id, { power: true, mode: 'white', colorTemp: 500, brightness: 1000 })}
                        style={{ background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.2)', color: '#fff', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 7, cursor: 'pointer' }}
                      >
                        💡 Työvalo
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* C. Shared Sauna Lighting Card */}
              {saunaLights.length > 0 && (
                <SaunaLightsCard
                  saunaLights={saunaLights}
                  onControlLight={handleControlLight}
                  readOnly={readOnly}
                  compact
                />
              )}

              {/* D. Other Indoor Lights */}
              {otherLights.map((d) => {
                const isOn = Boolean(d.properties.switch_led);
                return (
                  <div
                    key={d.id}
                    className="card"
                    style={{
                      background: isOn ? 'rgba(56, 189, 248, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                      border: isOn ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: 16,
                      padding: 16,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{d.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {isOn ? 'Päällä' : 'Pois päältä'}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => handleControlLight(d.id, { power: !isOn })}
                      className={`btn btn-sm ${isOn ? 'btn-primary' : 'btn-secondary'}`}
                    >
                      {isOn ? 'Päällä' : 'Pois'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
