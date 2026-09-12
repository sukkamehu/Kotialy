import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import type { CostSummary, DailyCost } from '../types/costs';

export function DailyCostsCard() {
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [dailyCosts, setDailyCosts] = useState<DailyCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [rangeDays, setRangeDays] = useState<number>(7);

  // Settings form state
  const [margin, setMargin] = useState<string>('0.50');
  const [transfer, setTransfer] = useState<string>('4.50');
  const [vat, setVat] = useState<string>('25.5');
  const [savingSettings, setSavingSettings] = useState(false);

  const fetchData = async () => {
    try {
      const [sumRes, dailyRes] = await Promise.all([
        apiFetch('/api/costs/summary'),
        apiFetch(`/api/costs/daily?days=${rangeDays}`),
      ]);

      const sumData: CostSummary = await sumRes.json();
      const dailyData = await dailyRes.json();

      setSummary(sumData);
      setDailyCosts(dailyData.costs || []);

      if (sumData.settings) {
        setMargin(String(sumData.settings.margin_cents_kwh ?? '0.50'));
        setTransfer(String(sumData.settings.transfer_cents_kwh ?? '4.50'));
        setVat(String(sumData.settings.vat_percent ?? '25.5'));
      }
    } catch (err) {
      console.error('Failed to fetch cost data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, [rangeDays]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const res = await apiFetch('/api/costs/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          margin_cents_kwh: parseFloat(margin),
          transfer_cents_kwh: parseFloat(transfer),
          vat_percent: parseFloat(vat),
        }),
      });
      if (res.ok) {
        setShowSettings(false);
        fetchData();
      }
    } catch (err) {
      console.error('Failed to save cost settings', err);
    } finally {
      setSavingSettings(false);
    }
  };

  const today = summary?.today;
  const yesterday = summary?.yesterday;
  const month = summary?.month;

  // Max daily cost for scaling the mini-bar visualization
  const maxCost = Math.max(...dailyCosts.map((d) => d.total_cost_eur), 1);

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-icon">💶</span>
        <span className="card-title">Päivittäiset Energiakustannukset & Säästöt</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {month && month.savings_eur > 0 && (
            <div className="badge badge-heat" style={{ fontSize: 12, fontWeight: 700, background: 'rgba(52, 211, 153, 0.15)', color: '#34d399', border: '1px solid rgba(52, 211, 153, 0.3)' }}>
              Säästö tässä kuussa: ~{month.savings_eur.toFixed(1)} €
            </div>
          )}
          <button
            type="button"
            className="btn btn-icon"
            title="Hintaparametrit"
            onClick={() => setShowSettings(!showSettings)}
            style={{
              padding: '4px 8px',
              fontSize: 13,
              borderRadius: 6,
              background: showSettings ? 'var(--heat-primary)' : 'rgba(255,255,255,0.06)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
            }}
          >
            ⚙️ Asetukset
          </button>
        </div>
      </div>

      <div className="card-body">
        {/* Collapsible settings editor */}
        {showSettings && (
          <form
            onSubmit={handleSaveSettings}
            style={{
              marginBottom: 18,
              padding: 14,
              borderRadius: 10,
              background: 'rgba(0,0,0,0.25)',
              border: '1px solid var(--border)',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Siirtohinta + vero (snt/kWh)</label>
              <input
                type="number"
                step="0.01"
                value={transfer}
                onChange={(e) => setTransfer(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  width: 130,
                  fontSize: 13,
                }}
                required
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Marginaali (snt/kWh)</label>
              <input
                type="number"
                step="0.01"
                value={margin}
                onChange={(e) => setMargin(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  width: 110,
                  fontSize: 13,
                }}
                required
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>ALV (%)</label>
              <input
                type="number"
                step="0.1"
                value={vat}
                onChange={(e) => setVat(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  width: 90,
                  fontSize: 13,
                }}
                required
              />
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 18 }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={savingSettings}
                style={{
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                {savingSettings ? 'Tallennetaan...' : 'Tallenna ja laske'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setShowSettings(false)}
                style={{
                  padding: '6px 12px',
                  fontSize: 12,
                  borderRadius: 6,
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                Peruuta
              </button>
            </div>
          </form>
        )}

        {/* Top KPI Box Grid */}
        <div className="metrics-grid metrics-grid-3" style={{ marginBottom: 18 }}>
          {/* Today */}
          <div className="metric-box">
            <span className="metric-label">Tänään ({today?.date || 'Tänään'})</span>
            <span className="metric-value" style={{ color: 'var(--heat-primary)', fontSize: 22 }}>
              {today ? `${today.total_cost_eur.toFixed(2)} €` : '—'}
            </span>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Kulutus: <strong style={{ color: 'var(--text-primary)' }}>{today?.total_consumption_kwh.toFixed(1) ?? 0} kWh</strong>
              {today?.avg_price_cents_kwh != null && (
                <> • Keskihinta: <strong style={{ color: 'var(--text-primary)' }}>{today.avg_price_cents_kwh.toFixed(1)} snt/kWh</strong></>
              )}
            </div>
          </div>

          {/* Yesterday */}
          <div className="metric-box">
            <span className="metric-label">Eilen</span>
            <span className="metric-value" style={{ fontSize: 22 }}>
              {yesterday ? `${yesterday.total_cost_eur.toFixed(2)} €` : '—'}
            </span>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Kulutus: <strong style={{ color: 'var(--text-primary)' }}>{yesterday?.total_consumption_kwh.toFixed(1) ?? 0} kWh</strong>
              {yesterday?.cop != null && (
                <> • COP: <strong style={{ color: 'var(--online)' }}>{yesterday.cop}</strong></>
              )}
            </div>
          </div>

          {/* Current Month */}
          <div className="metric-box">
            <span className="metric-label">Kuluva kuukausi ({month?.month || ''})</span>
            <span className="metric-value" style={{ color: 'var(--text-primary)', fontSize: 22 }}>
              {month ? `${month.total_cost_eur.toFixed(2)} €` : '—'}
            </span>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Yhteensä: <strong style={{ color: 'var(--text-primary)' }}>{month?.total_consumption_kwh.toFixed(0) ?? 0} kWh</strong>
              {month?.savings_eur ? (
                <> • Säästö: <strong style={{ color: '#34d399' }}>~{month.savings_eur.toFixed(0)} €</strong></>
              ) : null}
            </div>
          </div>
        </div>

        {/* Daily History Table & Visualizer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Päiväkohtainen toteuma
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setRangeDays(d)}
                style={{
                  fontSize: 11,
                  fontWeight: rangeDays === d ? 700 : 500,
                  padding: '3px 8px',
                  borderRadius: 4,
                  background: rangeDays === d ? 'var(--heat-primary)' : 'rgba(255,255,255,0.05)',
                  color: rangeDays === d ? '#fff' : 'var(--text-muted)',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {d} pv
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 13 }}>
            Ladataan kustannustietoja...
          </div>
        ) : dailyCosts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 13 }}>
            Ei vielä tallennettuja päiväkustannuksia. Kustannukset lasketaan automaattisesti taustalla.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 11 }}>
                  <th style={{ padding: '8px 6px' }}>Päivä</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>Kulutus (kWh)</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>Tuotto (kWh)</th>
                  <th style={{ padding: '8px 6px', textAlign: 'center' }}>COP</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>Keskihinta</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>Kustannus (€)</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>Säästö (€)</th>
                  <th style={{ padding: '8px 6px', width: '22%' }}>Osuus</th>
                </tr>
              </thead>
              <tbody>
                {dailyCosts.map((day) => {
                  const barWidth = Math.max(4, Math.min(100, Math.round((day.total_cost_eur / maxCost) * 100)));
                  return (
                    <tr
                      key={day.date}
                      style={{
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        transition: 'background 0.2s',
                      }}
                    >
                      <td style={{ padding: '8px 6px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {day.date}
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', color: 'var(--text-primary)' }}>
                        {day.total_consumption_kwh.toFixed(1)}
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', color: 'var(--text-muted)' }}>
                        {day.total_production_kwh > 0 ? day.total_production_kwh.toFixed(1) : '—'}
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                        {day.cop ? (
                          <span style={{ color: day.cop >= 3.0 ? 'var(--online)' : 'var(--text-primary)', fontWeight: 600 }}>
                            {day.cop}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', color: 'var(--text-muted)' }}>
                        {day.avg_price_cents_kwh != null ? `${day.avg_price_cents_kwh.toFixed(1)} snt` : '—'}
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700, color: 'var(--heat-primary)' }}>
                        {day.total_cost_eur.toFixed(2)} €
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', color: '#34d399', fontWeight: 600 }}>
                        {day.savings_eur > 0 ? `+${day.savings_eur.toFixed(2)} €` : '—'}
                      </td>
                      <td style={{ padding: '8px 6px' }}>
                        <div
                          style={{
                            height: 8,
                            width: '100%',
                            background: 'rgba(255,255,255,0.06)',
                            borderRadius: 4,
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              height: '100%',
                              width: `${barWidth}%`,
                              background: 'linear-gradient(90deg, var(--heat-primary), #f59e0b)',
                              borderRadius: 4,
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
