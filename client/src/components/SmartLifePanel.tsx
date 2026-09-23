import { useTuya } from '../hooks/useTuya';
import type { TuyaDevice } from '../types/tuya';

export function SmartLifePanel() {
  const { devices, loading, refreshing, refreshDevices } = useTuya();

  // Categorize devices
  const climateSensors = devices.filter((d) => d.type === 'climate');
  const waterLeakSensors = devices.filter((d) => d.type === 'water_leak');
  const doorSensors = devices.filter((d) => d.type === 'door');
  const otherDevices = devices.filter((d) => d.type !== 'climate' && d.type !== 'water_leak' && d.type !== 'door');

  return (
    <div className="card">
      <div className="card-header" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="card-icon">📱</span>
          <div>
            <span className="card-title">Smart Life -anturit ja laitteet</span>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              Yhteensä {devices.length} laitetta Tuya IoT -pilvestä
            </div>
          </div>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={refreshDevices}
            disabled={refreshing || loading}
            style={{
              padding: '5px 12px',
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
            <span>{refreshing ? 'Synkronoidaan...' : 'Päivitä laitteet'}</span>
          </button>
        </div>
      </div>

      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* 1. Climate Sensors */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#38bdf8', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>🌡️</span> Lämpötila- ja kosteusanturit ({climateSensors.length} kpl)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {climateSensors.map((d: TuyaDevice) => (
              <div
                key={d.id}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 10,
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{d.name}</span>
                  {d.online ? (
                    <span style={{ fontSize: 10, color: '#4ade80', background: 'rgba(34, 197, 94, 0.12)', padding: '2px 6px', borderRadius: 10 }}>Online</span>
                  ) : (
                    <span style={{ fontSize: 10, color: '#f87171', background: 'rgba(239, 68, 68, 0.12)', padding: '2px 6px', borderRadius: 10 }}>Offline</span>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
                  <div>
                    <span style={{ fontSize: 20, fontWeight: 700, color: '#fb923c' }}>
                      {d.properties.temperature != null ? `${d.properties.temperature} °C` : '--'}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: '#38bdf8', fontWeight: 600 }}>
                    {d.properties.humidity != null ? `💧 ${d.properties.humidity} %` : ''}
                  </div>
                </div>

                {d.properties.battery != null && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 4, marginTop: 2 }}>
                    <span>🔋 Paristo:</span>
                    <span>{d.properties.battery} %</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 2. Water Leak Sensors */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#34d399', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>💧</span> Vesivuotohälyttimet ({waterLeakSensors.length} kpl)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {waterLeakSensors.map((d: TuyaDevice) => {
              const isLeak = Boolean(d.properties.leak_detected);
              return (
                <div
                  key={d.id}
                  style={{
                    background: isLeak ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                    border: isLeak ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: 10,
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{d.name}</span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 8,
                        background: isLeak ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.15)',
                        color: isLeak ? '#fca5a5' : '#4ade80',
                      }}
                    >
                      {isLeak ? '🚨 VUOTOHÄLYTYS!' : '🟢 OK (Kuiva)'}
                    </span>
                  </div>

                  {d.properties.battery != null && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                      <span>🔋 Paristo:</span>
                      <span>{d.properties.battery} %</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. Door Sensors & Others */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#a78bfa', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>🚪</span> Ovi- ja muut laitteet ({doorSensors.length + otherDevices.length} kpl)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {doorSensors.map((d: TuyaDevice) => (
              <div
                key={d.id}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 10,
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{d.name}</span>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 8,
                    background: d.properties.is_open ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.12)',
                    color: d.properties.is_open ? '#f87171' : '#4ade80',
                  }}>
                    {d.properties.is_open ? 'Auki' : 'Suljettu'}
                  </span>
                </div>
                {d.properties.battery != null && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                    <span>🔋 Paristo:</span>
                    <span>{d.properties.battery} %</span>
                  </div>
                )}
              </div>
            ))}

            {otherDevices.map((d: TuyaDevice) => (
              <div
                key={d.id}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 10,
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{d.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d.model || d.category}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  Tyyppi: {d.type === 'sauna_switch' ? 'Saunan 3-vaiherele' : d.type === 'gateway' ? 'Tuya Yhdyskäytävä' : d.type}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
