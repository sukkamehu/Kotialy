import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import type { CostSummary, DailyCost } from '../types/costs';

const MONTH_NAMES_FI: Record<string, string> = {
  '01': 'Tammikuu',
  '02': 'Helmikuu',
  '03': 'Maaliskuu',
  '04': 'Huhtikuu',
  '05': 'Toukokuu',
  '06': 'Kesäkuu',
  '07': 'Heinäkuu',
  '08': 'Elokuu',
  '09': 'Syyskuu',
  '10': 'Lokakuu',
  '11': 'Marraskuu',
  '12': 'Joulukuu',
};

function formatMonthLabel(monthKey: string, short = false): string {
  if (!monthKey || !monthKey.includes('-')) return monthKey || '';
  const [year, month] = monthKey.split('-');
  const name = MONTH_NAMES_FI[month] || month;
  if (short) {
    const currentYear = new Date().getFullYear().toString();
    return year === currentYear ? name : `${name} '${year.slice(2)}`;
  }
  return `${name} ${year}`;
}

export function DailyCostsCard({ readOnly = false }: { readOnly?: boolean } = {}) {
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [dailyCosts, setDailyCosts] = useState<DailyCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedRange, setSelectedRange] = useState<string>('7');

  // Settings form state
  const [transferMode, setTransferMode] = useState<'day_night' | 'flat'>('day_night');
  const [transferDay, setTransferDay] = useState<string>('5.11');
  const [transferNight, setTransferNight] = useState<string>('3.12');
  const [transfer, setTransfer] = useState<string>('4.50');
  const [margin, setMargin] = useState<string>('0.286');
  const [savingSettings, setSavingSettings] = useState(false);

  const fetchData = async () => {
    try {
      let dailyUrl = `/api/costs/daily?days=${selectedRange}`;
      if (selectedRange === 'all') {
        dailyUrl = '/api/costs/daily?days=all';
      } else if (/^\d{4}-\d{2}$/.test(selectedRange)) {
        dailyUrl = `/api/costs/daily?month=${selectedRange}`;
      }

      const [sumRes, dailyRes] = await Promise.all([
        apiFetch('/api/costs/summary'),
        apiFetch(dailyUrl),
      ]);

      const sumData: CostSummary = await sumRes.json();
      const dailyData = await dailyRes.json();

      setSummary(sumData);
      setDailyCosts(dailyData.costs || []);

      if (sumData.settings) {
        setTransferMode(sumData.settings.transfer_mode === 'flat' ? 'flat' : 'day_night');
        setTransferDay(String(sumData.settings.transfer_day_cents_kwh ?? '5.11'));
        setTransferNight(String(sumData.settings.transfer_night_cents_kwh ?? '3.12'));
        setTransfer(String(sumData.settings.transfer_cents_kwh ?? '4.50'));
        setMargin(String(sumData.settings.margin_cents_kwh ?? '0.286'));
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
  }, [selectedRange]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const res = await apiFetch('/api/costs/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transfer_mode: transferMode,
          transfer_day_cents_kwh: parseFloat(transferDay) || 5.11,
          transfer_night_cents_kwh: parseFloat(transferNight) || 3.12,
          transfer_cents_kwh: parseFloat(transfer) || 4.50,
          margin_cents_kwh: parseFloat(margin) || 0.50,
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

  const isMonthSelected = /^\d{4}-\d{2}$/.test(selectedRange);
  const selectedMonthData = isMonthSelected
    ? summary?.months?.find((m) => m.month === selectedRange) || null
    : null;
  const isAllSelected = selectedRange === 'all';

  // Totals for current dailyCosts list (used for footer and 'all' KPI)
  const totalConsumption = dailyCosts.reduce((s, d) => s + (d.total_consumption_kwh || 0), 0);
  const totalProduction = dailyCosts.reduce((s, d) => s + (d.total_production_kwh || 0), 0);
  const totalCost = dailyCosts.reduce((s, d) => s + (d.total_cost_eur || 0), 0);
  const totalSavings = dailyCosts.reduce((s, d) => s + (d.savings_eur || 0), 0);
  const avgCop = totalConsumption > 0 ? Number((totalProduction / totalConsumption).toFixed(2)) : null;
  const periodAvgPrice = totalConsumption > 0 ? Number(((totalCost / totalConsumption) * 100).toFixed(1)) : null;

  // Max daily cost for scaling the mini-bar visualization
  const maxCost = Math.max(...dailyCosts.map((d) => d.total_cost_eur), 1);

  // Dynamic header badge savings
  const activeSavings = isAllSelected
    ? totalSavings
    : isMonthSelected
      ? (selectedMonthData?.savings_eur ?? 0)
      : (month?.savings_eur ?? 0);

  const savingsBadgeLabel = isAllSelected
    ? `Säästö yhteensä (${dailyCosts.length} pv)`
    : isMonthSelected
      ? `Säästö (${formatMonthLabel(selectedRange, true)})`
      : 'Säästö tässä kuussa';

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-icon">💶</span>
        <span className="card-title">Päivittäiset Energiakustannukset & Säästöt</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {activeSavings > 0 && (
            <div className="badge badge-heat" style={{ fontSize: 12, fontWeight: 700, background: 'rgba(52, 211, 153, 0.15)', color: '#34d399', border: '1px solid rgba(52, 211, 153, 0.3)' }}>
              {savingsBadgeLabel}: ~{activeSavings.toFixed(1)} €
            </div>
          )}
          {!readOnly && (
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
          )}
        </div>
      </div>

      <div className="card-body">
        {/* Collapsible settings editor */}
        {showSettings && (
          <form
            onSubmit={handleSaveSettings}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
                e.preventDefault();
                (e.target as HTMLElement).blur();
              }
            }}
            style={{
              marginBottom: 20,
              padding: 16,
              borderRadius: 12,
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.1)',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            {/* Tariff Mode Switcher */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                ⚡ Sähkön siirtotariffi & sopimushinnat
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setTransferMode('day_night')}
                  style={{
                    padding: '4px 10px',
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 6,
                    border: transferMode === 'day_night' ? '1px solid #10b981' : '1px solid rgba(255,255,255,0.1)',
                    background: transferMode === 'day_night' ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                    color: transferMode === 'day_night' ? '#6ee7b7' : 'var(--text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  🌙 Yösiirto (Päivä / Yö)
                </button>
                <button
                  type="button"
                  onClick={() => setTransferMode('flat')}
                  style={{
                    padding: '4px 10px',
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 6,
                    border: transferMode === 'flat' ? '1px solid var(--accent-primary, #3b82f6)' : '1px solid rgba(255,255,255,0.1)',
                    background: transferMode === 'flat' ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                    color: transferMode === 'flat' ? '#60a5fa' : 'var(--text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  ⚡ Yksiaikainen
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
              {transferMode === 'day_night' ? (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>Päiväsiirto 07–22 (snt/kWh)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={transferDay}
                      onChange={(e) => setTransferDay(e.target.value)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 6,
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-primary)',
                        width: 140,
                        fontSize: 13,
                      }}
                      required
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 11, color: '#10b981', fontWeight: 600 }}>Yösiirto 22–07 (snt/kWh)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={transferNight}
                      onChange={(e) => setTransferNight(e.target.value)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 6,
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-primary)',
                        width: 140,
                        fontSize: 13,
                      }}
                      required
                    />
                  </div>
                </>
              ) : (
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
                      width: 140,
                      fontSize: 13,
                    }}
                    required
                  />
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Marginaali (snt/kWh, sis. alv)</label>
                <input
                  type="number"
                  step="0.001"
                  value={margin}
                  onChange={(e) => setMargin(e.target.value)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    width: 140,
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

          {/* Third Metric Box: Month or All selection */}
          <div className="metric-box">
            <span className="metric-label">
              {isAllSelected
                ? `Kaikki tallennetut (${dailyCosts.length} pv)`
                : isMonthSelected
                  ? `${selectedRange === month?.month ? 'Kuluva kuukausi' : 'Valittu kuukausi'} (${formatMonthLabel(selectedRange)})`
                  : `Kuluva kuukausi (${formatMonthLabel(month?.month || '')})`}
            </span>
            <span className="metric-value" style={{ color: 'var(--text-primary)', fontSize: 22 }}>
              {isAllSelected
                ? `${totalCost.toFixed(2)} €`
                : isMonthSelected
                  ? `${(selectedMonthData?.total_cost_eur ?? 0).toFixed(2)} €`
                  : month
                    ? `${month.total_cost_eur.toFixed(2)} €`
                    : '—'}
            </span>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              {isAllSelected ? (
                <>
                  Yhteensä: <strong style={{ color: 'var(--text-primary)' }}>{totalConsumption.toFixed(0)} kWh</strong>
                  {totalSavings > 0 ? (
                    <> • Säästö: <strong style={{ color: '#34d399' }}>~{totalSavings.toFixed(0)} €</strong></>
                  ) : null}
                  {avgCop != null ? (
                    <> • COP: <strong style={{ color: 'var(--online)' }}>{avgCop}</strong></>
                  ) : null}
                </>
              ) : isMonthSelected ? (
                <>
                  Yhteensä: <strong style={{ color: 'var(--text-primary)' }}>{selectedMonthData?.total_consumption_kwh.toFixed(0) ?? 0} kWh</strong>
                  {selectedMonthData?.savings_eur ? (
                    <> • Säästö: <strong style={{ color: '#34d399' }}>~{selectedMonthData.savings_eur.toFixed(0)} €</strong></>
                  ) : null}
                  {selectedMonthData?.cop != null ? (
                    <> • COP: <strong style={{ color: 'var(--online)' }}>{selectedMonthData.cop}</strong></>
                  ) : null}
                </>
              ) : (
                <>
                  Yhteensä: <strong style={{ color: 'var(--text-primary)' }}>{month?.total_consumption_kwh.toFixed(0) ?? 0} kWh</strong>
                  {month?.savings_eur ? (
                    <> • Säästö: <strong style={{ color: '#34d399' }}>~{month.savings_eur.toFixed(0)} €</strong></>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Daily History Table & Visualizer Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Päiväkohtainen toteuma
            </span>
            <span style={{ marginLeft: 8, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
              • Tallennettu pysyvästi
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            {/* Quick days */}
            {(['7', '14', '30'] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setSelectedRange(d)}
                style={{
                  fontSize: 11,
                  fontWeight: selectedRange === d ? 700 : 500,
                  padding: '4px 9px',
                  borderRadius: 6,
                  background: selectedRange === d ? 'var(--heat-primary)' : 'rgba(255,255,255,0.05)',
                  color: selectedRange === d ? '#fff' : 'var(--text-muted)',
                  border: selectedRange === d ? '1px solid rgba(245,158,11,0.5)' : '1px solid rgba(255,255,255,0.06)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {d} pv
              </button>
            ))}

            <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.15)', margin: '0 2px' }} />

            {/* Available Months */}
            {(summary?.months || []).map((m) => {
              const isSelected = selectedRange === m.month;
              const label = formatMonthLabel(m.month, true);
              return (
                <button
                  key={m.month}
                  type="button"
                  onClick={() => setSelectedRange(m.month)}
                  title={`${formatMonthLabel(m.month)} (${m.days_count} pv, ${m.total_cost_eur.toFixed(1)} €)`}
                  style={{
                    fontSize: 11,
                    fontWeight: isSelected ? 700 : 500,
                    padding: '4px 9px',
                    borderRadius: 6,
                    background: isSelected ? 'var(--heat-primary)' : 'rgba(255,255,255,0.05)',
                    color: isSelected ? '#fff' : 'var(--text-muted)',
                    border: isSelected ? '1px solid rgba(245,158,11,0.5)' : '1px solid rgba(255,255,255,0.06)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    whiteSpace: 'nowrap',
                  }}
                >
                  📅 {label}
                </button>
              );
            })}

            <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.15)', margin: '0 2px' }} />

            {/* All recorded history */}
            <button
              type="button"
              onClick={() => setSelectedRange('all')}
              title="Näytä koko tallennettu päivähistoria"
              style={{
                fontSize: 11,
                fontWeight: selectedRange === 'all' ? 700 : 500,
                padding: '4px 9px',
                borderRadius: 6,
                background: selectedRange === 'all' ? 'var(--heat-primary)' : 'rgba(255,255,255,0.05)',
                color: selectedRange === 'all' ? '#fff' : 'var(--text-muted)',
                border: selectedRange === 'all' ? '1px solid rgba(245,158,11,0.5)' : '1px solid rgba(255,255,255,0.06)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Kaikki
            </button>
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
              {dailyCosts.length > 0 && (
                <tfoot>
                  <tr
                    style={{
                      borderTop: '2px solid rgba(255,255,255,0.12)',
                      background: 'rgba(255,255,255,0.02)',
                      fontWeight: 700,
                    }}
                  >
                    <td style={{ padding: '10px 6px', color: 'var(--text-primary)' }}>
                      Yhteensä ({dailyCosts.length} pv)
                    </td>
                    <td style={{ padding: '10px 6px', textAlign: 'right', color: 'var(--text-primary)' }}>
                      {totalConsumption.toFixed(1)}
                    </td>
                    <td style={{ padding: '10px 6px', textAlign: 'right', color: 'var(--text-muted)' }}>
                      {totalProduction > 0 ? totalProduction.toFixed(1) : '—'}
                    </td>
                    <td style={{ padding: '10px 6px', textAlign: 'center' }}>
                      {avgCop ? (
                        <span style={{ color: avgCop >= 3.0 ? 'var(--online)' : 'var(--text-primary)', fontWeight: 700 }}>
                          {avgCop}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '10px 6px', textAlign: 'right', color: 'var(--text-muted)' }}>
                      {periodAvgPrice != null ? `${periodAvgPrice.toFixed(1)} snt` : '—'}
                    </td>
                    <td style={{ padding: '10px 6px', textAlign: 'right', fontWeight: 800, color: 'var(--heat-primary)' }}>
                      {totalCost.toFixed(2)} €
                    </td>
                    <td style={{ padding: '10px 6px', textAlign: 'right', color: '#34d399', fontWeight: 700 }}>
                      {totalSavings > 0 ? `+${totalSavings.toFixed(2)} €` : '—'}
                    </td>
                    <td style={{ padding: '10px 6px' }}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
