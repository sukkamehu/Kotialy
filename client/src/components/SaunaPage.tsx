import React, { useState } from 'react';
import { SaunaCard } from './SaunaCard';
import { useTuya } from '../hooks/useTuya';
import { apiFetch } from '../lib/api';
import type { TuyaDevice } from '../types/tuya';
import { ErrorBoundary } from './ErrorBoundary';

interface SaunaPageProps {
  readOnly?: boolean;
}

export const SaunaPage: React.FC<SaunaPageProps> = ({ readOnly = false }) => {
  const { devices, refreshDevices } = useTuya();
  const [showIndividualLights, setShowIndividualLights] = useState(false);

  // Group lights for sauna
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

  const saunaLights = devices.filter((d) => d.type === 'light' && isSaunaLight(d));

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

  const saunaIds = saunaLights.map((d) => d.id);
  const anySaunaOn = saunaLights.some((d) => Boolean(d.properties.switch_led));
  const allSaunaOnline = saunaLights.length > 0 && saunaLights.every((d) => d.online);
  const avgBright = saunaLights.length > 0
    ? Math.round(
        saunaLights.reduce((acc, d) => acc + (d.properties.bright_value ? d.properties.bright_value / 10 : 100), 0) /
          saunaLights.length
      )
    : 100;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 36 }}>
      {/* Category Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>🧖‍♂️</span> Saunatilat
          </h2>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>
            Kiukaan etäohjaus, turva-ajastin, saunan tunnelmavalaistus ja reaaliaikaiset mittaukset
          </div>
        </div>
      </div>

      {/* 1. Main Sauna Heating Widget (SaunaCard) */}
      <ErrorBoundary>
        <SaunaCard readOnly={readOnly} />
      </ErrorBoundary>

      {/* 2. Sauna Lighting & Atmosphere Control Card */}
      <ErrorBoundary>
        <div
          className="card"
          style={{
            background: anySaunaOn
              ? 'linear-gradient(145deg, rgba(234, 88, 12, 0.12) 0%, rgba(15, 23, 42, 0.85) 100%)'
              : 'linear-gradient(145deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.85) 100%)',
            border: anySaunaOn ? '1px solid rgba(249, 115, 22, 0.45)' : '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 16,
            padding: 20,
            boxShadow: anySaunaOn ? '0 8px 32px rgba(249, 115, 22, 0.15)' : 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {/* Card Header & Master Toggle */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: anySaunaOn ? 'rgba(234, 88, 12, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                  border: anySaunaOn ? '1px solid rgba(234, 88, 12, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 22,
                }}
              >
                💡
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>
                    Saunan Valaistus
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#fb923c',
                      background: 'rgba(251, 146, 60, 0.15)',
                      border: '1px solid rgba(251, 146, 60, 0.3)',
                      padding: '2px 8px',
                      borderRadius: 8,
                    }}
                  >
                    🔥 Tunnelmavalaistus
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {allSaunaOnline
                    ? `${anySaunaOn ? `Päällä (${avgBright} %)` : 'Sammutettu'} · Kiuashehku aktivoituu automaattisesti kiukaan lämmetessä`
                    : 'Kattovalot valmiudessa'}
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={readOnly || saunaIds.length === 0}
              onClick={() => handleControlLight(saunaIds, { power: !anySaunaOn })}
              style={{
                background: anySaunaOn ? 'linear-gradient(135deg, #f97316, #ea580c)' : 'rgba(255, 255, 255, 0.08)',
                border: anySaunaOn ? '1px solid rgba(249, 115, 22, 0.6)' : '1px solid rgba(255, 255, 255, 0.15)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                padding: '8px 18px',
                borderRadius: 10,
                cursor: readOnly ? 'not-allowed' : 'pointer',
                boxShadow: anySaunaOn ? '0 2px 14px rgba(249, 115, 22, 0.4)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              {anySaunaOn ? '🔥 Valot Päällä' : 'Kytke päälle'}
            </button>
          </div>

          {/* Master Brightness Slider */}
          {anySaunaOn && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(0,0,0,0.25)', padding: '10px 16px', borderRadius: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', minWidth: 70 }}>Kirkkaus:</span>
              <input
                type="range"
                min="10"
                max="100"
                value={avgBright}
                disabled={readOnly}
                onChange={(e) => handleControlLight(saunaIds, { power: true, brightness: Number(e.target.value) * 10 })}
                style={{ flex: 1, accentColor: '#f97316', cursor: 'pointer' }}
              />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#f97316', minWidth: 45, textAlign: 'right' }}>
                {avgBright} %
              </span>
            </div>
          )}

          {/* Atmospheric Lighting Presets */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 2 }}>Esiasetukset:</span>
            <button
              type="button"
              disabled={readOnly || saunaIds.length === 0}
              onClick={() => handleControlLight(saunaIds, { power: true, mode: 'colour', colorHsv: { h: 20, s: 960, v: 500 } })}
              title="Kiuashehku (syvä oranssi hiillos)"
              style={{
                background: 'rgba(234, 88, 12, 0.2)',
                border: '1px solid rgba(234, 88, 12, 0.45)',
                color: '#fb923c',
                fontSize: 12,
                fontWeight: 600,
                padding: '6px 12px',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              🔥 Kiuashehku
            </button>
            <button
              type="button"
              disabled={readOnly || saunaIds.length === 0}
              onClick={() => handleControlLight(saunaIds, { power: true, mode: 'colour', colorHsv: { h: 38, s: 800, v: 900 } })}
              title="Saunakulta (lämmin kultainen hehku)"
              style={{
                background: 'rgba(234, 179, 8, 0.2)',
                border: '1px solid rgba(234, 179, 8, 0.45)',
                color: '#facc15',
                fontSize: 12,
                fontWeight: 600,
                padding: '6px 12px',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              ✨ Saunakulta
            </button>
            <button
              type="button"
              disabled={readOnly || saunaIds.length === 0}
              onClick={() => handleControlLight(saunaIds, { power: true, mode: 'colour', colorHsv: { h: 26, s: 920, v: 400 } })}
              title="Savusauna (pehmeä syvä meripihka)"
              style={{
                background: 'rgba(180, 83, 9, 0.2)',
                border: '1px solid rgba(180, 83, 9, 0.45)',
                color: '#fde047',
                fontSize: 12,
                fontWeight: 600,
                padding: '6px 12px',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              🌲 Savusauna
            </button>
            <button
              type="button"
              disabled={readOnly || saunaIds.length === 0}
              onClick={() => handleControlLight(saunaIds, { power: true, mode: 'white', colorTemp: 1000, brightness: 700 })}
              title="Lämmin valkoinen"
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#fff',
                fontSize: 12,
                fontWeight: 600,
                padding: '6px 12px',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              ☀️ Lämmin valkoinen
            </button>
            <button
              type="button"
              disabled={readOnly || saunaIds.length === 0}
              onClick={() => handleControlLight(saunaIds, { power: true, mode: 'white', colorTemp: 0, brightness: 1000 })}
              title="Kirkas siivousvalo"
              style={{
                background: 'rgba(147, 197, 253, 0.15)',
                border: '1px solid rgba(147, 197, 253, 0.3)',
                color: '#bfdbfe',
                fontSize: 12,
                fontWeight: 600,
                padding: '6px 12px',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              ❄️ Siivousvalo
            </button>

            <button
              type="button"
              onClick={() => setShowIndividualLights(!showIndividualLights)}
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
              <span>{showIndividualLights ? 'Piilota kattovalot' : 'Yksittäiset kattovalot'}</span>
              <span>{showIndividualLights ? '▲' : '▼'}</span>
            </button>
          </div>

          {/* Optional Individual Sauna Lights */}
          {showIndividualLights && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 4, paddingTop: 10, borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
              {saunaLights.map((d: TuyaDevice) => {
                const isOn = Boolean(d.properties.switch_led);
                const b = d.properties.bright_value ? Math.round(d.properties.bright_value / 10) : 100;
                return (
                  <div key={d.id} style={{ background: 'rgba(0,0,0,0.25)', padding: '10px 12px', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{d.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{isOn ? `Päällä (${b} %)` : 'Pois'}</div>
                    </div>
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => handleControlLight(d.id, { power: !isOn })}
                      style={{
                        background: isOn ? '#f97316' : 'rgba(255,255,255,0.1)',
                        border: 'none',
                        color: '#fff',
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '4px 10px',
                        borderRadius: 6,
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
      </ErrorBoundary>
    </div>
  );
};
