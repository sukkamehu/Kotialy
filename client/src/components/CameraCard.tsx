import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { apiFetch } from '../lib/api';

interface CameraStatus {
  enabled: boolean;
  online: boolean;
  name: string;
  lastSnapshotAt: number | null;
  error: string | null;
  hasSnapshot: boolean;
  subRtspUrlDisplay: string;
  mainRtspUrlDisplay: string;
  resolution: string;
}

export function CameraCard() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Default to 1000ms (1.0s) for responsive live feed
  const [refreshInterval, setRefreshInterval] = useState<number>(() => {
    const saved = localStorage.getItem('kotialy_camera_interval');
    return saved !== null ? parseInt(saved, 10) : 1000;
  });

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  
  // Default to 1080p Full HD
  const [isHd, setIsHd] = useState<boolean>(() => {
    const saved = localStorage.getItem('kotialy_camera_hd');
    return saved !== null ? saved === 'true' : true;
  });

  const [status, setStatus] = useState<CameraStatus | null>(null);
  const [copiedStream, setCopiedStream] = useState<string | null>(null);

  const prevBlobUrlRef = useRef<string | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const isFetchingRef = useRef<boolean>(false);

  // Fetch camera status info
  const fetchStatus = useCallback(async () => {
    try {
      const res = await apiFetch('/api/camera/status');
      if (res.ok) {
        const data = await res.json();
        if (isMountedRef.current) {
          setStatus(data);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Fetch snapshot blob and double-buffer to avoid visual flicker
  const fetchSnapshot = useCallback(async (highRes = isHd, manual = false) => {
    if (isFetchingRef.current && !manual) return;
    isFetchingRef.current = true;
    if (manual) setRefreshing(true);

    try {
      const url = `/api/camera/snapshot?t=${Date.now()}${highRes ? '&highRes=1' : '&highRes=0'}`;
      const res = await apiFetch(url);

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message || 'Kuvan haku epäonnistui');
      }

      const blob = await res.blob();
      if (!isMountedRef.current) return;

      const newUrl = URL.createObjectURL(blob);

      // Preload image before setting state to prevent flicker
      const img = new Image();
      img.onload = () => {
        if (!isMountedRef.current) {
          URL.revokeObjectURL(newUrl);
          return;
        }
        if (prevBlobUrlRef.current) {
          URL.revokeObjectURL(prevBlobUrlRef.current);
        }
        prevBlobUrlRef.current = newUrl;
        setImageUrl(newUrl);
        setLastUpdated(new Date());
        setError(null);
      };
      img.onerror = () => {
        if (!isMountedRef.current) return;
        URL.revokeObjectURL(newUrl);
      };
      img.src = newUrl;

    } catch (err: any) {
      if (isMountedRef.current) {
        setError(err.message || 'Kamerayhteys poikki');
      }
    } finally {
      isFetchingRef.current = false;
      if (isMountedRef.current) {
        setLoading(false);
        if (manual) setRefreshing(false);
      }
    }
  }, [isHd]);

  useEffect(() => {
    isMountedRef.current = true;
    fetchStatus();
    fetchSnapshot(isHd);

    return () => {
      isMountedRef.current = false;
      if (prevBlobUrlRef.current) {
        URL.revokeObjectURL(prevBlobUrlRef.current);
      }
    };
  }, [fetchSnapshot, fetchStatus, isHd]);

  // Periodic rapid refresh timer
  useEffect(() => {
    if (refreshInterval <= 0) return;

    const timer = setInterval(() => {
      fetchSnapshot(isHd);
    }, refreshInterval);

    return () => clearInterval(timer);
  }, [refreshInterval, fetchSnapshot, isHd]);

  const handleIntervalChange = (interval: number) => {
    setRefreshInterval(interval);
    localStorage.setItem('kotialy_camera_interval', String(interval));
    if (interval > 0) fetchSnapshot(isHd);
  };

  const toggleHd = () => {
    const nextVal = !isHd;
    setIsHd(nextVal);
    localStorage.setItem('kotialy_camera_hd', String(nextVal));
    fetchSnapshot(nextVal, true);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedStream(label);
    setTimeout(() => setCopiedStream(null), 2500);
  };

  const isLive = refreshInterval > 0 && !error;

  return (
    <>
      <div className="card-glass" style={{ display: 'flex', flexDirection: 'column' }}>
        {/* Card Header */}
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>📹</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>
                {status?.name || 'Teknisen tilan kamera'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                192.168.68.57 • TAS-Tech RTSP (UDP)
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {/* Live Indicator */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '3px 8px',
                borderRadius: 12,
                fontSize: 11,
                fontWeight: 600,
                background: isLive ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: isLive ? 'var(--online)' : 'var(--offline)',
                border: `1px solid ${isLive ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: isLive ? 'var(--online)' : 'var(--offline)',
                  boxShadow: isLive ? '0 0 6px var(--online)' : undefined,
                  animation: isLive ? 'pulse 1.5s infinite' : undefined,
                }}
              />
              {refreshInterval === 0 ? 'PYSÄYTETTY' : error ? 'OFFLINE' : 'LIVE'}
            </div>

            {/* Quality HD/SD toggle */}
            <button
              onClick={toggleHd}
              style={{
                border: `1px solid ${isHd ? 'rgba(34, 211, 238, 0.5)' : 'var(--border)'}`,
                background: isHd ? 'rgba(34, 211, 238, 0.18)' : 'rgba(255,255,255,0.05)',
                color: isHd ? 'var(--cool-primary)' : 'var(--text-secondary)',
                fontWeight: 700,
                fontSize: 11,
                padding: '3px 8px',
                borderRadius: 6,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title={isHd ? '1080p Full HD aktiivinen (klikkaa vaihtaaksesi nopeaan SD-tilaan)' : 'SD-tila aktiivinen (klikkaa vaihtaaksesi 1080p HD -tilaan)'}
            >
              {isHd ? '🌟 1080p HD' : '⚡ SD 640p'}
            </button>

            {/* Refresh Interval Selector */}
            <div
              style={{
                display: 'flex',
                background: 'rgba(255,255,255,0.06)',
                borderRadius: 8,
                padding: 2,
                border: '1px solid var(--border)',
              }}
            >
              {[
                { label: '0.5s', val: 500 },
                { label: '1s', val: 1000 },
                { label: '2s', val: 2000 },
                { label: '5s', val: 5000 },
                { label: '⏸', val: 0 },
              ].map((opt) => (
                <button
                  key={opt.val}
                  onClick={() => handleIntervalChange(opt.val)}
                  style={{
                    border: 'none',
                    background: refreshInterval === opt.val ? 'var(--cool-primary)' : 'transparent',
                    color: refreshInterval === opt.val ? '#0f172a' : 'var(--text-secondary)',
                    fontWeight: refreshInterval === opt.val ? 700 : 500,
                    fontSize: 11,
                    padding: '3px 6px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  title={opt.val === 0 ? 'Pysäytä päivitys' : `Päivitä ${opt.label} välein`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Manual refresh button */}
            <button
              onClick={() => fetchSnapshot(isHd, true)}
              disabled={refreshing}
              style={{
                border: '1px solid var(--border)',
                background: 'rgba(255,255,255,0.05)',
                color: 'var(--text-primary)',
                padding: '4px 7px',
                borderRadius: 8,
                cursor: refreshing ? 'not-allowed' : 'pointer',
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
              }}
              title="Päivitä kuva heti"
            >
              <span style={{ display: 'inline-block', transform: refreshing ? 'rotate(360deg)' : 'none', transition: 'transform 0.5s ease' }}>
                🔄
              </span>
            </button>

            {/* Fullscreen / Enlarge button */}
            <button
              onClick={() => setIsModalOpen(true)}
              style={{
                border: '1px solid var(--border)',
                background: 'rgba(255,255,255,0.05)',
                color: 'var(--text-primary)',
                padding: '4px 7px',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 12,
              }}
              title="Suurenna ja näytä suoratoisto-osoitteet"
            >
              ⛶
            </button>
          </div>
        </div>

        {/* Card Body / Video Viewport */}
        <div style={{ padding: 14 }}>
          <div
            onClick={() => setIsModalOpen(true)}
            style={{
              position: 'relative',
              width: '100%',
              borderRadius: 12,
              overflow: 'hidden',
              background: '#04070f',
              border: '1px solid var(--border)',
              aspectRatio: '16 / 9',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'inset 0 0 20px rgba(0,0,0,0.6)',
            }}
          >
            {imageUrl ? (
              <img
                src={imageUrl}
                alt="Pannuhuoneen valvontakamera"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  display: 'block',
                  transition: 'opacity 0.15s ease',
                  opacity: loading && !imageUrl ? 0.4 : 1,
                }}
              />
            ) : loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 28, animation: 'spin 1.5s linear infinite' }}>⏳</div>
                <div style={{ fontSize: 12 }}>Haetaan suoraa videokuvaa...</div>
              </div>
            ) : null}

            {error && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(15, 20, 32, 0.85)',
                  backdropFilter: 'blur(4px)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 16,
                  textAlign: 'center',
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 24 }}>⚠️</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#f87171' }}>
                  Kamerayhteysvirhe
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 300 }}>
                  {error}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    fetchSnapshot(isHd, true);
                  }}
                  style={{
                    marginTop: 4,
                    padding: '5px 14px',
                    borderRadius: 6,
                    border: '1px solid var(--cool-primary)',
                    background: 'rgba(34, 211, 238, 0.1)',
                    color: 'var(--cool-primary)',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Yritä uudelleen
                </button>
              </div>
            )}

            {/* Top-Left Overlay Tag */}
            <div
              style={{
                position: 'absolute',
                top: 8,
                left: 8,
                background: 'rgba(0,0,0,0.7)',
                backdropFilter: 'blur(4px)',
                padding: '3px 8px',
                borderRadius: 6,
                fontSize: 10,
                fontWeight: 600,
                color: '#e2e8f0',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <span style={{ color: isHd ? 'var(--heat-primary)' : 'var(--cool-primary)' }}>●</span> {isHd ? '1080p Full HD' : 'SD 640×352'}
            </div>

            {/* Bottom Overlay Bar */}
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 70%, transparent 100%)',
                padding: '12px 10px 6px 10px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                fontSize: 10,
                color: 'rgba(255,255,255,0.75)',
              }}
            >
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Laatu:</span> {isHd ? '1920×1080 (HQ)' : '640×352 (Fast)'}
              </div>
              <div>
                {lastUpdated ? (
                  <span>
                    Päivitetty: {lastUpdated.toLocaleTimeString('fi-FI')}
                  </span>
                ) : (
                  'Odottaa kuvaa'
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Fullscreen / Stream Info Modal */}
      {isModalOpen && createPortal(
        <div
          onClick={() => setIsModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.88)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            zIndex: 999999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-accent)',
              borderRadius: 16,
              maxWidth: 1080,
              width: '100%',
              maxHeight: '92vh',
              overflowY: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>📹</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 17, color: 'var(--text-primary)' }}>
                    Pannuhuoneen valvontakamera (192.168.68.57)
                  </h3>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    EYEPLUS ONVIF / TAS-Tech RTSP Server
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* HD / Sub toggle */}
                <button
                  onClick={toggleHd}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 8,
                    border: `1px solid ${isHd ? 'var(--cool-primary)' : 'var(--border)'}`,
                    background: isHd ? 'rgba(34, 211, 238, 0.2)' : 'rgba(255,255,255,0.05)',
                    color: isHd ? 'var(--cool-primary)' : 'var(--text-secondary)',
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {isHd ? '🌟 1080p Full HD' : '⚡ 640x352 Sub stream'}
                </button>

                <button
                  onClick={() => setIsModalOpen(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    fontSize: 20,
                    cursor: 'pointer',
                    padding: '4px 8px',
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Image View */}
            <div style={{ padding: 20, background: '#020408' }}>
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: '16 / 9',
                  borderRadius: 8,
                  overflow: 'hidden',
                  background: '#000',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {imageUrl && (
                  <img
                    src={imageUrl}
                    alt="Valvontakamera HD"
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                )}

                <div
                  style={{
                    position: 'absolute',
                    top: 10,
                    right: 10,
                    background: 'rgba(0,0,0,0.7)',
                    padding: '4px 10px',
                    borderRadius: 6,
                    fontSize: 11,
                    color: '#fff',
                  }}
                >
                  {lastUpdated ? lastUpdated.toLocaleTimeString('fi-FI') : ''}
                </div>
              </div>
            </div>

            {/* RTSP Stream Details & Direct Access Links */}
            <div style={{ padding: '16px 20px', background: 'rgba(255,255,255,0.02)', borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 }}>
                🔗 Suoratoisto-osoitteet (RTSP over UDP)
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* 1080p Main Stream */}
                <div
                  style={{
                    background: 'rgba(0,0,0,0.4)',
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: 'var(--cool-primary)', fontWeight: 600 }}>
                      Päävirta (1080p HD, 1920×1080 @ 15fps):
                    </div>
                    <code style={{ fontSize: 12, color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                      rtsp://admin:123456789@192.168.68.57:554/0/av0
                    </code>
                  </div>
                  <button
                    onClick={() => copyToClipboard('rtsp://admin:123456789@192.168.68.57:554/0/av0', 'main')}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 6,
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                      fontSize: 11,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {copiedStream === 'main' ? '✓ Kopioitu!' : 'Kopioi URL'}
                  </button>
                </div>

                {/* Sub Stream */}
                <div
                  style={{
                    background: 'rgba(0,0,0,0.4)',
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: 'var(--dhw-primary)', fontWeight: 600 }}>
                      Alivirta / Nopea katselu (640×352 @ 15fps):
                    </div>
                    <code style={{ fontSize: 12, color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                      rtsp://admin:123456789@192.168.68.57:554/0/av1
                    </code>
                  </div>
                  <button
                    onClick={() => copyToClipboard('rtsp://admin:123456789@192.168.68.57:554/0/av1', 'sub')}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 6,
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                      fontSize: 11,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {copiedStream === 'sub' ? '✓ Kopioitu!' : 'Kopioi URL'}
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
                💡 <b>Vinkki:</b> Kameran RTSP-palvelin käyttää UDP-protokollaa. VLC:ssä: <i>Asetukset → Tulot / Koodekit → RTSP-protokolla: UDP</i>.
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
