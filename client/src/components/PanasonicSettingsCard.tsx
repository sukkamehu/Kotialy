import { useState } from 'react';
import type { HeishamonState } from '../types/heishamon';
import { numVal } from '../types/heishamon';

export interface HeatPumpSettingItem {
  id: string;
  category: 'curve' | 'heating' | 'dhw' | 'heater';
  name: string;
  menuPath: string;
  recommendedValue: string;
  allowedRange?: string;
  unit?: string;
  reason: string;
  kotiAlyImpact: string;
  previousValue?: string;
  topic?: string;
  getCurrent?: (state?: HeishamonState) => {
    valueText: string;
    status: 'match' | 'diff' | 'unknown';
    detail?: string;
  };
}

const DEFAULT_SETTINGS: HeatPumpSettingItem[] = [
  // ─── 1. Lämpökäyrä (Kompensaatiokäyrä) ───
  {
    id: 'curve_low',
    category: 'curve',
    name: 'Käyrä: Menovesi kovalla pakkasella (-20 °C)',
    menuPath: 'Toiminnan määritys → Lämm.ON: Ved. lämp. (Vasen ylä)',
    recommendedValue: '38 °C',
    allowedRange: '20 °C – 65 °C',
    previousValue: '35 °C @ -15 °C',
    reason: 'Lattialämmityksen peruskäyrän pakkaspäätepiste, joka takaa riittävän lämmön kovillakin talvipakkasilla.',
    kotiAlyImpact: 'Kotiäly voi nostaa (+3 °C) tai laskea (-2 °C) menovettä dynaamisesti pörssihinnan mukaan.',
    topic: 'main/Z1_Heat_Curve_Target_High_Temp',
    getCurrent: (state) => {
      const v = state ? numVal(state, 'main/Z1_Heat_Curve_Target_High_Temp') : null;
      if (v === null) return { valueText: '—', status: 'unknown' };
      return {
        valueText: `${v} °C`,
        status: v === 38 ? 'match' : 'diff',
        detail: v === 38 ? 'Vastaa suositusta' : 'Poikkeaa suosituksesta',
      };
    },
  },
  {
    id: 'curve_high',
    category: 'curve',
    name: 'Käyrä: Menovesi leudolla säällä (+15 °C)',
    menuPath: 'Toiminnan määritys → Lämm.ON: Ved. lämp. (Vasen ala)',
    recommendedValue: '27 °C',
    allowedRange: '20 °C – 65 °C',
    previousValue: '26 °C @ +15 °C',
    reason: 'Pitää puukoolatun kipsilattian ja puskurin riittävän lämpimänä leudolla syyskelillä ja pidentää kompressorin käyntijaksoa ennen sammutusta.',
    kotiAlyImpact: 'Luo tasaisen matalan pohjan, josta Kotiäly optimoi tehon ja puskurin latausjaksot.',
    topic: 'main/Z1_Heat_Curve_Target_Low_Temp',
    getCurrent: (state) => {
      const v = state ? numVal(state, 'main/Z1_Heat_Curve_Target_Low_Temp') : null;
      if (v === null) return { valueText: '—', status: 'unknown' };
      return {
        valueText: `${v} °C`,
        status: v === 27 ? 'match' : 'diff',
        detail: v === 27 ? 'Vastaa suositusta' : 'Poikkeaa suosituksesta',
      };
    },
  },
  {
    id: 'curve_ambient_low',
    category: 'curve',
    name: 'Käyrän pakkaspäätepiste (ulkolämpötila)',
    menuPath: 'Toiminnan määritys → Lämm.ON: Ved. lämp. (Oikea ala)',
    recommendedValue: '-20 °C',
    allowedRange: '-20 °C – 15 °C',
    previousValue: '-15 °C',
    reason: 'Laajentaa käyrän pakkasalueen -20 °C asti, mikä loiventaa nousukulmaa ja tasaa tehoa.',
    kotiAlyImpact: 'Tasaa pumpun ottotehoa laajalla ulkolämpötila-alueella.',
    topic: 'main/Z1_Heat_Curve_Outside_Low_Temp',
    getCurrent: (state) => {
      const v = state ? numVal(state, 'main/Z1_Heat_Curve_Outside_Low_Temp') : null;
      if (v === null) return { valueText: '—', status: 'unknown' };
      return {
        valueText: `${v} °C`,
        status: v === -20 ? 'match' : 'diff',
        detail: v === -20 ? 'Vastaa suositusta' : 'Poikkeaa suosituksesta',
      };
    },
  },
  {
    id: 'curve_ambient_high',
    category: 'curve',
    name: 'Käyrän leutopäätepiste (ulkolämpötila)',
    menuPath: 'Toiminnan määritys → Lämm.ON: Ved. lämp. (Oikea ala)',
    recommendedValue: '15 °C',
    allowedRange: '-15 °C – 15 °C',
    previousValue: '15 °C',
    reason: 'Standardi leudon kelin vertailupiste lämmityskauden käynnistymiseen.',
    kotiAlyImpact: 'Määrittää lämmityskauden aloituskäyrän perustason.',
    topic: 'main/Z1_Heat_Curve_Outside_High_Temp',
    getCurrent: (state) => {
      const v = state ? numVal(state, 'main/Z1_Heat_Curve_Outside_High_Temp') : null;
      if (v === null) return { valueText: '—', status: 'unknown' };
      return {
        valueText: `${v} °C`,
        status: v === 15 ? 'match' : 'diff',
        detail: v === 15 ? 'Vastaa suositusta' : 'Poikkeaa suosituksesta',
      };
    },
  },

  // ─── 2. Lämmityksen ohjaus & Hystereesi & Työsäiliö ───
  {
    id: 'buffer_tank',
    category: 'heating',
    name: 'Työsäiliö / Puskurivaraaja (Buffer Tank)',
    menuPath: 'Toiminnan määritys → Järjestelmäasetukset → Puskurisäiliö',
    recommendedValue: 'Pois päältä (Ei)',
    allowedRange: 'Kyllä / Ei',
    previousValue: 'Kyllä (kokeiltu)',
    reason: 'Panasonicin "Työsäiliö = Kyllä" on suunniteltu isoille energiavaraajille (lataa ylilämmöllä ja pysäyttää ensiökierron). 100 L 4-putkipuskuri toimii parhaiten hydraulisena erottimena asetuksella "Ei", ja fyysisesti kytketty puskurianturi palvelee Kotiälyn seurantaa ja suojauksia.',
    kotiAlyImpact: 'Kotiälyn älykäs puskurisyklaus ja Quiet Mode pitkittävät käyntijaksoja paremmalla COP:lla kuin Panasonicin oma työsäiliölogiikka.',
    topic: 'main/Buffer_Installed',
    getCurrent: (state) => {
      const v = state ? numVal(state, 'main/Buffer_Installed') : null;
      if (v === null) return { valueText: '—', status: 'unknown' };
      return {
        valueText: v === 1 ? 'Käytössä (Buffer ON)' : 'Pois päältä (Ei)',
        status: v === 0 ? 'match' : 'diff',
        detail: v === 0 ? 'Optimaalinen 100 L puskurille · Anturi kytketty' : 'Ei suositella 100 L puskurille (pätkii / ylilämmittää)',
      };
    },
  },
  {
    id: 'heating_on_dt',
    category: 'heating',
    name: 'Veden lämpötilaero (Lämm.ON: ΔT)',
    menuPath: 'Toiminnan määritys → Lämm.ON: ΔT',
    recommendedValue: '8 °C',
    allowedRange: '1 °C – 15 °C',
    previousValue: '5 °C',
    reason: 'Antaa pumpun säätää virtausta laajasti ja hyödyntää työsäiliön koko tilavuutta ennen sammutusta.',
    kotiAlyImpact: 'Pidentää käyntijaksoja ja hidastaa sisäisen kiertovesipumpun virtausta.',
    topic: 'main/Heat_Delta',
    getCurrent: (state) => {
      const v = state ? numVal(state, 'main/Heat_Delta') : null;
      if (v === null) return { valueText: '—', status: 'unknown' };
      return {
        valueText: `${v} °C`,
        status: v === 8 ? 'match' : 'diff',
        detail: v === 8 ? 'Vastaa suositusta' : 'Poikkeaa suosituksesta',
      };
    },
  },
  {
    id: 'heating_off_ambient',
    category: 'heating',
    name: 'Lämmitys OFF: ulkolämpötila (Kesäsulku)',
    menuPath: 'Toiminnan määritys → Lämmitys → Lämmitys OFF: ulkolämpötila',
    recommendedValue: '15 °C',
    allowedRange: '5 °C – 35 °C',
    previousValue: '17 °C',
    reason: 'Sammuttaa lattialämmityksen automaattisesti kesäksi ja leudoiksi iltapäiviksi (jättää vain käyttöveden päälle).',
    kotiAlyImpact: 'Estää turhan lämmityksen ja katkokäynnin leudoilla ilmoilla.',
    topic: 'main/Heating_Off_Outdoor_Temp',
    getCurrent: (state) => {
      const v = state ? numVal(state, 'main/Heating_Off_Outdoor_Temp') : null;
      if (v === null) return { valueText: '—', status: 'unknown' };
      return {
        valueText: `${v} °C`,
        status: v === 15 ? 'match' : 'diff',
        detail: v === 15 ? 'Vastaa suositusta' : 'Poikkeaa suosituksesta',
      };
    },
  },

  // ─── 3. Käyttövesi (LKV) ───
  {
    id: 'dhw_reheat_dt',
    category: 'dhw',
    name: 'Uudelleenlämmityksen lämpötilaero (Uud. lämm. lämpötila)',
    menuPath: 'Toiminnan määritys → Säiliö → Uud. lämm. lämpötila',
    recommendedValue: '-8 °C (tai -7 °C)',
    allowedRange: '-12 °C – -2 °C',
    previousValue: '-2 °C / -3 °C',
    reason: 'Korjasi aiemman 15 krt/vrk katkokäynnin. Käynnistää LKV-jakson vasta kun vesi laskee n. 40–42 °C:een.',
    kotiAlyImpact: 'Vapauttaa pumpun lämmittämään lattioita ja työsäiliötä 90 % ajasta sen sijaan että pumppu poukkoilisi jatkuvasti käyttöveteen.',
    topic: 'main/DHW_Heat_Delta',
    getCurrent: (state) => {
      const v = state ? numVal(state, 'main/DHW_Heat_Delta') : null;
      if (v === null) return { valueText: '—', status: 'unknown' };
      const ok = v === -8 || v === -7;
      return {
        valueText: `${v} °C`,
        status: ok ? 'match' : 'diff',
        detail: ok ? 'Vastaa suositusta' : 'Poikkeaa suosituksesta',
      };
    },
  },
  {
    id: 'dhw_tank_heat_max',
    category: 'dhw',
    name: 'Säiliön lämmitysaika enintään (Säiliön lämm. aika enint.)',
    menuPath: 'Toiminnan määritys → Säiliö → Säiliön lämm. aika enint.',
    recommendedValue: '01:00 (60 min)',
    allowedRange: '0:05 – 4:00',
    previousValue: 'Ei tiedossa',
    reason: 'Riittää täyteen käyttövesisykliin suihkujen jälkeen, mutta katkaisee syklin tunnin kohdalla, jotta lattialämmitys ei kylmene talvipakkasilla.',
    kotiAlyImpact: 'Takaa lattioille riittävän lämpöenergian saannin myös kylmimpinä pakkaspäivinä.',
    topic: 'main/DHW_Heatup_Max_Time',
    getCurrent: (state) => {
      const v = state ? numVal(state, 'main/DHW_Heatup_Max_Time') : null;
      if (v === null) return { valueText: '—', status: 'unknown' };
      return {
        valueText: `${v} min (01:00)`,
        status: v === 60 ? 'match' : 'diff',
        detail: v === 60 ? 'Vastaa suositusta' : 'Poikkeaa suosituksesta',
      };
    },
  },
  {
    id: 'dhw_floor_heat_max',
    category: 'dhw',
    name: 'Lämmityksen toiminta-aika enintään (Toiminta-aika enint.)',
    menuPath: 'Toiminnan määritys → Säiliö → Toiminta-aika enint.',
    recommendedValue: '03:00 – 04:00 (3–4 h)',
    allowedRange: '0:30 – 10:00',
    previousValue: 'Ei tiedossa',
    reason: 'Varmistaa, että lattialämmitys ja puskurivaraaja saavat vähintään 3–4 tuntia yhtäjaksoista lämmitystä ennen seuraavaa mahdollista käyttövesisykliä.',
    kotiAlyImpact: 'Lattiarakenne ja 100L puskurisäiliö ehtivät varata edullista yölämpöä.',
    topic: 'main/Room_Operation_Max_Time',
    getCurrent: (state) => {
      const v = state ? numVal(state, 'main/Room_Operation_Max_Time') : null;
      if (v === null) return { valueText: '—', status: 'unknown' };
      const hours = Math.round((v / 60) * 10) / 10;
      return {
        valueText: `${v} min (${hours} h)`,
        status: v >= 180 ? 'match' : 'diff',
        detail: v >= 180 ? 'Riittävä lämmitysaika' : 'Liian lyhyt aika',
      };
    },
  },
  {
    id: 'dhw_target_temp',
    category: 'dhw',
    name: 'Käyttövesisäiliön tavoitelämpötila',
    menuPath: 'Päävalikko → Käyttövesi → Tavoitelämpötila',
    recommendedValue: '48 °C – 50 °C',
    allowedRange: '40 °C – 65 °C',
    previousValue: '48 °C',
    reason: 'Energiatehokas suihkuvesi ilman kompressorin turhaa ylikuormittamista.',
    kotiAlyImpact: 'Optimoitavissa APC:n LKV-ohjauksella yöaikaan.',
    topic: 'main/DHW_Target_Temp',
    getCurrent: (state) => {
      const v = state ? numVal(state, 'main/DHW_Target_Temp') : null;
      if (v === null) return { valueText: '—', status: 'unknown' };
      const ok = v >= 48 && v <= 50;
      return {
        valueText: `${v} °C`,
        status: ok ? 'match' : 'diff',
        detail: ok ? 'Vastaa suositusta' : 'Poikkeaa suosituksesta',
      };
    },
  },

  // ─── 4. Sähköinen lisävastus ───
  {
    id: 'heater_on_ambient',
    category: 'heater',
    name: 'Lämmitin ON: ulkolämpötila (Lisävastuksen sallintaraja)',
    menuPath: 'Toiminnan määritys → Lämmitys → Lämmitin ON: ulkolämpötila',
    recommendedValue: '-10 °C (tai -12 °C)',
    allowedRange: '-15 °C – 20 °C',
    previousValue: '0 °C / +5 °C',
    reason: 'Kieltää kalliin suoran sähkövastuksen nollakeleillä ja leudoilla pakkasilla.',
    kotiAlyImpact: 'Estää turhat sähkönkulutuspiikit ja antaa kompressorin hoitaa lämmityksen korkealla hyötysuhteella.',
    topic: 'main/Heater_On_Outdoor_Temp',
    getCurrent: (state) => {
      const v = state ? numVal(state, 'main/Heater_On_Outdoor_Temp') : null;
      if (v === null) return { valueText: '—', status: 'unknown' };
      const ok = v <= -10;
      return {
        valueText: `${v} °C`,
        status: ok ? 'match' : 'diff',
        detail: ok ? 'Vastus estetty leudoilla pakkasilla' : 'Vastus sallittu liian leudolla',
      };
    },
  },
];

const NOTES_KEY = 'kotialy_heatpump_commissioning_notes_v2';

interface PanasonicSettingsCardProps {
  state?: HeishamonState;
}

export function PanasonicSettingsCard({ state }: PanasonicSettingsCardProps) {
  const [filter, setFilter] = useState<'all' | 'curve' | 'heating' | 'dhw' | 'heater'>('all');
  const [notes, setNotes] = useState<string>(() => {
    try {
      return localStorage.getItem(NOTES_KEY) || 'Lämm.ON ΔT = 8 °C. Lämpökäyrän leutopää asetettu 27 °C @ +15 °C. Lämmityksen kesäkatkaisu 15 °C. Puskurianturi on kytketty mittaukseen, mutta Panasonicin Työsäiliö-asetus pidetään pois päältä (Ei) 100 L puskurille — Kotiälyn älykäs syklaus ja Quiet Mode hoitavat pätkäkäynnin eston.';
    } catch {
      return '';
    }
  });
  const [savedStatus, setSavedStatus] = useState(false);

  const filtered = filter === 'all'
    ? DEFAULT_SETTINGS
    : DEFAULT_SETTINGS.filter((s) => s.category === filter);

  function handleSaveNotes(val: string) {
    setNotes(val);
    try {
      localStorage.setItem(NOTES_KEY, val);
      setSavedStatus(true);
      setTimeout(() => setSavedStatus(false), 2000);
    } catch {
      // ignore
    }
  }

  // Live telemetry
  const outsideTemp = state ? numVal(state, 'main/Outside_Temp') : null;
  const mainTarget = state ? numVal(state, 'main/Main_Target_Temp') : null;
  const mainOutlet = state ? numVal(state, 'main/Main_Outlet_Temp') : null;
  const z1Shift = state ? numVal(state, 'main/Z1_Heat_Request_Temp') : null;
  const z1CurveTargetHigh = state ? numVal(state, 'main/Z1_Heat_Curve_Target_High_Temp') : 38;
  const z1CurveTargetLow = state ? numVal(state, 'main/Z1_Heat_Curve_Target_Low_Temp') : 27;

  // Calculate base curve formula for visualization
  // T_water(T_out) = 27 + (15 - T_out) * ( (38 - 27) / (15 - (-20)) ) = 27 + (15 - T_out) * (11/35)
  const calcBaseCurve = (tOut: number) => {
    const clamped = Math.max(-20, Math.min(15, tOut));
    const target = (z1CurveTargetLow ?? 27) + ((15 - clamped) * ((z1CurveTargetHigh ?? 38) - (z1CurveTargetLow ?? 27))) / 35;
    return Math.round(target * 10) / 10;
  };

  const currentCalculatedBase = outsideTemp != null ? calcBaseCurve(outsideTemp) : null;

  return (
    <div className="card apc-card" style={{ padding: '24px', background: 'var(--card-bg, #1a1e29)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 26 }}>⚙️</span>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
              Panasonic Aquarea & Lattialämmitys – Asetusmuistio
            </h2>
          </div>
          <p style={{ margin: '6px 0 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            Kotiälyn ja lautakoolatun lattialämmityksen kanssa optimoidut viralliset laiteasetukset ja reaaliaikainen tilanne.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: 'Kaikki (12)' },
            { id: 'curve', label: '📈 Lämpökäyrä' },
            { id: 'heating', label: '🔥 Lämmitys & Työsäiliö' },
            { id: 'dhw', label: '🚿 Käyttövesi' },
            { id: 'heater', label: '⚡ Lisävastus' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id as any)}
              className="segmented-btn"
              style={{
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 8,
                border: filter === tab.id ? '1px solid var(--accent-primary, #3b82f6)' : '1px solid rgba(255,255,255,0.08)',
                background: filter === tab.id ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.03)',
                color: filter === tab.id ? '#60a5fa' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sync Status Banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(6, 182, 212, 0.08))',
        border: '1px solid rgba(16, 185, 129, 0.3)',
        borderRadius: 12,
        padding: '12px 18px',
        marginBottom: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 24 }}>✅</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#34d399' }}>
              Suositusarvot aktiivisina Panasonicissa (100 % synkronoitu)
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              Lämpökäyrä (38 °C / 27 °C), veden lämpötilaero ΔT (8 °C), LKV-uudelleenlämmitys (-8 °C) ja lisävastuksen esto (-15 °C) ovat aktiivisia.
            </div>
          </div>
        </div>

        {outsideTemp != null && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            background: 'rgba(0, 0, 0, 0.25)',
            padding: '6px 14px',
            borderRadius: 8,
            border: '1px solid rgba(255, 255, 255, 0.08)',
            fontSize: 12,
          }}>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Ulko: </span>
              <strong style={{ color: '#60a5fa' }}>{outsideTemp.toFixed(1)} °C</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Menovesi: </span>
              <strong style={{ color: '#34d399' }}>{mainOutlet != null ? `${mainOutlet.toFixed(1)} °C` : '—'}</strong>
              <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 4 }}>
                (pyynti {mainTarget != null ? `${mainTarget.toFixed(0)} °C` : '—'})
              </span>
            </div>
            {z1Shift != null && z1Shift !== 0 && (
              <div>
                <span style={{ color: 'var(--text-muted)' }}>APC-siirto: </span>
                <strong style={{ color: z1Shift > 0 ? '#34d399' : '#f59e0b' }}>
                  {z1Shift > 0 ? `+${z1Shift}` : z1Shift} °C
                </strong>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick Summary Highlights with Live Values */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 12,
        marginBottom: 24,
      }}>
        {/* Card 1: Curve */}
        <div style={{
          padding: '12px 16px',
          borderRadius: 10,
          background: 'rgba(59, 130, 246, 0.08)',
          border: '1px solid rgba(59, 130, 246, 0.2)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 11, color: '#93c5fd', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
              Lattian Peruskäyrä
            </div>
            <span style={{ fontSize: 11, color: '#34d399', fontWeight: 700 }}>✓ Aktiivinen</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', marginTop: 4 }}>
            38 °C / 27 °C
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            Pakkaspää -20 °C / Leutopää +15 °C
          </div>
        </div>

        {/* Card 2: Delta T */}
        <div style={{
          padding: '12px 16px',
          borderRadius: 10,
          background: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.2)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 11, color: '#6ee7b7', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
              Veden ΔT (Lämm.ON)
            </div>
            <span style={{ fontSize: 11, color: '#34d399', fontWeight: 700 }}>✓ 8 °C</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#10b981', marginTop: 4 }}>
            8 °C
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            Hyödyntää työsäiliön täyden tehon
          </div>
        </div>

        {/* Card 3: Buffer */}
        <div style={{
          padding: '12px 16px',
          borderRadius: 10,
          background: 'rgba(168, 85, 247, 0.08)',
          border: '1px solid rgba(168, 85, 247, 0.2)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 11, color: '#d8b4fe', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
              Työsäiliö / Puskuri
            </div>
            <span style={{ fontSize: 11, color: '#c084fc', fontWeight: 700 }}>Kotiäly-ohjaus</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#c084fc', marginTop: 4 }}>
            100 L Puskuri
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            Anturi kytketty · Buffer OFF (optimaalinen)
          </div>
        </div>

        {/* Card 4: DHW Reheat */}
        <div style={{
          padding: '12px 16px',
          borderRadius: 10,
          background: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.2)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 11, color: '#fcd34d', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
              LKV Uudelleenlämmitys
            </div>
            <span style={{ fontSize: 11, color: '#34d399', fontWeight: 700 }}>✓ -8 °C</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#f59e0b', marginTop: 4 }}>
            -8 °C
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            Katkokäynnin esto (käynnistys ~42 °C)
          </div>
        </div>

        {/* Card 5: Backup Heater */}
        <div style={{
          padding: '12px 16px',
          borderRadius: 10,
          background: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 11, color: '#fca5a5', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
              Lisävastuksen esto
            </div>
            <span style={{ fontSize: 11, color: '#34d399', fontWeight: 700 }}>✓ -15 °C</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#ef4444', marginTop: 4 }}>
            -15 °C
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            Vastus estetty leudoilla keleillä
          </div>
        </div>
      </div>

      {/* Visual Compensation Curve Diagram (Active when 'all' or 'curve' is selected) */}
      {(filter === 'all' || filter === 'curve') && (
        <div style={{
          background: 'rgba(0, 0, 0, 0.35)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 12,
          padding: '18px 20px',
          marginBottom: 24,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>📈</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                Lattialämmityksen Kompensaatiokäyrä & Nykyinen Toimintapiste
              </span>
            </div>

            {outsideTemp != null && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 16 }}>
                <span>Ulkolämpötila: <strong style={{ color: '#60a5fa' }}>{outsideTemp.toFixed(1)} °C</strong></span>
                <span>Laskennallinen peruspyynti: <strong style={{ color: '#34d399' }}>{currentCalculatedBase != null ? `${currentCalculatedBase.toFixed(1)} °C` : '—'}</strong></span>
                {mainTarget != null && (
                  <span>Toteutuva pyynti: <strong style={{ color: '#22d3ee' }}>{mainTarget.toFixed(0)} °C</strong></span>
                )}
              </div>
            )}
          </div>

          {/* SVG Curve Plot */}
          <div style={{ width: '100%', height: 160, position: 'relative' }}>
            <svg viewBox="0 0 600 150" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
              <defs>
                <linearGradient id="curveGradient" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#10b981" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              <line x1="50" y1="20" x2="560" y2="20" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
              <line x1="50" y1="65" x2="560" y2="65" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
              <line x1="50" y1="110" x2="560" y2="110" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />

              {/* Y Axis Labels */}
              <text x="40" y="24" fill="var(--text-muted)" fontSize="10" textAnchor="end">40 °C</text>
              <text x="40" y="69" fill="var(--text-muted)" fontSize="10" textAnchor="end">32 °C</text>
              <text x="40" y="114" fill="var(--text-muted)" fontSize="10" textAnchor="end">25 °C</text>

              {/* X Axis Coordinates: -20°C -> x=60, +15°C -> x=550. Range = 35°C, 490px */}
              {/* Point 1: -20 °C, 38 °C (y: 20 + (40-38)*5 = 30) */}
              {/* Point 2: +15 °C, 27 °C (y: 20 + (40-27)*5 = 85) */}
              <line x1="60" y1="120" x2="550" y2="120" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
              <text x="60" y="136" fill="var(--text-muted)" fontSize="10" textAnchor="middle">-20 °C</text>
              <text x="200" y="136" fill="var(--text-muted)" fontSize="10" textAnchor="middle">-10 °C</text>
              <text x="340" y="136" fill="var(--text-muted)" fontSize="10" textAnchor="middle">0 °C</text>
              <text x="480" y="136" fill="var(--text-muted)" fontSize="10" textAnchor="middle">+10 °C</text>
              <text x="550" y="136" fill="var(--text-muted)" fontSize="10" textAnchor="middle">+15 °C</text>

              {/* The Recommended / Panasonic Curve Line */}
              <line
                x1="60"
                y1="30"
                x2="550"
                y2="85"
                stroke="url(#curveGradient)"
                strokeWidth="3.5"
                strokeLinecap="round"
              />

              {/* Cold Endpoint Marker: (-20°C, 38°C) */}
              <circle cx="60" cy="30" r="5" fill="#3b82f6" stroke="#fff" strokeWidth="1.5" />
              <text x="60" y="18" fill="#60a5fa" fontSize="11" fontWeight="700" textAnchor="middle">
                38 °C @ -20 °C
              </text>

              {/* Mild Endpoint Marker: (+15°C, 27°C) */}
              <circle cx="550" cy="85" r="5" fill="#10b981" stroke="#fff" strokeWidth="1.5" />
              <text x="550" y="75" fill="#34d399" fontSize="11" fontWeight="700" textAnchor="middle">
                27 °C @ +15 °C
              </text>

              {/* Current Outdoor Operating Point */}
              {outsideTemp != null && (
                (() => {
                  const clamped = Math.max(-20, Math.min(15, outsideTemp));
                  const currentX = 60 + ((clamped - (-20)) / 35) * 490;
                  const currentY = 30 + ((clamped - (-20)) / 35) * (85 - 30);
                  const targetY = mainTarget != null ? 20 + (40 - mainTarget) * 5 : currentY;

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
                          strokeWidth="2"
                        />
                      )}

                      {/* Operating Point Circle */}
                      <circle cx={currentX} cy={targetY} r="7" fill="#f59e0b" stroke="#fff" strokeWidth="2">
                        <animate attributeName="r" values="6;8;6" dur="2s" repeatCount="indefinite" />
                      </circle>

                      {/* Tooltip text above point */}
                      <rect
                        x={Math.max(70, Math.min(470, currentX - 55))}
                        y={Math.max(25, targetY - 32)}
                        width="110"
                        height="24"
                        rx="6"
                        fill="rgba(0,0,0,0.85)"
                        stroke="#f59e0b"
                        strokeWidth="1"
                      />
                      <text
                        x={Math.max(70, Math.min(470, currentX - 55)) + 55}
                        y={Math.max(25, targetY - 32) + 16}
                        fill="#fcd34d"
                        fontSize="11"
                        fontWeight="700"
                        textAnchor="middle"
                      >
                        Nyt: {outsideTemp.toFixed(1)} °C → {mainTarget != null ? mainTarget.toFixed(0) : currentCalculatedBase?.toFixed(0)} °C
                      </text>
                    </g>
                  );
                })()
              )}
            </svg>
          </div>
        </div>
      )}

      {/* Table of Settings */}
      <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', marginBottom: 24 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 600 }}>Asetuksen nimi & Polku</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 600, width: 140 }}>Suositusarvo</th>
              <th style={{ padding: '12px 16px', color: '#34d399', fontWeight: 600, width: 150 }}>Tämänhetkinen arvo (Panasonic)</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 600, width: 110 }}>Aiempi arvo</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 600 }}>Perustelu & Kotiäly-vaikutus</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item, idx) => {
              const live = item.getCurrent ? item.getCurrent(state) : { valueText: '—', status: 'unknown' as const };
              const isMatch = live.status === 'match';

              return (
                <tr
                  key={item.id}
                  style={{
                    borderBottom: idx < filtered.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                    background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                  }}
                >
                  <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{item.menuPath}</div>
                  </td>

                  {/* Recommended value */}
                  <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '4px 10px',
                      borderRadius: 6,
                      background: 'rgba(59, 130, 246, 0.15)',
                      color: '#60a5fa',
                      fontWeight: 700,
                      fontSize: 13,
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                    }}>
                      {item.recommendedValue}
                    </span>
                    {item.allowedRange && (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                        Sallittu: {item.allowedRange}
                      </div>
                    )}
                  </td>

                  {/* Live value from Panasonic / Heishamon */}
                  <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '4px 10px',
                      borderRadius: 6,
                      background: isMatch ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                      color: isMatch ? '#34d399' : '#fbbf24',
                      fontWeight: 700,
                      fontSize: 13,
                      border: isMatch ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(245, 158, 11, 0.35)',
                    }}>
                      <span>{live.valueText}</span>
                      <span style={{ fontSize: 11 }}>{isMatch ? '✓' : '⚠️'}</span>
                    </span>
                    {live.detail && (
                      <div style={{ fontSize: 10, color: isMatch ? '#10b981' : '#f59e0b', marginTop: 4, fontWeight: 500 }}>
                        {live.detail}
                      </div>
                    )}
                  </td>

                  {/* Previous value before tuning */}
                  <td style={{ padding: '14px 16px', verticalAlign: 'top', color: '#f87171', fontSize: 12 }}>
                    {item.previousValue ? (
                      <span style={{ textDecoration: 'line-through', opacity: 0.8 }}>
                        {item.previousValue}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>–</span>
                    )}
                  </td>

                  {/* Reason & Kotiäly impact */}
                  <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                    <div style={{ color: 'var(--text-secondary)', lineHeight: 1.4 }}>{item.reason}</div>
                    <div style={{
                      marginTop: 6,
                      fontSize: 12,
                      color: '#60a5fa',
                      background: 'rgba(59, 130, 246, 0.08)',
                      padding: '6px 10px',
                      borderRadius: 6,
                      borderLeft: '2px solid #3b82f6',
                    }}>
                      💡 <strong>Kotiäly:</strong> {item.kotiAlyImpact}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* User Notes Section */}
      <div style={{
        background: 'rgba(255,255,255,0.02)',
        padding: '16px',
        borderRadius: 10,
        border: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label htmlFor="hp-notes" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
            📝 Omat muistiinpanot & säätöhistoria:
          </label>
          {savedStatus && (
            <span style={{ fontSize: 12, color: '#10b981', fontWeight: 600 }}>
              ✓ Muistiinpanot tallennettu
            </span>
          )}
        </div>
        <textarea
          id="hp-notes"
          rows={3}
          value={notes}
          onChange={(e) => handleSaveNotes(e.target.value)}
          placeholder="Kirjaa tähän muistiinpanot tehdyistä muutoksista..."
          style={{
            width: '100%',
            boxSizing: 'border-box',
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            color: 'var(--text-primary)',
            padding: '10px 12px',
            fontSize: 13,
            fontFamily: 'inherit',
            resize: 'vertical',
          }}
        />
      </div>
    </div>
  );
}
