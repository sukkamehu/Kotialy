import React from 'react';
import { useApc } from '../hooks/useApc';

interface ApcDecisionLogCardProps {
  maxEntries?: number;
  onOpenApc?: () => void;
}

export const ApcDecisionLogCard: React.FC<ApcDecisionLogCardProps> = ({
  maxEntries = 15,
  onOpenApc,
}) => {
  const { logs, status } = useApc();

  return (
    <div
      className="card"
      style={{
        background: 'linear-gradient(165deg, rgba(19, 29, 51, 0.95) 0%, rgba(10, 15, 29, 0.98) 100%)',
        border: '1px solid rgba(16, 185, 129, 0.25)',
        borderRadius: 18,
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>⚡</span>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
              APC Päätösloki & Reaaliaikaiset toimenpiteet
            </h3>
            <p style={{ margin: '3px 0 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              Miksi Kotiäly on tehnyt minkäkin ohjauspäätöksen (Spot-hinta, varaajan tila, sääennuste ja akkujärjestelmä)
            </p>
          </div>
        </div>

        {onOpenApc && (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={onOpenApc}
            style={{
              fontSize: 12,
              borderRadius: 8,
              border: '1px solid rgba(16, 185, 129, 0.35)',
              background: 'rgba(16, 185, 129, 0.12)',
              color: '#4ade80',
              fontWeight: 600,
              padding: '5px 12px',
              cursor: 'pointer',
            }}
          >
            Avaa APC-Asetukset ▶
          </button>
        )}
      </div>

      <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <th style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontWeight: 600, width: 130 }}>Aika</th>
              <th style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontWeight: 600, width: 120 }}>Direktiivi</th>
              <th style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontWeight: 600 }}>Perustelu & Syy</th>
              <th style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontWeight: 600, width: 105 }}>Pörssihinta</th>
              <th style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontWeight: 600, width: 95 }}>Ulkoilma</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Ei vielä lokitapahtumia. Loki päivittyy automaattisesti ohjaustoimenpiteiden myötä.
                </td>
              </tr>
            ) : (
              logs.slice(0, maxEntries).map((log, idx) => (
                <tr
                  key={log.id || idx}
                  style={{
                    borderBottom: idx < maxEntries - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                    background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                  }}
                >
                  <td style={{ padding: '9px 14px', color: 'var(--text-muted)', fontSize: 11.5 }}>
                    {new Date(log.timestamp).toLocaleString('fi-FI', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td style={{ padding: '9px 14px' }}>
                    <span
                      style={{
                        padding: '2px 7px',
                        borderRadius: 6,
                        fontSize: 10.5,
                        fontWeight: 700,
                        background:
                          log.directive === 'BOOST'
                            ? 'rgba(245, 158, 11, 0.2)'
                            : log.directive === 'SETBACK'
                            ? 'rgba(56, 189, 248, 0.2)'
                            : log.directive === 'DHW_CYCLE'
                            ? 'rgba(16, 185, 129, 0.2)'
                            : 'rgba(255,255,255,0.08)',
                        color:
                          log.directive === 'BOOST'
                            ? '#f59e0b'
                            : log.directive === 'SETBACK'
                            ? '#38bdf8'
                            : log.directive === 'DHW_CYCLE'
                            ? '#10b981'
                            : 'var(--text-secondary)',
                      }}
                    >
                      {log.directive}
                    </span>
                  </td>
                  <td style={{ padding: '9px 14px', color: 'var(--text-primary)' }}>
                    {log.reason || log.action}
                  </td>
                  <td style={{ padding: '9px 14px', color: '#facc15', fontWeight: 600, fontSize: 11.5 }}>
                    {log.price_cents != null ? `${log.price_cents.toFixed(2)} snt` : '—'}
                  </td>
                  <td style={{ padding: '9px 14px', color: '#38bdf8', fontSize: 11.5 }}>
                    {log.outdoor_temp != null ? `${log.outdoor_temp.toFixed(1)} °C` : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
