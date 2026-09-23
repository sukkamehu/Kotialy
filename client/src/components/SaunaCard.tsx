import { useState, useEffect } from 'react';
import { useTuya } from '../hooks/useTuya';
import { ConfirmModal } from './ConfirmModal';

interface SaunaCardProps {
  readOnly?: boolean;
}

export function SaunaCard({ readOnly = false }: SaunaCardProps) {
  const { sauna, setSaunaPower, actionLoading, error } = useTuya();
  const [selectedDuration, setSelectedDuration] = useState<number>(180);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [now, setNow] = useState<number>(Date.now());

  // Realtime countdown ticker every second
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const isOn = Boolean(sauna?.isOn);

  // Calculate live countdown
  let remainingMs = 0;
  let remainingText = '';
  let progressPercent = 0;
  let shutdownTimeString = '';

  if (isOn && sauna?.autoOffAt) {
    remainingMs = Math.max(0, sauna.autoOffAt - now);
    const totalDurationMs = (sauna.durationMinutes || 180) * 60 * 1000;
    progressPercent = Math.max(0, Math.min(100, (remainingMs / totalDurationMs) * 100));

    const totalSeconds = Math.ceil(remainingMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      remainingText = `${hours}h ${minutes}min ${seconds}s`;
    } else if (minutes > 0) {
      remainingText = `${minutes}min ${seconds}s`;
    } else {
      remainingText = `${seconds}s`;
    }

    shutdownTimeString = new Date(sauna.autoOffAt).toLocaleTimeString('fi-FI', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  const handleToggleClick = () => {
    if (readOnly || actionLoading) return;
    if (!isOn) {
      setShowConfirmModal(true);
    } else {
      setSaunaPower(false);
    }
  };

  const confirmTurnOn = async () => {
    setShowConfirmModal(false);
    await setSaunaPower(true, selectedDuration);
  };

  return (
    <div
      className="card"
      style={{
        background: isOn
          ? 'linear-gradient(135deg, rgba(30, 18, 12, 0.95) 0%, rgba(45, 20, 10, 0.92) 100%)'
          : 'var(--card-bg, rgba(15, 23, 42, 0.75))',
        borderColor: isOn ? 'rgba(245, 158, 11, 0.5)' : 'var(--border)',
        boxShadow: isOn
          ? '0 0 35px rgba(245, 158, 11, 0.25), 0 8px 32px rgba(0, 0, 0, 0.6)'
          : 'var(--card-shadow, 0 4px 20px rgba(0, 0, 0, 0.3))',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background Heat Shimmer Accent when ON */}
      {isOn && (
        <div
          style={{
            position: 'absolute',
            top: -50,
            right: -50,
            width: 150,
            height: 150,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(239, 68, 68, 0.35) 0%, rgba(245, 158, 11, 0) 70%)',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Header */}
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 24 }}>🧖‍♂️</span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="card-title" style={{ fontSize: 17, fontWeight: 700 }}>Sauna</span>
              {isOn ? (
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 12,
                  background: 'rgba(239, 68, 68, 0.2)',
                  color: '#f87171',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 6px #ef4444' }} />
                  LÄMPIÄÄ
                </span>
              ) : (
                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: 12,
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: 'var(--text-muted)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                }}>
                  Pois päältä
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              WiFi-ohjattu 3-vaiherele (SmartLife / Tuya)
            </div>
          </div>
        </div>

        {/* Safety Badge */}
        <div
          title="Saunassa on pakotettu 3 tunnin maksimiaika. Kiuas ei voi koskaan jäädä päälle yli 3 tunniksi."
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            borderRadius: 8,
            background: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            fontSize: 11,
            color: '#34d399',
            fontWeight: 600,
          }}
        >
          <span>🛡️</span>
          <span>Max 3h varotoimi</span>
        </div>
      </div>

      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && (
          <div style={{
            padding: '8px 12px',
            borderRadius: 8,
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#f87171',
            fontSize: 12,
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Temperature & Humidity Display */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 10,
          background: isOn ? 'rgba(0, 0, 0, 0.35)' : 'rgba(255, 255, 255, 0.02)',
          padding: '12px 16px',
          borderRadius: 12,
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>🌡️</span> Saunan lämpötila
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: isOn ? '#fb923c' : 'var(--text-primary)', marginTop: 2 }}>
              {sauna?.temperature != null ? `${sauna.temperature} °C` : '-- °C'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>💧</span> Ilmankosteus
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#38bdf8', marginTop: 2 }}>
              {sauna?.humidity != null ? `${sauna.humidity} %` : '-- %'}
            </div>
          </div>
        </div>

        {/* Active Countdown & Auto-Off Section */}
        {isOn && (
          <div style={{
            background: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: 12,
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>⏱️</span> Aikaa jäljellä:
              </span>
              <strong style={{ fontSize: 16, color: '#fbbf24', fontFamily: 'monospace' }}>
                {remainingText || 'Päättymässä...'}
              </strong>
            </div>

            {/* Progress bar */}
            <div style={{
              width: '100%',
              height: 6,
              background: 'rgba(0, 0, 0, 0.4)',
              borderRadius: 3,
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${progressPercent}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #f59e0b, #ef4444)',
                transition: 'width 1s linear',
              }} />
            </div>

            <div style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
              <span>Automaattinen turvakatkaisu:</span>
              <strong>klo {shutdownTimeString || '--:--'}</strong>
            </div>
          </div>
        )}

        {/* Duration selector (only when OFF) */}
        {!isOn && !readOnly && (
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 600 }}>
              Valitse lämmitysaika (max 3h):
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              {[
                { min: 60, label: '1 h' },
                { min: 90, label: '1.5 h' },
                { min: 120, label: '2 h' },
                { min: 180, label: '3 h (Max)' },
              ].map(({ min, label }) => (
                <button
                  key={min}
                  type="button"
                  onClick={() => setSelectedDuration(min)}
                  style={{
                    padding: '8px 6px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: selectedDuration === min ? 700 : 500,
                    border: selectedDuration === min ? '1px solid #f59e0b' : '1px solid rgba(255, 255, 255, 0.1)',
                    background: selectedDuration === min ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                    color: selectedDuration === min ? '#fbbf24' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Main Big Toggle Button */}
        {!readOnly && (
          <button
            type="button"
            onClick={handleToggleClick}
            disabled={actionLoading}
            style={{
              width: '100%',
              padding: '14px 20px',
              borderRadius: 12,
              border: isOn ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid rgba(245, 158, 11, 0.5)',
              background: isOn
                ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              color: '#fff',
              fontSize: 16,
              fontWeight: 700,
              cursor: actionLoading ? 'wait' : 'pointer',
              boxShadow: isOn
                ? '0 4px 20px rgba(239, 68, 68, 0.4)'
                : '0 4px 20px rgba(245, 158, 11, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              transition: 'all 0.2s ease',
            }}
          >
            {actionLoading ? (
              <span>⏳ Käsitellään ohjauspyyntöä...</span>
            ) : isOn ? (
              <>
                <span>⏹️</span>
                <span>SAMMUTA KIUAS NYT</span>
              </>
            ) : (
              <>
                <span>🔥</span>
                <span>KYTKE SAUNA PÄÄLLE ({selectedDuration / 60} h)</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={showConfirmModal}
        title="Kytketäänkö kiuas päälle?"
        message={`Olet kytkemässä saunan päälle ${selectedDuration / 60} tunniksi (${selectedDuration} min). Kiuas sammuu automaattisesti viimeistään klo ${new Date(Date.now() + selectedDuration * 60000).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })}.`}
        confirmLabel={`Kyllä, kytke päälle (${selectedDuration / 60} h)`}
        cancelLabel="Peruuta"
        danger={false}
        pending={actionLoading}
        onConfirm={confirmTurnOn}
        onCancel={() => setShowConfirmModal(false)}
      />
    </div>
  );
}
