import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useApc } from '../hooks/useApc';
import type { ApcMode, ApcPlanSlot } from '../types/apc';

interface ApcCardProps {
  readOnly?: boolean;
}

const MODE_DESCRIPTIONS: Record<ApcMode, { label: string; desc: string; icon: string }> = {
  balanced: {
    label: 'Tasapaino',
    desc: 'Esilämmittää halvoilla tunneilla ja säästää maltillisesti huipuissa',
    icon: '⚖️',
  },
  eco: {
    label: 'Säästö',
    desc: 'Maksimaalinen hintaseuranta: syvemmät pudotukset ja korkeammat lataukset',
    icon: '🌱',
  },
  comfort: {
    label: 'Mukavuus',
    desc: 'Ensisijainen lämmön tasaisuus pienellä edullisten tuntien hyödyntämisellä',
    icon: '🛋️',
  },
  dhw_only: {
    label: 'Vain käyttövesi',
    desc: 'Ohjaa ainoastaan käyttövesivaraajan lämmityksen vuorokauden halvimpaan jaksoon',
    icon: '🚿',
  },
};

export function ApcCard({ readOnly = false }: ApcCardProps) {
  const {
    status,
    logs,
    loading,
    saving,
    error,
    toggleEnabled,
    setMode,
    setOverride,
    updateSettings,
  } = useApc();

  const [showSettings, setShowSettings] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<ApcPlanSlot | null>(null);

  // Settings form draft state
  const [bufferBoost, setBufferBoost] = useState<number>(status?.settings?.buffer_boost_c ?? 3);
  const [bufferSetback, setBufferSetback] = useState<number>(status?.settings?.buffer_setback_c ?? -2);
  const [dhwTarget, setDhwTarget] = useState<number>(status?.settings?.dhw_target_c ?? 55);
  const [dhwMin, setDhwMin] = useState<number>(status?.settings?.dhw_min_c ?? 45);
  const [cheapThresh, setCheapThresh] = useState<number>(status?.settings?.cheap_threshold_cents ?? 3.0);
  const [peakThresh, setPeakThresh] = useState<number>(status?.settings?.peak_threshold_cents ?? 20.0);
  const [dhwHours, setDhwHours] = useState<number>(status?.settings?.dhw_duration_hours ?? 2);

  const openSettings = () => {
    if (status?.settings) {
      setBufferBoost(status.settings.buffer_boost_c);
      setBufferSetback(status.settings.buffer_setback_c);
      setDhwTarget(status.settings.dhw_target_c);
      setDhwMin(status.settings.dhw_min_c);
      setCheapThresh(status.settings.cheap_threshold_cents);
      setPeakThresh(status.settings.peak_threshold_cents);
      setDhwHours(status.settings.dhw_duration_hours);
    }
    setShowSettings(true);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await updateSettings({
      buffer_boost_c: Number(bufferBoost),
      buffer_setback_c: Number(bufferSetback),
      dhw_target_c: Number(dhwTarget),
      dhw_min_c: Number(dhwMin),
      cheap_threshold_cents: Number(cheapThresh),
      peak_threshold_cents: Number(peakThresh),
      dhw_duration_hours: Number(dhwHours),
    });
    if (ok) setShowSettings(false);
  };

  if (loading && !status) {
    return (
      <div className="card" style={{ minHeight: 140, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--text-muted)' }}>Ladataan APC-älyohjaimen tietoja...</span>
      </div>
    );
  }

  const enabled = status?.enabled ?? true;
  const currentDirective = status?.currentDirective ?? 'NORMAL';
  const overrideActive = status?.overrideActive ?? false;
  const plan = status?.plan || [];

  // Find maximum price for timeline normalization
  const maxPlanPrice = Math.max(...plan.map((p) => p.price), 15);
  const minPlanPrice = Math.min(...plan.map((p) => p.price), 0);

  // Badge colors and text
  const directiveColors: Record<string, { bg: string; color: string; border: string; label: string; icon: string }> = {
    BOOST: { bg: 'rgba(52, 211, 153, 0.15)', color: '#34d399', border: 'rgba(52, 211, 153, 0.35)', label: 'Esilämmitys (Lataus)', icon: '⚡' },
    SETBACK: { bg: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: 'rgba(239, 68, 68, 0.35)', label: 'Säästö (Pudotus)', icon: '💤' },
    ECO: { bg: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: 'rgba(245, 158, 11, 0.35)', label: 'Ekotila (-1°C)', icon: '🌱' },
    DHW_CYCLE: { bg: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: 'rgba(56, 189, 248, 0.35)', label: 'Käyttövesilataus', icon: '🚿' },
    NORMAL: { bg: 'rgba(255, 255, 255, 0.08)', color: 'var(--text-primary)', border: 'var(--border)', label: 'Normaali lämmitys', icon: '⚖️' },
  };

  const activeStyle = !enabled
    ? { bg: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', border: 'var(--border)', label: 'Pois päältä', icon: '⏹' }
    : overrideActive
    ? { bg: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', border: 'rgba(168, 85, 247, 0.35)', label: 'Manuaalinen ohitus', icon: '⏸' }
    : directiveColors[currentDirective] || directiveColors.NORMAL;

  return (
    <div
      className="card"
      style={{
        borderColor: enabled ? (currentDirective === 'BOOST' ? 'rgba(52, 211, 153, 0.35)' : currentDirective === 'SETBACK' ? 'rgba(239, 68, 68, 0.3)' : 'var(--border)') : 'var(--border)',
        boxShadow: enabled && currentDirective === 'BOOST' ? '0 0 25px rgba(52, 211, 153, 0.08)' : undefined,
      }}
    >
      <div className="card-header">
        <span className="card-icon">🧠</span>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="card-title">APC · Älykäs Sähkön Hintaohjain</span>
            <div
              className="badge"
              style={{
                background: activeStyle.bg,
                color: activeStyle.color,
                border: `1px solid ${activeStyle.border}`,
                fontWeight: 700,
                fontSize: 11,
              }}
            >
              {activeStyle.icon} {activeStyle.label}
            </div>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            Optimoi puskurin ja käyttöveden lämmityksen Nord Pool -varttihinnoilla
          </span>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setShowLogs(!showLogs)}
            style={{
              background: showLogs ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              fontSize: 12,
            }}
          >
            📋 Lokit
          </button>

          {!readOnly && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={openSettings}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                fontSize: 12,
              }}
            >
              ⚙️ Asetukset
            </button>
          )}

          <button
            type="button"
            className={`btn btn-sm ${enabled ? 'btn-primary' : 'btn-ghost'}`}
            disabled={readOnly || saving}
            onClick={toggleEnabled}
            style={{ fontWeight: 600, minWidth: 80 }}
          >
            {saving ? '…' : enabled ? '● Päällä' : '○ Pois'}
          </button>
        </div>
      </div>

      <div className="card-body">
        {error && (
          <div className="control-msg error" style={{ marginBottom: 14 }}>
            ⚠ {error}
          </div>
        )}

        {/* Top summary row: Mode selector + Current decision highlight */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 18 }}>
          {/* Mode selector */}
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.05em' }}>
              Optimointiprofiili
            </div>
            <div className="toggle-group" style={{ marginBottom: 8 }}>
              {(['balanced', 'eco', 'comfort', 'dhw_only'] as ApcMode[]).map((m) => (
                <button
                  key={m}
                  className={`toggle-btn ${status?.mode === m ? 'active' : ''}`}
                  disabled={readOnly || !enabled || saving}
                  onClick={() => setMode(m)}
                  style={{ fontSize: 11, padding: '5px 8px' }}
                >
                  {MODE_DESCRIPTIONS[m].icon} {MODE_DESCRIPTIONS[m].label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              {MODE_DESCRIPTIONS[status?.mode || 'balanced'].desc}
            </div>
          </div>

          {/* Current decision & targets */}
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Nykytila & Ohjauskohteet
              </span>
              {status?.currentPrice != null && (
                <span style={{ fontSize: 12, fontWeight: 700, color: status.currentPrice < 3 ? 'var(--online)' : status.currentPrice > 15 ? 'var(--offline)' : 'var(--text-primary)' }}>
                  {status.currentPrice.toFixed(2)} snt/kWh
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', margin: '6px 0 10px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Puskurin siirto (Z1)</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: currentDirective === 'BOOST' ? 'var(--online)' : currentDirective === 'SETBACK' ? 'var(--offline)' : 'var(--text-primary)' }}>
                  {currentDirective === 'BOOST' ? `+${status?.settings?.buffer_boost_c ?? 3}°C` : currentDirective === 'SETBACK' ? `${status?.settings?.buffer_setback_c ?? -2}°C` : '0°C (Normaali)'}
                </div>
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Käyttövesi (DHW)</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: status?.activeDhwSlot ? 'var(--dhw-primary)' : 'var(--text-secondary)' }}>
                  {status?.activeDhwSlot ? `${status?.settings?.dhw_target_c ?? 55}°C (Lataus)` : `${status?.settings?.dhw_min_c ?? 45}°C (Ylläpito)`}
                </div>
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Puskuri / KV Nyt</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>
                  {status?.sensors.bufferTemp?.toFixed(1) ?? '—'}° / {status?.sensors.dhwTemp?.toFixed(1) ?? '—'}°
                </div>
              </div>
            </div>

            {/* Manual Override controls */}
            {!readOnly && enabled && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                {overrideActive ? (
                  <>
                    <span style={{ fontSize: 11, color: '#c084fc' }}>
                      Tauko päättyy {status?.overrideUntil ? new Date(status.overrideUntil).toLocaleTimeString('fi-FI') : ''}
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      style={{ marginLeft: 'auto', fontSize: 11, padding: '3px 8px' }}
                      onClick={() => setOverride(0)}
                    >
                      Palaa automaatioon
                    </button>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Ohita automaatio:</span>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      style={{ fontSize: 11, padding: '3px 8px' }}
                      onClick={() => setOverride(2, 'NORMAL')}
                    >
                      Tauko 2h
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      style={{ fontSize: 11, padding: '3px 8px' }}
                      onClick={() => setOverride(2, 'BOOST')}
                    >
                      Lataa 2h
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 24-Hour Timeline visualizer */}
        <div style={{ marginBottom: 16 }}>
          {status?.stats && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 8,
              background: status.stats.isFlatHorizon ? 'rgba(56, 189, 248, 0.08)' : 'rgba(255, 255, 255, 0.03)',
              border: `1px solid ${status.stats.isFlatHorizon ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.06)'}`,
              borderRadius: 8,
              padding: '6px 12px',
              marginBottom: 12,
              fontSize: 11,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>{status.stats.isFlatHorizon ? '⚖️' : '📊'}</span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  Vuorokauden pörssihinnat: <b>{status.stats.minPrice.toFixed(1)} – {status.stats.maxPrice.toFixed(1)} snt</b> (vaihtelu {status.stats.spread.toFixed(1)} snt · ka. {status.stats.avgPrice.toFixed(1)} snt)
                </span>
              </div>
              <div>
                <span style={{
                  color: status.stats.isFlatHorizon ? '#38bdf8' : '#34d399',
                  fontWeight: 600,
                  fontSize: 10,
                  backgroundColor: status.stats.isFlatHorizon ? 'rgba(56, 189, 248, 0.15)' : 'rgba(52, 211, 153, 0.15)',
                  padding: '2px 8px',
                  borderRadius: 10,
                }}>
                  {status.stats.isFlatHorizon ? '✨ Tasainen hintataso → Optimaalinen COP & peruskäynti' : '⚡ Dynaaminen pörssiohjaus aktiivinen'}
                </span>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Optimointiaikataulu (Seuraavat 24h / 15 min vartit)
            </span>
            <div style={{ display: 'flex', gap: 10, fontSize: 11 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: '#34d399' }} /> Esilämmitys
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: '#38bdf8' }} /> Käyttövesi
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: '#f87171' }} /> Säästöjakso
              </span>
            </div>
          </div>

          {plan.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-muted)', fontSize: 12 }}>
              Odotetaan Nord Pool -hintatietoja...
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                height: 100,
                gap: 2,
                background: 'rgba(0,0,0,0.3)',
                padding: '8px 8px 0 8px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                overflowX: 'auto',
              }}
            >
              {plan.slice(0, 48).map((slot) => {
                const heightPct = Math.max(12, Math.min(100, ((slot.price - minPlanPrice) / (maxPlanPrice - minPlanPrice || 1)) * 90));
                const isNow = Date.now() >= slot.start_time && Date.now() < slot.end_time;
                const isSelected = selectedSlot?.start_time === slot.start_time;

                let barBg = 'rgba(255, 255, 255, 0.2)';
                if (slot.directive === 'BOOST') barBg = '#34d399';
                else if (slot.is_dhw_slot) barBg = '#38bdf8';
                else if (slot.directive === 'SETBACK') barBg = '#f87171';
                else if (slot.directive === 'ECO') barBg = '#fbbf24';

                const timeStr = new Date(slot.start_time).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });

                return (
                  <div
                    key={slot.start_time}
                    onClick={() => setSelectedSlot(isSelected ? null : slot)}
                    style={{
                      flex: 1,
                      minWidth: 10,
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'flex-end',
                      alignItems: 'center',
                      cursor: 'pointer',
                      position: 'relative',
                    }}
                    title={`${timeStr} · ${slot.price.toFixed(2)} snt/kWh\nTila: ${slot.directive} (${slot.reason})`}
                  >
                    {isNow && (
                      <div
                        style={{
                          position: 'absolute',
                          top: -6,
                          width: 4,
                          height: 4,
                          borderRadius: '50%',
                          background: '#fff',
                          boxShadow: '0 0 6px #fff',
                        }}
                      />
                    )}
                    <div
                      style={{
                        width: '100%',
                        height: `${heightPct}%`,
                        background: barBg,
                        borderRadius: '2px 2px 0 0',
                        opacity: isNow ? 1 : isSelected ? 1 : 0.75,
                        outline: isSelected ? '1px solid #fff' : isNow ? '1px solid rgba(255,255,255,0.6)' : 'none',
                        transition: 'height 0.3s, opacity 0.2s',
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* Selected slot info popup */}
          {selectedSlot && (
            <div
              style={{
                marginTop: 8,
                padding: '8px 12px',
                borderRadius: 6,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: 12,
              }}
            >
              <div>
                <strong>{new Date(selectedSlot.start_time).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })} – {new Date(selectedSlot.end_time).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })}</strong>
                {' · '}
                <span style={{ color: selectedSlot.price < 3 ? 'var(--online)' : selectedSlot.price > 15 ? 'var(--offline)' : 'var(--text-primary)' }}>
                  {selectedSlot.price.toFixed(2)} snt/kWh
                </span>
                {' · '}
                <span style={{ color: 'var(--text-secondary)' }}>{selectedSlot.reason}</span>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setSelectedSlot(null)}
                style={{ fontSize: 11, padding: '2px 6px' }}
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Registered Devices row */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.05em' }}>
            Ohjattavat lämmityslaitteet
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            {status?.devices?.map((dev) => (
              <div
                key={dev.driver}
                style={{
                  padding: '8px 12px',
                  borderRadius: 6,
                  background: 'rgba(0,0,0,0.15)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 18 }}>{dev.driver === 'panasonic' ? '⚙️' : '❄️'}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{dev.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {dev.driver === 'panasonic'
                      ? `Kytketty Heishamoniin (siirto: ${dev.currentOffset ?? 0 > 0 ? '+' : ''}${dev.currentOffset ?? 0}°C)`
                      : 'Valmiustilassa (odotetaan ILP-integraatiota)'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Logs drawer */}
        {showLogs && (
          <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                APC-optimointiloki (Viimeisimmät päätökset)
              </span>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setShowLogs(false)}
                style={{ fontSize: 11 }}
              >
                Sulje
              </button>
            </div>

            {logs.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 0' }}>
                Ei vielä lokitapahtumia.
              </div>
            ) : (
              <div style={{ maxHeight: 180, overflowY: 'auto', fontSize: 11, borderRadius: 6, background: 'rgba(0,0,0,0.25)', padding: 8 }}>
                {logs.map((log) => (
                  <div
                    key={log.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '4px 0',
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                    }}
                  >
                    <span style={{ color: 'var(--text-muted)', minWidth: 60 }}>
                      {new Date(log.timestamp).toLocaleTimeString('fi-FI')}
                    </span>
                    <span style={{ flex: 1, margin: '0 8px', color: 'var(--text-primary)' }}>
                      {log.action} — <span style={{ color: 'var(--text-muted)' }}>{log.reason}</span>
                    </span>
                    {log.price_cents != null && (
                      <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                        {log.price_cents.toFixed(1)} snt
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Settings Modal */}
        {/* Settings Modal (Portal to body to guarantee always on top of all cards) */}
        {showSettings && createPortal(
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.85)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 999999,
              padding: '20px 16px',
              overflowY: 'auto',
            }}
            onClick={() => setShowSettings(false)}
          >
            <div
              style={{
                background: '#13192b',
                border: '1px solid rgba(255,255,255,0.18)',
                borderRadius: 16,
                maxWidth: 520,
                width: '100%',
                maxHeight: 'min(92vh, 760px)',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 30px 80px rgba(0,0,0,0.95)',
                color: '#f8fafc',
                overflow: 'hidden',
                margin: 'auto',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '16px 20px',
                  borderBottom: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.02)',
                  flexShrink: 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 22 }}>⚙️</span>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#f8fafc' }}>
                    APC-optimointiasetukset
                  </h3>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setShowSettings(false)}
                  style={{ fontSize: 18, padding: '4px 8px', color: 'var(--text-muted)' }}
                  title="Sulje"
                >
                  ✕
                </button>
              </div>

              {/* Scrollable Form Body */}
              <form
                onSubmit={handleSaveSettings}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  overflowY: 'auto',
                  flex: 1,
                  padding: '18px 20px',
                  gap: 16,
                }}
              >
                <div style={{ background: '#0d1322', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc' }}>
                      Puskurivaraajan esilämmitys (Boost)
                    </label>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--online)' }}>
                      +{bufferBoost}°C
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="15"
                    step="1"
                    value={bufferBoost}
                    onChange={(e) => setBufferBoost(Number(e.target.value))}
                    style={{ width: '100%', marginTop: 8 }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                    <span>+1°C (Mieto)</span>
                    <span>+5°C</span>
                    <span>+10°C</span>
                    <span>+15°C (Täyslataus)</span>
                  </div>
                </div>

                <div style={{ background: '#0d1322', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc' }}>
                      Puskurivaraajan säästöpudotus (Setback)
                    </label>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#f87171' }}>
                      {bufferSetback}°C
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-10"
                    max="-1"
                    step="1"
                    value={bufferSetback}
                    onChange={(e) => setBufferSetback(Number(e.target.value))}
                    style={{ width: '100%', marginTop: 8 }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                    <span>-10°C (Syvä säästö)</span>
                    <span>-5°C</span>
                    <span>-2°C</span>
                    <span>-1°C (Kevyt)</span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Käyttöveden lataustavoite (°C)</label>
                    <input
                      type="number"
                      min="45"
                      max="65"
                      value={dhwTarget}
                      onChange={(e) => setDhwTarget(Number(e.target.value))}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: '#0d1322', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: 13 }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>KV Minimilämpötila (°C)</label>
                    <input
                      type="number"
                      min="40"
                      max="50"
                      value={dhwMin}
                      onChange={(e) => setDhwMin(Number(e.target.value))}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: '#0d1322', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: 13 }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Halvan sähkön raja (snt/kWh)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={cheapThresh}
                      onChange={(e) => setCheapThresh(Number(e.target.value))}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: '#0d1322', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: 13 }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Hintahuipun raja (snt/kWh)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={peakThresh}
                      onChange={(e) => setPeakThresh(Number(e.target.value))}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: '#0d1322', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: 13 }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Käyttövesilatauksen kesto (h/vrk)</label>
                  <input
                    type="number"
                    min="1"
                    max="6"
                    value={dhwHours}
                    onChange={(e) => setDhwHours(Number(e.target.value))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: '#0d1322', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: 13 }}
                  />
                </div>

                {/* Fixed Footer Buttons */}
                <div
                  style={{
                    display: 'flex',
                    gap: 10,
                    justifyContent: 'flex-end',
                    marginTop: 10,
                    paddingTop: 14,
                    borderTop: '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setShowSettings(false)}
                    style={{ padding: '8px 16px', borderRadius: 6 }}
                  >
                    Peruuta
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={saving}
                    style={{ padding: '8px 20px', borderRadius: 6, fontWeight: 600 }}
                  >
                    {saving ? 'Tallennetaan...' : 'Tallenna asetukset'}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
      </div>
    </div>
  );
}
