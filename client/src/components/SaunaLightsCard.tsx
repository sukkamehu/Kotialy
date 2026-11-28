import React, { useState } from 'react';
import type { TuyaDevice } from '../types/tuya';

interface SaunaLightsCardProps {
  saunaLights: TuyaDevice[];
  onControlLight: (deviceId: string | string[], params: Record<string, unknown>) => Promise<void> | void;
  readOnly?: boolean;
  compact?: boolean;
}

export function isSaunaLightDevice(d: TuyaDevice): boolean {
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
}

/**
 * Shared Sauna atmospheric lighting control card used in both SaunaPage
 * and the Lighting section of DevicesControlPage (single source of truth).
 */
export const SaunaLightsCard: React.FC<SaunaLightsCardProps> = ({
  saunaLights,
  onControlLight,
  readOnly = false,
  compact = false,
}) => {
  const [showIndividualLights, setShowIndividualLights] = useState(false);

  const saunaIds = saunaLights.map((d) => d.id);
  const anySaunaOn = saunaLights.some((d) => Boolean(d.properties.switch_led));
  const allSaunaOnline = saunaLights.length > 0 && saunaLights.every((d) => d.online);
  const avgBright =
    saunaLights.length > 0
      ? Math.round(
          saunaLights.reduce(
            (acc, d) => acc + (d.properties.bright_value ? d.properties.bright_value / 10 : 100),
            0
          ) / saunaLights.length
        )
      : 100;

  return (
    <div
      className="card"
      style={{
        background: anySaunaOn
          ? 'linear-gradient(145deg, rgba(234, 88, 12, 0.12) 0%, rgba(15, 23, 42, 0.85) 100%)'
          : 'linear-gradient(145deg, rgba(30, 41, 59, 0.65) 0%, rgba(15, 23, 42, 0.85) 100%)',
        border: anySaunaOn ? '1px solid rgba(249, 115, 22, 0.45)' : '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 16,
        padding: compact ? 18 : 20,
        boxShadow: anySaunaOn ? '0 8px 28px rgba(249, 115, 22, 0.14)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 12 : 16,
      }}
    >
      {/* Header & Master Toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: compact ? 40 : 44,
              height: compact ? 40 : 44,
              borderRadius: 12,
              background: anySaunaOn ? 'rgba(234, 88, 12, 0.25)' : 'rgba(255, 255, 255, 0.05)',
              border: anySaunaOn ? '1px solid rgba(234, 88, 12, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: compact ? 20 : 22,
            }}
          >
            {anySaunaOn ? '🔥' : '💡'}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: compact ? 15 : 16, color: 'var(--text-primary)' }}>
                Saunan valaistus {saunaLights.length > 0 ? `(${saunaLights.length} kpl)` : ''}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#fb923c',
                  background: 'rgba(251, 146, 60, 0.15)',
                  border: '1px solid rgba(251, 146, 60, 0.3)',
                  padding: '2px 7px',
                  borderRadius: 6,
                }}
              >
                🔥 Kiuashehku
              </span>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
              {allSaunaOnline
                ? `${anySaunaOn ? `Päällä (${avgBright} %)` : 'Sammutettu'}${compact ? '' : ' · Kiuashehku aktivoituu automaattisesti kiukaan lämmetessä'}`
                : saunaLights.length > 0
                ? 'Kattovalot valmiudessa'
                : 'Ei yhdistettyjä saunavaloja'}
            </div>
          </div>
        </div>

        <button
          type="button"
          disabled={readOnly || saunaIds.length === 0}
          onClick={() => onControlLight(saunaIds, { power: !anySaunaOn })}
          style={{
            background: anySaunaOn ? 'linear-gradient(135deg, #f97316, #ea580c)' : 'rgba(255, 255, 255, 0.08)',
            border: anySaunaOn ? '1px solid rgba(249, 115, 22, 0.6)' : '1px solid rgba(255, 255, 255, 0.15)',
            color: '#fff',
            fontSize: 12.5,
            fontWeight: 700,
            padding: '7px 16px',
            borderRadius: 9,
            cursor: readOnly || saunaIds.length === 0 ? 'not-allowed' : 'pointer',
            boxShadow: anySaunaOn ? '0 2px 12px rgba(249, 115, 22, 0.35)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          {anySaunaOn ? '🔥 Valot päällä' : 'Kytke päälle'}
        </button>
      </div>

      {/* Brightness Slider */}
      {anySaunaOn && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(0,0,0,0.25)', padding: '9px 14px', borderRadius: 10 }}>
          <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', minWidth: 64 }}>Kirkkaus:</span>
          <input
            type="range"
            min="10"
            max="100"
            value={avgBright}
            disabled={readOnly}
            onChange={(e) => onControlLight(saunaIds, { power: true, brightness: Number(e.target.value) * 10 })}
            style={{ flex: 1, accentColor: '#f97316', cursor: 'pointer' }}
          />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#f97316', minWidth: 42, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            {avgBright} %
          </span>
        </div>
      )}

      {/* Atmospheric Presets */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11.5, color: 'var(--text-muted)', marginRight: 2 }}>Esiasetukset:</span>
        <button
          type="button"
          disabled={readOnly || saunaIds.length === 0}
          onClick={() => onControlLight(saunaIds, { power: true, mode: 'colour', colorHsv: { h: 20, s: 960, v: 500 } })}
          title="Kiuashehku (syvä oranssi hiillos)"
          style={{
            background: 'rgba(234, 88, 12, 0.2)',
            border: '1px solid rgba(234, 88, 12, 0.45)',
            color: '#fb923c',
            fontSize: 11.5,
            fontWeight: 600,
            padding: '5px 10px',
            borderRadius: 7,
            cursor: 'pointer',
          }}
        >
          🔥 Kiuashehku
        </button>
        <button
          type="button"
          disabled={readOnly || saunaIds.length === 0}
          onClick={() => onControlLight(saunaIds, { power: true, mode: 'colour', colorHsv: { h: 38, s: 800, v: 900 } })}
          title="Saunakulta (lämmin kultainen hehku)"
          style={{
            background: 'rgba(234, 179, 8, 0.2)',
            border: '1px solid rgba(234, 179, 8, 0.45)',
            color: '#facc15',
            fontSize: 11.5,
            fontWeight: 600,
            padding: '5px 10px',
            borderRadius: 7,
            cursor: 'pointer',
          }}
        >
          ✨ Saunakulta
        </button>
        <button
          type="button"
          disabled={readOnly || saunaIds.length === 0}
          onClick={() => onControlLight(saunaIds, { power: true, mode: 'colour', colorHsv: { h: 26, s: 920, v: 400 } })}
          title="Savusauna (pehmeä syvä meripihka)"
          style={{
            background: 'rgba(180, 83, 9, 0.2)',
            border: '1px solid rgba(180, 83, 9, 0.45)',
            color: '#fde047',
            fontSize: 11.5,
            fontWeight: 600,
            padding: '5px 10px',
            borderRadius: 7,
            cursor: 'pointer',
          }}
        >
          🌲 Savusauna
        </button>
        <button
          type="button"
          disabled={readOnly || saunaIds.length === 0}
          onClick={() => onControlLight(saunaIds, { power: true, mode: 'white', colorTemp: 1000, brightness: 700 })}
          title="Lämmin valkoinen"
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            color: '#fff',
            fontSize: 11.5,
            fontWeight: 600,
            padding: '5px 10px',
            borderRadius: 7,
            cursor: 'pointer',
          }}
        >
          ☀️ Lämmin valkoinen
        </button>
        <button
          type="button"
          disabled={readOnly || saunaIds.length === 0}
          onClick={() => onControlLight(saunaIds, { power: true, mode: 'white', colorTemp: 0, brightness: 1000 })}
          title="Kirkas siivousvalo"
          style={{
            background: 'rgba(147, 197, 253, 0.15)',
            border: '1px solid rgba(147, 197, 253, 0.3)',
            color: '#bfdbfe',
            fontSize: 11.5,
            fontWeight: 600,
            padding: '5px 10px',
            borderRadius: 7,
            cursor: 'pointer',
          }}
        >
          ❄️ Siivousvalo
        </button>

        {saunaLights.length > 1 && (
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
            <span>{showIndividualLights ? 'Piilota yksittäiset' : 'Yksittäiset valot'}</span>
            <span>{showIndividualLights ? '▲' : '▼'}</span>
          </button>
        )}
      </div>

      {/* Optional Individual Sauna Lights */}
      {showIndividualLights && saunaLights.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 8,
            marginTop: 4,
            paddingTop: 10,
            borderTop: '1px dashed rgba(255,255,255,0.1)',
          }}
        >
          {saunaLights.map((d) => {
            const isOn = Boolean(d.properties.switch_led);
            const b = d.properties.bright_value ? Math.round(d.properties.bright_value / 10) : 100;
            return (
              <div
                key={d.id}
                style={{
                  background: 'rgba(0,0,0,0.25)',
                  padding: '9px 12px',
                  borderRadius: 9,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{d.name}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                    {isOn ? `Päällä (${b} %)` : 'Pois'}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => onControlLight(d.id, { power: !isOn })}
                  style={{
                    background: isOn ? '#f97316' : 'rgba(255,255,255,0.1)',
                    border: 'none',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '4px 10px',
                    borderRadius: 6,
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
  );
};
