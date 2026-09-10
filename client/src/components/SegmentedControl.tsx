interface Option {
  value: number;
  label: string;
}

interface SegmentedControlProps {
  label: string;
  options: Option[];
  /** Currently reported value, or null when unknown. */
  value: number | null;
  onSelect: (value: number) => void;
  pending?: boolean;
  disabled?: boolean;
  idPrefix: string;
  hint?: string;
}

/**
 * Labelled row of mutually exclusive options (quiet level, operating mode, …).
 *
 * The active segment reflects what the heat pump reports, not what was last
 * clicked — so a command that never lands does not leave the UI lying.
 */
export function SegmentedControl({
  label, options, value, onSelect, pending = false, disabled = false, idPrefix, hint,
}: SegmentedControlProps) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>{label}</span>
        {pending && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>sending…</span>}
      </div>
      <div className="toggle-group">
        {options.map((opt) => (
          <button
            key={opt.value}
            className={`toggle-btn ${value === opt.value ? 'active' : ''}`}
            onClick={() => onSelect(opt.value)}
            disabled={disabled || pending}
            id={`${idPrefix}-${opt.value}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {hint && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>{hint}</div>
      )}
    </div>
  );
}

interface ToggleRowProps {
  label: string;
  description?: string;
  on: boolean;
  onToggle: () => void;
  pending?: boolean;
  idPrefix: string;
  onLabel?: string;
  offLabel?: string;
  danger?: boolean;
}

/** Label + description on the left, an on/off button on the right. */
export function ToggleRow({
  label, description, on, onToggle, pending = false, idPrefix,
  onLabel = '● On', offLabel = '○ Off', danger = false,
}: ToggleRowProps) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12,
    }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>{label}</div>
        {description && (
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{description}</div>
        )}
      </div>
      <button
        className={`btn btn-sm ${on ? (danger ? 'btn-danger' : 'btn-primary') : 'btn-ghost'}`}
        onClick={onToggle}
        disabled={pending}
        id={idPrefix}
        style={{ flexShrink: 0 }}
      >
        {pending ? '…' : on ? onLabel : offLabel}
      </button>
    </div>
  );
}
