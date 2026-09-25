import { useState, useEffect } from 'react';
import { useApc } from '../hooks/useApc';
import { apiFetch } from '../lib/api';
import type { ApcMode } from '../types/apc';
import type { CostSettings } from '../types/costs';

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
    setFloorPumpOverride,
    setFloorPumpMode: setFloorPumpModeApi,
  } = useApc();

  // APC Settings form draft state
  const [bufferBoost, setBufferBoost] = useState<number>(status?.settings?.buffer_boost_c ?? 3);
  const [bufferSetback, setBufferSetback] = useState<number>(status?.settings?.buffer_setback_c ?? -2);
  const [dhwBoostTarget, setDhwBoostTarget] = useState<string>(String(status?.settings?.dhw_boost_target_c ?? 55));
  const [dhwNormalTarget, setDhwNormalTarget] = useState<string>(String(status?.settings?.dhw_normal_target_c ?? 50));
  const [dhwMin, setDhwMin] = useState<string>(String(status?.settings?.dhw_min_c ?? 45));
  const [dhwBoostOnCheap, setDhwBoostOnCheap] = useState<boolean>(status?.settings?.dhw_boost_on_cheap ?? true);
  const [cheapThresh, setCheapThresh] = useState<string>(String(status?.settings?.cheap_threshold_cents ?? 3.0));
  const [peakThresh, setPeakThresh] = useState<string>(String(status?.settings?.peak_threshold_cents ?? 20.0));
  const [dhwHours, setDhwHours] = useState<string>(String(status?.settings?.dhw_duration_hours ?? 2));
  const [heatingCutoff, setHeatingCutoff] = useState<string>(String(status?.settings?.heating_cutoff_c ?? 13));
  const [preventCurveShift, setPreventCurveShift] = useState<boolean>(status?.settings?.prevent_curve_shift_above_cutoff !== false);
  const [quietAutoEnabled, setQuietAutoEnabled] = useState<boolean>(status?.settings?.quiet_mode_auto_enabled !== false);
  const [quiet3Temp, setQuiet3Temp] = useState<string>(String(status?.settings?.quiet_mode_level_3_temp ?? 3.0));
  const [quiet2Temp, setQuiet2Temp] = useState<string>(String(status?.settings?.quiet_mode_level_2_temp ?? 0.0));
  const [quiet1Temp, setQuiet1Temp] = useState<string>(String(status?.settings?.quiet_mode_level_1_temp ?? -5.0));
  const [floorPumpMode, setFloorPumpModeState] = useState<'auto' | 'constant_on' | 'constant_off'>('auto');
  const [floorPumpCutoff, setFloorPumpCutoff] = useState<string>('20.0');
  const [floorPumpSummerPulse, setFloorPumpSummerPulse] = useState<boolean>(true);
  const [floorPumpAntiSeize, setFloorPumpAntiSeize] = useState<boolean>(true);
  const [floorPumpOverrideDuration, setFloorPumpOverrideDuration] = useState<number>(0);
  const [smartCyclingEnabled, setSmartCyclingEnabled] = useState<boolean>(status?.settings?.smart_cycling_enabled !== false);
  const [smartCyclingBoost, setSmartCyclingBoost] = useState<string>(String(status?.settings?.smart_cycling_charge_boost_c ?? 3.0));
  const [smartCyclingMinRest, setSmartCyclingMinRest] = useState<string>(String(status?.settings?.smart_cycling_min_rest_min ?? 60));
  const [smartCyclingRestSetback, setSmartCyclingRestSetback] = useState<string>(String(status?.settings?.smart_cycling_rest_setback_c ?? -2.0));
  const [smartCyclingMaxRun, setSmartCyclingMaxRun] = useState<string>(String(status?.settings?.smart_cycling_max_run_min ?? 75));
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Sähkösopimus & Siirtohinnat state
  const [transferMode, setTransferMode] = useState<'day_night' | 'flat'>('day_night');
  const [transferDay, setTransferDay] = useState<string>('5.11');
  const [transferNight, setTransferNight] = useState<string>('3.12');
  const [transferFlat, setTransferFlat] = useState<string>('4.50');
  const [margin, setMargin] = useState<string>('0.286');
  const [savingCosts, setSavingCosts] = useState(false);
  const [costsSuccess, setCostsSuccess] = useState(false);

  const fetchCostSettings = async () => {
    try {
      const res = await apiFetch('/api/costs/settings');
      if (res.ok) {
        const data = await res.json();
        const s: CostSettings | undefined = data.settings;
        if (s) {
          setTransferMode(s.transfer_mode === 'flat' ? 'flat' : 'day_night');
          setTransferDay(String(s.transfer_day_cents_kwh ?? '5.11'));
          setTransferNight(String(s.transfer_night_cents_kwh ?? '3.12'));
          setTransferFlat(String(s.transfer_cents_kwh ?? '4.50'));
          setMargin(String(s.margin_cents_kwh ?? '0.286'));
        }
      }
    } catch (err) {
      console.error('Failed to load cost settings', err);
    }
  };

  useEffect(() => {
    fetchCostSettings();
  }, []);

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
      setHeatingCutoff(String(status.settings.heating_cutoff_c ?? 13));
      setPreventCurveShift(status.settings.prevent_curve_shift_above_cutoff !== false);
      setQuietAutoEnabled(status.settings.quiet_mode_auto_enabled !== false);
      setQuiet3Temp(String(status.settings.quiet_mode_level_3_temp ?? 3.0));
      setQuiet2Temp(String(status.settings.quiet_mode_level_2_temp ?? 0.0));
      setQuiet1Temp(String(status.settings.quiet_mode_level_1_temp ?? -5.0));
      setFloorPumpModeState(status.settings.floor_pump_mode ?? 'auto');
      setFloorPumpCutoff(String(status.settings.floor_pump_summer_cutoff_temp ?? 20.0));
      setFloorPumpSummerPulse(status.settings.floor_pump_summer_pulse_enabled !== false);
      setFloorPumpAntiSeize(status.settings.floor_pump_anti_seize_enabled !== false);
      setSmartCyclingEnabled(status.settings.smart_cycling_enabled !== false);
      setSmartCyclingBoost(String(status.settings.smart_cycling_charge_boost_c ?? 3.0));
      setSmartCyclingMinRest(String(status.settings.smart_cycling_min_rest_min ?? 60));
      setSmartCyclingRestSetback(String(status.settings.smart_cycling_rest_setback_c ?? -2.0));
      setSmartCyclingMaxRun(String(status.settings.smart_cycling_max_run_min ?? 75));
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
    if (readOnly) return;
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
      heating_cutoff_c: parseFloat(heatingCutoff) || 13,
      prevent_curve_shift_above_cutoff: Boolean(preventCurveShift),
      quiet_mode_auto_enabled: Boolean(quietAutoEnabled),
      quiet_mode_level_3_temp: parseFloat(quiet3Temp) || 3.0,
      quiet_mode_level_2_temp: parseFloat(quiet2Temp) || 0.0,
      quiet_mode_level_1_temp: parseFloat(quiet1Temp) || -5.0,
      floor_pump_mode: floorPumpMode,
      floor_pump_summer_cutoff_temp: parseFloat(floorPumpCutoff) || 20.0,
      floor_pump_summer_pulse_enabled: Boolean(floorPumpSummerPulse),
      floor_pump_anti_seize_enabled: Boolean(floorPumpAntiSeize),
      smart_cycling_enabled: Boolean(smartCyclingEnabled),
      smart_cycling_charge_boost_c: parseFloat(smartCyclingBoost) || 3.0,
      smart_cycling_min_rest_min: parseInt(smartCyclingMinRest, 10) || 60,
      smart_cycling_rest_setback_c: parseFloat(smartCyclingRestSetback) || -2.0,
      smart_cycling_max_run_min: parseInt(smartCyclingMaxRun, 10) || 75,
    });
    if (ok) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    }
  };

  const handleSaveCosts = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCosts(true);
    try {
      const res = await apiFetch('/api/costs/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transfer_mode: transferMode,
          transfer_day_cents_kwh: parseFloat(transferDay) || 5.11,
          transfer_night_cents_kwh: parseFloat(transferNight) || 3.12,
          transfer_cents_kwh: parseFloat(transferFlat) || 4.50,
          margin_cents_kwh: parseFloat(margin) || 0.286,
        }),
      });
      if (res.ok) {
        setCostsSuccess(true);
        setTimeout(() => setCostsSuccess(false), 2500);
      }
    } catch (err) {
      console.error('Failed to save electricity contract settings', err);
    } finally {
      setSavingCosts(false);
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
                  APC Älykäs Pörssiohjaus & Sähkösopimus
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
                Optatoi Panasonic Aquarea -lämpöpumpun toimintaa Nord Pool -pörssisähkön, sähkön siirtohintojen ja sääennusteen mukaan.
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

      {/* Section 1: Sähkösopimus & Siirtohinnat */}
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
              1. Sähkösopimus & Siirtohinnat (Tariffit)
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
              Tallenna sähköverkkoyhtiösi siirtohinnat ja pörssisähkön marginaali. Kotiäly optimoi lämmityksen kokonaishinnan mukaan.
            </p>
          </div>
          <div style={{
            padding: '6px 12px',
            borderRadius: 8,
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            fontSize: 12,
            color: '#60a5fa',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <span>💡</span> Yösiirron etu: <strong>-1,99 snt/kWh</strong> (22:00–07:00)
          </div>
        </div>

        <form onSubmit={handleSaveCosts}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {/* Siirtotuotteen valinta */}
            <div style={{
              padding: '16px',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🔌</span> Siirtotuotteen tyyppi
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => !readOnly && setTransferMode('day_night')}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    border: transferMode === 'day_night' ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
                    background: transferMode === 'day_night' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.02)',
                    color: transferMode === 'day_night' ? '#60a5fa' : 'var(--text-secondary)',
                    cursor: readOnly ? 'default' : 'pointer',
                  }}
                >
                  🌙 Yösiirto (Aikasähkö)
                </button>
                <button
                  type="button"
                  onClick={() => !readOnly && setTransferMode('flat')}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    border: transferMode === 'flat' ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
                    background: transferMode === 'flat' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.02)',
                    color: transferMode === 'flat' ? '#60a5fa' : 'var(--text-secondary)',
                    cursor: readOnly ? 'default' : 'pointer',
                  }}
                >
                  ⚡ Yleissiirto (Yksiaikainen)
                </button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {transferMode === 'day_night'
                  ? 'Päivä ma–su klo 07–22, Yö ma–su klo 22–07.'
                  : 'Sama siirtohinta vuorokauden ympäri.'}
              </div>
            </div>

            {/* Siirtohinnat */}
            <div style={{
              padding: '16px',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>💰</span> Siirtomaksut (sis. ALV)
              </label>

              {transferMode === 'day_night' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                      Päiväsiirto (snt/kWh)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={transferDay}
                      onChange={(e) => setTransferDay(e.target.value)}
                      disabled={readOnly}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: 8,
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: 'var(--text-primary)',
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#38bdf8', display: 'block', marginBottom: 4 }}>
                      Yösiirto (snt/kWh)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={transferNight}
                      onChange={(e) => setTransferNight(e.target.value)}
                      disabled={readOnly}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: 8,
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#38bdf8',
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    Siirtohinta (snt/kWh)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={transferFlat}
                    onChange={(e) => setTransferFlat(e.target.value)}
                    disabled={readOnly}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 8,
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: 'var(--text-primary)',
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  />
                </div>
              )}
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Yösiirto 3,12 snt/kWh, Päiväsiirto 5,11 snt/kWh (sis. sähköveron ja alv 25,5 %).
              </div>
            </div>

            {/* Pörssisähkön marginaali (sis. alv) */}
            <div style={{
              padding: '16px',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>📈</span> Marginaali (snt/kWh, sis. alv)
              </label>

              <div>
                <label style={{ fontSize: 11, color: '#f59e0b', display: 'block', marginBottom: 4 }}>
                  Pörssisähkön marginaali (snt/kWh)
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={margin}
                  onChange={(e) => setMargin(e.target.value)}
                  disabled={readOnly}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#f59e0b',
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Kaikki hinnat (siirto, marginaali, pörssihinta) syötetään suoraan loppuhintoina sisältäen arvonlisäveron.
              </div>
            </div>
          </div>

          {!readOnly && (
            <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }}>
              {costsSuccess && (
                <span style={{ fontSize: 13, color: '#10b981', fontWeight: 700 }}>
                  ✓ Sähkösopimuksen ja siirron hinnat päivitetty!
                </span>
              )}
              <button
                type="submit"
                disabled={savingCosts}
                className="btn btn-primary"
                style={{
                  padding: '8px 20px',
                  fontSize: 13,
                  fontWeight: 700,
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                {savingCosts ? 'Tallennetaan...' : '💾 Tallenna sähkösopimus'}
              </button>
            </div>
          )}
        </form>
      </div>

      {/* Section 2: Active Strategy Profiles */}
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
            2. Valitse toimintastrategia
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

      {/* Section 3: Detailed Parameters Editor */}
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
              3. Hienosäädä parametrit ja raja-arvot
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

            {/* Column D: Kesätila & Lämmityksen Katkaisuraja */}
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
                <span style={{ fontSize: 20 }}>☀️</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Kesätila & Lämmityksen Katkaisuraja
                </span>
              </div>

              <div>
                <label style={{ fontSize: 11, color: '#38bdf8', display: 'block', marginBottom: 4, fontWeight: 600 }}>
                  Lämmityksen katkaisuraja (°C)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={heatingCutoff}
                  onChange={(e) => setHeatingCutoff(e.target.value)}
                  disabled={readOnly}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#38bdf8',
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Estää huone- ja lattialämmityksen käynnistymisen, kun ulkona on tätä lämpimämpää.
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}>
                  <input
                    type="checkbox"
                    checked={preventCurveShift}
                    onChange={(e) => setPreventCurveShift(e.target.checked)}
                    disabled={readOnly}
                    style={{ width: 16, height: 16, marginTop: 2, accentColor: '#10b981' }}
                  />
                  <span>
                    <strong style={{ color: 'var(--text-primary)' }}>Estä APC-käyränsiirto (Boost)</strong> kun ulkolämpötila ylittää katkaisurajan
                  </span>
                </label>
              </div>
            </div>

            {/* Column: Automaattinen Quiet Mode (Hiljainen tila / Pätkäkäynnin esto) */}
            <div style={{
              padding: '18px',
              borderRadius: 12,
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(168, 85, 247, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 20 }}>🤫</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                    Hiljainen tila (Quiet Mode -ohjaus)
                  </span>
                </div>
                <span className="badge" style={{ fontSize: 10, padding: '2px 8px', background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
                  9 kW T-CAP optimi
                </span>
              </div>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={quietAutoEnabled}
                  onChange={(e) => setQuietAutoEnabled(e.target.checked)}
                  disabled={readOnly}
                  style={{ width: 16, height: 16, marginTop: 2, accentColor: '#a855f7' }}
                />
                <span>
                  <strong style={{ color: 'var(--text-primary)' }}>Automaattinen Quiet Mode ulkolämpötilan mukaan</strong>: Rajoittaa kompressorin kierrosnopeutta ja estää tehon ryntäämisen leudoilla keleillä (poistaa pätkäkäynnin ja parantaa COP:ta).
                </span>
              </label>

              {quietAutoEnabled && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 4 }}>
                  <div>
                    <label style={{ fontSize: 11, color: '#c084fc', display: 'block', marginBottom: 4, fontWeight: 600 }}>
                      Quiet 3 raja (°C)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={quiet3Temp}
                      onChange={(e) => setQuiet3Temp(e.target.value)}
                      disabled={readOnly}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: 8,
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#c084fc',
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    />
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                      ≥ {quiet3Temp}°C → Taso 3 (leuto sää, min. taajuus)
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 11, color: '#38bdf8', display: 'block', marginBottom: 4, fontWeight: 600 }}>
                      Quiet 2 raja (°C)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={quiet2Temp}
                      onChange={(e) => setQuiet2Temp(e.target.value)}
                      disabled={readOnly}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: 8,
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#38bdf8',
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    />
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                      {quiet2Temp}°C ... {quiet3Temp}°C → Taso 2
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 11, color: '#34d399', display: 'block', marginBottom: 4, fontWeight: 600 }}>
                      Quiet 1 raja (°C)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={quiet1Temp}
                      onChange={(e) => setQuiet1Temp(e.target.value)}
                      disabled={readOnly}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: 8,
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#34d399',
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    />
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                      {quiet1Temp}°C ... {quiet2Temp}°C → Taso 1 (alle {quiet1Temp}°C → Pois/Täysi teho)
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Column: Älykäs puskurisyklaus (Pätkäkäynnin esto / Syvä puskurin lataus) */}
            <div style={{
              padding: '18px',
              borderRadius: 12,
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(14, 165, 233, 0.3)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 20 }}>🔄</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                    Älykäs puskurisyklaus
                  </span>
                </div>
                <span className="badge" style={{ fontSize: 10, padding: '2px 8px', background: 'rgba(14, 165, 233, 0.15)', color: '#38bdf8', border: '1px solid rgba(14, 165, 233, 0.3)' }}>
                  Pätkäkäynnin esto
                </span>
              </div>

              {/* Live Cycling Status Box */}
              {(() => {
                const panasonic = status?.devices?.find(d => d.driver === 'panasonic');
                const phase = panasonic?.cyclingPhase || 'IDLE';
                const chargeStartedAt = panasonic?.chargeStartedAt || 0;
                const restStartedAt = panasonic?.restStartedAt || 0;
                const lastCycleMin = panasonic?.lastCycleDurationMin;
                const lastRestMin = panasonic?.lastRestDurationMin;
                const now = Date.now();

                const chargeElapsedMin = chargeStartedAt > 0 ? Math.floor((now - chargeStartedAt) / 60000) : 0;
                const restElapsedMin = restStartedAt > 0 ? Math.floor((now - restStartedAt) / 60000) : 0;
                const minRest = parseInt(smartCyclingMinRest, 10) || 60;
                const restRemainingMin = Math.max(0, minRest - restElapsedMin);

                const isCharging = phase === 'CHARGING';
                const isResting = phase === 'RESTING';

                return (
                  <div style={{
                    background: isCharging
                      ? 'rgba(34, 197, 94, 0.1)'
                      : isResting
                      ? 'rgba(59, 130, 246, 0.1)'
                      : 'rgba(255, 255, 255, 0.03)',
                    border: isCharging
                      ? '1px solid rgba(34, 197, 94, 0.3)'
                      : isResting
                      ? '1px solid rgba(59, 130, 246, 0.3)'
                      : '1px solid rgba(255, 255, 255, 0.07)',
                    borderRadius: 10,
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                        Reaaliaikainen vaihe:
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor: isCharging ? '#22c55e' : isResting ? '#38bdf8' : '#94a3b8',
                          boxShadow: isCharging ? '0 0 8px #22c55e' : isResting ? '0 0 8px #38bdf8' : 'none',
                        }} />
                        <span style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: isCharging ? '#22c55e' : isResting ? '#38bdf8' : 'var(--text-muted)',
                        }}>
                          {isCharging
                            ? `⚡ Latausvaihe (+${smartCyclingBoost} °C)`
                            : isResting
                            ? `🌙 Lepotauko / Purku (${smartCyclingRestSetback} °C)`
                            : '⚪ Valmiustila (Odottaa)'}
                        </span>
                      </div>
                    </div>

                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {isCharging && (
                        <span>🔥 Kompressori lataa puskurisäiliötä syvällisesti (kestänyt <strong>{chargeElapsedMin} min</strong> / max {smartCyclingMaxRun} min).</span>
                      )}
                      {isResting && (
                        <span>🌀 Lattialämmityksen toisiopumppu purkaa puskurin lämpöä laattaan (lepoaikaa jäljellä <strong>{restRemainingMin} min</strong>).</span>
                      )}
                      {!isCharging && !isResting && (
                        <span>Normaali käyräpyynti voimassa. Odottaa lämpöpumpun luonnollista käynnistymistä.</span>
                      )}
                    </div>

                    {(lastCycleMin != null || lastRestMin != null) && (
                      <div style={{ display: 'flex', gap: 12, fontSize: 10, color: 'var(--text-muted)', marginTop: 4, paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        {lastCycleMin != null && <span>Edellinen lataus: <strong>{lastCycleMin} min</strong></span>}
                        {lastRestMin != null && <span>Edellinen lepo: <strong>{lastRestMin} min</strong></span>}
                      </div>
                    )}
                  </div>
                );
              })()}

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={smartCyclingEnabled}
                  onChange={(e) => setSmartCyclingEnabled(e.target.checked)}
                  disabled={readOnly}
                  style={{ width: 16, height: 16, marginTop: 2, accentColor: '#0ea5e9' }}
                />
                <span>
                  <strong style={{ color: 'var(--text-primary)' }}>Automaattinen puskurisyklaus (Anti-short-cycling)</strong>: Korvaa puuttuvan Zone 1 -anturin. Latauksen aikana nostaa pyyntiä +{smartCyclingBoost} °C (kompressori ajaa pitkän 30–60 min jakson) ja sammumisen jälkeen laskee pyyntiä {smartCyclingRestSetback} °C min. {smartCyclingMinRest} minuutiksi.
                </span>
              </label>

              {smartCyclingEnabled && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, color: '#22c55e', display: 'block', marginBottom: 4, fontWeight: 600 }}>
                      Latausvaiheen lisänosto (°C)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="1.0"
                      max="5.0"
                      value={smartCyclingBoost}
                      onChange={(e) => setSmartCyclingBoost(e.target.value)}
                      disabled={readOnly}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: 8,
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#22c55e',
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    />
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                      Nostaa käyrää +{smartCyclingBoost}°C kompressorin käydessä
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 11, color: '#38bdf8', display: 'block', marginBottom: 4, fontWeight: 600 }}>
                      Minimilepoaika (min)
                    </label>
                    <input
                      type="number"
                      step="5"
                      min="15"
                      max="180"
                      value={smartCyclingMinRest}
                      onChange={(e) => setSmartCyclingMinRest(e.target.value)}
                      disabled={readOnly}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: 8,
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#38bdf8',
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    />
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                      Estää uudelleenkäynnistyksen {smartCyclingMinRest} min ajaksi
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 11, color: '#38bdf8', display: 'block', marginBottom: 4, fontWeight: 600 }}>
                      Lepojakson pudotus (°C)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="-5.0"
                      max="0.0"
                      value={smartCyclingRestSetback}
                      onChange={(e) => setSmartCyclingRestSetback(e.target.value)}
                      disabled={readOnly}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: 8,
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#38bdf8',
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    />
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                      Laskee pyyntiä {smartCyclingRestSetback}°C lepojakson aikana
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 11, color: '#f59e0b', display: 'block', marginBottom: 4, fontWeight: 600 }}>
                      Maksimi latausaika (min)
                    </label>
                    <input
                      type="number"
                      step="5"
                      min="30"
                      max="180"
                      value={smartCyclingMaxRun}
                      onChange={(e) => setSmartCyclingMaxRun(e.target.value)}
                      disabled={readOnly}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: 8,
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#f59e0b',
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    />
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                      Turvaraja: palauttaa peruspyynnin {smartCyclingMaxRun} min jälkeen
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Column E: Lattialämmityksen kiertovesipumppu (Sonoff) */}
            <div style={{
              padding: '18px',
              borderRadius: 12,
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 20 }}>🌀</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                    Lattialämmityspumppu (Sonoff)
                  </span>
                </div>
                <span className="badge badge-online" style={{ fontSize: 10, padding: '2px 8px' }}>
                  Toisiopiiri
                </span>
              </div>

              {/* Live Status Box */}
              {(() => {
                const fp = status?.devices?.find(d => d.driver === 'floor_pump');
                const isOn = fp?.currentState === 'ON';
                const isOverride = fp?.overrideActive;
                const isAntiSeize = fp?.antiSeizeActive;
                return (
                  <div style={{
                    background: isOn ? 'rgba(34, 197, 94, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                    border: isOn ? '1px solid rgba(34, 197, 94, 0.25)' : '1px solid rgba(255, 255, 255, 0.07)',
                    borderRadius: 10,
                    padding: '10px 12px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                        Reaaliaikainen tila:
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor: isOn ? '#22c55e' : '#64748b',
                          boxShadow: isOn ? '0 0 8px #22c55e' : 'none',
                        }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: isOn ? '#22c55e' : 'var(--text-muted)' }}>
                          {isOn ? 'Käynnissä (ON ~45 W)' : 'Lepotilassa (OFF 0 W)'}
                        </span>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {fp?.reason || 'Automaattinen lämmityskierto'}
                    </div>
                    {isOverride && (
                      <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600, marginTop: 4 }}>
                        ⚡ Manuaalinen pakkokytkentä aktiivinen
                      </div>
                    )}
                    {isAntiSeize && (
                      <div style={{ fontSize: 11, color: '#c084fc', fontWeight: 600, marginTop: 4 }}>
                        🔄 Päivittäinen jumiutumissuojan liikutteluajo aktiivinen
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Operating Mode Selector */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#60a5fa', display: 'block', marginBottom: 6 }}>
                  Toimintatila:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                  {[
                    { id: 'auto', label: '⚡ Automaatti', desc: 'APC Smart' },
                    { id: 'constant_on', label: '🟢 Jatkuva', desc: 'Aina päällä' },
                    { id: 'constant_off', label: '🔴 Pois', desc: 'Aina pois' },
                  ].map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setFloorPumpModeState(m.id as any);
                        if (!readOnly) setFloorPumpModeApi(m.id as any);
                      }}
                      disabled={readOnly}
                      style={{
                        padding: '8px 6px',
                        borderRadius: 8,
                        border: floorPumpMode === m.id ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.08)',
                        background: floorPumpMode === m.id ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.02)',
                        color: floorPumpMode === m.id ? '#60a5fa' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 600,
                        textAlign: 'center',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div>{m.label}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{m.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Manual Override Quick Controls */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                    Pakkokytkentä / Ohitus:
                  </label>
                  <select
                    value={floorPumpOverrideDuration}
                    onChange={(e) => setFloorPumpOverrideDuration(Number(e.target.value))}
                    disabled={readOnly}
                    style={{
                      padding: '3px 8px',
                      borderRadius: 6,
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: 'var(--text-primary)',
                      fontSize: 11,
                    }}
                  >
                    <option value="0">Toistaiseksi</option>
                    <option value="1">1 tunti</option>
                    <option value="2">2 tuntia</option>
                    <option value="4">4 tuntia</option>
                    <option value="8">8 tuntia</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-success"
                    onClick={() => !readOnly && setFloorPumpOverride('ON', floorPumpOverrideDuration)}
                    disabled={readOnly || saving}
                    style={{ flex: 1, fontSize: 12, padding: '7px 10px', borderRadius: 8 }}
                  >
                    🟢 Pakota ON
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() => !readOnly && setFloorPumpOverride('OFF', floorPumpOverrideDuration)}
                    disabled={readOnly || saving}
                    style={{ flex: 1, fontSize: 12, padding: '7px 10px', borderRadius: 8 }}
                  >
                    🔴 Pakota OFF
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => !readOnly && setFloorPumpOverride(null, 0)}
                    disabled={readOnly || saving}
                    style={{ fontSize: 12, padding: '7px 12px', borderRadius: 8 }}
                    title="Pura ohitus ja palauta automaattitila"
                  >
                    ⚡ Auto
                  </button>
                </div>
              </div>

              {/* Summer Cutoff Threshold */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#f59e0b' }}>
                    ☀️ Kesäkatkaisuraja (Ulkolämpötila)
                  </label>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#f59e0b' }}>
                    {floorPumpCutoff} °C
                  </span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="28"
                  step="0.5"
                  value={floorPumpCutoff}
                  onChange={(e) => setFloorPumpCutoff(e.target.value)}
                  disabled={readOnly}
                  style={{ width: '100%', accentColor: '#f59e0b', cursor: 'pointer' }}
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Alle tämän ulkolämpötilan pumppu käy jatkuvasti. Yli tämän lämpötilan siirrytään kesäjaksoajoon / lepotilaan.
                </div>
              </div>

              {/* Summer Comfort Pulse & DHW Heat Capture Checkbox */}
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={floorPumpSummerPulse}
                  onChange={(e) => setFloorPumpSummerPulse(e.target.checked)}
                  disabled={readOnly}
                  style={{ width: 16, height: 16, marginTop: 2, accentColor: '#38bdf8' }}
                />
                <span>
                  <strong style={{ color: 'var(--text-primary)' }}>Kesäajan mukavuusjaksoajo & LKV-talteenotto</strong>: Pyörittää pumppua lämpimällä säällä 15 min / 2 h välein sekä aina käyttövesilatauksen jälkeen, jotta kylpyhuoneen lattia pysyy kuivana ja mukavan lämpimänä.
                </span>
              </label>

              {/* Anti-Seize Exercise Checkbox */}
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={floorPumpAntiSeize}
                  onChange={(e) => setFloorPumpAntiSeize(e.target.checked)}
                  disabled={readOnly}
                  style={{ width: 16, height: 16, marginTop: 2, accentColor: '#10b981' }}
                />
                <span>
                  <strong style={{ color: 'var(--text-primary)' }}>Päivittäinen jumiutumisenesto</strong>: Pyörittää pumppua 5 minuutin ajan päivittäin (klo 12:00–12:05) kesätauon aikana juoksupyörän suojaamiseksi.
                </span>
              </label>
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

      {/* Section 4: Live Decision Log Table */}
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
            4. APC Päätösloki & Reaaliaikaiset toimenpiteet
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
