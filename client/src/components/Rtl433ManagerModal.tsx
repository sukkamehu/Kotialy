import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useRtl433 } from '../hooks/useRtl433';
import type { Rtl433Device } from '../types/rtl433';

interface Rtl433ManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSensorForChart?: (sensorName: string, tempTopic: string, humidTopic?: string) => void;
}

function timeAgo(ts: number | null | undefined): string {
  if (!ts) return 'Ei vielä signaalia';
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 5) return 'Juuri nyt';
  if (sec < 60) return `${sec} s sitten`;
  if (sec < 3600) return `${Math.floor(sec / 60)} min sitten`;
  return `${Math.floor(sec / 3600)} h sitten`;
}

function getRssiColor(rssi?: number): string {
  if (rssi === undefined) return 'var(--text-muted)';
  if (rssi > -65) return '#22c55e'; // excellent
  if (rssi > -80) return '#38bdf8'; // good
  if (rssi > -95) return '#f59e0b'; // fair
  return '#ef4444'; // weak
}

export function Rtl433ManagerModal({
  isOpen,
  onClose,
  onSelectSensorForChart,
}: Rtl433ManagerModalProps) {
  const { devices, status, loading, error, refresh, updateAlias, deleteDevice } = useRtl433();

  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'ignored' | 'help'>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editOutdoor, setEditOutdoor] = useState(false);
  const [editIgnored, setEditIgnored] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showRawId, setShowRawId] = useState<string | null>(null);

  const filteredDevices = useMemo(() => {
    if (activeTab === 'active') {
      return devices.filter((d) => !d.isIgnored && d.online);
    }
    if (activeTab === 'ignored') {
      return devices.filter((d) => d.isIgnored);
    }
    return devices;
  }, [devices, activeTab]);

  const startEditing = (dev: Rtl433Device) => {
    setEditingId(dev.id);
    setEditName(dev.customName || '');
    setEditLocation(dev.location || '');
    setEditOutdoor(Boolean(dev.isOutdoor));
    setEditIgnored(Boolean(dev.isIgnored));
  };

  const handleSave = async (id: string) => {
    setSaving(true);
    await updateAlias(id, {
      custom_name: editName.trim() || null,
      location: editLocation.trim() || null,
      is_outdoor: editOutdoor,
      is_ignored: editIgnored,
    });
    setSaving(false);
    setEditingId(null);
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        padding: 16,
        animation: 'fadeIn 0.15s ease-out',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: 920,
          width: '100%',
          boxShadow: '0 24px 60px rgba(0,0,0,0.75)',
          borderColor: 'rgba(56, 189, 248, 0.3)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '92vh',
          padding: 0,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.95) 100%)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 24 }}>📻</span>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  433 MHz RF-Vastaanotin & Anturit
                </h2>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  Realtek RTL-SDR USB · rtl_433 langattomien sää- ja lämpötila-anturien vastaanotto
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <span>🔄</span> Päivitä
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              style={{
                width: 32,
                height: 32,
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                fontSize: 16,
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Live Status Summary Bar */}
        <div
          style={{
            padding: '12px 20px',
            background: 'rgba(15, 23, 42, 0.6)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            display: 'flex',
            gap: 16,
            flexWrap: 'wrap',
            alignItems: 'center',
            fontSize: '0.82rem',
          }}
        >
          {/* Receiver Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: status.connected ? '#22c55e' : '#ef4444',
                boxShadow: status.connected ? '0 0 8px #22c55e' : 'none',
              }}
            />
            <span style={{ color: 'var(--text-secondary)' }}>Välittäjä:</span>
            <span style={{ fontWeight: 600, color: status.connected ? '#22c55e' : '#ef4444' }}>
              {status.connected ? 'Yhdistetty' : 'Ei yhteyttä'}
            </span>
          </div>

          {/* Frequency */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'var(--text-muted)' }}>📡 Taajuus:</span>
            <span style={{ fontWeight: 600, color: '#38bdf8' }}>433.92 MHz</span>
          </div>

          {/* Total Devices */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'var(--text-muted)' }}>📦 Anturit:</span>
            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{devices.length} kpl</span>
          </div>

          {/* Packets */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'var(--text-muted)' }}>⚡ Paketit:</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{status.packetCount}</span>
          </div>

          {/* Last signal */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
            <span style={{ color: 'var(--text-muted)' }}>⏱️ Viimeisin signaali:</span>
            <span style={{ fontWeight: 600, color: '#facc15' }}>{timeAgo(status.lastReceivedAt)}</span>
          </div>
        </div>

        {/* Tab Switcher */}
        <div
          style={{
            padding: '8px 20px',
            background: 'rgba(0, 0, 0, 0.25)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
            display: 'flex',
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              border: 'none',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              background: activeTab === 'all' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
              color: activeTab === 'all' ? '#38bdf8' : 'var(--text-secondary)',
              transition: 'all 0.15s ease',
            }}
          >
            Kaikki ({devices.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('active')}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              border: 'none',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              background: activeTab === 'active' ? 'rgba(34, 197, 94, 0.2)' : 'transparent',
              color: activeTab === 'active' ? '#4ade80' : 'var(--text-secondary)',
              transition: 'all 0.15s ease',
            }}
          >
            Aktiiviset ({devices.filter((d) => !d.isIgnored && d.online).length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ignored')}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              border: 'none',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              background: activeTab === 'ignored' ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
              color: activeTab === 'ignored' ? '#f87171' : 'var(--text-secondary)',
              transition: 'all 0.15s ease',
            }}
          >
            Piilotetut ({devices.filter((d) => d.isIgnored).length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('help')}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              border: 'none',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              marginLeft: 'auto',
              background: activeTab === 'help' ? 'rgba(168, 85, 247, 0.2)' : 'transparent',
              color: activeTab === 'help' ? '#c084fc' : 'var(--text-secondary)',
              transition: 'all 0.15s ease',
            }}
          >
            ℹ️ Ohjeet & Taajuudet
          </button>
        </div>

        {/* Content Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {error && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 8,
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#f87171',
                marginBottom: 16,
                fontSize: 13,
              }}
            >
              ⚠️ {error}
            </div>
          )}

          {/* Help & Info Tab */}
          {activeTab === 'help' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 12,
                  padding: 20,
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                <h3 style={{ margin: '0 0 10px 0', fontSize: 16, color: '#38bdf8' }}>
                  📡 Miten 433 MHz vastaanotto toimii Kotiälyssä?
                </h3>
                <p style={{ margin: '0 0 12px 0', color: 'var(--text-secondary)' }}>
                  Kotiäly hyödyntää palvelimeen kytkettyä Realtek RTL2832U -pohjaista USB DVB-T / SDR -vastaanotinta ja
                  avointa <code>rtl_433</code> -ohjelmistoa. Se kuuntelee 433.92 MHz ISM-radiotaajuutta ja purkaa automaattisesti
                  yli 200 eri valmistajan langattomat anturipaketit (mm. Nexus, TFA, Oregon Scientific, Acurite, Rubicson, Fine Offset).
                </p>

                <h4 style={{ margin: '14px 0 6px 0', fontSize: 14, color: '#facc15' }}>
                  💡 Vinkkejä uusien anturien käyttöönottoon:
                </h4>
                <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--text-secondary)' }}>
                  <li>
                    <strong>Uuden anturin lisäys:</strong> Aseta anturiin paristot tai paina takakannen <em>TX</em>-painiketta. Anturi lähettää signaalin ja ilmestyy tähän näkymään automaattisesti.
                  </li>
                  <li>
                    <strong>Nimeäminen:</strong> Paina anturikortin <em>Muokkaa</em>-painiketta ja anna anturille selkeä nimi (esim. <em>Takapihan terassi</em> tai <em>Pikkuvarasto</em>). Anturi näkyy tällä nimellä Kotiälyn Lämpötilat-sivulla.
                  </li>
                  <li>
                    <strong>Ulkoanturimerkintä:</strong> Jos anturi mittaa ulkoilmaa, valitse <em>Käytä ulkoanturina</em>.
                  </li>
                  <li>
                    <strong>Naapurin anturien piilotus:</strong> Koska 433 MHz kantaa kymmeniä metrejä, saatat havaita naapurin antureita. Voit merkitä ne helposti <em>Piilota / Ohita</em> -tilaksi.
                  </li>
                </ul>

                <h4 style={{ margin: '14px 0 6px 0', fontSize: 14, color: '#a855f7' }}>
                  🔄 Useamman taajuuden kuuntelu (esim. 868 MHz):
                </h4>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                  Jos sinulla on myös 868 MHz ISM-antureita, voit ottaa taajuushyppelyn käyttöön muokkaamalla palvelimella tiedostoa{' '}
                  <code>~/Dev/kotialy/rtl_433/rtl_433.conf</code> lisäämällä rivit:
                  <br />
                  <code style={{ display: 'block', background: 'rgba(0,0,0,0.4)', padding: '8px 12px', borderRadius: 6, marginTop: 6 }}>
                    hop_interval 30<br />
                    frequency 433.92M<br />
                    frequency 868.3M
                  </code>
                </p>
              </div>
            </div>
          ) : filteredDevices.length === 0 ? (
            /* Empty State */
            <div
              style={{
                textAlign: 'center',
                padding: '48px 24px',
                background: 'rgba(255, 255, 255, 0.02)',
                borderRadius: 12,
                border: '1px dashed rgba(255, 255, 255, 0.1)',
              }}
            >
              <div style={{ fontSize: 44, marginBottom: 12 }}>📡</div>
              <h3 style={{ margin: '0 0 8px 0', fontSize: 16, color: 'var(--text-primary)' }}>
                {activeTab === 'ignored'
                  ? 'Ei piilotettuja antureita'
                  : 'Odotetaan 433.92 MHz radiosignaaleja...'}
              </h3>
              <p style={{ margin: '0 auto 16px auto', maxWidth: 480, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {activeTab === 'ignored'
                  ? 'Et ole vielä merkinnyt yhtään anturia piilotetuksi.'
                  : 'Vastaanotin kuuntelee taustalla. Kun langaton anturi lähettää mittaustietoa (tyypillisesti 30–60 s välein), se ilmestyy tähän automaattisesti.'}
              </p>
              {activeTab !== 'ignored' && (
                <div style={{ fontSize: 12, color: '#38bdf8' }}>
                  💡 Vinkki: Paina lämpöanturin TX-painiketta tai irrota paristo hetkeksi nopeuttaaksesi tunnistusta.
                </div>
              )}
            </div>
          ) : (
            /* Device Cards Grid */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filteredDevices.map((dev) => {
                const isEditing = editingId === dev.id;
                const isRawOpen = showRawId === dev.id;
                const temp = dev.properties.temperature;
                const hum = dev.properties.humidity;
                const battery = dev.properties.battery;
                const batteryOk = dev.properties.battery_ok;
                const rssi = dev.properties.rssi;

                return (
                  <div
                    key={dev.id}
                    style={{
                      background: dev.isIgnored
                        ? 'rgba(30, 41, 59, 0.3)'
                        : 'linear-gradient(145deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%)',
                      border: `1px solid ${dev.isIgnored ? 'rgba(255, 255, 255, 0.06)' : dev.online ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.1)'}`,
                      borderRadius: 12,
                      padding: 16,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                      transition: 'all 0.2s ease',
                      opacity: dev.isIgnored ? 0.65 : 1,
                    }}
                  >
                    {/* Top Row: Title, Model, Badges, Measurements */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 18 }}>🌡️</span>
                          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                            {dev.customName || `${dev.model} #${dev.rawId || dev.id}`}
                          </span>
                          {dev.customName && (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              ({dev.model} {dev.rawId ? `ID ${dev.rawId}` : ''})
                            </span>
                          )}
                          {dev.isOutdoor && (
                            <span
                              style={{
                                padding: '2px 8px',
                                borderRadius: 100,
                                background: 'rgba(56, 189, 248, 0.15)',
                                border: '1px solid rgba(56, 189, 248, 0.35)',
                                color: '#38bdf8',
                                fontSize: 11,
                                fontWeight: 600,
                              }}
                            >
                              🌲 Ulkoanturi
                            </span>
                          )}
                          {dev.isIgnored && (
                            <span
                              style={{
                                padding: '2px 8px',
                                borderRadius: 100,
                                background: 'rgba(239, 68, 68, 0.15)',
                                border: '1px solid rgba(239, 68, 68, 0.35)',
                                color: '#f87171',
                                fontSize: 11,
                                fontWeight: 600,
                              }}
                            >
                              🚫 Piilotettu
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                          {dev.channel !== null && dev.channel !== undefined && (
                            <span>Kanava {dev.channel}</span>
                          )}
                          {dev.location && <span>📍 {dev.location}</span>}
                          <span>⏱️ {timeAgo(dev.lastSeen)}</span>
                          {rssi !== undefined && (
                            <span style={{ color: getRssiColor(rssi), fontWeight: 600 }}>
                              📶 {rssi} dBm
                            </span>
                          )}
                          {batteryOk !== undefined && (
                            <span>
                              {batteryOk ? '🔋 Paristo OK' : '⚠️ Paristo vähissä'}
                              {battery !== undefined && ` (${battery}%)`}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right Side: Temperature & Humidity readout */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' }}>
                        {temp !== undefined && (
                          <div
                            style={{
                              padding: '6px 14px',
                              borderRadius: 10,
                              background: 'rgba(56, 189, 248, 0.12)',
                              border: '1px solid rgba(56, 189, 248, 0.25)',
                              textAlign: 'center',
                            }}
                          >
                            <div style={{ fontSize: 10, color: '#38bdf8', fontWeight: 600, textTransform: 'uppercase' }}>
                              Lämpötila
                            </div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: '#38bdf8' }}>
                              {temp.toFixed(1)} °C
                            </div>
                          </div>
                        )}

                        {hum !== undefined && (
                          <div
                            style={{
                              padding: '6px 14px',
                              borderRadius: 10,
                              background: 'rgba(34, 197, 94, 0.12)',
                              border: '1px solid rgba(34, 197, 94, 0.25)',
                              textAlign: 'center',
                            }}
                          >
                            <div style={{ fontSize: 10, color: '#4ade80', fontWeight: 600, textTransform: 'uppercase' }}>
                              Kosteus
                            </div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: '#4ade80' }}>
                              {hum.toFixed(0)} %
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Inline Editing Form */}
                    {isEditing ? (
                      <div
                        style={{
                          background: 'rgba(0, 0, 0, 0.3)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: 10,
                          padding: 14,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 12,
                        }}
                      >
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                          <div>
                            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                              Oma selkeä nimi:
                            </label>
                            <input
                              type="text"
                              className="input"
                              placeholder="esim. Takapihan terassi"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              style={{ width: '100%', fontSize: 13, padding: '7px 10px' }}
                            />
                          </div>

                          <div>
                            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                              Sijainti / Huone:
                            </label>
                            <input
                              type="text"
                              className="input"
                              placeholder="esim. Piha, Varasto, Kellari"
                              value={editLocation}
                              onChange={(e) => setEditLocation(e.target.value)}
                              style={{ width: '100%', fontSize: 13, padding: '7px 10px' }}
                            />
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={editOutdoor}
                              onChange={(e) => setEditOutdoor(e.target.checked)}
                            />
                            <span>🌲 Käytä ulkolämpötila-anturina</span>
                          </label>

                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer', color: '#f87171' }}>
                            <input
                              type="checkbox"
                              checked={editIgnored}
                              onChange={(e) => setEditIgnored(e.target.checked)}
                            />
                            <span>🚫 Piilota / Ohita tämä anturi</span>
                          </label>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            disabled={saving}
                            className="btn btn-secondary"
                            style={{ padding: '6px 14px', fontSize: 12 }}
                          >
                            Peruuta
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSave(dev.id)}
                            disabled={saving}
                            className="btn btn-primary"
                            style={{ padding: '6px 16px', fontSize: 12 }}
                          >
                            {saving ? 'Tallennetaan...' : 'Tallenna muutokset'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Action Buttons */
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          paddingTop: 8,
                          borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                          flexWrap: 'wrap',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => startEditing(dev)}
                          className="btn btn-secondary"
                          style={{ padding: '5px 12px', fontSize: 12 }}
                        >
                          ✏️ Muokkaa & Nimeä
                        </button>

                        {onSelectSensorForChart && temp !== undefined && (
                          <button
                            type="button"
                            onClick={() => {
                              onSelectSensorForChart(
                                dev.customName || dev.model,
                                `rtl433/${dev.id}/temperature`,
                                hum !== undefined ? `rtl433/${dev.id}/humidity` : undefined
                              );
                              onClose();
                            }}
                            className="btn btn-secondary"
                            style={{ padding: '5px 12px', fontSize: 12 }}
                          >
                            📈 Avaa Kuvaaja
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setShowRawId(isRawOpen ? null : dev.id)}
                          style={{
                            padding: '5px 10px',
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-muted)',
                            fontSize: 11,
                            cursor: 'pointer',
                          }}
                        >
                          {isRawOpen ? '▲ Piilota raakadata' : '▼ Näytä raakadata'}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`Haluatko varmasti poistaa anturin ${dev.customName || dev.id}?`)) {
                              deleteDevice(dev.id);
                            }
                          }}
                          style={{
                            marginLeft: 'auto',
                            padding: '4px 8px',
                            background: 'transparent',
                            border: 'none',
                            color: 'rgba(239, 68, 68, 0.7)',
                            fontSize: 11,
                            cursor: 'pointer',
                          }}
                        >
                          🗑️ Poista
                        </button>
                      </div>
                    )}

                    {/* Collapsible Raw Data Payload Viewer */}
                    {isRawOpen && dev.raw && (
                      <div
                        style={{
                          background: 'rgba(0, 0, 0, 0.4)',
                          borderRadius: 8,
                          padding: 10,
                          fontSize: 11,
                          fontFamily: 'monospace',
                          color: '#94a3b8',
                          overflowX: 'auto',
                        }}
                      >
                        <pre style={{ margin: 0 }}>{JSON.stringify(dev.raw, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
