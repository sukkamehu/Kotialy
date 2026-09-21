import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTapo } from '../hooks/useTapo';
import { useElectricityPrice } from '../hooks/useElectricityPrice';
import type { TapoDevice } from '../types/tapo';
import type { TrendTopicTarget } from './VariableTrendModal';

interface TapoPlugsCardProps {
  onOpenTrend?: (target: TrendTopicTarget) => void;
  readOnly?: boolean;
}

export const TapoPlugsCard: React.FC<TapoPlugsCardProps> = ({ onOpenTrend, readOnly = false }) => {
  const {
    devices,
    loading,
    error,
    togglePower,
    setOverride,
    updateSettings,
    pollNow,
    totalPowerW,
    totalTodayEnergyKwh,
  } = useTapo();
  const { priceCentsKWh } = useElectricityPrice();

  const [activeSettingsDevice, setActiveSettingsDevice] = useState<TapoDevice | null>(null);
  const [overrideModalDevice, setOverrideModalDevice] = useState<TapoDevice | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Form states for settings modal
  const [formName, setFormName] = useState('');
  const [formIp, setFormIp] = useState('');
  const [formMaxPrice, setFormMaxPrice] = useState<string>('');
  const [formMinTemp, setFormMinTemp] = useState<string>('');
  const [formMaxTemp, setFormMaxTemp] = useState<string>('');
  const [formAutoMode, setFormAutoMode] = useState<'auto' | 'constant_on' | 'constant_off'>('auto');

  // Listen to Escape key to close modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveSettingsDevice(null);
        setOverrideModalDevice(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const openSettings = (dev: TapoDevice) => {
    setActiveSettingsDevice(dev);
    setFormName(dev.name || '');
    setFormIp(dev.ip || '');
    setFormMaxPrice(dev.max_price_cents != null ? String(dev.max_price_cents) : '');
    setFormMinTemp(dev.min_temp_c != null ? String(dev.min_temp_c) : '');
    setFormMaxTemp(dev.max_temp_c != null ? String(dev.max_temp_c) : '');
    setFormAutoMode(dev.auto_mode || 'auto');
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSettingsDevice) return;
    setSavingId(activeSettingsDevice.id);
    try {
      await updateSettings(activeSettingsDevice.id, {
        name: formName.trim() || activeSettingsDevice.name,
        ip: formIp.trim(),
        auto_mode: formAutoMode,
        max_price_cents: formMaxPrice !== '' ? parseFloat(formMaxPrice) : null,
        min_temp_c: formMinTemp !== '' ? parseFloat(formMinTemp) : null,
        max_temp_c: formMaxTemp !== '' ? parseFloat(formMaxTemp) : null,
      });
      setActiveSettingsDevice(null);
    } catch (err) {
      console.error('Failed to update Tapo settings:', err);
    } finally {
      setSavingId(null);
    }
  };

  const handleToggle = async (dev: TapoDevice) => {
    if (readOnly || savingId) return;
    setSavingId(dev.id);
    try {
      const nextState = dev.state === 'ON' ? 'OFF' : 'ON';
      await togglePower(dev.id, nextState);
    } catch (err) {
      console.error('Failed to toggle Tapo power:', err);
    } finally {
      setSavingId(null);
    }
  };

  const handleSetOverride = async (dev: TapoDevice, state: 'ON' | 'OFF' | null, hours: number) => {
    if (readOnly || savingId) return;
    setSavingId(dev.id);
    try {
      await setOverride(dev.id, state, hours);
      setOverrideModalDevice(null);
    } catch (err) {
      console.error('Failed to set Tapo override:', err);
    } finally {
      setSavingId(null);
    }
  };

  const spotPrice = priceCentsKWh;

  return (
    <div className="card tapo-plugs-section" style={{ position: 'relative', overflow: 'hidden' }}>
      {/* Decorative accent top glow */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: '10%',
          right: '10%',
          height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(56, 189, 248, 0.6), rgba(168, 85, 247, 0.6), transparent)',
          pointerEvents: 'none',
        }}
      />

      {/* Card Header */}
      <div
        className="card-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          paddingBottom: '16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
          marginBottom: '18px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(168, 85, 247, 0.15))',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.3rem',
              boxShadow: '0 4px 12px rgba(56, 189, 248, 0.1)',
            }}
          >
            🔌
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>
                Tapo P115 Älypistorasiat
              </h3>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '20px',
                  background: 'rgba(56, 189, 248, 0.12)',
                  color: '#38bdf8',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                }}
              >
                Pörssisähköautomaatio & Mittaus
              </span>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Reaaliaikainen kulutus, kuormanohjaus ja hintarajojen automaattivalvonta
            </p>
          </div>
        </div>

        {/* Aggregate Stats & Action */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              background: 'rgba(0, 0, 0, 0.3)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '10px',
              padding: '6px 14px',
            }}
          >
            <div
              style={{ cursor: onOpenTrend ? 'pointer' : 'default' }}
              onClick={() => {
                if (onOpenTrend) {
                  onOpenTrend({
                    topic: 'tapo/total_power',
                    label: 'Tapo Yhteisteho',
                    unit: 'W',
                    color: '#818cf8',
                    currentValue: totalPowerW,
                  });
                }
              }}
              title={onOpenTrend ? 'Avaa yhteistehon trendikaavio' : undefined}
            >
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Yhteisteho 📈
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: totalPowerW > 10 ? '#38bdf8' : 'var(--text-primary)' }}>
                {totalPowerW.toFixed(0)} <span style={{ fontSize: '0.72rem', fontWeight: 500, color: 'var(--text-muted)' }}>W</span>
              </div>
            </div>
            <div style={{ width: '1px', height: '24px', background: 'rgba(255, 255, 255, 0.1)' }} />
            <div
              style={{ cursor: onOpenTrend ? 'pointer' : 'default' }}
              onClick={() => {
                if (onOpenTrend) {
                  onOpenTrend({
                    topic: 'tapo/total_today_energy',
                    label: 'Tapo Yhteiskulutus tänään',
                    unit: 'kWh',
                    color: '#a78bfa',
                    currentValue: totalTodayEnergyKwh,
                  });
                }
              }}
              title={onOpenTrend ? 'Avaa yhteiskulutuksen trendikaavio' : undefined}
            >
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Tänään 📈
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#a78bfa' }}>
                {totalTodayEnergyKwh.toFixed(2)} <span style={{ fontSize: '0.72rem', fontWeight: 500, color: 'var(--text-muted)' }}>kWh</span>
              </div>
            </div>
          </div>

          {!readOnly && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={pollNow}
              title="Päivitä laitteiden teholukemat välittömästi"
              style={{
                borderRadius: '10px',
                padding: '7px 12px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '0.82rem',
                cursor: 'pointer',
              }}
            >
              🔄 <span className="hide-mobile">Päivitä</span>
            </button>
          )}
        </div>
      </div>

      {/* Loading State */}
      {loading && devices.length === 0 ? (
        <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '1.8rem', marginBottom: '8px' }}>⏳</div>
          Ladataan Tapo-älypistorasioiden tietoja...
        </div>
      ) : error && devices.length === 0 ? (
        <div
          style={{
            padding: '1rem 1.25rem',
            borderRadius: '10px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            color: '#f87171',
            fontSize: '0.88rem',
          }}
        >
          ⚠️ Virhe pistorasioiden latauksessa: {error}
        </div>
      ) : (
        /* Device Grid */
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '14px',
          }}
        >
          {devices.map((dev) => {
            const isStorage = dev.id === 'isovarasto' || dev.id === 'pikkuvarasto' || dev.type === 'storage_heating';
            const isWashing = dev.id === 'pesukone' || dev.type === 'appliance_washing_machine';
            const isDryer = dev.id === 'kuivausrumpu' || dev.type === 'appliance_dryer';

            const isOn = dev.state === 'ON';
            const power = dev.power_w || 0;
            const energyToday = dev.today_energy_kwh || 0;
            const isOverride = dev.isOverrideActive;
            const overrideMin = dev.override_until ? Math.ceil((dev.override_until - Date.now()) / 60000) : 0;

            const maxPrice = dev.max_price_cents;
            const isPriceOk = maxPrice == null || (spotPrice != null && spotPrice <= maxPrice);

            // Icon & Category text
            let icon = '⚡';
            let catLabel = 'Pistorasia';
            if (dev.id === 'isovarasto') {
              icon = '🔥';
              catLabel = 'Isovarasto (Lämmitys)';
            } else if (dev.id === 'pikkuvarasto') {
              icon = '🔥';
              catLabel = 'Pikkuvarasto (Lämmitys)';
            } else if (isWashing) {
              icon = '🧺';
              catLabel = 'Pyykinpesukone';
            } else if (isDryer) {
              icon = '💨';
              catLabel = 'Kuivausrumpu';
            }

            // Power meter fill percent (0 - 2500 W max)
            const powerPct = Math.min(100, Math.max(0, (power / 2500) * 100));

            return (
              <div
                key={dev.id}
                style={{
                  borderRadius: '14px',
                  padding: '16px',
                  background: isOn
                    ? 'linear-gradient(160deg, rgba(30, 41, 59, 0.75) 0%, rgba(15, 23, 42, 0.9) 100%)'
                    : 'rgba(15, 23, 42, 0.45)',
                  border: isOn
                    ? '1px solid rgba(56, 189, 248, 0.3)'
                    : '1px solid rgba(255, 255, 255, 0.07)',
                  boxShadow: isOn ? '0 4px 20px rgba(56, 189, 248, 0.07)' : 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  transition: 'all 0.2s ease',
                }}
              >
                <div>
                  {/* Card Top: Icon, Titles, LED status */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '10px',
                          background: isOn ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                          border: isOn ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '1.2rem',
                        }}
                      >
                        {icon}
                      </div>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {dev.name}
                        </h4>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <span>{dev.ip}</span>
                          {dev.auto_mode !== 'auto' && (
                            <span style={{ color: '#f59e0b', fontWeight: 600 }}>
                              • {dev.auto_mode === 'constant_on' ? 'Aina Päällä' : 'Aina Pois'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Status Pill with Glowing Dot */}
                    <div
                      style={{
                        padding: '3px 9px',
                        borderRadius: '20px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        background: isOn ? 'rgba(34, 197, 94, 0.15)' : 'rgba(148, 163, 184, 0.1)',
                        color: isOn ? '#4ade80' : '#94a3b8',
                        border: isOn ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(148, 163, 184, 0.2)',
                      }}
                    >
                      <span
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          background: isOn ? '#4ade80' : '#64748b',
                          boxShadow: isOn ? '0 0 8px #4ade80' : 'none',
                        }}
                      />
                      {isOn ? 'PÄÄLLÄ' : 'POIS'}
                    </div>
                  </div>

                  {/* Power Readout Block (Clickable for Trend) */}
                  <div
                    style={{
                      background: 'rgba(0, 0, 0, 0.25)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      borderRadius: '10px',
                      padding: '10px 12px',
                      marginBottom: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                      <div
                        style={{
                          cursor: onOpenTrend ? 'pointer' : 'default',
                          padding: '2px 4px',
                          margin: '-2px -4px',
                          borderRadius: '6px',
                          transition: 'background 0.15s',
                        }}
                        onClick={() => {
                          if (onOpenTrend) {
                            onOpenTrend({
                              topic: `tapo/${dev.id}/power`,
                              label: `${dev.name} Teho`,
                              unit: 'W',
                              color: isStorage ? '#fb923c' : isWashing ? '#0ea5e9' : '#c084fc',
                              currentValue: power,
                            });
                          }
                        }}
                        title={onOpenTrend ? 'Klikkaa avataksesi tehon trendikaavio' : undefined}
                      >
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          Teho {onOpenTrend && '📈'}
                        </span>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: power > 5 ? '#38bdf8' : 'var(--text-primary)', lineHeight: 1.1 }}>
                          {power.toFixed(0)} <span style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-muted)' }}>W</span>
                        </div>
                      </div>

                      <div
                        style={{
                          textAlign: 'right',
                          cursor: onOpenTrend ? 'pointer' : 'default',
                          padding: '2px 4px',
                          margin: '-2px -4px',
                          borderRadius: '6px',
                          transition: 'background 0.15s',
                        }}
                        onClick={() => {
                          if (onOpenTrend) {
                            onOpenTrend({
                              topic: `tapo/${dev.id}/energy`,
                              label: `${dev.name} Kulutus tänään`,
                              unit: 'kWh',
                              color: '#a78bfa',
                              currentValue: energyToday,
                            });
                          }
                        }}
                        title={onOpenTrend ? 'Klikkaa avataksesi kulutuksen trendikaavio' : undefined}
                      >
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px' }}>
                          Kulutus tänään {onOpenTrend && '📈'}
                        </span>
                        <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#a78bfa', lineHeight: 1.1 }}>
                          {energyToday.toFixed(2)} <span style={{ fontSize: '0.74rem', fontWeight: 500, color: 'var(--text-muted)' }}>kWh</span>
                        </div>
                      </div>
                    </div>

                    {/* Mini live power bar */}
                    <div
                      style={{
                        height: '4px',
                        borderRadius: '2px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        overflow: 'hidden',
                        position: 'relative',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${powerPct}%`,
                          background: power > 1500 ? 'linear-gradient(90deg, #38bdf8, #f59e0b)' : '#38bdf8',
                          borderRadius: '2px',
                          transition: 'width 0.4s ease',
                          boxShadow: power > 10 ? '0 0 6px rgba(56, 189, 248, 0.5)' : 'none',
                        }}
                      />
                    </div>
                  </div>

                  {/* Automation & Condition Status */}
                  <div
                    style={{
                      fontSize: '0.78rem',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      background: isOverride
                        ? 'rgba(245, 158, 11, 0.12)'
                        : isOn
                        ? 'rgba(56, 189, 248, 0.06)'
                        : 'rgba(255, 255, 255, 0.03)',
                      border: isOverride
                        ? '1px solid rgba(245, 158, 11, 0.3)'
                        : '1px solid rgba(255, 255, 255, 0.06)',
                      marginBottom: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                      <span style={{ fontWeight: 600, color: isOverride ? '#fbbf24' : 'var(--text-primary)' }}>
                        {catLabel}
                      </span>
                      {maxPrice != null && (
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: '10px',
                            background: isPriceOk ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: isPriceOk ? '#4ade80' : '#f87171',
                            border: isPriceOk ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                          }}
                        >
                          Raja: {maxPrice.toFixed(1)} snt
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)' }}>
                      {dev.last_action_reason ||
                        (isStorage
                          ? 'Halpa sähkö → Lämpövaraus (+22°C) · Pakkassuojaus (+10°C)'
                          : isWashing
                          ? 'Käynnistys sallittu kun sähkö ≤ 15,0 snt/kWh'
                          : isDryer
                          ? 'Käynnistys sallittu kun sähkö ≤ 12,0 snt/kWh'
                          : 'Automaatio aktiivinen')}
                    </div>
                    {isOverride && (
                      <div style={{ fontSize: '0.72rem', marginTop: '4px', color: '#f59e0b', fontWeight: 600 }}>
                        ⏳ Manuaaliohitus aktiivinen (~{overrideMin} min jäljellä)
                      </div>
                    )}
                  </div>
                </div>

                {/* Control Action Buttons */}
                {!readOnly && (
                  <div
                    style={{
                      display: 'flex',
                      gap: '8px',
                      paddingTop: '10px',
                      borderTop: '1px solid rgba(255, 255, 255, 0.07)',
                    }}
                  >
                    <button
                      className={`btn btn-sm ${isOn ? 'btn-danger' : 'btn-primary'}`}
                      onClick={() => handleToggle(dev)}
                      disabled={savingId === dev.id}
                      style={{
                        flex: 1,
                        fontWeight: 600,
                        borderRadius: '8px',
                        padding: '7px 10px',
                        fontSize: '0.84rem',
                        cursor: 'pointer',
                      }}
                    >
                      {savingId === dev.id ? 'Kytketään...' : isOn ? 'Kytke POIS' : 'Kytke PÄÄLLE'}
                    </button>

                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setOverrideModalDevice(dev)}
                      title="Aseta määräaikainen manuaaliohitus"
                      style={{
                        borderRadius: '8px',
                        padding: '7px 10px',
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                      }}
                    >
                      ⏱️ Ohita
                    </button>

                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => openSettings(dev)}
                      title="Muokkaa asetuksia ja hintarajoja"
                      style={{
                        borderRadius: '8px',
                        padding: '7px 10px',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                      }}
                    >
                      ⚙️
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Override Modal Portal */}
      {overrideModalDevice &&
        createPortal(
          <div className="modal-overlay" onClick={() => setOverrideModalDevice(null)}>
            <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
              <div className="modal-header">
                <h3 className="modal-title">
                  <span>⏱️</span> Ohitus: {overrideModalDevice.name}
                </h3>
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={() => setOverrideModalDevice(null)}
                  title="Sulje"
                >
                  ✕
                </button>
              </div>

              <div className="modal-body">
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', margin: '0 0 16px', lineHeight: 1.45 }}>
                  Pakota pistorasian tila määräajaksi. Automaatio ja hintavahti palaavat automaattisesti voimaan ajan päätyttyä.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => handleSetOverride(overrideModalDevice, 'ON', 2)}
                    disabled={savingId === overrideModalDevice.id}
                    style={{ padding: '12px', borderRadius: '10px', fontWeight: 600, justifyContent: 'center' }}
                  >
                    ⚡ Pakota PÄÄLLE (2 tuntia)
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => handleSetOverride(overrideModalDevice, 'ON', 4)}
                    disabled={savingId === overrideModalDevice.id}
                    style={{ padding: '12px', borderRadius: '10px', fontWeight: 600, justifyContent: 'center' }}
                  >
                    ⚡ Pakota PÄÄLLE (4 tuntia)
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={() => handleSetOverride(overrideModalDevice, 'OFF', 4)}
                    disabled={savingId === overrideModalDevice.id}
                    style={{ padding: '12px', borderRadius: '10px', fontWeight: 600, justifyContent: 'center' }}
                  >
                    🛑 Pakota POIS PÄÄLTÄ (4 tuntia)
                  </button>
                  {overrideModalDevice.isOverrideActive && (
                    <button
                      className="btn btn-ghost"
                      onClick={() => handleSetOverride(overrideModalDevice, null, 0)}
                      disabled={savingId === overrideModalDevice.id}
                      style={{
                        padding: '12px',
                        borderRadius: '10px',
                        border: '1px solid rgba(56, 189, 248, 0.4)',
                        color: '#38bdf8',
                        fontWeight: 600,
                        justifyContent: 'center',
                      }}
                    >
                      🔄 Poista ohitus & Palauta automaatio
                    </button>
                  )}
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setOverrideModalDevice(null)}
                  style={{ borderRadius: '8px' }}
                >
                  Sulje
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Settings Modal Portal */}
      {activeSettingsDevice &&
        createPortal(
          <div className="modal-overlay" onClick={() => setActiveSettingsDevice(null)}>
            <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
              <div className="modal-header">
                <h3 className="modal-title">
                  <span>⚙️</span> Asetukset: {activeSettingsDevice.name}
                </h3>
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={() => setActiveSettingsDevice(null)}
                  title="Sulje"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveSettings}>
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Basic Info */}
                  <div>
                    <label className="form-label">Laitteen nimi</label>
                    <input
                      type="text"
                      className="input"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="esim. Pyykinpesukone"
                      required
                    />
                  </div>

                  <div>
                    <label className="form-label">IP-osoite (lähiverkko)</label>
                    <input
                      type="text"
                      className="input"
                      value={formIp}
                      onChange={(e) => setFormIp(e.target.value)}
                      placeholder="192.168.68.xx"
                      required
                    />
                    <span className="form-hint">Kiinteä tai DHCP-varattu paikallinen IP-osoite</span>
                  </div>

                  {/* Operating Mode */}
                  <div>
                    <label className="form-label">Ohjaustila</label>
                    <select
                      className="input"
                      value={formAutoMode}
                      onChange={(e) => setFormAutoMode(e.target.value as any)}
                    >
                      <option value="auto">Älykäs automaatio (suositus)</option>
                      <option value="constant_on">Aina päällä (ohita automaatio)</option>
                      <option value="constant_off">Aina pois päältä</option>
                    </select>
                    <span className="form-hint">
                      {formAutoMode === 'auto'
                        ? 'Ohjataan pörssisähkön hinnan ja turvarajojen mukaan.'
                        : formAutoMode === 'constant_on'
                        ? 'Virransyöttö pidetään aina päällä pörssisähkön hinnasta riippumatta.'
                        : 'Virransyöttö katkaistu kokonaan.'}
                    </span>
                  </div>

                  {/* Electricity Price Threshold for Appliances */}
                  {(activeSettingsDevice.id === 'pesukone' ||
                    activeSettingsDevice.id === 'kuivausrumpu' ||
                    activeSettingsDevice.type.includes('appliance') ||
                    activeSettingsDevice.max_price_cents != null) && (
                    <div
                      style={{
                        padding: '12px 14px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        borderRadius: '10px',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                      }}
                    >
                      <label className="form-label" style={{ color: '#facc15' }}>
                        ⚡ Maksimi pörssisähkön hinta (snt/kWh)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        className="input"
                        value={formMaxPrice}
                        onChange={(e) => setFormMaxPrice(e.target.value)}
                        placeholder="esim. 15.0"
                      />
                      <span className="form-hint">
                        Pistorasia katkaistaan automaattisesti aina kun pörssisähkö ylittää tämän rajan.
                      </span>
                    </div>
                  )}

                  {/* Temperature Boundaries for Storage Heating */}
                  {(activeSettingsDevice.type === 'storage_heating' ||
                    activeSettingsDevice.id === 'pikkuvarasto' ||
                    activeSettingsDevice.id === 'isovarasto') && (
                    <div
                      style={{
                        padding: '12px 14px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        borderRadius: '10px',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                      }}
                    >
                      <div className="form-label" style={{ color: '#fb923c', marginBottom: '8px' }}>
                        🌡️ Varaston lämpötilarajat (°C)
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                          <label className="form-label" style={{ fontSize: '11px' }}>
                            Pakkassuojaus (minimi)
                          </label>
                          <input
                            type="number"
                            step="0.5"
                            className="input"
                            value={formMinTemp}
                            onChange={(e) => setFormMinTemp(e.target.value)}
                            placeholder="10.0"
                          />
                          <span className="form-hint">Ei päästetä alle</span>
                        </div>
                        <div>
                          <label className="form-label" style={{ fontSize: '11px' }}>
                            Lämpövaraus (maksimi)
                          </label>
                          <input
                            type="number"
                            step="0.5"
                            className="input"
                            value={formMaxTemp}
                            onChange={(e) => setFormMaxTemp(e.target.value)}
                            placeholder="22.0"
                          />
                          <span className="form-hint">Halvan sähkön tavoite</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setActiveSettingsDevice(null)}
                    style={{ borderRadius: '8px' }}
                  >
                    Peruuta
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={savingId === activeSettingsDevice.id}
                    style={{ borderRadius: '8px', fontWeight: 600, padding: '8px 18px' }}
                  >
                    {savingId === activeSettingsDevice.id ? 'Tallennetaan...' : 'Tallenna asetukset'}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
