import type { HeishamonState } from '../types/heishamon';
import { numVal } from '../types/heishamon';

interface PowerCardProps {
  state: HeishamonState;
}

function PowerGauge({ label, produced, consumed, color }: {
  label: string; produced: number | null; consumed: number | null; color: string;
}) {
  const cop = consumed && consumed > 0 && produced ? produced / consumed : null;
  const maxPower = 9000; // 9kW max
  const prodPct = produced ? Math.min((produced / maxPower) * 100, 100) : 0;
  const consPct = consumed ? Math.min((consumed / maxPower) * 100, 100) : 0;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
        {cop !== null && (
          <span style={{ fontSize: 12, fontWeight: 700, color }}>
            COP {cop.toFixed(2)}
          </span>
        )}
      </div>
      {/* Produced */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 20, textAlign: 'right' }}>↑</span>
        <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 100, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${prodPct}%`,
            background: color,
            borderRadius: 100,
            transition: 'width 1s ease',
            boxShadow: `0 0 8px ${color}50`,
          }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color, width: 52, textAlign: 'right' }}>
          {produced !== null ? `${(produced / 1000).toFixed(2)}kW` : '—'}
        </span>
      </div>
      {/* Consumed */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 20, textAlign: 'right' }}>↓</span>
        <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 100, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${consPct}%`,
            background: 'rgba(255,255,255,0.3)',
            borderRadius: 100,
            transition: 'width 1s ease',
          }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', width: 52, textAlign: 'right' }}>
          {consumed !== null ? `${(consumed / 1000).toFixed(2)}kW` : '—'}
        </span>
      </div>
    </div>
  );
}

export function PowerCard({ state }: PowerCardProps) {
  // Prefer XTOP values (M-series extra data block), fallback to main topics
  const heatProdXT = numVal(state, 'extra/Heat_Power_Production');
  const heatConsXT = numVal(state, 'extra/Heat_Power_Consumption');
  const coolProdXT = numVal(state, 'extra/Cool_Power_Production');
  const coolConsXT = numVal(state, 'extra/Cool_Power_Consumption');
  const dhwProdXT  = numVal(state, 'extra/DHW_Power_Production');
  const dhwConsXT  = numVal(state, 'extra/DHW_Power_Consumption');

  const heatProd = heatProdXT ?? numVal(state, 'main/Heat_Power_Production');
  const heatCons = heatConsXT ?? numVal(state, 'main/Heat_Power_Consumption');
  const coolProd = coolProdXT ?? numVal(state, 'main/Cool_Power_Production');
  const coolCons = coolConsXT ?? numVal(state, 'main/Cool_Power_Consumption');
  const dhwProd  = dhwProdXT  ?? numVal(state, 'main/DHW_Power_Production');
  const dhwCons  = dhwConsXT  ?? numVal(state, 'main/DHW_Power_Consumption');

  const current = numVal(state, 'main/Compressor_Current');

  // Total active power
  const totalProd = (heatProd ?? 0) + (coolProd ?? 0) + (dhwProd ?? 0);
  const totalCons = (heatCons ?? 0) + (coolCons ?? 0) + (dhwCons ?? 0);
  const usingXtop = heatProdXT !== null || heatConsXT !== null;

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-icon">⚡</span>
        <span className="card-title">Power & Energy</span>
        {usingXtop && (
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--dhw-primary)', fontWeight: 600 }}>
            XTOP
          </span>
        )}
      </div>
      <div className="card-body">
        {/* Total */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <div className="metric">
            <span className="metric-label">Total Production</span>
            <span className="metric-value" style={{ color: 'var(--heat-primary)', fontSize: 28 }}>
              {totalProd > 0 ? `${(totalProd / 1000).toFixed(2)}` : '—'}
              <span className="metric-unit" style={{ fontSize: 14 }}>kW</span>
            </span>
          </div>
          <div className="metric" style={{ textAlign: 'right' }}>
            <span className="metric-label">Consumption</span>
            <span className="metric-value" style={{ fontSize: 28 }}>
              {totalCons > 0 ? `${(totalCons / 1000).toFixed(2)}` : '—'}
              <span className="metric-unit" style={{ fontSize: 14 }}>kW</span>
            </span>
          </div>
        </div>

        <div className="divider" />
        <div style={{ marginTop: 16 }}>
          <PowerGauge label="Heating" produced={heatProd} consumed={heatCons} color="var(--heat-primary)" />
          <PowerGauge label="Cooling" produced={coolProd} consumed={coolCons} color="var(--cool-primary)" />
          <PowerGauge label="DHW" produced={dhwProd} consumed={dhwCons} color="var(--dhw-primary)" />
        </div>

        {current !== null && (
          <>
            <div className="divider" />
            <div className="metric metric-sm" style={{ marginTop: 12 }}>
              <span className="metric-label">Compressor Current</span>
              <span className="metric-value">
                {current.toFixed(1)}
                <span className="metric-unit">A</span>
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
