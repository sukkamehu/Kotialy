import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useOutdoorLights } from '../hooks/useOutdoorLights';

interface OutdoorLightsCardProps {
  readOnly?: boolean;
}

interface OutdoorLightsSettingsModalProps {
  status: any;
  onClose: () => void;
  onSave: (settings: Record<string, string>) => Promise<void>;
  saving: boolean;
}

const OutdoorLightsSettingsModal: React.FC<OutdoorLightsSettingsModalProps> = ({
  status,
  onClose,
  onSave,
  saving,
}) => {
  const [duskOffset, setDuskOffset] = useState<string>(
    status?.settings?.dusk_offset_minutes || '10'
  );
  const [dawnOffset, setDawnOffset] = useState<string>(
    status?.settings?.dawn_offset_minutes || '15'
  );
  const [nightOffEnabled, setNightOffEnabled] = useState<boolean>(
    status?.settings?.night_off_enabled === 'true'
  );
  const [nightOffStart, setNightOffStart] = useState<string>(
    status?.settings?.night_off_start || '23:30'
  );
  const [nightOffEnd, setNightOffEnd] = useState<string>(
    status?.settings?.night_off_end || '05:30'
  );
  const [autoEnabled, setAutoEnabled] = useState<boolean>(
    status?.settings?.enabled !== 'false'
  );

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave({
      enabled: autoEnabled ? 'true' : 'false',
      dusk_offset_minutes: duskOffset,
      dawn_offset_minutes: dawnOffset,
      night_off_enabled: nightOffEnabled ? 'true' : 'false',
      night_off_start: nightOffStart,
      night_off_end: nightOffEnd,
    });
  };

  const inputStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    padding: '9px 12px',
    borderRadius: '8px',
    background: 'rgba(10, 15, 29, 0.95)',
    border: '1px solid rgba(255, 255, 255, 0.16)',
    color: '#f8fafc',
    fontSize: '13.5px',
    fontFamily: 'inherit',
    outline: 'none',
    boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.4)',
    boxSizing: 'border-box',
  };

  return createPortal(
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 999999,
        padding: '16px',
      }}
    >
      <div
        className="modal-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(165deg, #131d33 0%, #0a0f1d 100%)',
          border: '1px solid rgba(245, 158, 11, 0.35)',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.85), 0 0 40px rgba(245, 158, 11, 0.12)',
          maxWidth: '480px',
          width: '100%',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.3rem' }}>⚙️</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc' }}>
                Ulkovalojen Asetukset
              </h3>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Astronominen hämärä- ja auringonlaskuohjaus (Rele 1 & Rele 2)
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '1.2rem',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '6px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Enable Auto Switch */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(255, 255, 255, 0.03)',
              padding: '12px 14px',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              cursor: 'pointer',
            }}
            onClick={() => setAutoEnabled(!autoEnabled)}
          >
            <div>
              <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#f8fafc' }}>
                Automaattinen hämäräkytkentä
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Ohjaa molempia ulkovaloreleitä auringon sijainnin mukaan
              </div>
            </div>
            <input
              type="checkbox"
              checked={autoEnabled}
              onChange={(e) => setAutoEnabled(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: '#f59e0b', cursor: 'pointer' }}
            />
          </div>

          {/* Dusk & Dawn Offsets */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                🌇 Illan sytytysennakko (min)
              </label>
              <input
                type="number"
                value={duskOffset}
                onChange={(e) => setDuskOffset(e.target.value)}
                style={inputStyle}
                min="-60"
                max="120"
              />
              <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                {parseInt(duskOffset, 10) >= 0 ? `+${duskOffset} min laskun jälkeen` : `${duskOffset} min ennen laskua`}
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                🌅 Aamun sammutusviive (min)
              </label>
              <input
                type="number"
                value={dawnOffset}
                onChange={(e) => setDawnOffset(e.target.value)}
                style={inputStyle}
                min="-60"
                max="120"
              />
              <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                {parseInt(dawnOffset, 10) >= 0 ? `+${dawnOffset} min nousun jälkeen` : `${dawnOffset} min ennen nousua`}
              </span>
            </div>
          </div>

          {/* Night Off Settings */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.02)',
              padding: '14px',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
              onClick={() => setNightOffEnabled(!nightOffEnabled)}
            >
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
                  🌙 Yösammutus (Sähkönsäästö)
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Sammuttaa ulkovalot automaattisesti yöksi
                </div>
              </div>
              <input
                type="checkbox"
                checked={nightOffEnabled}
                onChange={(e) => setNightOffEnabled(e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: '#f59e0b', cursor: 'pointer' }}
              />
            </div>

            {nightOffEnabled && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '4px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Sammutus klo
                  </label>
                  <input
                    type="time"
                    value={nightOffStart}
                    onChange={(e) => setNightOffStart(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Uudelleensytytys klo
                  </label>
                  <input
                    type="time"
                    value={nightOffEnd}
                    onChange={(e) => setNightOffEnd(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{
                padding: '9px 16px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: 'var(--text-secondary)',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Peruuta
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '9px 20px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                border: 'none',
                color: '#000',
                fontSize: '13px',
                fontWeight: 700,
                cursor: saving ? 'wait' : 'pointer',
                boxShadow: '0 2px 10px rgba(245, 158, 11, 0.3)',
              }}
            >
              {saving ? 'Tallennetaan...' : 'Tallenna asetukset'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export function OutdoorLightsCard({ readOnly = false }: OutdoorLightsCardProps) {
  const { status, loading, saving, setOverride, updateSettings } = useOutdoorLights();
  const [showSettings, setShowSettings] = useState(false);

  if (loading && !status) {
    return (
      <div className="card" style={{ padding: '20px', textAlign: 'center' }}>
        <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Ladataan ulkovalojen tilaa...</div>
      </div>
    );
  }

  const isGlobalOverride = status?.isOverrideActive ?? false;
  const reason = status?.reason || 'Automaattinen hämäräohjaus';

  const formatTime = (isoString?: string | null) => {
    if (!isoString) return '--:--';
    try {
      return new Date(isoString).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '--:--';
    }
  };

  const sunsetTime = formatTime(status?.sunTimes?.sunset);
  const sunriseTime = formatTime(status?.sunTimes?.sunrise);
  const duskTime = formatTime(status?.sunTimes?.dusk);
  const dawnTime = formatTime(status?.sunTimes?.dawn);

  const relay1 = status?.relays?.[0] || {
    id: 'relay_1',
    relayNum: 1,
    name: 'Ulkovalot 1',
    label: 'Pihapiiri & Autotalli',
    state: status?.state || 'OFF',
    isOn: status?.isOn ?? false,
    online: status?.deviceOnline ?? true,
    telemetry: status?.telemetry,
    isOverrideActive: isGlobalOverride,
    overrideState: status?.overrideState,
    overrideMinutesRemaining: status?.overrideMinutesRemaining || 0,
  };

  const relay2 = status?.relays?.[1] || {
    id: 'relay_2',
    relayNum: 2,
    name: 'Ulkovalot 2',
    label: 'Toinen wifi-rele',
    state: 'OFF',
    isOn: false,
    online: true,
    telemetry: null,
    isOverrideActive: false,
    overrideState: null,
    overrideMinutesRemaining: 0,
  };

  const anyLightsOn = relay1.isOn || relay2.isOn;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* ─── Top Master Banner: Astronomical Sun & Automation Overview ─── */}
      <div
        className="card"
        style={{
          borderRadius: '16px',
          padding: '18px 20px',
          background: anyLightsOn
            ? 'linear-gradient(145deg, rgba(245, 158, 11, 0.12) 0%, rgba(15, 23, 42, 0.85) 100%)'
            : 'linear-gradient(145deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.85) 100%)',
          border: anyLightsOn ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: anyLightsOn ? '0 8px 32px rgba(245, 158, 11, 0.12)' : 'none',
          position: 'relative',
          overflow: 'hidden',
          transition: 'all 0.3s ease',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: anyLightsOn ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                border: anyLightsOn ? '1px solid rgba(245, 158, 11, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.4rem',
              }}
            >
              🏡
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Ulkovalaistus (2 WiFi-relettä)
                </h3>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '10px',
                    background: anyLightsOn ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                    color: anyLightsOn ? '#fbbf24' : 'var(--text-muted)',
                    border: anyLightsOn ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
                  }}
                >
                  {relay1.isOn && relay2.isOn
                    ? 'KAIKKI PÄÄLLÄ (2/2)'
                    : anyLightsOn
                    ? 'OSITTAIN PÄÄLLÄ (1/2)'
                    : 'KAIKKI POIS (0/2)'}
                </span>
                {isGlobalOverride && (
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '10px',
                      background: 'rgba(239, 68, 68, 0.2)',
                      color: '#f87171',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                    }}
                  >
                    ⚡ Yleinen pakkokytkentä ({status?.overrideMinutesRemaining} min)
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.78rem', color: isGlobalOverride ? '#f59e0b' : 'var(--text-muted)', marginTop: '3px' }}>
                ✨ {reason}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {!readOnly && (
              <button
                onClick={() => setShowSettings(true)}
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  color: 'var(--text-secondary)',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                ⚙️ Asetukset
              </button>
            )}
          </div>
        </div>

        {/* Solar Timetable Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '10px',
            marginBottom: '14px',
          }}
        >
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.5)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: '10px',
              padding: '10px 12px',
            }}
          >
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>🌇 Auringonlasku</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f59e0b' }}>{sunsetTime}</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>Hämärä: {duskTime}</div>
          </div>

          <div
            style={{
              background: 'rgba(15, 23, 42, 0.5)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: '10px',
              padding: '10px 12px',
            }}
          >
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>🌅 Auringonnousu</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#38bdf8' }}>{sunriseTime}</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>Sarastus: {dawnTime}</div>
          </div>

          <div
            style={{
              background: 'rgba(15, 23, 42, 0.5)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: '10px',
              padding: '10px 12px',
            }}
          >
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>🌙 Yösammutus</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {status?.settings?.night_off_enabled === 'true'
                ? `${status?.settings?.night_off_start || '23:30'} – ${status?.settings?.night_off_end || '05:30'}`
                : 'Pois päältä'}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              {status?.settings?.night_off_enabled === 'true' ? 'Molemmille releille' : 'Päällä koko yön'}
            </div>
          </div>
        </div>

        {/* Master Group Controls */}
        {!readOnly && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              flexWrap: 'wrap',
              paddingTop: 10,
              borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              Kaikkien ulkovalojen yhteisohjaus:
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                onClick={() => setOverride('ON', 120, 'all')}
                disabled={saving}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  background: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  color: '#fbbf24',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                💡 Sytytä Kaikki (2h)
              </button>
              <button
                onClick={() => setOverride('OFF', 120, 'all')}
                disabled={saving}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: '#f87171',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                🌙 Sammuta Kaikki (2h)
              </button>
              <button
                onClick={() => setOverride('AUTO', 0, 'all')}
                disabled={saving}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  background: 'rgba(56, 189, 248, 0.12)',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  color: '#38bdf8',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                🔄 Palauta Automaattitila
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Dual Relays Widgets Grid ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
        {/* ─── WIDGET 1: Ulkovalot 1 (Pihapiiri & Autotalli) ─── */}
        <div
          className="card"
          style={{
            borderRadius: '16px',
            padding: '18px',
            background: relay1.isOn
              ? 'linear-gradient(145deg, rgba(245, 158, 11, 0.14) 0%, rgba(15, 23, 42, 0.9) 100%)'
              : 'linear-gradient(145deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.85) 100%)',
            border: relay1.isOn ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: relay1.isOn ? '0 6px 24px rgba(245, 158, 11, 0.1)' : 'none',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 14,
          }}
        >
          <div>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: relay1.isOn ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                    border: relay1.isOn ? '1px solid rgba(245, 158, 11, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.2rem',
                  }}
                >
                  💡
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Ulkovalot 1
                    </h4>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        padding: '1px 6px',
                        borderRadius: 8,
                        background: 'rgba(56, 189, 248, 0.15)',
                        color: '#38bdf8',
                        border: '1px solid rgba(56, 189, 248, 0.3)',
                        fontWeight: 600,
                      }}
                    >
                      Pihapiiri & Autotalli
                    </span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    Päärele (Mittaroitu · MTRG)
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '8px',
                    background: relay1.isOn ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                    color: relay1.isOn ? '#fbbf24' : 'var(--text-muted)',
                    border: relay1.isOn ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
                  }}
                >
                  {relay1.isOn ? 'PÄÄLLÄ' : 'POIS PÄÄLTÄ'}
                </span>
              </div>
            </div>

            {/* Sub-status line */}
            <div style={{ fontSize: '0.75rem', color: relay1.isOverrideActive ? '#f59e0b' : 'var(--text-muted)', marginBottom: 12 }}>
              {relay1.isOverrideActive
                ? `⚡ Pakotettu ${relay1.overrideState || (relay1.isOn ? 'ON' : 'OFF')} (~${relay1.overrideMinutesRemaining} min jäljellä)`
                : `✨ ${reason}`}
            </div>

            {/* Telemetry Grid */}
            {relay1.telemetry && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))',
                  gap: '8px',
                  background: 'rgba(15, 23, 42, 0.55)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '10px',
                  padding: '10px',
                  marginBottom: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: '0.65rem', color: '#38bdf8' }}>⚡ Teho</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {relay1.telemetry.power_w.toFixed(1)} <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>W</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.65rem', color: '#38bdf8' }}>🔌 Jännite</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {relay1.telemetry.voltage_v.toFixed(0)} <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>V</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.65rem', color: '#38bdf8' }}>📊 Energia</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {relay1.telemetry.energy_kwh.toFixed(1)} <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>kWh</span>
                  </div>
                </div>
                {relay1.telemetry.device_temp != null && (
                  <div>
                    <div style={{ fontSize: '0.65rem', color: '#38bdf8' }}>🌡️ Lämpö</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {relay1.telemetry.device_temp} <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>°C</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action buttons */}
          {!readOnly && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 8, borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
              <button
                onClick={() => setOverride('ON', 120, 'relay1')}
                disabled={saving}
                style={{
                  flex: '1 1 auto',
                  padding: '7px 10px',
                  borderRadius: 6,
                  background: relay1.isOn && relay1.isOverrideActive ? '#f59e0b' : 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  color: relay1.isOn && relay1.isOverrideActive ? '#000' : '#fbbf24',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                💡 Sytytä (2h)
              </button>
              <button
                onClick={() => setOverride('OFF', 120, 'relay1')}
                disabled={saving}
                style={{
                  flex: '1 1 auto',
                  padding: '7px 10px',
                  borderRadius: 6,
                  background: !relay1.isOn && relay1.isOverrideActive ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255, 255, 255, 0.05)',
                  border: !relay1.isOn && relay1.isOverrideActive ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
                  color: !relay1.isOn && relay1.isOverrideActive ? '#ef4444' : 'var(--text-secondary)',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                🌙 Sammuta (2h)
              </button>
              <button
                onClick={() => setOverride('AUTO', 0, 'relay1')}
                disabled={saving}
                style={{
                  padding: '7px 10px',
                  borderRadius: 6,
                  background: !relay1.isOverrideActive ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  border: !relay1.isOverrideActive ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
                  color: !relay1.isOverrideActive ? '#38bdf8' : 'var(--text-muted)',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                title="Palauta automaattinen hämäräohjaus"
              >
                ⚡ Auto
              </button>
            </div>
          )}
        </div>

        {/* ─── WIDGET 2: Ulkovalot 2 (Toinen wifi-rele) ─── */}
        <div
          className="card"
          style={{
            borderRadius: '16px',
            padding: '18px',
            background: relay2.isOn
              ? 'linear-gradient(145deg, rgba(245, 158, 11, 0.14) 0%, rgba(15, 23, 42, 0.9) 100%)'
              : 'linear-gradient(145deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.85) 100%)',
            border: relay2.isOn ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: relay2.isOn ? '0 6px 24px rgba(245, 158, 11, 0.1)' : 'none',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 14,
          }}
        >
          <div>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: relay2.isOn ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                    border: relay2.isOn ? '1px solid rgba(245, 158, 11, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.2rem',
                  }}
                >
                  💡
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Ulkovalot 2
                    </h4>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        padding: '1px 6px',
                        borderRadius: 8,
                        background: 'rgba(168, 85, 247, 0.15)',
                        color: '#c084fc',
                        border: '1px solid rgba(168, 85, 247, 0.3)',
                        fontWeight: 600,
                      }}
                    >
                      Toinen rele
                    </span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    Tuya WiFi-rele ({relay2.id.slice(-6)})
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '8px',
                    background: relay2.isOn ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                    color: relay2.isOn ? '#fbbf24' : 'var(--text-muted)',
                    border: relay2.isOn ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
                  }}
                >
                  {relay2.isOn ? 'PÄÄLLÄ' : 'POIS PÄÄLTÄ'}
                </span>
              </div>
            </div>

            {/* Sub-status line */}
            <div style={{ fontSize: '0.75rem', color: relay2.isOverrideActive ? '#f59e0b' : 'var(--text-muted)', marginBottom: 12 }}>
              {relay2.isOverrideActive
                ? `⚡ Pakotettu ${relay2.overrideState || (relay2.isOn ? 'ON' : 'OFF')} (~${relay2.overrideMinutesRemaining} min jäljellä)`
                : `✨ ${reason}`}
            </div>

            {/* Sync & Mode Indicator Card */}
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.55)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '10px',
                padding: '12px 14px',
                marginBottom: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Ohjaustila:</span>
                <span style={{ fontSize: '0.76rem', fontWeight: 600, color: '#38bdf8' }}>
                  {relay2.isOverrideActive ? 'Manuaalinen ohitus' : 'Synkronoitu pääohjaukseen (Auto)'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Hämärä- & Yösammutus:</span>
                <span style={{ fontSize: '0.76rem', fontWeight: 600, color: '#22c55e' }}>
                  Aktiivinen (Sama aikataulu)
                </span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          {!readOnly && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 8, borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
              <button
                onClick={() => setOverride('ON', 120, 'relay2')}
                disabled={saving}
                style={{
                  flex: '1 1 auto',
                  padding: '7px 10px',
                  borderRadius: 6,
                  background: relay2.isOn && relay2.isOverrideActive ? '#f59e0b' : 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  color: relay2.isOn && relay2.isOverrideActive ? '#000' : '#fbbf24',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                💡 Sytytä (2h)
              </button>
              <button
                onClick={() => setOverride('OFF', 120, 'relay2')}
                disabled={saving}
                style={{
                  flex: '1 1 auto',
                  padding: '7px 10px',
                  borderRadius: 6,
                  background: !relay2.isOn && relay2.isOverrideActive ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255, 255, 255, 0.05)',
                  border: !relay2.isOn && relay2.isOverrideActive ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
                  color: !relay2.isOn && relay2.isOverrideActive ? '#ef4444' : 'var(--text-secondary)',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                🌙 Sammuta (2h)
              </button>
              <button
                onClick={() => setOverride('AUTO', 0, 'relay2')}
                disabled={saving}
                style={{
                  padding: '7px 10px',
                  borderRadius: 6,
                  background: !relay2.isOverrideActive ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  border: !relay2.isOverrideActive ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
                  color: !relay2.isOverrideActive ? '#38bdf8' : 'var(--text-muted)',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                title="Palauta automaattinen hämäräohjaus"
              >
                ⚡ Auto
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Settings Modal (Rendered cleanly via Portal to document.body) */}
      {showSettings && (
        <OutdoorLightsSettingsModal
          status={status}
          onClose={() => setShowSettings(false)}
          onSave={async (newSettings) => {
            await updateSettings(newSettings);
            setShowSettings(false);
          }}
          saving={saving}
        />
      )}
    </div>
  );
}
