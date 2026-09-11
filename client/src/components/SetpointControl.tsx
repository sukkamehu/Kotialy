import { useEffect, useRef, useState } from 'react';

interface SetpointControlProps {
  label: string;
  /** Current value reported by the heat pump, or null when unknown. */
  value: number | null;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  accentColor?: string;
  hint?: string;
  disabled?: boolean;
  pending?: boolean;
  /** Called once the user settles on a value (slider release / button press). */
  onCommit: (value: number) => void;
  idPrefix?: string;
  /** Render the value with a leading + for positive numbers (offsets). */
  signed?: boolean;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

/**
 * Slider + stepper for a numeric setpoint.
 *
 * While the user is dragging, the slider shows their draft value; the reported
 * value only takes over again once the edit settles. Without that, an incoming
 * MQTT update mid-drag would yank the handle back under the user's finger.
 */
export function SetpointControl({
  label, value, min, max, step = 1, unit = '°C', accentColor = 'var(--heat-primary)',
  hint, disabled = false, pending = false, onCommit, idPrefix = 'setpoint', signed = false,
}: SetpointControlProps) {
  const [draft, setDraft] = useState<number | null>(value);
  const editingRef = useRef(false);

  // Follow the reported value unless the user is mid-edit.
  useEffect(() => {
    if (!editingRef.current) setDraft(value);
  }, [value]);

  const shown = draft ?? value;
  const hasValue = shown !== null;
  // An unknown value still needs a slider position; sit it in the middle.
  const sliderValue = hasValue ? clamp(shown, min, max) : Math.round((min + max) / 2);
  const pct = ((sliderValue - min) / (max - min)) * 100;

  function commit(next: number) {
    const clamped = clamp(Math.round(next / step) * step, min, max);
    editingRef.current = false;
    setDraft(clamped);
    onCommit(clamped);
  }

  function nudge(delta: number) {
    commit(sliderValue + delta);
  }

  const formatted = hasValue
    ? `${signed && sliderValue > 0 ? '+' : ''}${Number.isInteger(sliderValue) ? sliderValue : sliderValue.toFixed(1)}`
    : `${sliderValue}`;

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          {pending && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>lähetetään…</span>}
          <span style={{ fontSize: 20, fontWeight: 700, color: accentColor, fontVariantNumeric: 'tabular-nums' }}>
            {formatted}
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 2 }}>{unit}</span>
          </span>
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => nudge(-step)}
          disabled={disabled || sliderValue <= min}
          id={`${idPrefix}-minus`}
          aria-label={`${label} down`}
        >
          −
        </button>

        <input
          type="range"
          className="setpoint-slider"
          min={min}
          max={max}
          step={step}
          value={sliderValue}
          disabled={disabled}
          id={`${idPrefix}-slider`}
          aria-label={label}
          style={{
            // Paint the filled portion up to the handle.
            background: `linear-gradient(90deg, ${accentColor} ${pct}%, rgba(255,255,255,0.08) ${pct}%)`,
          }}
          onChange={(e) => {
            editingRef.current = true;
            setDraft(Number(e.target.value));
          }}
          onPointerUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
          onKeyUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
          onBlur={() => { editingRef.current = false; }}
        />

        <button
          className="btn btn-sm btn-ghost"
          onClick={() => nudge(step)}
          disabled={disabled || sliderValue >= max}
          id={`${idPrefix}-plus`}
          aria-label={`${label} up`}
        >
          +
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          {signed && min > 0 ? '+' : ''}{min}{unit}
        </span>
        {hint && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{hint}</span>}
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          {signed && max > 0 ? '+' : ''}{max}{unit}
        </span>
      </div>
    </div>
  );
}
