import React, { useState, useMemo } from 'react';
import { useRtl433 } from '../hooks/useRtl433';
import { useSatellites } from '../hooks/useSatellites';
import { Rtl433ManagerModal } from './Rtl433ManagerModal';
import { getStoredToken } from '../hooks/useAuth';

type ExperimentalSubTab = 'satellites' | 'rtl433' | 'ham';

export const ExperimentalRadioPage: React.FC = () => {
  const [subTab, setSubTab] = useState<ExperimentalSubTab>('satellites');
  const [managerOpen, setManagerOpen] = useState(false);
  const [activeImageFeed, setActiveImageFeed] = useState<'eumetsat_ir' | 'eumetsat_natural' | 'fmi_radar'>('eumetsat_ir');
  const [imageReloadKey, setImageReloadKey] = useState(Date.now());
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState(false);

  const token = getStoredToken();
  const imageSrc = `/api/satellites/image/${activeImageFeed}?t=${imageReloadKey}${token ? `&token=${encodeURIComponent(token)}` : ''}`;

  const { devices, status: rtlStatus, loading: rtlLoading } = useRtl433();
  const { passes, currentOverhead, loading: satLoading, refreshing: tlesRefreshing, refreshTles } = useSatellites();

  const outdoorCount = devices.filter((d) => d.isOutdoor && !d.isIgnored).length;

  // Active satellite passes in next 24h
  const nextPasses = useMemo(() => {
    const now = Date.now();
    return passes.filter((p) => p.los > now).slice(0, 8);
  }, [passes]);

  // Format countdown string
  const formatCountdown = (targetMs: number) => {
    const diff = targetMs - Date.now();
    if (diff <= 0) return 'NYT';
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    if (hours > 0) return `${hours} h ${remMins} min`;
    return `${mins} min`;
  };

  const handleRefreshImage = () => {
    setImageLoading(true);
    setImageError(false);
    setImageReloadKey(Date.now());
  };

  const handleSelectFeed = (feed: 'eumetsat_ir' | 'eumetsat_natural' | 'fmi_radar') => {
    setActiveImageFeed(feed);
    setImageLoading(true);
    setImageError(false);
    setImageReloadKey(Date.now());
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 36 }}>
      {/* ─── Hero Header & Hardware Status ─── */}
      <div
        className="card"
        style={{
          background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.95) 100%)',
          borderColor: 'rgba(56, 189, 248, 0.3)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Glow accent */}
        <div
          style={{
            position: 'absolute',
            top: -40,
            right: -40,
            width: 180,
            height: 180,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(56, 189, 248, 0.15) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        <div className="card-header" style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 12,
                  background: 'rgba(56, 189, 248, 0.15)',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 24,
                  boxShadow: '0 0 16px rgba(56, 189, 248, 0.2)',
                }}
              >
                🛰️
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
                    Radio & Satelliitti (Experimental SDR)
                  </h2>
                  <span
                    className="badge"
                    style={{
                      background: rtlStatus.connected ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: rtlStatus.connected ? '#4ade80' : '#f87171',
                      border: `1px solid ${rtlStatus.connected ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {rtlStatus.connected ? '🟢 RTL-SDR LIVE (433.92 MHz)' : '🔴 Vastaanotin offline'}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                  Ohjelmistoradio (SDR) · Realtek RTL2838 & Rafael Micro R820T · Sääsatelliitit, 433 MHz RF-telemetria & lentotutka
                </div>
              </div>
            </div>

            {/* Quick action buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setManagerOpen(true)}
                style={{
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  borderColor: 'rgba(255,255,255,0.15)',
                }}
              >
                <span>⚙️</span> Hallitse antureita ({devices.length})
              </button>
            </div>
          </div>
        </div>

        {/* Hardware Status Strip */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 12,
            padding: '16px 24px',
            background: 'rgba(0,0,0,0.15)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>SDR-Vastaanotinlaite</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#38bdf8', marginTop: 2 }}>
              Realtek RTL2838 / R820T
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>USB Passthrough /dev/bus/usb</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Keskitaajuus & Protokollat</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#facc15', marginTop: 2 }}>
              433.92 MHz ISM · 380 dekooderia
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>merbanan/rtl_433 Master CI</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Vastaanotetut paketit</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#4ade80', marginTop: 2 }}>
              {rtlStatus.packetCount.toLocaleString()} kpl
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              {rtlStatus.lastReceivedAt ? `Viimeisin: ${new Date(rtlStatus.lastReceivedAt).toLocaleTimeString('fi-FI')}` : 'Ei paketteja'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Havaitut anturit</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#c084fc', marginTop: 2 }}>
              {devices.length} kpl ({outdoorCount} ulkoanturia)
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Auto-rekisteröity tietokantaan</span>
          </div>
        </div>

        {/* Sub-Tabs Selector */}
        <div
          style={{
            display: 'flex',
            gap: 10,
            padding: '12px 24px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            flexWrap: 'wrap',
          }}
        >
          <button
            className={`btn btn-sm ${subTab === 'satellites' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setSubTab('satellites')}
            style={{
              padding: '6px 16px',
              fontSize: 13,
              fontWeight: subTab === 'satellites' ? 700 : 500,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>🛰️</span> Sääsatelliitit & Ylilennot
          </button>

          <button
            className={`btn btn-sm ${subTab === 'rtl433' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setSubTab('rtl433')}
            style={{
              padding: '6px 16px',
              fontSize: 13,
              fontWeight: subTab === 'rtl433' ? 700 : 500,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>📻</span> 433 MHz RF-Telemetria & Anturit ({devices.length})
          </button>

          <button
            className={`btn btn-sm ${subTab === 'ham' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setSubTab('ham')}
            style={{
              padding: '6px 16px',
              fontSize: 13,
              fontWeight: subTab === 'ham' ? 700 : 500,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>✈️</span> Radioamatööri & ADS-B Lentotutka
          </button>
        </div>
      </div>

      {/* ─── VIEW 1: SÄÄSATELLIITIT & YLILENNOT ─── */}
      {subTab === 'satellites' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Overhead Live Banner if active */}
          {currentOverhead && (
            <div
              style={{
                padding: '16px 20px',
                borderRadius: 12,
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(15, 23, 42, 0.9) 100%)',
                border: '1px solid rgba(16, 185, 129, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
                boxShadow: '0 0 24px rgba(16, 185, 129, 0.25)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ fontSize: 28, animation: 'pulse 1.5s infinite' }}>🛰️</span>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: '#4ade80' }}>
                      SATELLIITTI YLILENNOSSA NYT: {currentOverhead.satellite}
                    </span>
                    <span className="badge" style={{ background: 'rgba(34,197,94,0.3)', color: '#4ade80', fontSize: 11 }}>
                      LIVE
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                    Taajuus: <strong>{currentOverhead.frequency}</strong> ({currentOverhead.mode}) · Maksimielevaatio:{' '}
                    <strong>{currentOverhead.maxElevation}°</strong> · Reitti: {currentOverhead.trajectory}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 13, color: '#4ade80', fontWeight: 600 }}>
                Päättyy klo {new Date(currentOverhead.los).toLocaleTimeString('fi-FI')}
              </div>
            </div>
          )}

          {/* Satellite Pass Schedule Cards */}
          <div className="card">
            <div
              className="card-header"
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Seuraavat NOAA & Meteor Sääsatelliittien ylilennot (Etelä-Suomi)
                </h3>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  SGP4-ratapropagaatio · Havainnoija: Järvenpää (60.47°N, 25.09°E) · Vastaanottokelpoiset ylilennot (&gt;10°)
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={refreshTles}
                  disabled={tlesRefreshing}
                  style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
                  title="Hae tuoreimmat rataparametrit CelesTrakista"
                >
                  <span>🔄</span> {tlesRefreshing ? 'Päivitetään...' : 'Päivitä TLE-parametrit'}
                </button>
              </div>
            </div>

            <div className="card-body" style={{ padding: 20 }}>
              {satLoading && passes.length === 0 ? (
                <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>
                  Lasketaan satelliittien ratoja...
                </div>
              ) : nextPasses.length === 0 ? (
                <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>
                  Ei havaittuja ylilentoja seuraavan 24 tunnin aikana yli 10° kulmassa.
                </div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: 14,
                  }}
                >
                  {nextPasses.map((p, idx) => {
                    const isOverhead = Date.now() >= p.aos && Date.now() <= p.los;
                    const isExcellent = p.quality === 'excellent';
                    const isGood = p.quality === 'good';

                    const qualityColor = isExcellent ? '#4ade80' : isGood ? '#facc15' : '#94a3b8';
                    const qualityBg = isExcellent
                      ? 'rgba(34, 197, 94, 0.12)'
                      : isGood
                      ? 'rgba(250, 204, 21, 0.12)'
                      : 'rgba(148, 163, 184, 0.08)';

                    return (
                      <div
                        key={`${p.satellite}_${p.aos}_${idx}`}
                        style={{
                          padding: 16,
                          borderRadius: 12,
                          background: isOverhead
                            ? 'rgba(16, 185, 129, 0.15)'
                            : 'rgba(255, 255, 255, 0.03)',
                          border: `1px solid ${isOverhead ? 'rgba(16, 185, 129, 0.4)' : 'rgba(255, 255, 255, 0.08)'}`,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 10,
                          transition: 'all 0.2s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 18 }}>🛰️</span>
                            <div>
                              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                                {p.satellite}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                {p.mode} · {p.frequency}
                              </div>
                            </div>
                          </div>

                          <span
                            className="badge"
                            style={{
                              background: qualityBg,
                              color: qualityColor,
                              border: `1px solid ${qualityColor}40`,
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            {p.maxElevation}° ({p.qualityLabel})
                          </span>
                        </div>

                        {/* Timing details */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            background: 'rgba(0,0,0,0.2)',
                            borderRadius: 8,
                          }}
                        >
                          <div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Alkaa (AOS)</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#38bdf8' }}>
                              klo {new Date(p.aos).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>

                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Kesto</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                              {p.durationMin} min
                            </div>
                          </div>

                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Alkuun aikaa</div>
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 700,
                                color: isOverhead ? '#4ade80' : '#f59e0b',
                              }}
                            >
                              {formatCountdown(p.aos)}
                            </div>
                          </div>
                        </div>

                        {/* Trajectory */}
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>🧭</span>
                          <span>
                            Suunta: <strong>{p.trajectory}</strong> (Huippu: {p.azMaxCompass})
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Interactive Live Weather Satellite Imagery Viewer */}
          <div className="card">
            <div
              className="card-header"
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Reaaliaikaiset Sääsatelliitti- ja Tutkakuvat
                </h3>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  EUMETSAT Meteosat & Ilmatieteen laitos (FMI) · Suomi ja Pohjoismaat
                </div>
              </div>

              {/* Feed selector tabs */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  className={`btn btn-sm ${activeImageFeed === 'eumetsat_ir' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => handleSelectFeed('eumetsat_ir')}
                  style={{ fontSize: 12 }}
                >
                  🌡️ EUMETSAT IR 10.8µm
                </button>
                <button
                  className={`btn btn-sm ${activeImageFeed === 'eumetsat_natural' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => handleSelectFeed('eumetsat_natural')}
                  style={{ fontSize: 12 }}
                >
                  🌍 EUMETSAT TrueColor
                </button>
                <button
                  className={`btn btn-sm ${activeImageFeed === 'fmi_radar' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => handleSelectFeed('fmi_radar')}
                  style={{ fontSize: 12 }}
                >
                  🌧️ FMI Sade- ja Tutkakomposiitti
                </button>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={handleRefreshImage}
                  style={{ fontSize: 12 }}
                  title="Lataa tuore kuva palvelimelta"
                >
                  🔄
                </button>
              </div>
            </div>

            <div className="card-body" style={{ padding: 20 }}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: 12,
                  padding: 16,
                  border: '1px solid rgba(255,255,255,0.06)',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    position: 'relative',
                    maxWidth: 750,
                    width: '100%',
                    borderRadius: 8,
                    overflow: 'hidden',
                    border: '1px solid rgba(255,255,255,0.1)',
                    boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
                  }}
                >
                  {!imageError ? (
                    <img
                      src={imageSrc}
                      alt="Sääsatelliittikuva"
                      style={{
                        width: '100%',
                        height: 'auto',
                        display: 'block',
                        objectFit: 'contain',
                        maxHeight: '620px',
                        cursor: 'zoom-in',
                      }}
                      title="Klikkaa avataksesi kuvan uuteen välilehteen"
                      onClick={() => window.open(imageSrc, '_blank')}
                      onLoad={() => {
                        setImageLoading(false);
                        setImageError(false);
                      }}
                      onError={() => {
                        setImageLoading(false);
                        setImageError(true);
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        padding: '40px 20px',
                        textAlign: 'center',
                        color: '#f87171',
                        background: 'rgba(239, 68, 68, 0.08)',
                        borderRadius: 8,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 12,
                      }}
                    >
                      <div style={{ fontSize: 24 }}>⚠️</div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>Kuvan lataus epäonnistui</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 400 }}>
                        Palvelin hakee parhaillaan tuoreinta satelliitti- tai tutkadatanäkymää EUMETSAT/FMI WMS -palvelusta.
                      </div>
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={handleRefreshImage}
                        style={{ border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', fontSize: 12, marginTop: 4 }}
                      >
                        Yritä uudelleen 🔄
                      </button>
                    </div>
                  )}

                  {imageLoading && (
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'rgba(0,0,0,0.6)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#38bdf8',
                        fontWeight: 600,
                      }}
                    >
                      Ladataan kuvaa...
                    </div>
                  )}
                </div>

                <div
                  style={{
                    marginTop: 14,
                    width: '100%',
                    maxWidth: 750,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 10,
                    fontSize: 12,
                    color: 'var(--text-muted)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 260 }}>
                    {activeImageFeed === 'eumetsat_ir' && (
                      <span>
                        🌡️ <strong>EUMETSAT Infrapuna (IR 10.8 µm):</strong> Havaitsee pilvien yläpintojen lämpötilat ja pilvisyyden 24/7 (myös pimeässä). Kylmät, korkeat pilvet näkyvät kirkkaina.
                      </span>
                    )}
                    {activeImageFeed === 'eumetsat_natural' && (
                      <span>
                        🌍 <strong>EUMETSAT Natural Colour (RGB):</strong> Luonnollisen värinen satelliittinäkymä päivänvalossa. Pilvet valkoisia, lumi syaania ja maa luonnollisen vihreää/ruskeaa.
                      </span>
                    )}
                    {activeImageFeed === 'fmi_radar' && (
                      <span>
                        🌧️ <strong>Ilmatieteen laitoksen tutka:</strong> Koko Suomen kattava säätutkakomposiitti heijastavuudesta (dBZ), näyttää sadealueet reaaliaikaisena karttana.
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <a
                      href={imageSrc}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: 11,
                        color: '#38bdf8',
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        background: 'rgba(56, 189, 248, 0.1)',
                        border: '1px solid rgba(56, 189, 248, 0.25)',
                        padding: '3px 8px',
                        borderRadius: 6,
                        fontWeight: 600,
                      }}
                    >
                      Avaa täysikokoisena ↗
                    </a>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      Välimuisti: 5 min
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Satellite SDR Reception Guide & How-To */}
          <div className="card">
            <div className="card-header" style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                📖 Sääsatelliittikuvien (NOAA APT & Meteor LRPT) Vastaanotto-opas
              </h3>
            </div>
            <div className="card-body" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <p style={{ margin: 0 }}>
                Polar-sääsatelliitit (kuten <strong>NOAA 15, 18, 19</strong> ja <strong>Meteor-M2 3, 4</strong>) kiertävät maapallon navalta navalle n. 850 km korkeudessa. Ne ylittävät Suomen useita kertoja vuorokaudessa ja lähettävät reaaliaikaista kuvasignaalia suoraan alas maahan 137 MHz taajuusalueella.
              </p>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                  gap: 14,
                  marginTop: 6,
                }}
              >
                <div style={{ padding: 14, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontWeight: 700, color: '#38bdf8', marginBottom: 6 }}>1. Antenni: 120° V-Dipoli (137 MHz)</div>
                  Helpoin ja suosituin antenni. Kaksi 53,4 cm pituista metallitankoa tai kuparijohtoa 120 asteen kulmassa, suunnattuna etelään/pohjoiseen vaakatasossa. Toimii erinomaisesti horisontin yläpuolelta tuleville signaaleille ilman kääntömoottoria.
                </div>

                <div style={{ padding: 14, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontWeight: 700, color: '#4ade80', marginBottom: 6 }}>2. Ohjelmistot (SatDump / noaa-apt)</div>
                  Signaali tallennetaan IQ-audiona tai dekoodataan suoraan. <strong>SatDump</strong> on nykyään alan tehokkain moniprotokollasovellus (tukee sekä analogista NOAA APT että digitaalista Meteor LRPT QPSK).
                </div>

                <div style={{ padding: 14, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontWeight: 700, color: '#c084fc', marginBottom: 6 }}>3. 24/7 Automaatio & Toinen SDR-tikku</div>
                  Koska nykyinen RTL-SDR-tikku kuuntelee kodin 433 MHz lämpöantureita 24/7, satelliittien vastaanottoon kannattaa lisätä <strong>toinen edullinen USB-SDR-tikku (n. 15-25 €)</strong>. Tällöin Kotiäly voi tallentaa satelliittikuvat automaattisesti taustalla ilman lämpötilaloggauksen keskeytymistä!
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── VIEW 2: 433 MHZ RF-TELEMETRIA & ANTURIT ─── */}
      {subTab === 'rtl433' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Quick Stats Header */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 14,
            }}
          >
            <div className="card" style={{ padding: 16 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Vastaanotetut anturit</span>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#38bdf8', marginTop: 4 }}>
                {devices.length} <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)' }}>kpl</span>
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                {outdoorCount} merkitty ulkoanturiksi
              </span>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>RF-Pakettilaskuri</span>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#4ade80', marginTop: 4 }}>
                {rtlStatus.packetCount.toLocaleString()}{' '}
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)' }}>pakettia</span>
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                {rtlStatus.connected ? 'Jatkuva MQTT-striimaus aktiivinen' : 'Yhteys katkennut'}
              </span>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Protokollatuki</span>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#facc15', marginTop: 4 }}>
                380 <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)' }}>dekooderia</span>
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                Nexus, Bresser, inFactory, TFA, LaCrosse
              </span>
            </div>
          </div>

          {/* Device Cards Grid */}
          <div className="card">
            <div
              className="card-header"
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Kaikki havaitut 433 MHz anturit ja telemetria
                </h3>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  Klikkaa "Muokkaa" nimetäksesi anturin tai asettaaksesi sen ulkolämpömittariksi
                </div>
              </div>

              <button
                className="btn btn-sm btn-primary"
                onClick={() => setManagerOpen(true)}
                style={{ fontSize: 12 }}
              >
                ⚙️ Avaa anturien hallinta
              </button>
            </div>

            <div className="card-body" style={{ padding: 20 }}>
              {rtlLoading && devices.length === 0 ? (
                <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>
                  Ladataan antureita...
                </div>
              ) : devices.length === 0 ? (
                <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>
                  Ei vielä vastaanotettuja 433 MHz -antureita. Odota muutama minuutti.
                </div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: 14,
                  }}
                >
                  {devices.map((dev) => {
                    const temp = dev.properties.temperature;
                    const hum = dev.properties.humidity;
                    const battOk = dev.properties.battery_ok !== false;
                    const isOutdoor = dev.isOutdoor;

                    return (
                      <div
                        key={dev.id}
                        style={{
                          padding: 16,
                          borderRadius: 12,
                          background: dev.isIgnored
                            ? 'rgba(255,255,255,0.01)'
                            : isOutdoor
                            ? 'linear-gradient(145deg, rgba(34, 211, 238, 0.08) 0%, rgba(15, 23, 42, 0.6) 100%)'
                            : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${
                            dev.isIgnored
                              ? 'rgba(255,255,255,0.04)'
                              : isOutdoor
                              ? 'rgba(34, 211, 238, 0.3)'
                              : 'rgba(255,255,255,0.08)'
                          }`,
                          opacity: dev.isIgnored ? 0.5 : 1,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 10,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 20 }}>{isOutdoor ? '🌲' : '🌡️'}</span>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                                {dev.customName || `${dev.model} #${dev.rawId || dev.id}`}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                {dev.model} {dev.channel ? `(Kanava ${dev.channel})` : ''}
                              </div>
                            </div>
                          </div>

                          {isOutdoor && (
                            <span className="badge" style={{ background: 'rgba(34,211,238,0.15)', color: '#22d3ee', fontSize: 10 }}>
                              Ulkoanturi
                            </span>
                          )}
                        </div>

                        {/* Values */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            background: 'rgba(0,0,0,0.2)',
                            borderRadius: 8,
                          }}
                        >
                          <div>
                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Lämpötila</span>
                            <div style={{ fontSize: 20, fontWeight: 700, color: '#38bdf8' }}>
                              {temp !== undefined ? `${temp.toFixed(1)} °C` : '—'}
                            </div>
                          </div>

                          {hum !== undefined && (
                            <div>
                              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Kosteus</span>
                              <div style={{ fontSize: 18, fontWeight: 600, color: '#34d399' }}>
                                {hum.toFixed(0)} %
                              </div>
                            </div>
                          )}

                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Paristo</span>
                            <div style={{ fontSize: 12, fontWeight: 600, color: battOk ? '#4ade80' : '#f87171' }}>
                              {battOk ? '🔋 OK' : '🪫 Heikko'}
                            </div>
                          </div>
                        </div>

                        {/* Bottom line */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
                          <span>
                            {dev.lastSeen ? `Nähty: ${new Date(dev.lastSeen).toLocaleTimeString('fi-FI')}` : 'Ei yhteyttä'}
                          </span>
                          <span style={{ fontSize: 10 }}>
                            {dev.packetCount ? `${dev.packetCount} pakettia` : ''}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── VIEW 3: RADIOAMATÖÖRI & MUUT TAAJUUDET (ADS-B, APRS) ─── */}
      {subTab === 'ham' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* ADS-B Flight Radar */}
          <div className="card">
            <div className="card-header" style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>✈️</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                    ADS-B 1090 MHz Lentotutka (FlightAware / dump1090)
                  </h3>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    Reaaliaikainen lentoliikenteen valvonta ja transponderisignaalit Etelä-Suomen yllä
                  </div>
                </div>
              </div>
            </div>

            <div className="card-body" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <p style={{ margin: 0 }}>
                Kaikki modernit matkustajakoneet lähettävät sekunnin välein <strong>1090 MHz</strong> taajuudella digitaalista ADS-B -lähetystä, joka sisältää koneen tarkan GPS-sijainnin, lentokorkeuden, nopeuden, lennonnumeron ja suunnan.
              </p>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                  gap: 14,
                }}
              >
                <div style={{ padding: 14, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontWeight: 700, color: '#38bdf8', marginBottom: 4 }}>Kantama & Sijainti</div>
                  Järvenpäästä pienelläkin 1090 MHz dipolilla näkee Helsinki-Vantaan tuloväylät, Suomenlahden ylilentoliikenteen sekä koko Etelä- ja Keski-Suomen ilmatilan n. 150-350 km säteellä.
                </div>

                <div style={{ padding: 14, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontWeight: 700, color: '#4ade80', marginBottom: 4 }}>Software: dump1090 / readsb</div>
                  Valmis Docker-kontti <code>mikenye/readsb-protobuf</code> tai <code>tar1090</code> tarjoaa interaktiivisen web-kartan suoraan selaimessa lentokoneiden reiteillä ja korkeusväreillä.
                </div>

                <div style={{ padding: 14, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontWeight: 700, color: '#facc15', marginBottom: 4 }}>Syöttö FlightAwareen / FR24</div>
                  Omasta vastaanottimesta voi syöttää dataa suoraan Flightradar24:ään tai FlightAwareen, jolloin saa vastineeksi ilmaisen Flightradar24 Business-tilauksen.
                </div>
              </div>
            </div>
          </div>

          {/* APRS 144.800 MHz Ham Packet Radio */}
          <div className="card">
            <div className="card-header" style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>📻</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                    APRS 144.800 MHz (Automatic Packet Reporting System)
                  </h3>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    Radioamatöörien sääasemat, toistinasemat ja mobiilipaikannus 2 metrin VHF-bandilla
                  </div>
                </div>
              </div>
            </div>

            <div className="card-body" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <p style={{ margin: 0 }}>
                Suomessa ja Euroopassa radioamatöörit käyttävät taajuutta <strong>144.800 MHz (AX.25 1200 baud AFSK)</strong> sääasematietojen, telemetrian ja ajoneuvojen paikannusviestien välittämiseen. RTL-SDR:llä ja <code>direwolf</code>-sovelluksella voi purkaa nämä paketit suoraan Kotiälyn kartalle.
              </p>
            </div>
          </div>

          {/* Dual-SDR Architecture Diagram */}
          <div className="card">
            <div className="card-header" style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                🔌 Kahden SDR-tikun Arkkitehtuuri (Suositeltu laajennus)
              </h3>
            </div>
            <div className="card-body" style={{ padding: 20 }}>
              <div
                style={{
                  padding: 18,
                  borderRadius: 10,
                  background: 'rgba(0,0,0,0.25)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                <div style={{ color: '#38bdf8', fontWeight: 700 }}>
                  Miksi useampi SDR-vastaanotin on hyödyllinen?
                </div>
                <div>
                  Koska nykyinen RTL-SDR-vastaanotin on viritetty <strong>433.92 MHz</strong> taajuudelle kuuntelemaan pihan ja varastojen lämpötila-antureita keskeytyksettä, se ei voi samanaikaisesti vastaanottaa satelliitteja (137 MHz) tai lentotutkaa (1090 MHz).
                </div>
                <div>
                  Kytkemällä palvelimen toiseen USB-porttiin <strong>toinen RTL-SDR v3/v4 -tikku (sarjanumeroitu rtl_eeprom -s)</strong>:
                </div>
                <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--text-secondary)' }}>
                  <li><strong>USB Tikku #1 (Serial: 00000001):</strong> 433.92 MHz ympärivuorokautinen anturidata (kotialy-rtl433)</li>
                  <li><strong>USB Tikku #2 (Serial: 00000002):</strong> Sääsatelliitit (137 MHz NOAA/Meteor) ja/tai ADS-B Lentotutka (1090 MHz)</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rtl433 Manager Modal */}
      <Rtl433ManagerModal
        isOpen={managerOpen}
        onClose={() => setManagerOpen(false)}
      />
    </div>
  );
};
