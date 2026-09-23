import { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { apiFetch } from '../lib/api';
import type {
  HerrforsStatus,
  HerrforsAnalyticsResponse,
  HerrforsDailyItem,
} from '../types/herrfors';

const BASELINE_KW = 0.55;
const BASELINE_15MIN_KWH = 0.138;

interface HerrforsAnalyticsCardProps {
  readOnly?: boolean;
}

export function HerrforsAnalyticsCard({ readOnly = false }: HerrforsAnalyticsCardProps) {
  const [status, setStatus] = useState<HerrforsStatus | null>(null);
  const [data, setData] = useState<HerrforsAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [rangeDays, setRangeDays] = useState<number>(7);
  const [viewMode, setViewMode] = useState<'stacked' | 'bars' | 'power' | 'table'>('stacked');
  const [showSettings, setShowSettings] = useState(false);
  const [hiddenSeries, setHiddenSeries] = useState<Record<string, boolean>>({});

  const toggleSeries = (dataKey: string) => {
    setHiddenSeries((prev) => ({
      ...prev,
      [dataKey]: !prev[dataKey],
    }));
  };

  // Settings form state
  const [tokenInput, setTokenInput] = useState('');
  const [coIdInput, setCoIdInput] = useState('');
  const [refreshMinutesInput, setRefreshMinutesInput] = useState('5');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await apiFetch('/api/herrfors/status');
      if (res.ok) {
        const s: HerrforsStatus = await res.json();
        setStatus(s);
        if (s.co_id) setCoIdInput(s.co_id);
      }
    } catch {
      // ignore
    }
  };

  const fetchAnalytics = async () => {
    try {
      const res = await apiFetch(`/api/herrfors/analytics?days=${rangeDays}`);
      if (res.ok) {
        const d: HerrforsAnalyticsResponse = await res.json();
        setData(d);
      }
    } catch (err) {
      console.error('Failed to fetch Herrfors analytics', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchAnalytics();
    const interval = setInterval(() => {
      fetchStatus();
      fetchAnalytics();
    }, 60_000);
    return () => clearInterval(interval);
  }, [rangeDays]);

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const res = await apiFetch('/api/herrfors/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: rangeDays }),
      });
      if (res.ok) {
        await Promise.all([fetchStatus(), fetchAnalytics()]);
      }
    } catch (err) {
      console.error('Herrfors sync error', err);
    } finally {
      setSyncing(false);
    }
  };

  const handleRefreshSession = async () => {
    setSyncing(true);
    try {
      const res = await apiFetch('/api/herrfors/refresh', { method: 'POST' });
      if (res.ok) {
        await fetchStatus();
      }
    } catch (err) {
      console.error('Session refresh error', err);
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsMessage(null);
    try {
      const payload: Record<string, unknown> = {
        co_id: coIdInput.trim(),
        refresh_interval_minutes: parseInt(refreshMinutesInput) || 5,
      };
      if (tokenInput.trim()) {
        payload.session_token = tokenInput.trim();
      }

      const res = await apiFetch('/api/herrfors/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setSettingsMessage({ type: 'success', text: 'Asetukset ja session token tallennettu onnistuneesti!' });
        setTokenInput('');
        await Promise.all([fetchStatus(), fetchAnalytics()]);
        setTimeout(() => setShowSettings(false), 1500);
      } else {
        const errJson = await res.json();
        setSettingsMessage({ type: 'error', text: errJson.error || 'Asetusten tallennus epäonnistui' });
      }
    } catch (err) {
      setSettingsMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setSavingSettings(false);
    }
  };

  const summary = data?.summary;
  const isSessionValid = Boolean((status?.session_active || status?.token_expires) && !status?.last_error);

  const sortedSeries = data?.series ? data.series.slice().sort((a, b) => a.time - b.time) : [];

  // Format date for chart X-axis
  const formatTimeX = (timeMs: number) => {
    const d = new Date(timeMs);
    const weekday = d.toLocaleDateString('fi-FI', { weekday: 'short' });
    const weekdayCap = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    if (rangeDays <= 2) {
      return `${weekdayCap} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    return `${weekdayCap} ${d.getDate()}.${d.getMonth() + 1}.`;
  };

  // Custom Recharts Tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const pt = payload[0]?.payload;
    if (!pt) return null;

    const timeStr = new Date(pt.time || label).toLocaleString('fi-FI', {
      weekday: 'short',
      day: 'numeric',
      month: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const isPending = pt.is_pending || pt.house_kwh == null;

    return (
      <div style={{
        background: 'rgba(15, 23, 42, 0.95)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: 8,
        padding: '10px 14px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        fontSize: 12,
        minWidth: 210,
      }}>
        <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 4 }}>
          {timeStr}
        </div>

        {isPending ? (
          <div style={{
            margin: '6px 0 8px',
            padding: '6px 8px',
            borderRadius: 6,
            background: 'rgba(234, 179, 8, 0.12)',
            border: '1px solid rgba(234, 179, 8, 0.25)',
            color: '#fbbf24',
            fontSize: 11,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <span>⏳</span>
            <span>Odottaa verkkoyhtiön mittaustietoja</span>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#a855f7', marginBottom: 2 }}>
              <span>🏢 Talon kokonais:</span>
              <strong>{pt.house_kwh != null ? `${pt.house_kwh.toFixed(3)} kWh (${pt.house_power_kw} kW)` : '-'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ef4444', marginBottom: 2 }}>
              <span>♨️ Lämpöpumppu:</span>
              <strong>{pt.heatpump_kwh != null ? `${pt.heatpump_kwh.toFixed(3)} kWh (${pt.heatpump_power_kw} kW)` : '-'}</strong>
            </div>
            {pt.heating_kwh > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#f87171', paddingLeft: 10, fontSize: 11 }}>
                <span>↳ Lämmitys:</span>
                <span>{pt.heating_kwh.toFixed(3)} kWh</span>
              </div>
            )}
            {pt.dhw_kwh > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#fb923c', paddingLeft: 10, fontSize: 11 }}>
                <span>↳ Käyttövesi:</span>
                <span>{pt.dhw_kwh.toFixed(3)} kWh</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#818cf8', marginTop: 2 }}>
              <span>🔌 Pistorasiat (Tapo):</span>
              <strong>{pt.tapo_kwh != null ? `${pt.tapo_kwh.toFixed(3)} kWh (${pt.tapo_power_kw} kW)` : '-'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#38bdf8', marginTop: 2 }}>
              <span>💡 Taloussähkö:</span>
              <strong>{pt.other_kwh != null ? `${pt.other_kwh.toFixed(3)} kWh (${pt.other_power_kw} kW)` : '-'}</strong>
            </div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              color: '#10b981',
              marginTop: 4,
              paddingTop: 4,
              borderTop: '1px dashed rgba(255,255,255,0.1)',
              fontSize: 11,
            }}>
              <span>🎯 Baseline ({BASELINE_KW} kW):</span>
              {pt.house_power_kw != null ? (
                pt.house_power_kw > BASELINE_KW + 0.05 ? (
                  <strong style={{ color: '#fb923c' }}>
                    +{((pt.house_power_kw - BASELINE_KW) * 1000).toFixed(0)} W ylikulutus
                  </strong>
                ) : (
                  <strong style={{ color: '#34d399' }}>🟢 Pohjakulutustasolla</strong>
                )
              ) : (
                <span>{BASELINE_KW} kW</span>
              )}
            </div>
          </>
        )}

        {pt.temperature != null && (
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#34d399', marginTop: 4 }}>
            <span>🌡️ Ulkolämpötila:</span>
            <strong>{pt.temperature > 0 ? `+${pt.temperature}` : pt.temperature} °C</strong>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#fbbf24', marginTop: 4, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 4 }}>
          <span>⚡ Sähkön hinta:</span>
          <strong>{pt.full_price_cents ? `${pt.full_price_cents.toFixed(2)} c/kWh` : `${pt.price_cents} c/kWh`}</strong>
        </div>
      </div>
    );
  };

  return (
    <div className="card">
      {/* Header */}
      <div className="card-header" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="card-icon">🔌</span>
          <span className="card-title">Sähkönkulutus</span>
        </div>

        {/* Live session & action buttons */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {isSessionValid ? (
            <div
              title={`Herrfors-sessio voimassa: ${status?.token_expires ? new Date(status.token_expires).toLocaleTimeString('fi-FI') : 'Aktiivinen'}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 20,
                background: 'rgba(34, 197, 94, 0.12)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                fontSize: 12,
                color: '#4ade80',
              }}
            >
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
              <span>Sessio aktiivinen</span>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 20,
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                fontSize: 12,
                color: '#f87171',
              }}
            >
              <span>⚠️ Herrfors-sessio vaatii tokenin</span>
            </div>
          )}

          {!readOnly && (
            <>
              <button
                type="button"
                className="btn btn-icon"
                title="Synkronoi mittaukset nyt"
                onClick={handleManualSync}
                disabled={syncing}
                style={{
                  padding: '5px 10px',
                  fontSize: 12,
                  borderRadius: 6,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  cursor: syncing ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span>{syncing ? '⏳' : '🔄'}</span>
                <span>{syncing ? 'Synkronoidaan...' : 'Synkronoi'}</span>
              </button>

              <button
                type="button"
                className="btn btn-icon"
                title="Herrfors-asetukset & Session Token"
                onClick={() => setShowSettings(!showSettings)}
                style={{
                  padding: '5px 10px',
                  fontSize: 12,
                  borderRadius: 6,
                  background: showSettings ? 'var(--accent-primary, #3b82f6)' : 'rgba(255,255,255,0.06)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                ⚙️ Token & Asetukset
              </button>
            </>
          )}
        </div>
      </div>

      <div className="card-body">
        {/* Collapsible settings / token form */}
        {showSettings && (
          <form
            onSubmit={handleSaveSettings}
            style={{
              marginBottom: 20,
              padding: 16,
              borderRadius: 12,
              background: 'rgba(0,0,0,0.35)',
              border: '1px solid rgba(255,255,255,0.12)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Herrfors Portal Tunnisteet</div>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {settingsMessage && (
              <div style={{
                padding: '8px 12px',
                borderRadius: 6,
                fontSize: 12,
                background: settingsMessage.type === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: settingsMessage.type === 'success' ? '#4ade80' : '#f87171',
                border: `1px solid ${settingsMessage.type === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              }}>
                {settingsMessage.text}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Uusi Session Token (__Secure-next-auth.session-token):
                </label>
                <input
                  type="text"
                  placeholder={status?.configured ? '•••••••••••••••• (Asetettu, syötä vain uusi)' : 'Syötä session token'}
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 6,
                    background: 'rgba(0,0,0,0.4)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: 'var(--text-primary)',
                    fontSize: 13,
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Sopimus- / Mittauspiste-ID (coId):
                </label>
                <input
                  type="text"
                  value={coIdInput}
                  onChange={(e) => setCoIdInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 6,
                    background: 'rgba(0,0,0,0.4)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: 'var(--text-primary)',
                    fontSize: 13,
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Automaattinen virkistysväli (min):
                </label>
                <input
                  type="number"
                  min="2"
                  max="60"
                  value={refreshMinutesInput}
                  onChange={(e) => setRefreshMinutesInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 6,
                    background: 'rgba(0,0,0,0.4)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: 'var(--text-primary)',
                    fontSize: 13,
                  }}
                />
              </div>
            </div>

            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
              💡 <em>Kotiäly virkistää session tokenin automaattisesti 5 minuutin välein taustalla, joten uutta tokenia tarvitsee syöttää vain jos yhteys katkeaa.</em>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={handleRefreshSession}
                disabled={syncing}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Virkistä sessio heti
              </button>
              <button
                type="submit"
                disabled={savingSettings}
                style={{
                  padding: '6px 16px',
                  borderRadius: 6,
                  background: 'var(--accent-primary, #3b82f6)',
                  border: 'none',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: savingSettings ? 'wait' : 'pointer',
                }}
              >
                {savingSettings ? 'Tallennetaan...' : 'Tallenna asetukset'}
              </button>
            </div>
          </form>
        )}

        {/* KPI Cards Row */}
        {summary && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            marginBottom: 20,
          }}>
            {/* Total House Electricity */}
            <div style={{
              background: 'rgba(168, 85, 247, 0.08)',
              border: '1px solid rgba(168, 85, 247, 0.25)',
              borderRadius: 12,
              padding: 14,
            }}>
              <div style={{ fontSize: 12, color: '#c084fc', fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🏢</span> Talon kokonaiskulutus
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
                {summary.total_house_kwh.toFixed(1)} <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>kWh</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                <span>Kustannus:</span>
                <strong>{summary.total_house_cost_eur.toFixed(2)} €</strong>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'flex', justifyContent: 'space-between' }}>
                <span>Keskihinta:</span>
                <span>{summary.avg_realized_price_cents.toFixed(2)} c/kWh</span>
              </div>
            </div>

            {/* Heat Pump Consumption */}
            <div style={{
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: 12,
              padding: 14,
            }}>
              <div style={{ fontSize: 12, color: '#f87171', fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>♨️</span> Lämpöpumpun osuus
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
                {summary.total_heatpump_kwh.toFixed(1)} <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>kWh</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                <span>Osuus talosta:</span>
                <strong style={{ color: '#f87171' }}>{summary.heating_share_percent.toFixed(1)} %</strong>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'flex', justifyContent: 'space-between' }}>
                <span>Kustannus:</span>
                <span>{summary.total_heatpump_cost_eur.toFixed(2)} €</span>
              </div>
            </div>

            {/* Tapo Smart Plugs Electricity */}
            <div style={{
              background: 'rgba(129, 140, 248, 0.08)',
              border: '1px solid rgba(129, 140, 248, 0.25)',
              borderRadius: 12,
              padding: 14,
            }}>
              <div style={{ fontSize: 12, color: '#818cf8', fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🔌</span> Älypistorasiat (Tapo)
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
                {(summary.total_tapo_kwh ?? 0).toFixed(1)} <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>kWh</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                <span>Osuus talosta:</span>
                <strong style={{ color: '#818cf8' }}>{(summary.tapo_share_percent ?? 0).toFixed(1)} %</strong>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'flex', justifyContent: 'space-between' }}>
                <span>Kustannus:</span>
                <span>{(summary.total_tapo_cost_eur ?? 0).toFixed(2)} €</span>
              </div>
            </div>

            {/* Household Other Electricity */}
            <div style={{
              background: 'rgba(56, 189, 248, 0.08)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderRadius: 12,
              padding: 14,
            }}>
              <div style={{ fontSize: 12, color: '#38bdf8', fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>💡</span> Taloussähkö & Muu
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
                {summary.total_other_kwh.toFixed(1)} <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>kWh</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                <span>Osuus talosta:</span>
                <strong style={{ color: '#38bdf8' }}>{summary.other_share_percent.toFixed(1)} %</strong>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'flex', justifyContent: 'space-between' }}>
                <span>Kustannus:</span>
                <span>{summary.total_other_cost_eur.toFixed(2)} €</span>
              </div>
            </div>

            {/* Outdoor Temperature */}
            {summary.avg_temp != null && (
              <div style={{
                background: 'rgba(52, 211, 153, 0.08)',
                border: '1px solid rgba(52, 211, 153, 0.25)',
                borderRadius: 12,
                padding: 14,
              }}>
                <div style={{ fontSize: 12, color: '#34d399', fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>🌡️</span> Ulkolämpötila (Herrfors)
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {summary.avg_temp > 0 ? `+${summary.avg_temp}` : summary.avg_temp} <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>°C</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
                  <span>Min / Max:</span>
                  <strong>{summary.min_temp}°C .. {summary.max_temp}°C</strong>
                </div>
              </div>
            )}

            {/* Baseline Power & Share */}
            <div style={{
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              borderRadius: 12,
              padding: 14,
            }}>
              <div style={{ fontSize: 12, color: '#34d399', fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🎯</span> Pohjakulutus (Baseline)
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
                {BASELINE_KW} <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>kW</span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 6, fontWeight: 500 }}>(~13.2 kWh/vrk)</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                <span>Jakson pohjaosuus:</span>
                <strong style={{ color: '#34d399' }}>
                  {summary.total_house_kwh > 0 ? `${Math.min(100, Math.round((rangeDays * 24 * BASELINE_KW / summary.total_house_kwh) * 100))}%` : '-'}
                </strong>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'flex', justifyContent: 'space-between' }}>
                <span>Aktiivinen lisäkuorma:</span>
                <span style={{ color: '#fb923c' }}>
                  {summary.total_house_kwh > 0 ? `${Math.max(0, Math.round(100 - (rangeDays * 24 * BASELINE_KW / summary.total_house_kwh) * 100))}%` : '-'}
                </span>
              </div>
            </div>

            {/* Peak Power */}
            <div style={{
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              borderRadius: 12,
              padding: 14,
            }}>
              <div style={{ fontSize: 12, color: '#fbbf24', fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>📈</span> Huipputeho (15 min)
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
                {summary.peak_power_kw.toFixed(2)} <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>kW</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                {summary.peak_power_time ? (
                  <span>Ajankohta: {new Date(summary.peak_power_time).toLocaleString('fi-FI', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                ) : (
                  <span>Ei huippua jaksolla</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Settlement Info Notice */}
        {summary?.last_settled_reading_time && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            borderRadius: 10,
            background: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            fontSize: 12,
            color: 'var(--text-secondary)',
            marginBottom: 16,
          }}>
            <span style={{ fontSize: 18 }}>ℹ️</span>
            <div style={{ lineHeight: 1.45 }}>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Mittausdatan toimitusviive: </span>
              <span>Sähköverkkoyhtiö (Herrfors / Fingrid Datahub) julkaisee viralliset mittaustiedot viiveellä (yleensä seuraavana aamuna / edellisen vuorokauden osalta). Viimeisin vahvistettu mittaus: </span>
              <strong style={{ color: '#60a5fa' }}>
                {new Date(summary.last_settled_reading_time).toLocaleString('fi-FI', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </strong>
              <span>. Kuluvan hetken reaaliaikaisen kulutuksen ja laitteet näet <em>Historia & Trendit</em> -välilehdeltä.</span>
            </div>
          </div>
        )}

        {/* View mode & Range toolbar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          gap: 10,
          flexWrap: 'wrap',
        }}>
          {/* Range tabs */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { days: 1, label: 'Tänään' },
              { days: 2, label: '2 pv' },
              { days: 7, label: '7 pv' },
              { days: 14, label: '14 pv' },
              { days: 30, label: '30 pv' },
            ].map(({ days, label }) => (
              <button
                key={days}
                type="button"
                onClick={() => setRangeDays(days)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  border: rangeDays === days ? '1px solid var(--accent-primary, #3b82f6)' : '1px solid rgba(255,255,255,0.08)',
                  background: rangeDays === days ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.03)',
                  color: rangeDays === days ? '#60a5fa' : 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Chart mode tabs */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { mode: 'stacked', label: '📊 Pinottu energia' },
              { mode: 'bars', label: '📈 Pylväät' },
              { mode: 'power', label: '⚡ Teho (kW)' },
              { mode: 'table', label: '📋 Päivätaulukko' },
            ].map(({ mode, label }) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode as any)}
                style={{
                  padding: '5px 10px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 500,
                  border: viewMode === mode ? '1px solid rgba(255,255,255,0.2)' : '1px solid transparent',
                  background: viewMode === mode ? 'rgba(255,255,255,0.08)' : 'transparent',
                  color: viewMode === mode ? 'var(--text-primary)' : 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Chart View */}
        {viewMode !== 'table' && sortedSeries.length > 0 && (
          <div style={{ width: '100%', height: 340, marginTop: 10 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={sortedSeries} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorHouse" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.6}/>
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0.05}/>
                  </linearGradient>
                  <linearGradient id="colorHP" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.7}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0.1}/>
                  </linearGradient>
                  <linearGradient id="colorTapo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#818cf8" stopOpacity={0.7}/>
                    <stop offset="95%" stopColor="#818cf8" stopOpacity={0.1}/>
                  </linearGradient>
                  <linearGradient id="colorOther" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.7}/>
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="time"
                  tickFormatter={formatTimeX}
                  stroke="var(--text-muted)"
                  fontSize={11}
                  minTickGap={30}
                />
                <YAxis
                  yAxisId="left"
                  stroke="var(--text-muted)"
                  fontSize={11}
                  label={{
                    value: viewMode === 'power' ? 'Teho (kW)' : 'Kulutus (kWh)',
                    angle: -90,
                    position: 'insideLeft',
                    fill: 'var(--text-muted)',
                    fontSize: 11,
                  }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#fbbf24"
                  fontSize={11}
                  unit=" c"
                  domain={[0, 'auto']}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  onClick={(e: any) => {
                    if (e && e.dataKey) {
                      toggleSeries(String(e.dataKey));
                    }
                  }}
                  wrapperStyle={{ fontSize: 12, paddingTop: 8, cursor: 'pointer', userSelect: 'none' }}
                />

                {viewMode === 'stacked' && (
                  <>
                    <Area
                      yAxisId="left"
                      type="monotone"
                      dataKey="heatpump_kwh"
                      name="Lämpöpumppu (kWh)"
                      stackId="1"
                      stroke="#ef4444"
                      fill="url(#colorHP)"
                      hide={hiddenSeries['heatpump_kwh']}
                    />
                    <Area
                      yAxisId="left"
                      type="monotone"
                      dataKey="tapo_kwh"
                      name="Älypistorasiat (kWh)"
                      stackId="1"
                      stroke="#818cf8"
                      fill="url(#colorTapo)"
                      hide={hiddenSeries['tapo_kwh']}
                    />
                    <Area
                      yAxisId="left"
                      type="monotone"
                      dataKey="other_kwh"
                      name="Taloussähkö (kWh)"
                      stackId="1"
                      stroke="#38bdf8"
                      fill="url(#colorOther)"
                      hide={hiddenSeries['other_kwh']}
                    />
                  </>
                )}

                {viewMode === 'bars' && (
                  <>
                    <Bar
                      yAxisId="left"
                      dataKey="house_kwh"
                      name="Talon kokonais (kWh)"
                      fill="#a855f7"
                      radius={[3, 3, 0, 0]}
                      hide={hiddenSeries['house_kwh']}
                    />
                    <Bar
                      yAxisId="left"
                      dataKey="heatpump_kwh"
                      name="Lämpöpumppu (kWh)"
                      fill="#ef4444"
                      radius={[3, 3, 0, 0]}
                      hide={hiddenSeries['heatpump_kwh']}
                    />
                    <Bar
                      yAxisId="left"
                      dataKey="tapo_kwh"
                      name="Älypistorasiat (kWh)"
                      fill="#818cf8"
                      radius={[3, 3, 0, 0]}
                      hide={hiddenSeries['tapo_kwh']}
                    />
                  </>
                )}

                {viewMode === 'power' && (
                  <>
                    <Area
                      yAxisId="left"
                      type="monotone"
                      dataKey="house_power_kw"
                      name="Talon kokonaisteho (kW)"
                      stroke="#a855f7"
                      fill="url(#colorHouse)"
                      hide={hiddenSeries['house_power_kw']}
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="heatpump_power_kw"
                      name="Lämpöpumpun teho (kW)"
                      stroke="#ef4444"
                      strokeWidth={2}
                      dot={false}
                      hide={hiddenSeries['heatpump_power_kw']}
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="tapo_power_kw"
                      name="Pistorasioiden teho (kW)"
                      stroke="#818cf8"
                      strokeWidth={2}
                      dot={false}
                      hide={hiddenSeries['tapo_power_kw']}
                    />
                  </>
                )}

                {/* Baseline reference level */}
                <ReferenceLine
                  yAxisId="left"
                  y={viewMode === 'power' ? BASELINE_KW : BASELINE_15MIN_KWH}
                  stroke="#10b981"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{
                    value: viewMode === 'power' ? `🎯 Baseline (${BASELINE_KW} kW)` : `🎯 Baseline (${BASELINE_15MIN_KWH} kWh)`,
                    fill: '#10b981',
                    fontSize: 10,
                    position: 'insideTopLeft',
                  }}
                />

                {/* Outdoor Temperature */}
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="temperature"
                  name="Ulkolämpö (°C)"
                  stroke="#34d399"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  hide={hiddenSeries['temperature']}
                />

                {/* Electricity Price Line on Right Axis */}
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="full_price_cents"
                  name="Sähkön hinta (c/kWh)"
                  stroke="#fbbf24"
                  strokeWidth={1.5}
                  dot={false}
                  hide={hiddenSeries['full_price_cents']}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Daily Breakdown Table View */}
        {viewMode === 'table' && data && data.daily.length > 0 && (
          <div style={{ overflowX: 'auto', marginTop: 10 }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 12,
              textAlign: 'left',
            }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '8px 10px' }}>Päivämäärä</th>
                  <th style={{ padding: '8px 10px' }}>Ulkolämpö</th>
                  <th style={{ padding: '8px 10px' }}>Talon kokonais</th>
                  <th style={{ padding: '8px 10px' }}>Lämpöpumppu</th>
                  <th style={{ padding: '8px 10px' }}>Lämmityksen osuus</th>
                  <th style={{ padding: '8px 10px' }}>Älypistorasiat</th>
                  <th style={{ padding: '8px 10px' }}>Taloussähkö</th>
                  <th style={{ padding: '8px 10px' }}>Kokonaiskulu (€)</th>
                  <th style={{ padding: '8px 10px' }}>Lämpöpumpun kulu (€)</th>
                  <th style={{ padding: '8px 10px' }}>Pistorasioiden kulu (€)</th>
                </tr>
              </thead>
              <tbody>
                {data.daily.map((d: HerrforsDailyItem) => (
                  <tr key={d.date} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 600 }}>
                      {d.date}
                      {d.is_pending && (
                        <span style={{ marginLeft: 6, fontSize: 10, padding: '2px 5px', borderRadius: 4, background: 'rgba(234, 179, 8, 0.15)', color: '#fbbf24' }}>
                          Odottaa mittausta
                        </span>
                      )}
                      {!d.is_pending && d.pending_slots && d.pending_slots > 0 ? (
                        <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-muted)' }}>
                          ({d.settled_slots}/{d.slot_count} jaks.)
                        </span>
                      ) : null}
                    </td>
                    <td style={{ padding: '8px 10px', color: '#34d399' }}>
                      {d.avg_temp != null ? (
                        <span>
                          <strong>{d.avg_temp > 0 ? `+${d.avg_temp}` : d.avg_temp} °C</strong>
                          {d.min_temp != null && d.max_temp != null && (
                            <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>
                              ({d.min_temp}..{d.max_temp})
                            </span>
                          )}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td style={{ padding: '8px 10px', color: '#c084fc' }}>
                      {d.is_pending ? '-' : `${d.house_kwh.toFixed(1)} kWh`}
                    </td>
                    <td style={{ padding: '8px 10px', color: '#f87171' }}>
                      {d.is_pending ? '-' : `${d.heatpump_kwh.toFixed(1)} kWh`}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      {d.is_pending ? '-' : (
                        <span style={{
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          background: 'rgba(239, 68, 68, 0.15)',
                          color: '#f87171',
                        }}>
                          {d.heating_share_percent.toFixed(1)} %
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '8px 10px', color: '#818cf8' }}>
                      {d.is_pending ? '-' : (d.tapo_kwh ? `${d.tapo_kwh.toFixed(1)} kWh` : '-')}
                      {!d.is_pending && d.tapo_share_percent ? (
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>
                          ({d.tapo_share_percent.toFixed(1)}%)
                        </span>
                      ) : null}
                    </td>
                    <td style={{ padding: '8px 10px', color: '#38bdf8' }}>
                      {d.is_pending ? '-' : `${d.other_kwh.toFixed(1)} kWh`}
                    </td>
                    <td style={{ padding: '8px 10px', fontWeight: 600 }}>
                      {d.is_pending ? '-' : `${d.house_cost_eur.toFixed(2)} €`}
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>
                      {d.is_pending ? '-' : `${d.heatpump_cost_eur.toFixed(2)} €`}
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>
                      {d.is_pending ? '-' : (d.tapo_cost_eur ? `${d.tapo_cost_eur.toFixed(2)} €` : '0.00 €')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Empty state if no data */}
        {(!data || data.series.length === 0) && !loading && (
          <div style={{
            padding: 30,
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: 14,
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>⚡</div>
            <div>Herrfors-mittaustietoja ei löytynyt valitulta ajanjaksolta.</div>
            <button
              type="button"
              onClick={handleManualSync}
              disabled={syncing}
              style={{
                marginTop: 12,
                padding: '8px 16px',
                borderRadius: 8,
                background: 'var(--accent-primary, #3b82f6)',
                border: 'none',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {syncing ? 'Synkronoidaan...' : 'Käynnistä tietojen nouto Herrforsilta'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
