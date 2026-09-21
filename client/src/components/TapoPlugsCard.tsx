import React, { useState } from 'react';
import { useTapo } from '../hooks/useTapo';
import { useElectricityPrice } from '../hooks/useElectricityPrice';
import type { TapoDevice } from '../types/tapo';

interface TapoPlugsCardProps {
  readOnly?: boolean;
}

export const TapoPlugsCard: React.FC<TapoPlugsCardProps> = ({ readOnly = false }) => {
  const { devices, loading, error, togglePower, setOverride, updateSettings, pollNow, totalPowerW, totalTodayEnergyKwh } = useTapo();
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

  const openSettings = (dev: TapoDevice) => {
    setActiveSettingsDevice(dev);
    setFormName(dev.name);
    setFormIp(dev.ip);
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
        name: formName,
        ip: formIp,
        auto_mode: formAutoMode,
        max_price_cents: formMaxPrice !== '' ? parseFloat(formMaxPrice) : null,
        min_temp_c: formMinTemp !== '' ? parseFloat(formMinTemp) : null,
        max_temp_c: formMaxTemp !== '' ? parseFloat(formMaxTemp) : null,
      });
      setActiveSettingsDevice(null);
    } catch (err) {
      console.error(err);
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
      console.error(err);
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
      console.error(err);
    } finally {
      setSavingId(null);
    }
  };

  const spotPriceCents = priceCentsKWh;

  return (
    <div className="card tapo-plugs-card" style={{ marginTop: '1.25rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(168, 85, 247, 0.2))',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.2rem',
            }}
          >
            🔌
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              TP-Link Tapo P115 Älypistorasiat
              <span
                style={{
                  fontSize: '0.7rem',
                  padding: '0.15rem 0.5rem',
                  borderRadius: '12px',
                  background: 'rgba(56, 189, 248, 0.15)',
                  color: '#38bdf8',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                }}
              >
                Pörssisähköohjaus & Mittaus
              </span>
            </h3>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Reaaliaikainen tehonkulutus, energiamittaus ja hintarajoihin perustuva älyohjaus
            </p>
          </div>
        </div>

        {/* Global Summary Badge & Poll Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              padding: '0.4rem 0.8rem',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              gap: '1rem',
              fontSize: '0.85rem',
            }}
          >
            <div>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>Yhteisteho</span>
              <strong style={{ color: totalPowerW > 10 ? '#38bdf8' : 'inherit' }}>{totalPowerW.toFixed(0)} W</strong>
            </div>
            <div style={{ borderLeft: '1px solid rgba(255, 255, 255, 0.1)', paddingLeft: '1rem' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>Tänään</span>
              <strong>{totalTodayEnergyKwh.toFixed(2)} kWh</strong>
            </div>
          </div>

          {!readOnly && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={pollNow}
              title="Päivitä laitteiden teho- ja tilatiedot välittömästi"
              style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}
            >
              🔄 <span className="hide-mobile">Päivitä</span>
            </button>
          )}
        </div>
      </div>

      {loading && devices.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          Ladataan Tapo-pistorasioiden tietoja...
        </div>
      ) : error && devices.length === 0 ? (
        <div style={{ padding: '1rem', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
          Virhe pistorasioiden latauksessa: {error}
        </div>
      ) : (
        /* Device Grid */
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '1rem',
          }}
        >
          {devices.map((dev) => {
            const isWashing = dev.id === 'pesukone' || dev.type === 'appliance_washing_machine';
            const isDryer = dev.id === 'kuivausrumpu' || dev.type === 'appliance_dryer';
            const isStorage = dev.id === 'pikkuvarasto' || dev.id === 'isovarasto' || dev.type === 'storage_heating';

            const isOn = dev.state === 'ON';
            const power = dev.power_w || 0;
            const energyToday = dev.today_energy_kwh || 0;
            const isOverride = dev.isOverrideActive;
            const overrideMin = dev.override_until ? Math.ceil((dev.override_until - Date.now()) / 60000) : 0;

            // Price limit logic check
            const maxPrice = dev.max_price_cents;
            const isPriceOk = maxPrice == null || (spotPriceCents != null && spotPriceCents <= maxPrice);

            return (
              <div
                key={dev.id}
                style={{
                  borderRadius: '12px',
                  padding: '1rem',
                  background: isOn
                    ? 'linear-gradient(145deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.85))'
                    : 'rgba(15, 23, 42, 0.5)',
                  border: isOn
                    ? '1px solid rgba(56, 189, 248, 0.35)'
                    : '1px solid rgba(255, 255, 255, 0.08)',
                  boxShadow: isOn ? '0 4px 20px rgba(56, 189, 248, 0.08)' : 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  position: 'relative',
                  transition: 'all 0.2s ease-in-out',
                }}
              >
                {/* Top Row: Icon, Name, On/Off Badge */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.6rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ fontSize: '1.4rem' }}>
                        {isStorage ? '📦' : isWashing ? '🧺' : isDryer ? '💨' : '⚡'}
                      </span>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 600 }}>{dev.name}</h4>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <span>IP: {dev.ip}</span>
                          {dev.auto_mode !== 'auto' && (
                            <span style={{ color: '#f59e0b', fontWeight: 600 }}>
                              {dev.auto_mode === 'constant_on' ? 'Pakotettu ON' : 'Pakotettu OFF'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '0.2rem 0.55rem',
                          borderRadius: '6px',
                          background: isOn ? 'rgba(34, 197, 94, 0.2)' : 'rgba(148, 163, 184, 0.15)',
                          color: isOn ? '#4ade80' : '#94a3b8',
                          border: isOn ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(148, 163, 184, 0.2)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
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
                      </span>
                    </div>
                  </div>

                  {/* Power & Energy readout */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '0.5rem',
                      background: 'rgba(0, 0, 0, 0.25)',
                      padding: '0.6rem 0.8rem',
                      borderRadius: '8px',
                      marginBottom: '0.75rem',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Hetkellinen teho</div>
                      <div style={{ fontSize: '1.15rem', fontWeight: 700, color: power > 5 ? '#38bdf8' : 'inherit' }}>
                        {power.toFixed(0)} <span style={{ fontSize: '0.8rem', fontWeight: 400 }}>W</span>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Kulutus tänään</div>
                      <div style={{ fontSize: '1.15rem', fontWeight: 700, color: energyToday > 0 ? '#a78bfa' : 'inherit' }}>
                        {energyToday.toFixed(2)} <span style={{ fontSize: '0.8rem', fontWeight: 400 }}>kWh</span>
                      </div>
                    </div>
                  </div>

                  {/* Rule & Reason Box */}
                  <div
                    style={{
                      fontSize: '0.78rem',
                      padding: '0.45rem 0.6rem',
                      borderRadius: '6px',
                      background: isOverride
                        ? 'rgba(245, 158, 11, 0.12)'
                        : isOn
                        ? 'rgba(56, 189, 248, 0.08)'
                        : 'rgba(255, 255, 255, 0.03)',
                      border: isOverride
                        ? '1px solid rgba(245, 158, 11, 0.3)'
                        : '1px solid rgba(255, 255, 255, 0.05)',
                      marginBottom: '0.75rem',
                      color: isOverride ? '#fbbf24' : 'var(--text-secondary, #cbd5e1)',
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: '0.15rem', display: 'flex', justifyContent: 'space-between' }}>
                      <span>
                        {isStorage
                          ? '🔥 Varaston lämmitysohjaus'
                          : isWashing
                          ? '🧺 Pesukoneohjaus'
                          : isDryer
                          ? '💨 Kuivausrumpuohjaus'
                          : '⚡ Pistorasia'}
                      </span>
                      {maxPrice != null && (
                        <span style={{ color: isPriceOk ? '#4ade80' : '#f87171' }}>
                          Raja: {maxPrice.toFixed(1)} snt
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.74rem', opacity: 0.9 }}>
                      {dev.last_action_reason ||
                        (isStorage
                          ? 'Lämmitys halvan sähkön mukaan (Min +10°C / Boost +22°C)'
                          : isWashing
                          ? 'Käynnistys sallittu kun sähkö ≤ 15,0 snt/kWh'
                          : isDryer
                          ? 'Käynnistys sallittu kun sähkö ≤ 12,0 snt/kWh'
                          : 'Automaattiohjaus')}
                    </div>
                    {isOverride && (
                      <div style={{ fontSize: '0.72rem', marginTop: '0.2rem', color: '#f59e0b', fontWeight: 600 }}>
                        ⏳ Manuaaliohitus voimassa (~{overrideMin} min jäljellä)
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions Bottom Bar */}
                {!readOnly && (
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255, 255, 255, 0.07)' }}>
                    <button
                      className={`btn btn-sm ${isOn ? 'btn-danger' : 'btn-primary'}`}
                      onClick={() => handleToggle(dev)}
                      disabled={savingId === dev.id}
                      style={{ flex: 1, fontWeight: 600 }}
                    >
                      {savingId === dev.id ? 'Kytketään...' : isOn ? 'Kytke POIS' : 'Kytke PÄÄLLE'}
                    </button>

                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setOverrideModalDevice(dev)}
                      title="Aseta määräaikainen manuaaliohitus"
                      style={{ padding: '0.35rem 0.6rem' }}
                    >
                      ⏱️ Ohita
                    </button>

                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => openSettings(dev)}
                      title="Muokkaa asetuksia ja hintarajoja"
                      style={{ padding: '0.35rem 0.6rem' }}
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

      {/* Override Modal */}
      {overrideModalDevice && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
          onClick={() => setOverrideModalDevice(null)}
        >
          <div
            style={{
              background: 'var(--card-bg, #1e293b)',
              border: '1px solid var(--border-color, #334155)',
              borderRadius: '12px',
              padding: '1.5rem',
              maxWidth: '420px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1.15rem' }}>
              ⏱️ Määräaikainen ohitus: {overrideModalDevice.name}
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              Pakota pistorasia tiettyyn tilaan määräajaksi. Automaatio palaa automaattisesti voimaan ajan päätyttyä.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <button
                className="btn btn-primary"
                onClick={() => handleSetOverride(overrideModalDevice, 'ON', 2)}
                disabled={savingId === overrideModalDevice.id}
              >
                ⚡ Pakota PÄÄLLE (2 tuntia)
              </button>
              <button
                className="btn btn-primary"
                onClick={() => handleSetOverride(overrideModalDevice, 'ON', 4)}
                disabled={savingId === overrideModalDevice.id}
              >
                ⚡ Pakota PÄÄLLE (4 tuntia)
              </button>
              <button
                className="btn btn-danger"
                onClick={() => handleSetOverride(overrideModalDevice, 'OFF', 4)}
                disabled={savingId === overrideModalDevice.id}
              >
                🛑 Pakota POIS PÄÄLTÄ (4 tuntia)
              </button>
              {overrideModalDevice.isOverrideActive && (
                <button
                  className="btn btn-secondary"
                  onClick={() => handleSetOverride(overrideModalDevice, null, 0)}
                  disabled={savingId === overrideModalDevice.id}
                  style={{ border: '1px solid #38bdf8', color: '#38bdf8' }}
                >
                  🔄 Poista ohitus & Palauta automaatio
                </button>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setOverrideModalDevice(null)}>
                Sulje
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {activeSettingsDevice && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
          onClick={() => setActiveSettingsDevice(null)}
        >
          <div
            style={{
              background: 'var(--card-bg, #1e293b)',
              border: '1px solid var(--border-color, #334155)',
              borderRadius: '12px',
              padding: '1.5rem',
              maxWidth: '480px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1.15rem' }}>
              ⚙️ Asetukset: {activeSettingsDevice.name}
            </h3>

            <form onSubmit={handleSaveSettings}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.3rem', color: 'var(--text-muted)' }}>
                    Laitteen nimi
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    required
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.3rem', color: 'var(--text-muted)' }}>
                    IP-osoite (lähiverkko)
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={formIp}
                    onChange={(e) => setFormIp(e.target.value)}
                    required
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.3rem', color: 'var(--text-muted)' }}>
                    Ohjaustila
                  </label>
                  <select
                    className="input"
                    value={formAutoMode}
                    onChange={(e) => setFormAutoMode(e.target.value as any)}
                    style={{ width: '100%' }}
                  >
                    <option value="auto">Älykäs automaatio (suositus)</option>
                    <option value="constant_on">Aina päällä (ohita automaatio)</option>
                    <option value="constant_off">Aina pois päältä</option>
                  </select>
                </div>

                {(activeSettingsDevice.id === 'pesukone' || activeSettingsDevice.id === 'kuivausrumpu' || activeSettingsDevice.max_price_cents != null) && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.3rem', color: 'var(--text-muted)' }}>
                      Maksimi pörssisähkön hinta (snt/kWh)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      className="input"
                      value={formMaxPrice}
                      onChange={(e) => setFormMaxPrice(e.target.value)}
                      placeholder="esim. 15.0"
                      style={{ width: '100%' }}
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Pistorasia katkaistaan automaattisesti jos hinta ylittää tämän rajan.
                    </span>
                  </div>
                )}

                {(activeSettingsDevice.type === 'storage_heating' || activeSettingsDevice.id === 'pikkuvarasto' || activeSettingsDevice.id === 'isovarasto') && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.3rem', color: 'var(--text-muted)' }}>
                        Minimilämpö (°C)
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        className="input"
                        value={formMinTemp}
                        onChange={(e) => setFormMinTemp(e.target.value)}
                        placeholder="10.0"
                        style={{ width: '100%' }}
                      />
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Pakkassuojaus (ei alle)</span>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.3rem', color: 'var(--text-muted)' }}>
                        Halvan sähkön tavoite (°C)
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        className="input"
                        value={formMaxTemp}
                        onChange={(e) => setFormMaxTemp(e.target.value)}
                        placeholder="22.0"
                        style={{ width: '100%' }}
                      />
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Varaus halvan sähkön aikana</span>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setActiveSettingsDevice(null)}>
                  Peruuta
                </button>
                <button type="submit" className="btn btn-primary" disabled={savingId === activeSettingsDevice.id}>
                  {savingId === activeSettingsDevice.id ? 'Tallennetaan...' : 'Tallenna asetukset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
