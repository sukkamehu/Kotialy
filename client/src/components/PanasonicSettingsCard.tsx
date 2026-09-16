import { useState } from 'react';

export interface HeatPumpSettingItem {
  id: string;
  category: 'curve' | 'heating' | 'dhw' | 'heater' | 'apc';
  name: string;
  menuPath: string;
  recommendedValue: string;
  allowedRange?: string;
  unit?: string;
  reason: string;
  kotiAlyImpact: string;
  previousValue?: string;
}

const DEFAULT_SETTINGS: HeatPumpSettingItem[] = [
  // ─── 1. Lämpökäyrä (Kompensaatiokäyrä) ───
  {
    id: 'curve_low',
    category: 'curve',
    name: 'Käyrä: Menovesi kovalla pakkasella (-15 °C)',
    menuPath: 'Asennusasetukset → Toiminta-asetukset → Lämmitys → Ved. lämp. (Kompensaatiokäyrä)',
    recommendedValue: '35 °C',
    allowedRange: '20 °C – 65 °C',
    previousValue: '57 °C @ -5 °C',
    reason: 'Lattialämmitykselle turvallinen ja energiatehokas yläraja kovillakin talvipakkasilla.',
    kotiAlyImpact: 'Kotiälyn Boost (+3 °C) nostaa menoveden n. 38 °C:een, mikä pysyy vielä turvallisissa rajoissa lattiamateriaaleille.',
  },
  {
    id: 'curve_high',
    category: 'curve',
    name: 'Käyrä: Menovesi leudolla säällä (+15 °C)',
    menuPath: 'Asennusasetukset → Toiminta-asetukset → Lämmitys → Ved. lämp. (Kompensaatiokäyrä)',
    recommendedValue: '26 °C',
    allowedRange: '20 °C – 65 °C',
    previousValue: '37 °C @ +15 °C',
    reason: 'Estää ylilämpenemisen ja pätkäkäynnin syksyllä ja keväällä. Pitää lattian miellyttävän haaleana.',
    kotiAlyImpact: 'Luo tasaisen pohjan, josta Kotiäly voi pudottaa (-2 °C) kalliilla tunneilla ilman että laatta kylmenee.',
  },
  {
    id: 'curve_ambient_low',
    category: 'curve',
    name: 'Käyrän pakkaspäätepiste (ulkolämpötila)',
    menuPath: 'Asennusasetukset → Toiminta-asetukset → Lämmitys → Ved. lämp. (Kompensaatiokäyrä vasen ala)',
    recommendedValue: '-15 °C (tai -20 °C)',
    allowedRange: '-20 °C – 15 °C',
    previousValue: '-5 °C',
    reason: 'Loiventaa käyrän jyrkkyyttä, jotta pumppu ei nosta menovettä liian kuumaksi jo pikkupakkasilla.',
    kotiAlyImpact: 'Tasaa pumpun ottotehoa laajalla ulkolämpötila-alueella.',
  },
  {
    id: 'curve_ambient_high',
    category: 'curve',
    name: 'Käyrän leutopäätepiste (ulkolämpötila)',
    menuPath: 'Asennusasetukset → Toiminta-asetukset → Lämmitys → Ved. lämp. (Kompensaatiokäyrä oikea ala)',
    recommendedValue: '15 °C',
    allowedRange: '-15 °C – 15 °C',
    previousValue: '15 °C',
    reason: 'Standardi leudon kelin vertailupiste.',
    kotiAlyImpact: 'Määrittää lämmityskauden aloituskäyrän perustason.',
  },

  // ─── 2. Lämmityksen ohjaus & Hystereesi ───
  {
    id: 'heating_on_dt',
    category: 'heating',
    name: 'ΔT lämmityksen käynnistämiseen (Lämm. ON: ΔT)',
    menuPath: 'Asennusasetukset → Toiminta-asetukset → Lämmitys → Lämm. ON: ΔT',
    recommendedValue: '+4 °C (tai +3 °C)',
    allowedRange: '+1 °C – +15 °C',
    previousValue: '+1 °C / +2 °C',
    reason: 'Lopettaa pätkäkäynnin ja antaa pumpun käydä pitkiä taloudellisia jaksoja.',
    kotiAlyImpact: 'Erittäin kriittinen: Sallii menoveden laskea kalliilla pörssitunneilla (SETBACK) ilman että kompressori herää turhaan kalliilla sähköllä.',
  },
  {
    id: 'heating_off_ambient',
    category: 'heating',
    name: 'Lämmitys OFF: ulkolämpötila (Kesäsulku)',
    menuPath: 'Asennusasetukset → Toiminta-asetukset → Lämmitys → Lämmitys OFF: ulkolämpötila',
    recommendedValue: '17 °C',
    allowedRange: '5 °C – 35 °C',
    previousValue: 'Ei tiedossa',
    reason: 'Sammuttaa lattialämmityksen automaattisesti kesäksi ja jättää vain käyttöveden päälle.',
    kotiAlyImpact: 'Estää turhan lämmityksen kesähelteillä säästäen sähköä.',
  },
  {
    id: 'target_dt',
    category: 'heating',
    name: 'Lämmityksen menon ja paluun tavoite-ΔT',
    menuPath: 'Asennusasetukset → Toiminta-asetukset → Lämmitys → ΔT for heating',
    recommendedValue: '5 °C (tai 4 °C)',
    allowedRange: '1 °C – 15 °C',
    previousValue: '5 °C',
    reason: 'Ohjaa kiertovesipumppua pitämään virtausnopeuden ja lämmönluovutuksen ihanteellisena lattialle.',
    kotiAlyImpact: 'Maksimoi lämpöpumpun hyötysuhteen (korkea COP 4–5).',
  },

  // ─── 3. Käyttövesi (LKV) ───
  {
    id: 'dhw_reheat_dt',
    category: 'dhw',
    name: 'Uudelleenlämmityksen lämpötilaero (Uud. lämm. lämpötila)',
    menuPath: 'Asennusasetukset → Toiminta-asetukset → Säiliö → Uud. lämm. lämpötila',
    recommendedValue: '-8 °C (tai -7 °C)',
    allowedRange: '-12 °C – -2 °C',
    previousValue: '-2 °C / -3 °C',
    reason: 'Korjasi aiemman 15 krt/vrk katkokäynnin. Käynnistää LKV-jakson vasta kun vesi laskee n. 40–42 °C:een.',
    kotiAlyImpact: 'Vapauttaa pumpun lämmittämään lattioita 90 % ajasta sen sijaan että pumppu poukkoilisi jatkuvasti käyttöveteen.',
  },
  {
    id: 'dhw_tank_heat_max',
    category: 'dhw',
    name: 'Säiliön lämmitysaika enintään (Säiliön lämm. aika enint.)',
    menuPath: 'Asennusasetukset → Toiminta-asetukset → Säiliö → Säiliön lämm. aika (enint.)',
    recommendedValue: '01:00 (60 min)',
    allowedRange: '0:05 – 4:00',
    previousValue: 'Ei tiedossa',
    reason: 'Riittää täyteen käyttövesisykliin suihkujen jälkeen, mutta katkaisee syklin tunnin kohdalla, jotta lattialämmitys ei kylmene talvipakkasilla.',
    kotiAlyImpact: 'Takaa lattioille riittävän lämpöenergian saannin myös kylmimpinä pakkaspäivinä.',
  },
  {
    id: 'dhw_floor_heat_max',
    category: 'dhw',
    name: 'Lämmityksen toiminta-aika enintään (Toiminta-aika enint.)',
    menuPath: 'Asennusasetukset → Toiminta-asetukset → Säiliö → Toiminta-aika (enint.)',
    recommendedValue: '03:00 – 04:00 (3–4 h)',
    allowedRange: '0:30 – 10:00',
    previousValue: 'Ei tiedossa',
    reason: 'Varmistaa, että laatta saa vähintään 3–4 tuntia yhtäjaksoista lämmitystä ennen seuraavaa mahdollista käyttövesisykliä.',
    kotiAlyImpact: 'Lattialaatta ehtii varata suuren määrän halpaa yölämpöä.',
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
  },

  // ─── 4. Sähköinen lisävastus ───
  {
    id: 'heater_on_ambient',
    category: 'heater',
    name: 'Lämmitin ON: ulkolämpötila (Lisävastuksen sallintaraja)',
    menuPath: 'Asennusasetukset → Toiminta-asetukset → Lämmitys → Lämmitin ON: ulkolämpötila',
    recommendedValue: '-10 °C (tai -12 °C)',
    allowedRange: '-15 °C – 20 °C',
    previousValue: '0 °C / +5 °C',
    reason: 'Kieltää kalliin suoran sähkövastuksen nollakeleillä ja leudoilla pakkasilla.',
    kotiAlyImpact: 'Estää turhat sähkönkulutuspiikit ja antaa kompressorin hoitaa lämmityksen korkealla hyötysuhteella.',
  },
];

const NOTES_KEY = 'kotialy_heatpump_commissioning_notes_v1';

export function PanasonicSettingsCard() {
  const [filter, setFilter] = useState<'all' | 'curve' | 'heating' | 'dhw' | 'heater'>('all');
  const [notes, setNotes] = useState<string>(() => {
    try {
      return localStorage.getItem(NOTES_KEY) || 'Kaikki arvot konfiguroitu Panasonicin seinäohjaimelle 16.9.2026. Lattialämmityksen katkokäynti poistettu ja Kotiäly APC -yhteensopivuus varmistettu.';
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
            Kotiälyn ja lattialämmityksen kanssa optimoidut viralliset laiteasetukset (Asennettu 16.9.2026).
          </p>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: 'Kaikki (11)' },
            { id: 'curve', label: '📈 Lämpökäyrä' },
            { id: 'heating', label: '🔥 Lämmitys & ΔT' },
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

      {/* Quick Summary Highlights */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 12,
        marginBottom: 24,
      }}>
        <div style={{
          padding: '12px 16px',
          borderRadius: 10,
          background: 'rgba(59, 130, 246, 0.08)',
          border: '1px solid rgba(59, 130, 246, 0.2)',
        }}>
          <div style={{ fontSize: 11, color: '#93c5fd', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
            Lattian Peruskäyrä
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', marginTop: 4 }}>
            35 °C / 26 °C
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            -15 °C pakkasella / +15 °C leudolla
          </div>
        </div>

        <div style={{
          padding: '12px 16px',
          borderRadius: 10,
          background: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.2)',
        }}>
          <div style={{ fontSize: 11, color: '#6ee7b7', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
            Käynnistys-ΔT (Hystereesi)
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#10b981', marginTop: 4 }}>
            +4 °C
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            Sallii Kotiäly-säästön kalliilla tunneilla
          </div>
        </div>

        <div style={{
          padding: '12px 16px',
          borderRadius: 10,
          background: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.2)',
        }}>
          <div style={{ fontSize: 11, color: '#fcd34d', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
            LKV Uudelleenlämmitys
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#f59e0b', marginTop: 4 }}>
            -8 °C
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            Lopetti 15 krt/vrk katkokäynnin
          </div>
        </div>

        <div style={{
          padding: '12px 16px',
          borderRadius: 10,
          background: 'rgba(168, 85, 247, 0.08)',
          border: '1px solid rgba(168, 85, 247, 0.2)',
        }}>
          <div style={{ fontSize: 11, color: '#d8b4fe', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
            Lisävastuksen esto
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#a855f7', marginTop: 4 }}>
            -10 °C
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            Vastus estetty leudoilla keleillä
          </div>
        </div>
      </div>

      {/* Table of Settings */}
      <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', marginBottom: 24 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 600 }}>Asetuksen nimi & Polku</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 600, width: 140 }}>Suositusarvo</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 600, width: 120 }}>Aiempi arvo</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 600 }}>Perustelu & Kotiäly-vaikutus</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item, idx) => (
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
                <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '4px 10px',
                    borderRadius: 6,
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: '#10b981',
                    fontWeight: 700,
                    fontSize: 13,
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                  }}>
                    {item.recommendedValue}
                  </span>
                  {item.allowedRange && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                      Sallittu: {item.allowedRange}
                    </div>
                  )}
                </td>
                <td style={{ padding: '14px 16px', verticalAlign: 'top', color: '#f87171', fontSize: 12 }}>
                  {item.previousValue ? (
                    <span style={{ textDecoration: 'line-through', opacity: 0.8 }}>
                      {item.previousValue}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>–</span>
                  )}
                </td>
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
            ))}
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
