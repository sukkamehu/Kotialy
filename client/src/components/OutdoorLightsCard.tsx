import { useState } from 'react';
import { useOutdoorLights } from '../hooks/useOutdoorLights';

interface OutdoorLightsCardProps {
  readOnly?: boolean;
}

export function OutdoorLightsCard({ readOnly = false }: OutdoorLightsCardProps) {
  const { status, loading, saving, setOverride, updateSettings } = useOutdoorLights();
  const [showSettings, setShowSettings] = useState(false);

  // Local settings state for editing
  const [duskOffset, setDuskOffset] = useState<string>('-15');
  const [dawnOffset, setDawnOffset] = useState<string>('15');
  const [nightOffEnabled, setNightOffEnabled] = useState<boolean>(true);
  const [nightOffStart, setNightOffStart] = useState<string>('23:30');
  const [nightOffEnd, setNightOffEnd] = useState<string>('05:30');
  const [autoEnabled, setAutoEnabled] = useState<boolean>(true);

  // Sync settings when opened
  const handleOpenSettings = () => {
    if (status?.settings) {
      setDuskOffset(status.settings.dusk_offset_minutes || '-15');
      setDawnOffset(status.settings.dawn_offset_minutes || '15');
      setNightOffEnabled(status.settings.night_off_enabled === 'true');
      setNightOffStart(status.settings.night_off_start || '23:30');
      setNightOffEnd(status.settings.night_off_end || '05:30');
      setAutoEnabled(status.settings.enabled === 'true');
    }
    setShowSettings(true);
  };

  const handleSaveSettings = async () => {
    await updateSettings({
      enabled: autoEnabled ? 'true' : 'false',
      dusk_offset_minutes: duskOffset,
      dawn_offset_minutes: dawnOffset,
      night_off_enabled: nightOffEnabled ? 'true' : 'false',
      night_off_start: nightOffStart,
      night_off_end: nightOffEnd,
    });
    setShowSettings(false);
  };

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
              boxShadow: isOn ? '0 0 16px rgba(245, 158, 11, 0.3)' : 'none',
            }}
          >
            {isOn ? '💡' : '🌙'}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Ulkovalot
              </h3>
              <span
                style={{
                  fontSize: '0.68rem',
                  padding: '2px 8px',
                  borderRadius: '100px',
                  background: isOn ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                  color: isOn ? '#fbbf24' : 'var(--text-muted)',
                  border: isOn ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(255, 255, 255, 0.12)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Astronominen hämäräohjaus
              </span>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
              {reason}
            </div>
          </div>
        </div>

        {/* Settings button */}
        {!readOnly && (
          <button
            onClick={handleOpenSettings}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '8px',
              padding: '6px 10px',
              color: 'var(--text-secondary)',
              fontSize: '0.8rem',
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

      {/* Settings Modal */}
      {showSettings && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
        >
          <div
            style={{
              background: 'var(--card-bg, #1e293b)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '460px',
              width: '100%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                ⚙️ Ulkovalojen astronomiset asetukset
              </h3>
              <button
                onClick={() => setShowSettings(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '1.2rem',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
              {/* Enable Auto */}
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>Automaattiohjaus</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Käytä auringonlaskun ja nousun seurantaa</div>
                </div>
                <input
                  type="checkbox"
                  checked={autoEnabled}
                  onChange={(e) => setAutoEnabled(e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: '#f59e0b' }}
                />
              </label>

              {/* Dusk offset */}
              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  Hämäräoffset illalla (minuuttia suhteessa auringonlaskuun):
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="number"
                    value={duskOffset}
                    onChange={(e) => setDuskOffset(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                    }}
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: '120px' }}>
                    {parseInt(duskOffset, 10) < 0 ? `${Math.abs(parseInt(duskOffset, 10))} min ennen laskua` : `${duskOffset} min laskun jälkeen`}
                  </span>
                </div>
              </div>

              {/* Night off enabled */}
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginTop: '6px' }}>
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>Yösammutus</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Sammuta valot pikkutunneiksi energian säästämiseksi</div>
                </div>
                <input
                  type="checkbox"
                  checked={nightOffEnabled}
                  onChange={(e) => setNightOffEnabled(e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: '#f59e0b' }}
                />
              </label>

              {nightOffEnabled && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Sammutus klo:</label>
                    <input
                      type="time"
                      value={nightOffStart}
                      onChange={(e) => setNightOffStart(e.target.value)}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Sytytys klo:</label>
                    <input
                      type="time"
                      value={nightOffEnd}
                      onChange={(e) => setNightOffEnd(e.target.value)}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff' }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setShowSettings(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                Peruuta
              </button>
              <button
                onClick={handleSaveSettings}
                disabled={saving}
                style={{
                  padding: '8px 20px',
                  borderRadius: '8px',
                  background: '#f59e0b',
                  border: 'none',
                  color: '#000',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {saving ? 'Tallennetaan...' : 'Tallenna'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
