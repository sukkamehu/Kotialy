import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useApc } from '../hooks/useApc';
import type { ApcMode, ApcPlanSlot } from '../types/apc';

interface ApcCardProps {
  readOnly?: boolean;
  onOpenStrategy?: () => void;
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

export function ApcCard({ readOnly = false, onOpenStrategy }: ApcCardProps) {
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
  const [hoveredSlot, setHoveredSlot] = useState<ApcPlanSlot | null>(null);

  // Settings form draft state (use string for inputs to allow smooth editing & clearing)
  const [bufferBoost, setBufferBoost] = useState<number>(status?.settings?.buffer_boost_c ?? 3);
  const [bufferSetback, setBufferSetback] = useState<number>(status?.settings?.buffer_setback_c ?? -2);
  const [dhwBoostTarget, setDhwBoostTarget] = useState<string>(String(status?.settings?.dhw_boost_target_c ?? status?.settings?.dhw_target_c ?? 55));
  const [dhwNormalTarget, setDhwNormalTarget] = useState<string>(String(status?.settings?.dhw_normal_target_c ?? 50));
  const [dhwMin, setDhwMin] = useState<string>(String(status?.settings?.dhw_min_c ?? 45));
  const [dhwBoostOnCheap, setDhwBoostOnCheap] = useState<boolean>(status?.settings?.dhw_boost_on_cheap ?? true);
  const [cheapThresh, setCheapThresh] = useState<string>(String(status?.settings?.cheap_threshold_cents ?? 3.0));
  const [peakThresh, setPeakThresh] = useState<string>(String(status?.settings?.peak_threshold_cents ?? 20.0));
  const [dhwHours, setDhwHours] = useState<string>(String(status?.settings?.dhw_duration_hours ?? 2));

  const openSettings = () => {
    if (status?.settings) {
      setBufferBoost(status.settings.buffer_boost_c ?? 3);
      setBufferSetback(status.settings.buffer_setback_c ?? -2);
      setDhwBoostTarget(String(status.settings.dhw_boost_target_c ?? status.settings.dhw_target_c ?? 55));
      setDhwNormalTarget(String(status.settings.dhw_normal_target_c ?? 50));
      setDhwMin(String(status.settings.dhw_min_c ?? 45));
      setDhwBoostOnCheap(status.settings.dhw_boost_on_cheap !== false);
      setCheapThresh(String(status.settings.cheap_threshold_cents ?? 3.0));
      setPeakThresh(String(status.settings.peak_threshold_cents ?? 20.0));
      setDhwHours(String(status.settings.dhw_duration_hours ?? 2));
    }
    setShowSettings(true);
  };

  const applyPreset = (type: 'compressor_save' | 'balanced' | 'max_savings' | 'comfort') => {
    if (type === 'compressor_save') {
      setCheapThresh('3.0');
      setPeakThresh('20.0');
      setDhwBoostTarget('55');
      setDhwNormalTarget('50');
      setDhwMin('45');
      setDhwBoostOnCheap(true);
      setBufferBoost(3);
      setBufferSetback(-2);
      setDhwHours('2');
    } else if (type === 'balanced') {
      setCheapThresh('3.0');
      setPeakThresh('20.0');
      setDhwBoostTarget('55');
      setDhwNormalTarget('50');
      setDhwMin('45');
      setDhwBoostOnCheap(true);
      setBufferBoost(3);
      setBufferSetback(-2);
      setDhwHours('2');
    } else if (type === 'max_savings') {
      setCheapThresh('2.5');
      setPeakThresh('15.0');
      setDhwBoostTarget('55');
      setDhwNormalTarget('48');
      setDhwMin('42');
      setDhwBoostOnCheap(true);
      setBufferBoost(5);
      setBufferSetback(-4);
      setDhwHours('2');
    } else if (type === 'comfort') {
      setCheapThresh('4.0');
      setPeakThresh('25.0');
      setDhwBoostTarget('52');
      setDhwNormalTarget('50');
      setDhwMin('46');
      setDhwBoostOnCheap(false);
      setBufferBoost(2);
      setBufferSetback(-1);
      setDhwHours('3');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await updateSettings({
      buffer_boost_c: Number(bufferBoost),
      buffer_setback_c: Number(bufferSetback),
      dhw_target_c: parseFloat(dhwBoostTarget) || 55,
      dhw_boost_target_c: parseFloat(dhwBoostTarget) || 55,
      dhw_normal_target_c: parseFloat(dhwNormalTarget) || 50,
      dhw_min_c: parseFloat(dhwMin) || 45,
      dhw_boost_on_cheap: Boolean(dhwBoostOnCheap),
      cheap_threshold_cents: parseFloat(cheapThresh) || 3.0,
      peak_threshold_cents: parseFloat(peakThresh) || 20.0,
      dhw_duration_hours: parseInt(dhwHours, 10) || 2,
    });
    if (ok) setShowSettings(false);
  };

  const enabled = status?.enabled ?? true;
  const currentDirective = status?.currentDirective ?? 'NORMAL';
  const overrideActive = status?.overrideActive ?? false;
  const plan = status?.plan || [];
  const nowTs = Date.now();

  const [timeHorizon, setTimeHorizon] = useState<'24h' | '12h' | 'today' | 'tomorrow' | 'all'>('24h');

  const hasTomorrowSlots = useMemo(() => {
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
    const tomorrowStart = todayStart + 24 * 60 * 60 * 1000;
    return plan.some((s) => s.start_time >= tomorrowStart);
  }, [plan]);

  const displayPlan = useMemo(() => {
    if (!plan.length) return [];
    const nowIdx = plan.findIndex((s) => s.start_time <= nowTs && s.end_time > nowTs);
    const startFromNow = nowIdx >= 0 ? nowIdx : 0;

    if (timeHorizon === '12h') {
      return plan.slice(startFromNow, startFromNow + 48);
    }
    if (timeHorizon === '24h') {
      return plan.slice(startFromNow, startFromNow + 96);
    }
    if (timeHorizon === 'today') {
      const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
      const todayEnd = todayStart + 24 * 60 * 60 * 1000;
      const todaySlots = plan.filter((s) => s.start_time >= todayStart && s.start_time < todayEnd);
      return todaySlots.length ? todaySlots : plan.slice(0, 96);
    }
    if (timeHorizon === 'tomorrow') {
      const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
      const tomorrowStart = todayStart + 24 * 60 * 60 * 1000;
      const tomorrowEnd = tomorrowStart + 24 * 60 * 60 * 1000;
      const tomorrowSlots = plan.filter((s) => s.start_time >= tomorrowStart && s.start_time < tomorrowEnd);
      return tomorrowSlots.length ? tomorrowSlots : plan.slice(startFromNow, startFromNow + 96);
    }
    return plan;
  }, [plan, timeHorizon, nowTs]);

  const currentSlot = displayPlan.find((s) => s.start_time <= nowTs && s.end_time > nowTs) || displayPlan[0] || null;
  const activeInspectSlot = hoveredSlot || selectedSlot || currentSlot;

  // Find maximum & minimum price for timeline normalization (dynamically scaled to visible window)
  const validPrices = displayPlan
    .map((p) => p.price)
    .filter((p): p is number => typeof p === 'number' && !isNaN(p));
  const rawMax = validPrices.length ? Math.max(...validPrices) : 5;
  const rawMin = validPrices.length ? Math.min(...validPrices) : 0;

  // Adaptive dynamic ceiling: pads max by ~15% or at least +0.4 snt, at least 2.0 snt/kWh
  const maxPlanPrice = Number(Math.max(rawMax * 1.15, rawMax + 0.4, 2.0).toFixed(1));
  const minPlanPrice = Number(Math.min(rawMin < 0 ? rawMin * 1.15 : 0, 0).toFixed(1));
  const midPlanPrice = Number(((maxPlanPrice + minPlanPrice) / 2).toFixed(1));

  // Pick time tick labels (every ~3 hours) - called unconditionally
  const timeTicks = useMemo(() => {
    if (!displayPlan.length) return [];
    const ticks: { time: number; label: string }[] = [];
    const step = Math.max(1, Math.floor(displayPlan.length / 8));
    for (let i = 0; i < displayPlan.length; i += step) {
      const slot = displayPlan[i];
      ticks.push({
        time: slot.start_time,
        label: new Date(slot.start_time).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' }),
      });
    }
    const last = displayPlan[displayPlan.length - 1];
    if (last) {
      ticks.push({
        time: last.end_time,
        label: new Date(last.end_time).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' }),
      });
    }
    return ticks;
  }, [displayPlan]);

  // Compute upcoming key phase transitions in next 24h - called unconditionally
  const upcomingDirectives = useMemo(() => {
    if (!displayPlan.length) return [];
    const future = displayPlan.filter((s) => s.end_time > nowTs);
    const events: { slot: ApcPlanSlot; label: string; time: string; icon: string; color: string }[] = [];
    let prevDir = currentSlot?.directive;
    for (const s of future) {
      if (s.directive !== 'NORMAL' && s.directive !== prevDir) {
        let icon = '⚡';
        let label = 'Esilämmitys';
        let color = '#34d399';
        if (s.is_dhw_slot || s.directive === 'DHW_CYCLE') {
          icon = '🚿';
          label = 'Käyttövesi';
          color = '#38bdf8';
        } else if (s.directive === 'SETBACK') {
          icon = '💤';
          label = 'Säästöjakso';
          color = '#f87171';
        } else if (s.directive === 'ECO') {
          icon = '🌱';
          label = 'Ekotila';
          color = '#fbbf24';
        }
        events.push({
          slot: s,
          icon,
          label,
          color,
          time: new Date(s.start_time).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' }),
        });
        prevDir = s.directive;
      }
    }
    return events.slice(0, 3);
  }, [displayPlan, currentSlot, nowTs]);

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

  if (loading && !status) {
    return (
      <div className="card" style={{ minHeight: 140, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--text-muted)' }}>Ladataan APC-älyohjaimen tietoja...</span>
      </div>
    );
  }

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
            onClick={onOpenStrategy || (() => setShowLogs(!showLogs))}
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
              onClick={onOpenStrategy || openSettings}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                fontSize: 12,
              }}
              title="Avaa APC-strategia ja asetukset"
            >
              ⚙️ Asetukset & Strategia
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
              {status?.currentPrice != null && typeof status.currentPrice === 'number' && !isNaN(status.currentPrice) && (
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
                  {status?.activeDhwSlot ? `${status?.settings?.dhw_target_c ?? 55}°C (Lataus)` : `${status?.settings?.dhw_normal_target_c ?? 50}°C (Ylläpito)`}
                </div>
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Puskuri / KV Nyt</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>
                  {status?.sensors?.bufferTemp != null ? status.sensors.bufferTemp.toFixed(1) : '—'}° / {status?.sensors?.dhwTemp != null ? status.sensors.dhwTemp.toFixed(1) : '—'}°
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
                  Vuorokauden pörssihinnat: <b>{status.stats.minPrice != null ? status.stats.minPrice.toFixed(1) : '—'} – {status.stats.maxPrice != null ? status.stats.maxPrice.toFixed(1) : '—'} snt</b> (vaihtelu {status.stats.spread != null ? status.stats.spread.toFixed(1) : '—'} snt · ka. {status.stats.avgPrice != null ? status.stats.avgPrice.toFixed(1) : '—'} snt)
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

          {/* Action Plan & Upcoming Events Banner */}
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '10px 14px',
            marginBottom: 12,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                📌 TÄLLÄ HETKELLÄ:
              </span>
              <span style={{
                fontSize: 12,
                fontWeight: 600,
                color: activeStyle.color,
                background: activeStyle.bg,
                border: `1px solid ${activeStyle.border}`,
                padding: '2px 8px',
                borderRadius: 6,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}>
                <span>{activeStyle.icon}</span>
                <span>{currentSlot ? currentSlot.reason : activeStyle.label}</span>
              </span>
            </div>

            {/* Upcoming highlight events */}
            {upcomingDirectives.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>🔜 SEURAAVAKSI:</span>
                {upcomingDirectives.map((evt, idx) => (
                  <span
                    key={evt.slot.start_time}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      background: 'rgba(255,255,255,0.05)',
                      padding: '2px 7px',
                      borderRadius: 5,
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <span>{evt.icon}</span>
                    <strong style={{ color: evt.color }}>{evt.time}</strong>
                    <span>{evt.label}</span>
                    {idx < upcomingDirectives.length - 1 && <span style={{ opacity: 0.35, marginLeft: 2 }}>→</span>}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Interactive 24h Timeline Chart & Live Inspector */}
          <div style={{
            background: 'rgba(0,0,0,0.25)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '12px 14px',
            marginBottom: 12,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  📊 Optimointiaikataulu (15 min vartit)
                </span>

                {/* Horizon Switcher */}
                <div style={{ display: 'inline-flex', background: 'rgba(255,255,255,0.06)', borderRadius: 7, padding: 2, gap: 2 }}>
                  {(['24h', '12h', 'today', 'tomorrow', 'all'] as const).map((mode) => {
                    if (mode === 'tomorrow' && !hasTomorrowSlots) return null;
                    const labels: Record<string, string> = {
                      '24h': 'Seuraavat 24h',
                      '12h': '12h',
                      'today': 'Tänään',
                      'tomorrow': 'Huominen',
                      'all': 'Kaikki',
                    };
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setTimeHorizon(mode)}
                        style={{
                          border: 'none',
                          background: timeHorizon === mode ? 'var(--heat-primary, #f97316)' : 'transparent',
                          color: timeHorizon === mode ? '#fff' : 'var(--text-muted)',
                          fontSize: 10,
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: 5,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {labels[mode]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Legend */}
              <div style={{ display: 'flex', gap: 12, fontSize: 11, flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: '#34d399', boxShadow: '0 0 6px rgba(52,211,153,0.5)' }} /> Esilämmitys (Lataus)
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: '#38bdf8', boxShadow: '0 0 6px rgba(56,189,248,0.5)' }} /> Käyttövesi
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: '#f87171', boxShadow: '0 0 6px rgba(248,113,113,0.5)' }} /> Säästö (Pudotus)
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(255,255,255,0.25)' }} /> Normaali
                </span>
              </div>
            </div>

            {/* Dynamic Live Inspector Bar (Follows mouse hover immediately) */}
            {activeInspectSlot && (
              <div style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                padding: '8px 12px',
                marginBottom: 10,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
                transition: 'all 0.15s ease',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    background: 'rgba(255,255,255,0.08)',
                    padding: '3px 8px',
                    borderRadius: 4,
                  }}>
                    🕒 {new Date(activeInspectSlot.start_time).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })} – {new Date(activeInspectSlot.end_time).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: activeInspectSlot?.price != null && activeInspectSlot.price <= (status?.settings?.cheap_threshold_cents ?? 3)
                      ? 'var(--online)'
                      : activeInspectSlot?.price != null && activeInspectSlot.price >= (status?.settings?.peak_threshold_cents ?? 20)
                      ? 'var(--offline)'
                      : '#facc15',
                  }}>
                    ⚡ {activeInspectSlot?.price != null && typeof activeInspectSlot.price === 'number' ? activeInspectSlot.price.toFixed(2) : '—'} snt/kWh
                  </span>
                  <span style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: activeInspectSlot.directive === 'BOOST' ? '#34d399' : activeInspectSlot.is_dhw_slot || activeInspectSlot.directive === 'DHW_CYCLE' ? '#38bdf8' : activeInspectSlot.directive === 'SETBACK' ? '#f87171' : 'var(--text-secondary)',
                  }}>
                    {activeInspectSlot.directive === 'BOOST' ? '⚡ Esilämmitys / Lataus (+3°C)' : activeInspectSlot.is_dhw_slot || activeInspectSlot.directive === 'DHW_CYCLE' ? '🚿 Käyttövesilataus (55°C)' : activeInspectSlot.directive === 'SETBACK' ? '💤 Säästötila / Setback (-2°C)' : activeInspectSlot.directive === 'ECO' ? '🌱 Ekotila (-1°C)' : '⚖️ Normaali peruskäynti'}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {activeInspectSlot.reason}
                </div>
              </div>
            )}

            {/* Tall, Responsive Bar Chart (Height: 190px) with Y-Axis */}
            {displayPlan.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: 12 }}>
                Odotetaan Nord Pool -hintatietoja...
              </div>
            ) : (
              <div
                onMouseLeave={() => setHoveredSlot(null)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  height: 190,
                  gap: 1.5,
                  background: 'rgba(0,0,0,0.35)',
                  padding: '24px 8px 0 8px',
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.06)',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {/* Reference Grid lines with Y-Axis values */}
                <div style={{ position: 'absolute', top: 24, left: 8, right: 8, bottom: 0, pointerEvents: 'none', zIndex: 0 }}>
                  {/* Top grid line + label */}
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, borderTop: '1px dashed rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center' }}>
                    <span style={{
                      fontSize: 9,
                      fontWeight: 600,
                      color: 'rgba(255,255,255,0.55)',
                      background: 'rgba(15, 23, 42, 0.85)',
                      padding: '1px 5px',
                      borderRadius: 3,
                      border: '1px solid rgba(255,255,255,0.08)',
                      transform: 'translateY(-50%)',
                    }}>
                      {maxPlanPrice} snt/kWh
                    </span>
                  </div>

                  {/* Middle grid line + label */}
                  <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, borderTop: '1px dashed rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center' }}>
                    <span style={{
                      fontSize: 9,
                      fontWeight: 600,
                      color: 'rgba(255,255,255,0.4)',
                      background: 'rgba(15, 23, 42, 0.85)',
                      padding: '1px 5px',
                      borderRadius: 3,
                      border: '1px solid rgba(255,255,255,0.06)',
                      transform: 'translateY(-50%)',
                    }}>
                      {midPlanPrice} snt
                    </span>
                  </div>

                  {/* Baseline / Min line */}
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center' }}>
                    <span style={{
                      fontSize: 9,
                      fontWeight: 600,
                      color: minPlanPrice < 0 ? '#f87171' : 'rgba(255,255,255,0.35)',
                      background: 'rgba(15, 23, 42, 0.85)',
                      padding: '1px 5px',
                      borderRadius: 3,
                      border: '1px solid rgba(255,255,255,0.06)',
                      transform: 'translateY(-50%)',
                    }}>
                      {minPlanPrice} snt
                    </span>
                  </div>
                </div>

                {displayPlan.map((slot) => {
                  const slotPrice = typeof slot?.price === 'number' && !isNaN(slot.price) ? slot.price : minPlanPrice;
                  const range = maxPlanPrice - minPlanPrice || 1;
                  const heightPct = Math.max(8, Math.min(100, (((slotPrice - minPlanPrice) / range) * 88) + 8));
                  const isNow = Date.now() >= slot.start_time && Date.now() < slot.end_time;
                  const isHovered = (hoveredSlot?.start_time === slot.start_time) || (selectedSlot?.start_time === slot.start_time);

                  let barGradient = 'linear-gradient(180deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.08) 100%)';
                  let barShadow = 'none';

                  if (slot.directive === 'BOOST') {
                    barGradient = 'linear-gradient(180deg, #34d399 0%, #059669 100%)';
                    barShadow = '0 0 8px rgba(52, 211, 153, 0.45)';
                  } else if (slot.is_dhw_slot || slot.directive === 'DHW_CYCLE') {
                    barGradient = 'linear-gradient(180deg, #38bdf8 0%, #0284c7 100%)';
                    barShadow = '0 0 8px rgba(56, 189, 248, 0.45)';
                  } else if (slot.directive === 'SETBACK') {
                    barGradient = 'linear-gradient(180deg, #f87171 0%, #dc2626 100%)';
                    barShadow = '0 0 8px rgba(248, 113, 113, 0.35)';
                  } else if (slot.directive === 'ECO') {
                    barGradient = 'linear-gradient(180deg, #fbbf24 0%, #d97706 100%)';
                  }

                  return (
                    <div
                      key={slot.start_time}
                      onMouseEnter={() => setHoveredSlot(slot)}
                      onClick={() => setSelectedSlot(selectedSlot?.start_time === slot.start_time ? null : slot)}
                      style={{
                        flex: 1,
                        minWidth: 4,
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'flex-end',
                        alignItems: 'center',
                        cursor: 'pointer',
                        position: 'relative',
                        zIndex: isHovered || isNow ? 10 : 1,
                      }}
                    >
                      {/* Sleek Modern Now Indicator */}
                      {isNow && (
                        <div
                          style={{
                            position: 'absolute',
                            top: 0,
                            bottom: 0,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            zIndex: 25,
                            pointerEvents: 'none',
                          }}
                        >
                          {/* Floating Pill Tag at Top */}
                          <div style={{
                            position: 'absolute',
                            top: 3,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            background: 'rgba(14, 165, 233, 0.95)',
                            border: '1px solid rgba(255, 255, 255, 0.45)',
                            boxShadow: '0 0 10px rgba(14, 165, 233, 0.75), 0 2px 4px rgba(0,0,0,0.5)',
                            borderRadius: 4,
                            padding: '1px 5px',
                            backdropFilter: 'blur(4px)',
                            whiteSpace: 'nowrap',
                          }}>
                            <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#fff', boxShadow: '0 0 4px #fff' }} />
                            <span style={{ fontSize: 9, fontWeight: 800, color: '#fff', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                              NYT
                            </span>
                          </div>

                          {/* Full-Height Luminous Laser Line */}
                          <div style={{
                            width: 1.5,
                            height: '100%',
                            background: 'linear-gradient(180deg, rgba(14, 165, 233, 0.9) 0%, rgba(14, 165, 233, 0.25) 100%)',
                            boxShadow: '0 0 6px rgba(14, 165, 233, 0.65)',
                          }} />
                        </div>
                      )}

                      {/* Bar Pillar */}
                      <div
                        style={{
                          width: '100%',
                          height: `${heightPct}%`,
                          background: barGradient,
                          borderRadius: '3px 3px 0 0',
                          opacity: isHovered ? 1 : isNow ? 1 : 0.85,
                          transform: isHovered ? 'scaleY(1.04) scaleX(1.15)' : 'none',
                          transformOrigin: 'bottom',
                          boxShadow: isHovered
                            ? (barShadow !== 'none' ? barShadow : '0 0 10px rgba(255,255,255,0.35)')
                            : isNow
                            ? '0 0 12px rgba(56, 189, 248, 0.6)'
                            : 'none',
                          outline: isHovered ? '1.5px solid #fff' : isNow ? '2px solid rgba(56, 189, 248, 0.95)' : 'none',
                          transition: 'transform 0.15s ease, opacity 0.15s ease, box-shadow 0.15s ease',
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {/* X-Axis Time Markers (Hours) */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 6,
              padding: '0 4px',
              fontSize: 10,
              color: 'var(--text-muted)',
              fontWeight: 500,
            }}>
              {timeTicks.map((tick) => (
                <span key={tick.time}>{tick.label}</span>
              ))}
            </div>
          </div>
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
                    e.preventDefault();
                    (e.target as HTMLElement).blur();
                  }
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  overflowY: 'auto',
                  flex: 1,
                  padding: '18px 20px',
                  gap: 16,
                }}
              >
                {/* Strategy Presets */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: 6 }}>
                    ⚡ Valitse valmis optimointistrategia:
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => applyPreset('compressor_save')}
                      className="btn btn-sm"
                      style={{
                        background: 'rgba(56, 189, 248, 0.12)',
                        border: '1px solid rgba(56, 189, 248, 0.35)',
                        color: '#38bdf8',
                        fontSize: 11,
                        padding: '6px 8px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 2,
                      }}
                      title="Lataa käyttöveden 55°C halvan sähkön aikana kompressorin säästämiseksi"
                    >
                      <span style={{ fontSize: 14 }}>🚀 Kompressorin säästö</span>
                      <span style={{ fontSize: 9, opacity: 0.8 }}>55°C lataus &lt; 3 snt</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('balanced')}
                      className="btn btn-sm"
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        color: 'var(--text-primary)',
                        fontSize: 11,
                        padding: '6px 8px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 2,
                      }}
                    >
                      <span style={{ fontSize: 14 }}>⚖️ Tasapaino</span>
                      <span style={{ fontSize: 9, opacity: 0.8 }}>Oletusasetukset</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('max_savings')}
                      className="btn btn-sm"
                      style={{
                        background: 'rgba(52, 211, 153, 0.12)',
                        border: '1px solid rgba(52, 211, 153, 0.35)',
                        color: '#34d399',
                        fontSize: 11,
                        padding: '6px 8px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 2,
                      }}
                    >
                      <span style={{ fontSize: 14 }}>🌱 Suuri säästö</span>
                      <span style={{ fontSize: 9, opacity: 0.8 }}>Syvät pudotukset</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('comfort')}
                      className="btn btn-sm"
                      style={{
                        background: 'rgba(245, 158, 11, 0.12)',
                        border: '1px solid rgba(245, 158, 11, 0.35)',
                        color: '#fbbf24',
                        fontSize: 11,
                        padding: '6px 8px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 2,
                      }}
                    >
                      <span style={{ fontSize: 14 }}>🛋️ Mukavuus</span>
                      <span style={{ fontSize: 9, opacity: 0.8 }}>Tasainen lämpö</span>
                    </button>
                  </div>
                </div>

                {/* Strategy highlight card */}
                <div style={{
                  background: 'rgba(56, 189, 248, 0.08)',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  borderRadius: 8,
                  padding: '10px 12px',
                  fontSize: 12,
                  lineHeight: 1.4,
                  color: '#bae6fd',
                }}>
                  💡 <strong>Käyttöveden kompressoristrategia:</strong> Kun sähkö on halpaa (≤ {cheapThresh} snt/kWh), käyttövesi ladataan {dhwBoostTarget} °C:een asti. Varaajaan varastoituu jopa 20 % enemmän lämpöä, jolloin lämpöpumppu tekee harvempia ja pidempiä käyntijaksoja, mikä pidentää kompressorin elinikää ja välttää kalliin sähkön jaksoja.
                </div>

                {/* Section: Käyttöveden ohjaus */}
                <div style={{ background: '#0d1322', padding: 14, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>
                        🚿 Käyttöveden lataus ja lämpötilat
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        Automaattinen lämpövarasto halvalle sähkölle
                      </div>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: dhwBoostOnCheap ? '#34d399' : 'var(--text-muted)' }}>
                      <input
                        type="checkbox"
                        checked={dhwBoostOnCheap}
                        onChange={(e) => setDhwBoostOnCheap(e.target.checked)}
                        style={{ cursor: 'pointer' }}
                      />
                      <span>{dhwBoostOnCheap ? 'Boost aktiivinen' : 'Vain peruslämpö'}</span>
                    </label>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, color: '#38bdf8', display: 'block', marginBottom: 4, fontWeight: 600 }}>
                        🔥 Halvan sähkön pyynti (°C)
                      </label>
                      <input
                        type="number"
                        min="50"
                        max="65"
                        value={dhwBoostTarget}
                        onChange={(e) => setDhwBoostTarget(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: '#1e293b', border: '1px solid rgba(56, 189, 248, 0.3)', color: '#fff', fontSize: 13, fontWeight: 600 }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                        ⚖️ Peruspyynti normaalihinnalla (°C)
                      </label>
                      <input
                        type="number"
                        min="45"
                        max="55"
                        value={dhwNormalTarget}
                        onChange={(e) => setDhwNormalTarget(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: 13 }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 11, color: '#f87171', display: 'block', marginBottom: 4 }}>
                        🛡️ Minimilämpötila / säästö (°C)
                      </label>
                      <input
                        type="number"
                        min="40"
                        max="50"
                        value={dhwMin}
                        onChange={(e) => setDhwMin(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: 13 }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                      Vuorokauden halvimman käyttövesijakson kesto (h)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="6"
                      value={dhwHours}
                      onChange={(e) => setDhwHours(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: 13 }}
                    />
                  </div>
                </div>

                {/* Section: Sähkön hintarajat */}
                <div style={{ background: '#0d1322', padding: 14, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', marginBottom: 8 }}>
                    ⚡ Sähkön hintarajat (Nord Pool)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 11, color: 'var(--online)', display: 'block', marginBottom: 4, fontWeight: 600 }}>
                        Halvan sähkön raja (snt/kWh)
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        value={cheapThresh}
                        onChange={(e) => setCheapThresh(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: '#1e293b', border: '1px solid rgba(52, 211, 153, 0.3)', color: '#fff', fontSize: 13, fontWeight: 600 }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 11, color: '#f87171', display: 'block', marginBottom: 4, fontWeight: 600 }}>
                        Hintahuipun raja (snt/kWh)
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        value={peakThresh}
                        onChange={(e) => setPeakThresh(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: '#1e293b', border: '1px solid rgba(248, 113, 113, 0.3)', color: '#fff', fontSize: 13, fontWeight: 600 }}
                      />
                    </div>
                  </div>
                </div>

                {/* Section: Puskurivaraajan säätö */}
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
                    <span>+3°C (Suositus)</span>
                    <span>+5°C</span>
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
                    <span>-2°C (Suositus)</span>
                    <span>-1°C (Kevyt)</span>
                  </div>
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
