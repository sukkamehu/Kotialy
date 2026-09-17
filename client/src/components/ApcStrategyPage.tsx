import { useState, useEffect } from 'react';
import { useApc } from '../hooks/useApc';
import type { ApcMode } from '../types/apc';

interface ApcStrategyPageProps {
  readOnly?: boolean;
}

const STRATEGY_DETAILS: Record<ApcMode, {
  label: string;
  badge: string;
  icon: string;
  shortDesc: string;
  fullDesc: string;
  pros: string[];
  idealFor: string;
}> = {
  balanced: {
    label: 'Tasapainoinen (Suositus)',
    badge: 'Optimaalinen COP & säästöt',
    icon: '⚖️',
    shortDesc: 'Esilämmittää halvoilla tunneilla ja säästää maltillisesti kalliissa huipuissa.',
    fullDesc: 'Tasapainotila optimoi sekä kompressorin hyötysuhteen (COP) että sähkölaskun. Vaatii vähintään 2,5 snt/kWh hintaeron ennen lämpötilan siirtämistä, jotta kompressorin Carnot-häviöt eivät ylitä sähkösäästöä.',
    pros: [
      'Paras pitkän aikavälin kompromissi sähkölaskun ja asumismukavuuden välillä',
      'Ei turhaa pumppaamista silloin kun pörssihinta on tasainen',
      'Käyttövesi ladataan vuorokauden 2 halvimpana tuntina 55 °C:een',
    ],
    idealFor: 'Lattialämmitystalot ja varaajalliset järjestelmät peruskäyttöön.',
  },
  eco: {
    label: 'Maksimaalinen Säästö',
    badge: 'Aggressiivinen hintaseuranta',
    icon: '🌱',
    shortDesc: 'Maksimaalinen pörssisähkön hyödyntäminen: syvemmät pudotukset ja korkeammat lataukset.',
    fullDesc: 'Reagoi herkemmin pieniinkin hintaeroihin (jo 1,8 snt/kWh erolla). Pudottaa menovettä voimakkaammin kalliilla tunneilla ja lataa laattaan maksimilämmön halvoilla tunneilla.',
    pros: [
      'Pienin mahdollinen sähkölasku',
      'Hyödyntää betonilaatan massiivisen varaavuuden 100 %',
      'Käyttövesi ajetaan minimiin kalliilla tunneilla',
    ],
    idealFor: 'Paksulaattaiset talot, kun halutaan puristaa sähkölasku minimiin.',
  },
  comfort: {
    label: 'Mukavuus',
    badge: 'Tasainen huonelämpö',
    icon: '🛋️',
    shortDesc: 'Ensisijainen lämmön tasaisuus pienellä edullisten tuntien hyödyntämisellä.',
    fullDesc: 'Pitää talon lämmön erittäin vakaana. Tekee vain maltillisia esilämmityksiä ja hyvin loivia säästöpudotuksia vain silloin kun hintaero on suuri (yli 3,5 snt/kWh).',
    pros: [
      'Huonelämpötila pysyy täysin huomaamattoman tasaisena',
      'Ei riskiä lattian viilenemisestä pitkienkään huippujen aikana',
      'Käyttövesi pidetään aina vähintään 46 °C:ssa',
    ],
    idealFor: 'Kevyemmät rakenteet tai kun perheessä arvostetaan tasaista lämpöä.',
  },
  dhw_only: {
    label: 'Vain Käyttövesi',
    badge: 'Huonelämpö vakiona',
    icon: '🚿',
    shortDesc: 'Ohjaa ainoastaan käyttövesivaraajan lämmityksen vuorokauden halvimpaan jaksoon.',
    fullDesc: 'Lattialämmitys toimii peruskäyrällä ilman pörssijoustoa. Ainoastaan suihkuvesivaraaja ajoitetaan vuorokauden halvimmille pörssitunneille.',
    pros: [
      'Huonelämmitys ei koskaan muutu',
      'Käyttövesi ladataan edullisesti yöllä',
    ],
    idealFor: 'Kesäkausi tai kun huonelämmitykseen ei haluta minkäänlaista pörssiohjausta.',
  },
};

export function ApcStrategyPage({ readOnly = false }: ApcStrategyPageProps) {
  const {
    status,
    logs,
    saving,
    toggleEnabled,
    setMode,
    updateSettings,
  } = useApc();

  // Settings form draft state
  const [bufferBoost, setBufferBoost] = useState<number>(status?.settings?.buffer_boost_c ?? 3);
  const [bufferSetback, setBufferSetback] = useState<number>(status?.settings?.buffer_setback_c ?? -2);
  const [dhwBoostTarget, setDhwBoostTarget] = useState<string>(String(status?.settings?.dhw_boost_target_c ?? 55));
  const [dhwNormalTarget, setDhwNormalTarget] = useState<string>(String(status?.settings?.dhw_normal_target_c ?? 50));
  const [dhwMin, setDhwMin] = useState<string>(String(status?.settings?.dhw_min_c ?? 45));
  const [dhwBoostOnCheap, setDhwBoostOnCheap] = useState<boolean>(status?.settings?.dhw_boost_on_cheap ?? true);
  const [cheapThresh, setCheapThresh] = useState<string>(String(status?.settings?.cheap_threshold_cents ?? 3.0));
  const [peakThresh, setPeakThresh] = useState<string>(String(status?.settings?.peak_threshold_cents ?? 20.0));
  const [dhwHours, setDhwHours] = useState<string>(String(status?.settings?.dhw_duration_hours ?? 2));
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (status?.settings) {
      setBufferBoost(status.settings.buffer_boost_c ?? 3);
      setBufferSetback(status.settings.buffer_setback_c ?? -2);
      setDhwBoostTarget(String(status.settings.dhw_boost_target_c ?? 55));
      setDhwNormalTarget(String(status.settings.dhw_normal_target_c ?? 50));
      setDhwMin(String(status.settings.dhw_min_c ?? 45));
      setDhwBoostOnCheap(status.settings.dhw_boost_on_cheap !== false);
      setCheapThresh(String(status.settings.cheap_threshold_cents ?? 3.0));
      setPeakThresh(String(status.settings.peak_threshold_cents ?? 20.0));
      setDhwHours(String(status.settings.dhw_duration_hours ?? 2));
    }
  }, [status?.settings]);

  const applyPreset = (type: 'balanced' | 'max_savings' | 'comfort' | 'compressor_save') => {
    if (type === 'balanced') {
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
      setDhwBoostTarget('57');
      setDhwNormalTarget('48');
      setDhwMin('42');
      setDhwBoostOnCheap(true);
      setBufferBoost(4);
      setBufferSetback(-3);
      setDhwHours('2');
    } else if (type === 'comfort') {
      setCheapThresh('4.0');
      setPeakThresh('25.0');
      setDhwBoostTarget('53');
      setDhwNormalTarget('50');
      setDhwMin('46');
      setDhwBoostOnCheap(false);
      setBufferBoost(2);
      setBufferSetback(-1);
      setDhwHours('2');
    } else if (type === 'compressor_save') {
      setCheapThresh('3.0');
      setPeakThresh('20.0');
      setDhwBoostTarget('52');
      setDhwNormalTarget('48');
      setDhwMin('45');
      setDhwBoostOnCheap(true);
      setBufferBoost(2);
      setBufferSetback(-2);
      setDhwHours('2');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
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
    if (ok) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    }
  };

  const activeMode = status?.mode ?? 'balanced';
  const isEnabled = status?.enabled ?? true;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1200, margin: '0 auto' }}>
      {/* Top Banner */}
      <div className="card apc-card" style={{ padding: '24px', background: 'var(--card-bg, #1a1e29)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(59, 130, 246, 0.2))',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 26,
            }}>
              ⚡
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
                  APC Älykäs Pörssiohjaus – Strategia & Asetukset
                </h1>
                <span style={{
                  padding: '3px 10px',
                  borderRadius: 100,
                  fontSize: 12,
                  fontWeight: 700,
                  background: isEnabled ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.2)',
                  color: isEnabled ? '#10b981' : '#f43f5e',
                  border: isEnabled ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(244, 63, 94, 0.4)',
                }}>
                  {isEnabled ? '● Aktiivinen' : '○ Pois päältä'}
                </span>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
                Optatoi Panasonic Aquarea -lämpöpumpun toimintaa Nord Pool -pörssisähkön, Yösiirron ja sääennusteen mukaan.
              </p>
            </div>
          </div>

          {!readOnly && (
            <button
              onClick={() => toggleEnabled()}
              disabled={saving}
              className={`btn ${isEnabled ? 'btn-ghost' : 'btn-primary'}`}
              style={{
                padding: '8px 18px',
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 10,
                cursor: 'pointer',
              }}
            >
              {isEnabled ? '⏸️ Kytke APC pois päältä' : '▶️ Ota APC käyttöön'}
            </button>
          )}
        </div>
      </div>

      {/* Section 1: Active Strategy Profiles */}
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
            1. Valitse toimintastrategia
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            Strategia määrittää, kuinka herkästi ja aggressiivisesti järjestelmä reagoi pörssisähkön hintavaihteluihin.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 14,
        }}>
          {(Object.keys(STRATEGY_DETAILS) as ApcMode[]).map((modeKey) => {
            const info = STRATEGY_DETAILS[modeKey];
            const isSelected = activeMode === modeKey;
            return (
              <div
                key={modeKey}
                onClick={() => !readOnly && setMode(modeKey)}
                style={{
                  padding: '18px',
                  borderRadius: 12,
                  border: isSelected ? '2px solid #f59e0b' : '1px solid rgba(255,255,255,0.08)',
                  background: isSelected ? 'rgba(245, 158, 11, 0.08)' : 'rgba(255,255,255,0.02)',
                  cursor: readOnly ? 'default' : 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 22 }}>{info.icon}</span>
                    <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {info.label}
                    </span>
                  </div>
                  {isSelected && (
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: 6,
                      background: '#f59e0b',
                      color: '#000',
                      fontSize: 11,
                      fontWeight: 800,
                    }}>
                      VALITTU
                    </span>
                  )}
                </div>

                <div style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600 }}>
                  {info.badge}
                </div>

                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  {info.shortDesc}
                </div>

                <div style={{
                  marginTop: 'auto',
                  paddingTop: 10,
                  borderTop: '1px solid rgba(255,255,255,0.05)',
                  fontSize: 11,
                  color: 'var(--text-muted)',
                }}>
                  🎯 <strong>Suositus:</strong> {info.idealFor}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 2: Detailed Parameters Editor */}
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
              2. Hienosäädä parametrit ja raja-arvot
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
              Määritä lattialämmityksen ja käyttöveden tarkat siirrot sekä pörssisähkön halpuus- ja huippurajat.
            </p>
          </div>

          {/* Quick Preset Buttons */}
          {!readOnly && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 4 }}>Pika-asetukset:</span>
              <button
                type="button"
                onClick={() => applyPreset('balanced')}
                className="segmented-btn"
                style={{ padding: '5px 10px', fontSize: 11, borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                ⚖️ Tasapaino
              </button>
              <button
                type="button"
                onClick={() => applyPreset('max_savings')}
                className="segmented-btn"
                style={{ padding: '5px 10px', fontSize: 11, borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                🌱 Maks. säästö
              </button>
              <button
                type="button"
                onClick={() => applyPreset('comfort')}
                className="segmented-btn"
                style={{ padding: '5px 10px', fontSize: 11, borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                🛋️ Mukavuus
              </button>
            </div>
          )}
        </div>

        <form onSubmit={handleSave}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
            {/* Column A: Lattialämmitys & Puskuri */}
            <div style={{
              padding: '18px',
              borderRadius: 12,
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 10 }}>
                <span style={{ fontSize: 20 }}>🔥</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Lattialämmitys & Puskurivaraaja
                </span>
              </div>

              {/* Buffer Boost */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#f59e0b' }}>
                    🔥 Esilämmitys / Boost (Halvat tunnit)
                  </label>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#f59e0b' }}>
                    +{bufferBoost} °C
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  step="1"
                  value={bufferBoost}
                  onChange={(e) => setBufferBoost(Number(e.target.value))}
                  disabled={readOnly}
                  style={{ width: '100%', accentColor: '#f59e0b', cursor: 'pointer' }}
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Nostaa menoveden tavoitetta halvan sähkön aikana varaamaan lämpöä laattaan.
                </div>
              </div>

              {/* Buffer Setback */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#38bdf8' }}>
                    ❄️ Säästöpudotus / Setback (Kalliit tunnit)
                  </label>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#38bdf8' }}>
                    {bufferSetback} °C
                  </span>
                </div>
                <input
                  type="range"
                  min="-5"
                  max="-1"
                  step="1"
                  value={bufferSetback}
                  onChange={(e) => setBufferSetback(Number(e.target.value))}
                  disabled={readOnly}
                  style={{ width: '100%', accentColor: '#38bdf8', cursor: 'pointer' }}
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Laskee menoveden tavoitetta hintahuippujen aikana sähkön säästämiseksi.
                </div>
              </div>
            </div>

            {/* Column B: Käyttövesi (LKV) */}
            <div style={{
              padding: '18px',
              borderRadius: 12,
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 10 }}>
                <span style={{ fontSize: 20 }}>🚿</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Käyttöveden (LKV) Pörssilataus
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    Halvan sähkön lataus (°C)
                  </label>
                  <input
                    type="number"
                    value={dhwBoostTarget}
                    onChange={(e) => setDhwBoostTarget(e.target.value)}
                    disabled={readOnly}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#f59e0b',
                      fontSize: 14,
                      fontWeight: 700,
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    Minimilämpötila säästössä (°C)
                  </label>
                  <input
                    type="number"
                    value={dhwMin}
                    onChange={(e) => setDhwMin(e.target.value)}
                    disabled={readOnly}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#10b981',
                      fontSize: 14,
                      fontWeight: 700,
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    Normaali peruspyynti (°C)
                  </label>
                  <input
                    type="number"
                    value={dhwNormalTarget}
                    onChange={(e) => setDhwNormalTarget(e.target.value)}
                    disabled={readOnly}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: 'var(--text-primary)',
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    Latausjakson kesto (tuntia)
                  </label>
                  <input
                    type="number"
                    value={dhwHours}
                    onChange={(e) => setDhwHours(e.target.value)}
                    disabled={readOnly}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: 'var(--text-primary)',
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  />
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={dhwBoostOnCheap}
                  onChange={(e) => setDhwBoostOnCheap(e.target.checked)}
                  disabled={readOnly}
                  style={{ width: 16, height: 16, accentColor: '#10b981' }}
                />
                Lataa käyttövesi kuumaksi aina kun pörssisähkö on halpaa
              </label>
            </div>

            {/* Column C: Pörssisähkön kynnysarvot */}
            <div style={{
              padding: '18px',
              borderRadius: 12,
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 10 }}>
                <span style={{ fontSize: 20 }}>📊</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Hintarajat & Yösiirtoprioriteetti
                </span>
              </div>

              <div>
                <label style={{ fontSize: 11, color: '#10b981', display: 'block', marginBottom: 4, fontWeight: 600 }}>
                  Erittäin halvan sähkön raja (snt/kWh)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={cheapThresh}
                  onChange={(e) => setCheapThresh(e.target.value)}
                  disabled={readOnly}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#10b981',
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Tämän alittuessa pumppu käynnistää aina esilämmityksen ja teholatauksen.
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, color: '#f43f5e', display: 'block', marginBottom: 4, fontWeight: 600 }}>
                  Hintahuipun raja (snt/kWh)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={peakThresh}
                  onChange={(e) => setPeakThresh(e.target.value)}
                  disabled={readOnly}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#f43f5e',
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Tämän ylittyessä siirrytään aina välittömästi säästötilaan (Setback).
                </div>
              </div>
            </div>
          </div>

          {/* Action Bar */}
          {!readOnly && (
            <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }}>
              {saveSuccess && (
                <span style={{ fontSize: 13, color: '#10b981', fontWeight: 700 }}>
                  ✓ Asetukset tallennettu ja otettu käyttöön!
                </span>
              )}
              <button
                type="submit"
                disabled={saving}
                className="btn btn-primary"
                style={{
                  padding: '10px 24px',
                  fontSize: 14,
                  fontWeight: 700,
                  borderRadius: 10,
                  cursor: 'pointer',
                }}
              >
                {saving ? 'Tallennetaan...' : '💾 Tallenna APC-asetukset'}
              </button>
            </div>
          )}
        </form>
      </div>

      {/* Section 3: Live Decision Log Table */}
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
            3. APC Päätösloki & Reaaliaikaiset toimenpiteet
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            Loki näyttää, miksi Kotiäly on tehnyt minkäkin ohjauspäätöksen (Spot-hinta, varaajan tila, sääennuste).
          </p>
        </div>

        <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <th style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontWeight: 600, width: 140 }}>Aika</th>
                <th style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontWeight: 600, width: 130 }}>Direktiivi</th>
                <th style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontWeight: 600 }}>Perustelu & Syy</th>
                <th style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontWeight: 600, width: 110 }}>Pörssihinta</th>
                <th style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontWeight: 600, width: 100 }}>Ulkoilma</th>
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
                logs.slice(0, 20).map((log, idx) => (
                  <tr
                    key={log.id || idx}
                    style={{
                      borderBottom: idx < logs.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                      background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                    }}
                  >
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12 }}>
                      {new Date(log.timestamp).toLocaleString('fi-FI', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        padding: '3px 8px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        background: log.directive === 'BOOST' ? 'rgba(245, 158, 11, 0.2)' : log.directive === 'SETBACK' ? 'rgba(56, 189, 248, 0.2)' : log.directive === 'DHW_CYCLE' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.08)',
                        color: log.directive === 'BOOST' ? '#f59e0b' : log.directive === 'SETBACK' ? '#38bdf8' : log.directive === 'DHW_CYCLE' ? '#10b981' : 'var(--text-secondary)',
                      }}>
                        {log.directive}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-primary)' }}>
                      {log.reason || log.action}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#facc15', fontWeight: 600, fontSize: 12 }}>
                      {log.price_cents != null ? `${log.price_cents.toFixed(2)} snt` : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#38bdf8', fontSize: 12 }}>
                      {log.outdoor_temp != null ? `${log.outdoor_temp.toFixed(1)} °C` : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
