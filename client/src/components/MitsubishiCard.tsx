import React, { useState, useEffect } from 'react';
import { useMitsubishi } from '../hooks/useMitsubishi';
import { useElectricityPrice } from '../hooks/useElectricityPrice';
import type { MitsubishiOperatingMode, MitsubishiUnitStatus } from '../types/mitsubishi';

interface MitsubishiCardProps {
  readOnly?: boolean;
}

export const MitsubishiCard: React.FC<MitsubishiCardProps> = ({ readOnly = false }) => {
  const { status, loading, saving, setControl, updateSettings, setOverride } = useMitsubishi();
  const { priceCentsKWh } = useElectricityPrice();

  const [frostTempInput, setFrostTempInput] = useState<string>('-12.0');
  const [maxPriceInput, setMaxPriceInput] = useState<string>('20.0');
  const [heatTargetInput, setHeatTargetInput] = useState<string>('21.0');
  const [coolTargetInput, setCoolTargetInput] = useState<string>('23.0');
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const [showRationale, setShowRationale] = useState(true);

  useEffect(() => {
    if (status?.settings && !isEditingSettings) {
      setFrostTempInput(String(status.settings.frostAssistTemp));
      setMaxPriceInput(String(status.settings.maxPriceLimit));
      setHeatTargetInput(String(status.settings.heatTarget));
      setCoolTargetInput(String(status.settings.coolTarget));
    }
  }, [status?.settings, isEditingSettings]);

  if (loading && !status) {
    return (
      <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
        ⏳ Ladataan Mitsubishi ILP -tietoja (ESPHome CN105)...
      </div>
    );
  }

  const settings = status?.settings;
  const units = status?.units || [];
  const ylakertaUnit = units.find((u) => u.id === 'mitsubishi_ylakerta') || units[1];
  const alakertaUnit = units.find((u) => u.id === 'mitsubishi_alakerta') || units[0];

  const currentMode = settings?.mode || 'smart_assist';
  const isOverride = status?.overrideActive;
  const overrideMin = status?.overrideMinutesRemaining ?? 0;
  const outdoorTemp = status?.outdoorTemp;

  const handleModeSelect = async (mode: MitsubishiOperatingMode) => {
    if (readOnly) return;
    await updateSettings({ mitsu_mode: mode });
  };

  const handleUnitModeSelect = async (unitId: string, mode: string) => {
    if (readOnly) return;
    const unit = units.find((u) => u.id === unitId);
    const targetTemp = unit?.targetTemperature ?? (mode === 'COOL' ? 23 : 21);
    await setControl({ unitId, mode, target_temperature: targetTemp });
  };

  const handleSaveSettings = async () => {
    if (readOnly) return;
    const frost = parseFloat(frostTempInput);
    const price = parseFloat(maxPriceInput);
    const heat = parseFloat(heatTargetInput);
    const cool = parseFloat(coolTargetInput);

    if (isNaN(frost) || isNaN(price) || isNaN(heat) || isNaN(cool)) return;

    setIsEditingSettings(false);
    await updateSettings({
      mitsu_frost_assist_temp: frost,
      mitsu_max_price_cents: price,
      mitsu_heat_target_c: heat,
      mitsu_cool_target_c: cool,
    });
  };

  const handleQuickOverride = async (mode: string | null, hours: number, temp?: number) => {
    if (readOnly) return;
    await setOverride(mode, hours, temp);
  };

  const handleTempAdjust = async (unitId: string, currentTarget: number | null, delta: number, currentUnitMode?: string) => {
    if (readOnly || currentTarget == null) return;
    const newTarget = Math.round((currentTarget + delta) * 2) / 2;
    if (currentUnitMode === 'OFF') {
      await setControl({ unitId, mode: 'HEAT', target_temperature: newTarget });
    } else {
      await setControl({ unitId, target_temperature: newTarget });
    }
  };

  const handleFanSelect = async (unitId: string, fan_mode: string) => {
    if (readOnly) return;
    await setControl({ unitId, fan_mode });
  };

  // Determine active strategy badge label and styling
  let badgeLabel = '⏸️ Lattialämmitys priorisoitu';
  let badgeColor = '#10b981';
  let badgeBg = 'rgba(16, 185, 129, 0.15)';
  let badgeBorder = 'rgba(16, 185, 129, 0.35)';

  if (isOverride) {
    badgeLabel = `⚡ Ohitus aktiivinen (${status?.overrideState?.mode || 'MANUAALI'} · ~${overrideMin} min)`;
    badgeColor = '#f59e0b';
    badgeBg = 'rgba(245, 158, 11, 0.15)';
    badgeBorder = 'rgba(245, 158, 11, 0.4)';
  } else if (currentMode === 'smart_assist') {
    if (outdoorTemp != null && outdoorTemp <= (settings?.frostAssistTemp ?? -12)) {
      badgeLabel = '🛡️ Pakkasavustus aktiivinen (Vastussuoja)';
      badgeColor = '#c084fc';
      badgeBg = 'rgba(192, 132, 252, 0.2)';
      badgeBorder = 'rgba(192, 132, 252, 0.45)';
    } else {
      badgeLabel = '⏸️ Lattialämmitys priorisoitu (Valmiustila)';
      badgeColor = '#38bdf8';
      badgeBg = 'rgba(56, 189, 248, 0.12)';
      badgeBorder = 'rgba(56, 189, 248, 0.3)';
    }
  } else if (currentMode === 'fan_only') {
    badgeLabel = '🔥 Takkakierto (Ilman kompressoria)';
    badgeColor = '#f97316';
    badgeBg = 'rgba(249, 115, 22, 0.15)';
    badgeBorder = 'rgba(249, 115, 22, 0.35)';
  } else if (currentMode === 'cool') {
    badgeLabel = '❄️ Viilennys';
    badgeColor = '#06b6d4';
    badgeBg = 'rgba(6, 182, 212, 0.15)';
    badgeBorder = 'rgba(6, 182, 212, 0.35)';
  } else if (currentMode === 'heat') {
    badgeLabel = '♨️ Jatkuva lämmitys';
    badgeColor = '#ef4444';
    badgeBg = 'rgba(239, 68, 68, 0.15)';
    badgeBorder = 'rgba(239, 68, 68, 0.35)';
  } else if (currentMode === 'off') {
    badgeLabel = '⏹️ Sammutettu';
    badgeColor = '#94a3b8';
    badgeBg = 'rgba(148, 163, 184, 0.1)';
    badgeBorder = 'rgba(148, 163, 184, 0.25)';
  }

  const renderUnitCard = (
    unit: MitsubishiUnitStatus | undefined,
    fallbackId: string,
    fallbackName: string,
    fallbackHost: string,
    icon: string
  ) => {
    const isConnected = unit?.connected ?? false;
    const unitId = unit?.id || fallbackId;
    const unitName = unit?.name || fallbackName;
    const unitHost = unit?.host || fallbackHost;

    return (
      <div
        key={unitId}
        style={{
          background: 'rgba(0, 0, 0, 0.35)',
          border: isConnected
            ? '1px solid rgba(74, 222, 128, 0.3)'
            : '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 14,
          padding: 16,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1.2rem' }}>{icon}</span>
            <div>
              <strong style={{ fontSize: '0.98rem', color: 'var(--text-primary)' }}>
                {unitName}
              </strong>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {unitHost}
              </div>
            </div>
          </div>

          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              color: isConnected ? '#4ade80' : '#f87171',
              background: isConnected ? 'rgba(74, 222, 128, 0.15)' : 'rgba(248, 113, 113, 0.15)',
              padding: '2px 8px',
              borderRadius: 12,
              border: `1px solid ${isConnected ? 'rgba(74, 222, 128, 0.3)' : 'rgba(248, 113, 113, 0.3)'}`,
            }}
          >
            {isConnected ? '● Yhdistetty (Live)' : '○ Ei yhteyttä'}
          </span>
        </div>

        {isConnected ? (
          <>
            {/* Temperature & Action Row */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'rgba(255, 255, 255, 0.03)',
                borderRadius: 10,
                padding: '12px 14px',
                marginBottom: 12,
              }}
            >
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Huonelämpö
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#38bdf8' }}>
                  {unit?.currentTemperature != null
                    ? `${unit.currentTemperature.toFixed(1)} °C`
                    : '--'}
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Tavoitelämpö
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  {!readOnly && (
                    <button
                      onClick={() => handleTempAdjust(unitId, unit?.targetTemperature ?? 21, -0.5, unit?.mode)}
                      disabled={saving}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 6,
                        background: 'rgba(255, 255, 255, 0.1)',
                        border: 'none',
                        color: 'white',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      -
                    </button>
                  )}
                  <span style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-primary)', minWidth: 55, textAlign: 'center' }}>
                    {unit?.targetTemperature != null
                      ? `${unit.targetTemperature.toFixed(1)}°`
                      : '--'}
                  </span>
                  {!readOnly && (
                    <button
                      onClick={() => handleTempAdjust(unitId, unit?.targetTemperature ?? 21, 0.5, unit?.mode)}
                      disabled={saving}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 6,
                        background: 'rgba(255, 255, 255, 0.1)',
                        border: 'none',
                        color: 'white',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      +
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Direct Unit Mode Buttons (HEAT, COOL, FAN, OFF) */}
            {!readOnly && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                  Aseta laitteen tila suoraan:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                  {[
                    { mode: 'HEAT', label: '♨️ Lämpö', color: '#ef4444' },
                    { mode: 'COOL', label: '❄️ Viileä', color: '#06b6d4' },
                    { mode: 'FAN_ONLY', label: '🔥 Puhallus', color: '#f97316' },
                    { mode: 'OFF', label: '⏹️ Pois', color: '#94a3b8' },
                  ].map((btn) => {
                    const isActive = unit?.mode === btn.mode;
                    return (
                      <button
                        key={btn.mode}
                        onClick={() => handleUnitModeSelect(unitId, btn.mode)}
                        disabled={saving}
                        style={{
                          padding: '7px 4px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          borderRadius: 8,
                          border: isActive ? `1.5px solid ${btn.color}` : '1px solid rgba(255, 255, 255, 0.1)',
                          background: isActive ? `${btn.color}25` : 'rgba(255, 255, 255, 0.04)',
                          color: isActive ? 'white' : 'var(--text-muted)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {btn.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Current State Badges */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <div
                style={{
                  flex: 1,
                  minWidth: 90,
                  background: 'rgba(255, 255, 255, 0.04)',
                  borderRadius: 8,
                  padding: '6px 10px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Tila</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {unit?.mode || 'OFF'}
                </div>
              </div>

              <div
                style={{
                  flex: 1,
                  minWidth: 90,
                  background: 'rgba(255, 255, 255, 0.04)',
                  borderRadius: 8,
                  padding: '6px 10px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Toiminta</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#38bdf8' }}>
                  {unit?.action || 'IDLE'}
                </div>
              </div>

              <div
                style={{
                  flex: 1,
                  minWidth: 90,
                  background: 'rgba(255, 255, 255, 0.04)',
                  borderRadius: 8,
                  padding: '6px 10px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Puhallin</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#a78bfa' }}>
                  {unit?.fanMode || 'AUTO'}
                </div>
              </div>
            </div>

            {/* Quick Fan Control Bar */}
            {!readOnly && (
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                  Puhallinnopeus:
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {['AUTO', 'QUIET', 'LOW', 'MEDIUM', 'HIGH'].map((fan) => (
                    <button
                      key={fan}
                      onClick={() => handleFanSelect(unitId, fan)}
                      disabled={saving}
                      style={{
                        flex: 1,
                        padding: '5px 2px',
                        fontSize: '0.68rem',
                        fontWeight: 600,
                        borderRadius: 6,
                        border: unit?.fanMode === fan
                          ? '1px solid #38bdf8'
                          : '1px solid rgba(255, 255, 255, 0.1)',
                        background: unit?.fanMode === fan
                          ? 'rgba(56, 189, 248, 0.25)'
                          : 'rgba(255, 255, 255, 0.04)',
                        color: unit?.fanMode === fan ? 'white' : 'var(--text-muted)',
                        cursor: 'pointer',
                      }}
                    >
                      {fan}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div
            style={{
              padding: '24px 14px',
              background: 'rgba(255, 255, 255, 0.02)',
              borderRadius: 10,
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: '0.82rem',
              lineHeight: 1.4,
            }}
          >
            <div>Laite offline-tilassa tai yhteys katkennut.</div>
            <div style={{ fontSize: '0.74rem', marginTop: 4, color: '#94a3b8' }}>
              Tarkista virrat ja verkkoyhteys ({unitHost}).
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="card"
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.75) 0%, rgba(15, 23, 42, 0.95) 100%)',
        border: '1px solid rgba(56, 189, 248, 0.25)',
        borderRadius: 18,
        padding: '22px 24px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)',
        marginBottom: 20,
      }}
    >
      {/* Top Accent Glow */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: '5%',
          right: '5%',
          height: '2px',
          background: 'linear-gradient(90deg, transparent, rgba(56, 189, 248, 0.8), transparent)',
          pointerEvents: 'none',
        }}
      />

      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 12,
          paddingBottom: 16,
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(168, 85, 247, 0.15))',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.4rem',
              boxShadow: '0 0 15px rgba(56, 189, 248, 0.2)',
            }}
          >
            🌬️
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Mitsubishi Ilmalämpöpumput (ILP)
              </h3>
              <span
                style={{
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  color: badgeColor,
                  background: badgeBg,
                  border: `1px solid ${badgeBorder}`,
                  padding: '3px 10px',
                  borderRadius: 20,
                }}
              >
                {badgeLabel}
              </span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 3 }}>
              ESPHome CN105 Suora Ohjaus · Yläkerta (192.168.68.64) & Alakerta (192.168.68.65) · Hybridi-automaatio
            </div>
          </div>
        </div>

        {/* Live Reason Banner */}
        <div style={{ textAlign: 'right', maxWidth: 420 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 2 }}>
            Kotiäly-ohjaustilanne:
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.3 }}>
            {status?.reason || 'Automaatio aktiivinen'}
          </div>
        </div>
      </div>

      {/* Engineering Rationale Box (Collapsible) */}
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 12,
          padding: '12px 16px',
          marginBottom: 18,
          fontSize: '0.82rem',
          lineHeight: 1.5,
          color: 'var(--text-secondary)',
        }}
      >
        <div
          onClick={() => setShowRationale(!showRationale)}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            fontWeight: 600,
            color: '#38bdf8',
          }}
        >
          <span>💡 Miksi ILP ei lämmitä leudolla säällä?</span>
          <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>{showRationale ? 'Piilota ▲' : 'Näytä ▼'}</span>
        </div>

        {showRationale && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <p style={{ margin: '0 0 6px 0' }}>
              <strong>Lattialämmityksen häiriytyminen:</strong> Vesikiertoisen lattialämmityksen (Panasonic 12 kW VILP)
              hyötysuhde ja asumismukavuus perustuvat puukoolatun kipsilattian tasaiseen lämmönjakoon. Puukoolatussa kipsirakenteessa
              lämpökapasiteetti on maltillinen: jos ILP puhaltaa huoneilman liian lämpimäksi leudolla säällä, huonetermostaatit
              sulkeutuvat ja lattia viilenee nopeasti jalkojen alla epämiellyttäväksi. Samalla kiertovesivirtaus katkeaa ja VILP ajautuu
              epätaloudelliseen katkokäyntiin (pätkäkäynti).
            </p>
            <p style={{ margin: 0 }}>
              <strong>Kotiälyn Hybridi-strategia:</strong> ILP pidetään valmiustilassa ja käynnistetään lämmitykseen vain
              kovilla pakkasilla (oletus &le; {settings?.frostAssistTemp ?? -12} °C), jolloin se toimii tehokkaana{' '}
              <strong>vastussuojana</strong> estäen VILPin kalliiden 3–9 kW sähkövastusten kytkeytymisen. Lisäksi ILP toimii
              kesällä tehokkaana viilentimenä ja talvella takkatulen kierrättäjänä ilman kompressoria.
            </p>
          </div>
        )}
      </div>

      {/* Units Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16,
          marginBottom: 20,
        }}
      >
        {renderUnitCard(ylakertaUnit, 'mitsubishi_ylakerta', 'Mitsubishi ILP Yläkerta', '192.168.68.64', '🏠')}
        {renderUnitCard(alakertaUnit, 'mitsubishi_alakerta', 'Mitsubishi ILP Alakerta', '192.168.68.65', '🛋️')}
      </div>

      {/* APC Mode Selector */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>
          Kotiäly ILP-Toimintatila:
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
          {[
            {
              id: 'smart_assist' as MitsubishiOperatingMode,
              label: '🛡️ Hybridi',
              sub: 'Pakkasavustus < -12°C',
              color: '#38bdf8',
            },
            {
              id: 'fan_only' as MitsubishiOperatingMode,
              label: '🔥 Takkakierto',
              sub: 'Ilmankierto (Ei komp.)',
              color: '#f97316',
            },
            {
              id: 'cool' as MitsubishiOperatingMode,
              label: '❄️ Viilennys',
              sub: 'Kesäviilennys 23°C',
              color: '#06b6d4',
            },
            {
              id: 'heat' as MitsubishiOperatingMode,
              label: '♨️ Lämmitys',
              sub: 'Pakotettu jatkuva',
              color: '#ef4444',
            },
            {
              id: 'off' as MitsubishiOperatingMode,
              label: '⏹️ Sammutettu',
              sub: 'Valmiustila / OFF',
              color: '#94a3b8',
            },
          ].map((m) => {
            const isSelected = currentMode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => handleModeSelect(m.id)}
                disabled={readOnly || saving}
                style={{
                  background: isSelected ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                  border: isSelected ? `1.5px solid ${m.color}` : '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 10,
                  padding: '10px 8px',
                  textAlign: 'center',
                  cursor: readOnly ? 'default' : 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: isSelected ? m.color : 'var(--text-primary)' }}>
                  {m.label}
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  {m.sub}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Settings & Thresholds */}
      <div
        style={{
          background: 'rgba(0, 0, 0, 0.25)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: 12,
          padding: '14px 16px',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
            ⚙️ Hybridi- ja Suojarajat
          </strong>
          {!readOnly && (
            <button
              onClick={() => {
                if (isEditingSettings) handleSaveSettings();
                else setIsEditingSettings(true);
              }}
              style={{
                fontSize: '0.72rem',
                fontWeight: 600,
                color: isEditingSettings ? '#4ade80' : '#38bdf8',
                background: 'rgba(255, 255, 255, 0.06)',
                border: 'none',
                padding: '4px 10px',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              {isEditingSettings ? 'Tallenna asetukset' : 'Muokkaa rajoja'}
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Pakkasavustusraja (Ulkolämpö)</div>
            {isEditingSettings ? (
              <input
                type="number"
                step="0.5"
                value={frostTempInput}
                onChange={(e) => setFrostTempInput(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(0, 0, 0, 0.5)',
                  border: '1px solid #38bdf8',
                  color: 'white',
                  borderRadius: 6,
                  padding: '4px 8px',
                  fontSize: '0.9rem',
                }}
              />
            ) : (
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#38bdf8' }}>
                &le; {settings?.frostAssistTemp ?? -12.0} °C
              </div>
            )}
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>
              Käynnistää lämmityksen korvaamaan VILP-vastuksia
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Pörssisähkön hintakatto</div>
            {isEditingSettings ? (
              <input
                type="number"
                step="0.5"
                value={maxPriceInput}
                onChange={(e) => setMaxPriceInput(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(0, 0, 0, 0.5)',
                  border: '1px solid #38bdf8',
                  color: 'white',
                  borderRadius: 6,
                  padding: '4px 8px',
                  fontSize: '0.9rem',
                }}
              />
            ) : (
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#facc15' }}>
                {settings?.maxPriceLimit ?? 20.0} snt/kWh
              </div>
            )}
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>
              Nyt: {priceCentsKWh != null ? priceCentsKWh.toFixed(1) + ' snt/kWh' : '--'} · Kalliimmalla ei herää
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Pakkaslämmityksen pyynti</div>
            {isEditingSettings ? (
              <input
                type="number"
                step="0.5"
                value={heatTargetInput}
                onChange={(e) => setHeatTargetInput(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(0, 0, 0, 0.5)',
                  border: '1px solid #38bdf8',
                  color: 'white',
                  borderRadius: 6,
                  padding: '4px 8px',
                  fontSize: '0.9rem',
                }}
              />
            ) : (
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {settings?.heatTarget ?? 21.0} °C
              </div>
            )}
          </div>

          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Kesäviilennyksen pyynti</div>
            {isEditingSettings ? (
              <input
                type="number"
                step="0.5"
                value={coolTargetInput}
                onChange={(e) => setCoolTargetInput(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(0, 0, 0, 0.5)',
                  border: '1px solid #38bdf8',
                  color: 'white',
                  borderRadius: 6,
                  padding: '4px 8px',
                  fontSize: '0.9rem',
                }}
              />
            ) : (
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#06b6d4' }}>
                {settings?.coolTarget ?? 23.0} °C
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Override / Actions Bar */}
      {!readOnly && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pikaohitukset:</span>

          <button
            onClick={() => handleQuickOverride('FAN_ONLY', 2)}
            disabled={saving}
            style={{
              fontSize: '0.74rem',
              fontWeight: 600,
              background: 'rgba(249, 115, 22, 0.15)',
              border: '1px solid rgba(249, 115, 22, 0.35)',
              color: '#f97316',
              padding: '5px 12px',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            🔥 Takkakierto 2h
          </button>

          <button
            onClick={() => handleQuickOverride('HEAT', 2, 22)}
            disabled={saving}
            style={{
              fontSize: '0.74rem',
              fontWeight: 600,
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              color: '#ef4444',
              padding: '5px 12px',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            ♨️ Pikalämpö 2h
          </button>

          <button
            onClick={() => handleQuickOverride('COOL', 2, 22)}
            disabled={saving}
            style={{
              fontSize: '0.74rem',
              fontWeight: 600,
              background: 'rgba(6, 182, 212, 0.15)',
              border: '1px solid rgba(6, 182, 212, 0.35)',
              color: '#06b6d4',
              padding: '5px 12px',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            ❄️ Viilennys 2h
          </button>

          {isOverride && (
            <button
              onClick={() => handleQuickOverride(null, 0)}
              disabled={saving}
              style={{
                fontSize: '0.74rem',
                fontWeight: 600,
                background: 'rgba(74, 222, 128, 0.2)',
                border: '1px solid rgba(74, 222, 128, 0.4)',
                color: '#4ade80',
                padding: '5px 12px',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              ✓ Palauta hybridi-automaatioon
            </button>
          )}
        </div>
      )}
    </div>
  );
};
