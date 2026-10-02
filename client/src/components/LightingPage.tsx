import React, { useState } from 'react';
import { OutdoorLightsCard } from './OutdoorLightsCard';
import { useTuya } from '../hooks/useTuya';
import { apiFetch } from '../lib/api';
import type { TuyaDevice } from '../types/tuya';
import { ErrorBoundary } from './ErrorBoundary';

interface LightingPageProps {
  readOnly?: boolean;
}

export const LightingPage: React.FC<LightingPageProps> = ({ readOnly = false }) => {
  const { devices, loading, refreshing, refreshDevices } = useTuya();
  const [showSaunaSub, setShowSaunaSub] = useState(false);

  const lightDevices = devices.filter((d) => d.type === 'light');

  const isSaunaLight = (d: TuyaDevice) => {
    const n = (d.name || '').toLowerCase();
    return (
      n.includes('kattovalo 2') ||
      n.includes('kattovalo 3') ||
      n.includes('kattovalo2') ||
      n.includes('kattovalo3') ||
      n.includes('saunavalo') ||
      n.includes('sauna') ||
      d.id === 'bf13f2d77b1ba3f1cfhv4h' ||
      d.id === 'bf40483433d60b29d5xfe5'
    );
  };

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
      (n.includes('kattovalo') && !isSaunaLight(d) && !isMancaveLight(d)) ||
      n.includes('wc') ||
      d.id === 'bfefd134eb01593593vfd6'
    );
  };

  const saunaLights = lightDevices.filter(isSaunaLight);
  const wcLights = lightDevices.filter(isWcLight);
  const mancaveLights = lightDevices.filter(isMancaveLight);
  const otherLights = lightDevices.filter(
    (d) => !isSaunaLight(d) && !isWcLight(d) && !isMancaveLight(d)
  );

  const handleControlLight = async (deviceId: string | string[], params: Record<string, any>) => {
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

  const turnAllIndoorOff = async () => {
    if (readOnly || lightDevices.length === 0) return;
    const allIds = lightDevices.map((d) => d.id);
    await handleControlLight(allIds, { power: false });
  };

  const activeCount = lightDevices.filter((d) => Boolean(d.properties.switch_led)).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginBottom: 36 }}>
      {/* Category Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>💡</span> Valaistus
          </h2>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>
            Ulkovalojen automaattinen hämäräohjaus ja kiinteistön älykkäät sisävalot
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {activeCount > 0 && (
            <button
              type="button"
              disabled={readOnly}
              onClick={turnAllIndoorOff}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                color: '#f87171',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>⏹️</span> Sammuta kaikki sisävalot ({activeCount})
            </button>
          )}

          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={refreshDevices}
            disabled={refreshing || loading}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              borderRadius: 8,
              border: '1px solid rgba(255, 255, 255, 0.1)',
              background: 'rgba(255, 255, 255, 0.04)',
              color: 'var(--text-primary)',
              cursor: refreshing ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>{refreshing ? '⏳' : '🔄'}</span>
            <span>{refreshing ? 'Päivitetään...' : 'Päivitä'}</span>
          </button>
        </div>
      </div>

      {/* 1. Outdoor Lights (Ulkovalot) */}
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#facc15', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>🏡</span> Ulkovalaistus
        </div>
        <ErrorBoundary>
          <OutdoorLightsCard readOnly={readOnly} />
        </ErrorBoundary>
      </div>

      {/* 2. Indoor Lights (Sisävalot) */}
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#38bdf8', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>🏠</span> Sisävalot ({lightDevices.length} kpl)
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
                  background: isOn ? 'linear-gradient(145deg, rgba(14, 165, 233, 0.12) 0%, rgba(15, 23, 42, 0.85) 100%)' : 'linear-gradient(145deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.85) 100%)',
                  border: isOn ? '1px solid rgba(14, 165, 233, 0.45)' : '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 16,
                  padding: 18,
                  boxShadow: isOn ? '0 8px 30px rgba(14, 165, 233, 0.15)' : 'none',
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                        {isOnline ? `${isOn ? `Päällä (${bright} %)` : 'Sammutettu'}` : 'Offline'}
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
                      boxShadow: isOn ? '0 2px 10px rgba(2, 132, 199, 0.35)' : 'none',
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
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8', minWidth: 40, textAlign: 'right' }}>
                      {bright} %
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 2 }}>Merelliset sävyt:</span>
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
                  background: isOn ? 'linear-gradient(145deg, rgba(168, 85, 247, 0.12) 0%, rgba(15, 23, 42, 0.85) 100%)' : 'linear-gradient(145deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.85) 100%)',
                  border: isOn ? '1px solid rgba(168, 85, 247, 0.45)' : '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 16,
                  padding: 18,
                  boxShadow: isOn ? '0 8px 30px rgba(168, 85, 247, 0.15)' : 'none',
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                        {isOnline ? `${isOn ? `Päällä (${bright} %)` : 'Sammutettu'}` : 'Offline'}
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
                      boxShadow: isOn ? '0 2px 10px rgba(168, 85, 247, 0.35)' : 'none',
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
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#c084fc', minWidth: 40, textAlign: 'right' }}>
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
                    🍿 Leffatila (Violetti)
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
                    💡 Työvalo (Kirkas)
                  </button>
                </div>
              </div>
            );
          })}

          {/* C. Saunan Kattovalot (Kattovalot 2 & 3) */}
          {saunaLights.length > 0 && (() => {
            const saunaIds = saunaLights.map((d) => d.id);
            const anySaunaOn = saunaLights.some((d) => Boolean(d.properties.switch_led));
            const avgBright = Math.round(
              saunaLights.reduce((acc, d) => acc + (d.properties.bright_value ? d.properties.bright_value / 10 : 100), 0) /
                saunaLights.length
            );

            return (
              <div
                className="card"
                style={{
                  background: anySaunaOn ? 'linear-gradient(145deg, rgba(234, 88, 12, 0.12) 0%, rgba(15, 23, 42, 0.85) 100%)' : 'linear-gradient(145deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.85) 100%)',
                  border: anySaunaOn ? '1px solid rgba(249, 115, 22, 0.45)' : '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 16,
                  padding: 18,
                  boxShadow: anySaunaOn ? '0 8px 30px rgba(249, 115, 22, 0.15)' : 'none',
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
                        background: anySaunaOn ? 'rgba(234, 88, 12, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                        border: anySaunaOn ? '1px solid rgba(234, 88, 12, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 20,
                      }}
                    >
                      🔥
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                          Saunan Valaistus (Ryhmä: 2 kpl)
                        </span>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: '#fb923c',
                            background: 'rgba(251, 146, 60, 0.15)',
                            border: '1px solid rgba(251, 146, 60, 0.3)',
                            padding: '2px 6px',
                            borderRadius: 6,
                          }}
                        >
                          🔥 Kiuashehku
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {anySaunaOn ? `Päällä (${avgBright} %)` : 'Sammutettu'}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => handleControlLight(saunaIds, { power: !anySaunaOn })}
                    style={{
                      background: anySaunaOn ? 'linear-gradient(135deg, #f97316, #ea580c)' : 'rgba(255,255,255,0.08)',
                      border: anySaunaOn ? '1px solid rgba(249, 115, 22, 0.6)' : '1px solid rgba(255,255,255,0.15)',
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 700,
                      padding: '6px 16px',
                      borderRadius: 8,
                      cursor: readOnly ? 'not-allowed' : 'pointer',
                      boxShadow: anySaunaOn ? '0 2px 10px rgba(249, 115, 22, 0.35)' : 'none',
                    }}
                  >
                    {anySaunaOn ? '🔥 Päällä' : 'Pois päältä'}
                  </button>
                </div>

                {anySaunaOn && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(0,0,0,0.25)', padding: '8px 12px', borderRadius: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 60 }}>Kirkkaus:</span>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      value={avgBright}
                      disabled={readOnly}
                      onChange={(e) => handleControlLight(saunaIds, { power: true, brightness: Number(e.target.value) * 10 })}
                      style={{ flex: 1, accentColor: '#f97316', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#f97316', minWidth: 40, textAlign: 'right' }}>
                      {avgBright} %
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 2 }}>Esiasetukset:</span>
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => handleControlLight(saunaIds, { power: true, mode: 'colour', colorHsv: { h: 20, s: 960, v: 500 } })}
                    style={{ background: 'rgba(234, 88, 12, 0.2)', border: '1px solid rgba(234, 88, 12, 0.45)', color: '#fb923c', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 7, cursor: 'pointer' }}
                  >
                    🔥 Kiuashehku
                  </button>
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => handleControlLight(saunaIds, { power: true, mode: 'colour', colorHsv: { h: 38, s: 800, v: 900 } })}
                    style={{ background: 'rgba(234, 179, 8, 0.2)', border: '1px solid rgba(234, 179, 8, 0.45)', color: '#facc15', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 7, cursor: 'pointer' }}
                  >
                    ✨ Saunakulta
                  </button>
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => handleControlLight(saunaIds, { power: true, mode: 'white', colorTemp: 1000, brightness: 700 })}
                    style={{ background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.2)', color: '#fff', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 7, cursor: 'pointer' }}
                  >
                    ☀️ Lämmin valkoinen
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowSaunaSub(!showSaunaSub)}
                    style={{
                      marginLeft: 'auto',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      fontSize: 11,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <span>{showSaunaSub ? 'Piilota yksittäiset' : 'Yksittäiset valot'}</span>
                    <span>{showSaunaSub ? '▲' : '▼'}</span>
                  </button>
                </div>

                {showSaunaSub && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginTop: 4, paddingTop: 8, borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
                    {saunaLights.map((d) => {
                      const isOn = Boolean(d.properties.switch_led);
                      const b = d.properties.bright_value ? Math.round(d.properties.bright_value / 10) : 100;
                      return (
                        <div key={d.id} style={{ background: 'rgba(0,0,0,0.25)', padding: '8px 10px', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600 }}>{d.name}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{isOn ? `Päällä (${b} %)` : 'Pois'}</div>
                          </div>
                          <button
                            type="button"
                            disabled={readOnly}
                            onClick={() => handleControlLight(d.id, { power: !isOn })}
                            style={{
                              background: isOn ? '#f97316' : 'rgba(255,255,255,0.1)',
                              border: 'none',
                              color: '#fff',
                              fontSize: 10,
                              fontWeight: 600,
                              padding: '3px 8px',
                              borderRadius: 5,
                              cursor: 'pointer',
                            }}
                          >
                            {isOn ? 'Päällä' : 'Pois'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* D. Muut sisävalot */}
          {otherLights.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
              {otherLights.map((d) => {
                const isOn = Boolean(d.properties.switch_led);
                return (
                  <div
                    key={d.id}
                    className="card"
                    style={{
                      background: isOn ? 'rgba(56, 189, 248, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                      border: isOn ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: 14,
                      padding: 14,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{d.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{isOn ? 'Päällä' : 'Pois päältä'}</div>
                    </div>
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => handleControlLight(d.id, { power: !isOn })}
                      style={{
                        background: isOn ? '#38bdf8' : 'rgba(255,255,255,0.1)',
                        border: 'none',
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 600,
                        padding: '6px 14px',
                        borderRadius: 8,
                        cursor: readOnly ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {isOn ? 'Päällä' : 'Pois'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
