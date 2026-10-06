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
    status?.settings?.dusk_offset_minutes || '-15'
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
                Astronominen hämärä- ja auringonlaskuohjaus
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
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Automaattinen Hämäräohjaus
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Sytyttää ja sammuttaa valot auringon aseman mukaan
              </div>
            </div>
            <input
              type="checkbox"
              checked={autoEnabled}
              onChange={(e) => setAutoEnabled(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: '#f59e0b', cursor: 'pointer' }}
            />
          </div>

          {/* Dusk Offset */}
          <div>
            <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              🌇 Hämäräoffset illalla (minuuttia suhteessa auringonlaskuun):
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input
                type="number"
                value={duskOffset}
                onChange={(e) => setDuskOffset(e.target.value)}
                style={inputStyle}
              />
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', minWidth: '130px' }}>
                {parseInt(duskOffset || '0', 10) < 0
                  ? `${Math.abs(parseInt(duskOffset || '0', 10))} min ennen laskua`
                  : `${duskOffset} min laskun jälkeen`}
              </span>
            </div>
          </div>

          {/* Dawn Offset */}
          <div>
            <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              🌅 Sarastusoffset aamulla (minuuttia suhteessa auringonnousuun):
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input
                type="number"
                value={dawnOffset}
                onChange={(e) => setDawnOffset(e.target.value)}
                style={inputStyle}
              />
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', minWidth: '130px' }}>
                {parseInt(dawnOffset || '0', 10) < 0
                  ? `${Math.abs(parseInt(dawnOffset || '0', 10))} min ennen nousua`
                  : `${dawnOffset} min nousun jälkeen`}
              </span>
            </div>
          </div>

          {/* Night Off Settings */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '10px',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
              }}
              onClick={() => setNightOffEnabled(!nightOffEnabled)}
            >
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  🌙 Yösammutus (Säästötila)
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div>
                  <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                    Sammutus klo:
                  </label>
                  <input
                    type="time"
                    value={nightOffStart}
                    onChange={(e) => setNightOffStart(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                    Sytytys klo:
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

          {/* Footer Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '9px 16px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: 'var(--text-secondary)',
                fontSize: '13px',
                fontWeight: 600,
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

  const isOn = status?.isOn ?? false;
  const isOverride = status?.isOverrideActive ?? false;
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

  return (
    <div
      className="card"
      style={{
        borderRadius: '16px',
        padding: '20px',
        background: isOn
          ? 'linear-gradient(145deg, rgba(245, 158, 11, 0.12) 0%, rgba(15, 23, 42, 0.85) 100%)'
          : 'linear-gradient(145deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.85) 100%)',
        border: isOn ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: isOn ? '0 8px 32px rgba(245, 158, 11, 0.12)' : 'none',
        position: 'relative',
        overflow: 'hidden',
        transition: 'all 0.3s ease',
      }}
    >
      {/* Top Header Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: isOn ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255, 255, 255, 0.05)',
              border: isOn ? '1px solid rgba(245, 158, 11, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.4rem',
            }}
          >
            🏡
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Ulkovalot (Pihapiiri & Autotalli)
              </h3>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '10px',
                  background: isOn ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                  color: isOn ? '#fbbf24' : 'var(--text-muted)',
                  border: isOn ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
                }}
              >
                {isOn ? 'PÄÄLLÄ' : 'POIS PÄÄLTÄ'}
              </span>
            </div>
            <div style={{ fontSize: '0.78rem', color: isOverride ? '#f59e0b' : 'var(--text-muted)', marginTop: '2px' }}>
              {isOverride ? '⚡ Manuaalinen ohitustila aktiivinen' : `✨ ${reason}`}
            </div>
          </div>
        </div>

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

      {/* Main Status & Solar Timetable Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: '10px',
          marginBottom: '16px',
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
            {status?.settings?.night_off_enabled === 'true' ? 'Säästää sähköä' : 'Päällä koko yön'}
          </div>
        </div>
      </div>

      {/* Real-time Electricity Consumption & Hardware Telemetry */}
      {status?.telemetry && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
            gap: '10px',
            marginBottom: '16px',
            background: 'rgba(56, 189, 248, 0.06)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            borderRadius: '10px',
            padding: '10px 12px',
          }}
        >
          <div>
            <div style={{ fontSize: '0.7rem', color: '#38bdf8', marginBottom: '2px' }}>⚡ Hetkellinen teho</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {status.telemetry.power_w.toFixed(0)} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>W</span>
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Virta: {status.telemetry.current_a.toFixed(2)} A
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.7rem', color: '#38bdf8', marginBottom: '2px' }}>🔌 Jännite</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {status.telemetry.voltage_v.toFixed(1)} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>V</span>
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Verkkojännite
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.7rem', color: '#38bdf8', marginBottom: '2px' }}>📊 Kokonaisenergia</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {status.telemetry.energy_kwh.toFixed(1)} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>kWh</span>
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              WiFi-rele (MTRG)
            </div>
          </div>

          {status.telemetry.device_temp != null && (
            <div>
              <div style={{ fontSize: '0.7rem', color: '#38bdf8', marginBottom: '2px' }}>🌡️ Releen lämpö</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {status.telemetry.device_temp} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>°C</span>
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Elektroniikka
              </div>
            </div>
          )}
        </div>
      )}

      {/* Manual Override Bar / Actions */}
      {!readOnly && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={() => setOverride('ON', 120)}
            disabled={saving}
            style={{
              flex: '1 1 auto',
              minWidth: '110px',
              padding: '8px 14px',
              borderRadius: '8px',
              background: isOn && isOverride ? '#f59e0b' : 'rgba(245, 158, 11, 0.15)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              color: isOn && isOverride ? '#000' : '#fbbf24',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            💡 Sytytä (2h)
          </button>

          <button
            onClick={() => setOverride('OFF', 120)}
            disabled={saving}
            style={{
              flex: '1 1 auto',
              minWidth: '110px',
              padding: '8px 14px',
              borderRadius: '8px',
              background: !isOn && isOverride ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255, 255, 255, 0.05)',
              border: !isOn && isOverride ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
              color: !isOn && isOverride ? '#ef4444' : 'var(--text-secondary)',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            🌙 Sammuta (2h)
          </button>

          {isOverride && (
            <button
              onClick={() => setOverride('AUTO')}
              disabled={saving}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                background: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                color: '#38bdf8',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              🔄 Palauta Automaattitila
            </button>
          )}
        </div>
      )}

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
