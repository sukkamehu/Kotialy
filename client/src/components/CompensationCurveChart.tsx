import { useId } from 'react';
import type { HeishamonState } from '../types/heishamon';
import { numVal } from '../types/heishamon';

interface CompensationCurveChartProps {
  state?: HeishamonState | null;
  compact?: boolean;
}

export function CompensationCurveChart({ state, compact = false }: CompensationCurveChartProps) {
  const gradId = useId();

  const outsideTemp = state ? numVal(state, 'main/Outside_Temp') : null;
  const mainTarget = state ? numVal(state, 'main/Main_Target_Temp') : null;
  const z1Shift = state ? numVal(state, 'main/Z1_Heat_Request_Temp') : null;
  const curveTargetHigh = (state ? numVal(state, 'main/Z1_Heat_Curve_Target_High_Temp') : null) ?? 38;
  const curveTargetLow = (state ? numVal(state, 'main/Z1_Heat_Curve_Target_Low_Temp') : null) ?? 27;
  const curveOutLow = (state ? numVal(state, 'main/Z1_Heat_Curve_Outside_Low_Temp') : null) ?? -20;
  const curveOutHigh = (state ? numVal(state, 'main/Z1_Heat_Curve_Outside_High_Temp') : null) ?? 15;
  const outSpan = Math.max(1, curveOutHigh - curveOutLow);

  const calcBaseCurve = (tOut: number) => {
    const clamped = Math.max(curveOutLow, Math.min(curveOutHigh, tOut));
    const target = curveTargetLow + ((curveOutHigh - clamped) * (curveTargetHigh - curveTargetLow)) / outSpan;
    return Math.round(target * 10) / 10;
  };

  const currentCalculatedBase = outsideTemp != null ? calcBaseCurve(outsideTemp) : null;

  // Map water temp [22..44 °C] -> y [110..20] (approx 4.09 px/°C, or keep 20 + (40 - T) * 5 clamped)
  const tempToY = (t: number) => Math.max(14, Math.min(115, 20 + (40 - t) * 5));
  const outToX = (tOut: number) => {
    const clamped = Math.max(curveOutLow, Math.min(curveOutHigh, tOut));
    return 60 + ((clamped - curveOutLow) / outSpan) * 490;
  };

  const yHigh = tempToY(curveTargetHigh);
  const yLow = tempToY(curveTargetLow);

  const effectiveTarget = mainTarget != null
    ? mainTarget
    : (currentCalculatedBase != null && z1Shift != null ? currentCalculatedBase + z1Shift : currentCalculatedBase);

  return (
    <div style={{
      background: 'rgba(0, 0, 0, 0.35)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: 12,
      padding: compact ? '12px 14px' : '18px 20px',
      marginTop: compact ? 12 : 0,
      marginBottom: compact ? 14 : 24,
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: compact ? 6 : 10,
        marginBottom: compact ? 8 : 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: compact ? 15 : 20 }}>📈</span>
          <span style={{ fontSize: compact ? 12 : 14, fontWeight: 700, color: 'var(--text-primary)' }}>
            Lattialämmityksen Kompensaatiokäyrä & Nykyinen Toimintapiste
          </span>
        </div>

        {outsideTemp != null && (
          <div style={{
            fontSize: compact ? 11 : 12,
            color: 'var(--text-secondary)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: compact ? 10 : 16,
          }}>
            <span>Ulko: <strong style={{ color: '#60a5fa' }}>{outsideTemp.toFixed(1)} °C</strong></span>
            <span>Perus: <strong style={{ color: '#34d399' }}>{currentCalculatedBase != null ? `${currentCalculatedBase.toFixed(1)} °C` : '—'}</strong></span>
            {z1Shift != null && z1Shift !== 0 && (
              <span>Siirto: <strong style={{ color: '#c084fc' }}>{z1Shift > 0 ? `+${z1Shift}` : z1Shift} °C</strong></span>
            )}
            {effectiveTarget != null && (
              <span>Pyynti: <strong style={{ color: '#22d3ee' }}>{effectiveTarget.toFixed(0)} °C</strong></span>
            )}
          </div>
        )}
      </div>

      {/* SVG Curve Plot */}
      <div style={{ width: '100%', height: compact ? 130 : 160, position: 'relative' }}>
        <svg viewBox="0 0 600 150" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>
          </defs>

          {/* Grid Lines */}
          <line x1="50" y1="20" x2="560" y2="20" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
          <line x1="50" y1="65" x2="560" y2="65" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
          <line x1="50" y1="110" x2="560" y2="110" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />

          {/* Y Axis Labels */}
          <text x="44" y="24" fill="var(--text-muted)" fontSize="10" textAnchor="end">40 °C</text>
          <text x="44" y="69" fill="var(--text-muted)" fontSize="10" textAnchor="end">31 °C</text>
          <text x="44" y="114" fill="var(--text-muted)" fontSize="10" textAnchor="end">22 °C</text>

          {/* X Axis */}
          <line x1="60" y1="120" x2="550" y2="120" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
          <text x="60" y="136" fill="var(--text-muted)" fontSize="10" textAnchor="middle">{curveOutLow} °C</text>
          <text x="200" y="136" fill="var(--text-muted)" fontSize="10" textAnchor="middle">-10 °C</text>
          <text x="340" y="136" fill="var(--text-muted)" fontSize="10" textAnchor="middle">0 °C</text>
          <text x="480" y="136" fill="var(--text-muted)" fontSize="10" textAnchor="middle">+10 °C</text>
          <text x="550" y="136" fill="var(--text-muted)" fontSize="10" textAnchor="middle">+{curveOutHigh} °C</text>

          {/* The Panasonic Compensation Curve Line */}
          <line
            x1="60"
            y1={yHigh}
            x2="550"
            y2={yLow}
            stroke={`url(#${gradId})`}
            strokeWidth="3.5"
            strokeLinecap="round"
          />

          {/* Cold Endpoint Marker */}
          <circle cx="60" cy={yHigh} r="5" fill="#3b82f6" stroke="#fff" strokeWidth="1.5" />
          <text x="60" y={Math.max(12, yHigh - 12)} fill="#60a5fa" fontSize="11" fontWeight="700" textAnchor="middle">
            {curveTargetHigh} °C @ {curveOutLow} °C
          </text>

          {/* Mild Endpoint Marker */}
          <circle cx="550" cy={yLow} r="5" fill="#10b981" stroke="#fff" strokeWidth="1.5" />
          <text x="550" y={Math.max(12, yLow - 10)} fill="#34d399" fontSize="11" fontWeight="700" textAnchor="middle">
            {curveTargetLow} °C @ +{curveOutHigh} °C
          </text>

          {/* Current Outdoor Operating Point */}
          {outsideTemp != null && currentCalculatedBase != null && (() => {
            const currentX = outToX(outsideTemp);
            const currentY = tempToY(currentCalculatedBase);
            const targetY = effectiveTarget != null ? tempToY(effectiveTarget) : currentY;
            const tooltipX = Math.max(65, Math.min(460, currentX - 60));
            const tooltipY = Math.max(8, targetY - 34);

            return (
              <g>
                {/* Vertical line from axis to curve point */}
                <line
                  x1={currentX}
                  y1="120"
                  x2={currentX}
                  y2={currentY}
                  stroke="#f59e0b"
                  strokeDasharray="2 2"
                  strokeWidth="1.5"
                />

                {/* Shift delta line if active */}
                {z1Shift != null && z1Shift !== 0 && (
                  <line
                    x1={currentX}
                    y1={currentY}
                    x2={currentX}
                    y2={targetY}
                    stroke="#a855f7"
                    strokeWidth="2.5"
                  />
                )}

                {/* Base curve dot when shifted */}
                {z1Shift != null && z1Shift !== 0 && (
                  <circle cx={currentX} cy={currentY} r="3.5" fill="#34d399" stroke="#fff" strokeWidth="1" />
                )}

                {/* Operating Point Circle */}
                <circle cx={currentX} cy={targetY} r="7" fill="#f59e0b" stroke="#fff" strokeWidth="2">
                  <animate attributeName="r" values="6;8;6" dur="2s" repeatCount="indefinite" />
                </circle>

                {/* Tooltip text above point */}
                <rect
                  x={tooltipX}
                  y={tooltipY}
                  width="120"
                  height="24"
                  rx="6"
                  fill="rgba(0,0,0,0.88)"
                  stroke="#f59e0b"
                  strokeWidth="1"
                />
                <text
                  x={tooltipX + 60}
                  y={tooltipY + 16}
                  fill="#fcd34d"
                  fontSize="11"
                  fontWeight="700"
                  textAnchor="middle"
                >
                  Nyt: {outsideTemp.toFixed(1)} °C → {effectiveTarget != null ? effectiveTarget.toFixed(0) : currentCalculatedBase.toFixed(0)} °C
                </text>
              </g>
            );
          })()}
        </svg>
      </div>
    </div>
  );
}
