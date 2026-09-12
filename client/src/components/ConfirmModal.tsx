import { useEffect } from 'react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Peruuta',
  danger = false,
  pending = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        padding: 16,
        animation: 'fadeIn 0.15s ease-out',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: 440,
          width: '100%',
          boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
          borderColor: danger ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.15)',
        }}
      >
        <div className="card-header" style={{ borderBottom: '1px solid var(--border)' }}>
          <span className="card-icon">{danger ? '⚠️' : '⚡'}</span>
          <span className="card-title" style={{ color: danger ? '#f87171' : 'var(--text-primary)' }}>
            {title}
          </span>
        </div>

        <div className="card-body">
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 20 }}>
            {message}
          </p>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onCancel}
              disabled={pending}
              style={{ fontSize: 13 }}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              className={`btn ${danger ? 'btn-ghost' : 'btn-primary'}`}
              onClick={onConfirm}
              disabled={pending}
              style={{
                fontSize: 13,
                fontWeight: 600,
                ...(danger
                  ? {
                      background: 'rgba(239, 68, 68, 0.2)',
                      color: '#ef4444',
                      borderColor: 'rgba(239, 68, 68, 0.4)',
                    }
                  : {}),
              }}
            >
              {pending ? 'Suoritetaan…' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
