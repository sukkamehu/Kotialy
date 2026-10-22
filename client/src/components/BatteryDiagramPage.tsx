import { useState } from 'react';

type OperatingMode = 'solar_charge' | 'evening_discharge' | 'night_grid_charge' | 'blackout_eps' | 'standby';

interface ComponentDetail {
  id: string;
  title: string;
  code: string;
  category: string;
  icon: string;
  voltage: string;
  protection: string;
  cable: string;
  standards: string;
  description: string;
  specs: { label: string; value: string }[];
  installationNotes: string[];
}

export function BatteryDiagramPage() {
  const [mode, setMode] = useState<OperatingMode>('solar_charge');
  const [selectedComponent, setSelectedComponent] = useState<string | null>('inverter');
  const [activeSubTab, setActiveSubTab] = useState<'diagram' | 'cables' | 'ems_strategy'>('diagram');

  const componentDetails: Record<string, ComponentDetail> = {
    grid: {
      id: 'grid',
      title: 'Valtakunnan Jakeluverkko & Mittauskeskus',
      code: 'MK / 3N~ 400V 50Hz',
      category: 'Verkkoliityntä',
      icon: '🏛️',
      voltage: '400 V AC (3-vaihe, TN-C-S / TN-S)',
      protection: '3x25A gG/gL Pääsulakkeet',
      cable: 'AXMK 4x25 / MCMK 4x16+16',
      standards: 'SFS 6000, VBE2019 (Verkkoonliityntäehdot)',
      description: 'Kiinteistön sähköliittymä jakeluverkkoon (Herrfors Verkko). Sähkön osto ja aurinkosähkön/akun ylijäämän myynti kaksisuuntaisesti.',
      specs: [
        { label: 'Liittymäkoko', value: '3x25A (Liitäntäteho max 17.25 kW)' },
        { label: 'Nimellisjännite', value: '400V / 230V ±10% 50 Hz' },
        { label: 'Oikosulkuvirta Ik min', value: '> 250 A (Mitoitettu)' },
        { label: 'Maadoitus', value: 'TN-S kiinteistössä, maadoituselektrodi perusmaadoituksena' },
      ],
      installationNotes: [
        'Pääsulakkeiden selektiivisyys huomioitava invertterin 3x20A/3x25A suojaukseen nähden.',
        'Sähköyhtiölle toimitettava mikrotuotannon yleistietolomake ennen käyttöönottoa.',
      ],
    },
    smart_meter: {
      id: 'smart_meter',
      title: 'Kaksisuuntainen Älymittari (Smart Meter)',
      code: 'EM1 / RS485 Modbus RTU',
      category: 'Mittaustekniikka',
      icon: '📊',
      voltage: '3x230/400V AC',
      protection: 'Johdonsuojakatkaisija B6A 3P (mittausjännite)',
      cable: 'LiYCY 2x2x0.5mm² (Suojattu kierretty pari RS485)',
      standards: 'EN 50470-1/3, MID-hyväksytty, Luokka B',
      description: 'Asennetaan pääkytkimen jälkeen ennen kuormia. Mittaa reaaliaikaisen virran ja tehonsiirron suunnan vaiheittain (L1, L2, L3) virtamuuntimilla (CT 100A). Ohjaa invertterin nollasyöttöä ja akun latausta/purkua.',
      specs: [
        { label: 'Malli', value: 'Eastron SDM630MCT / Chint DTSU666' },
        { label: 'Mittaustapa', value: '3x CT-virtamuuntimet (Split-core 100A/5A tai 100A/333mV)' },
        { label: 'Väylänopeus', value: '9600 / 19200 baud, 8-N-1' },
        { label: 'Vasteaika', value: '< 100 ms (Invertterin säätösilmukka)' },
      ],
      installationNotes: [
        'Virtamuuntimien (CT) nuolen suunnan oltava ehdottomasti kohti kuormia (Grid -> Load).',
        'RS485-kaapelin häiriösuojavaippa maadoitetaan VAIN invertterin päästä (maasilmukoiden esto).',
        'Väylän molempiin päihin 120 Ω päätevastus tarvittaessa.',
      ],
    },
    spd: {
      id: 'spd',
      title: 'Pääkeskuksen Ylijännitesuoja T1+T2',
      code: 'SPD1 / Type 1+2 Combi',
      category: 'Suojauslaitteet',
      icon: '🛡️',
      voltage: 'Uc = 275V / 400V AC',
      protection: 'Etusulake max 125A gG tai suoraan pääkytkimen rinnalla',
      cable: 'MK 10mm² / 16mm² Cu (lyhyt johdotus <0.5m)',
      standards: 'SFS-EN 61643-11, SFS 6000-4-443',
      description: 'Yhdistetty salamasuoja (T1, 10/350µs) ja ylijännitesuoja (T2, 8/20µs). Suojaa herkkää invertterielektroniikkaa, akkua ja lämpöpumpun piirikortteja salamaniskuilta ja kytkentäylijännitteiltä.',
      specs: [
        { label: 'Salamasyöksyvirta Iimp', value: '12.5 kA per napa (10/350 µs)' },
        { label: 'Nimellissyöksyvirta In', value: '25 kA (8/20 µs)' },
        { label: 'Suojaustaso Up', value: '≤ 1.5 kV' },
        { label: 'Hälytyskosketin', value: 'Potentiaalivapaa vaihtokosketin Kotiälylle' },
      ],
      installationNotes: [
        'Johtimien yhteenlaskettu pituus pääkiskolta maadoituskiskolle saa olla enintään 50 cm.',
        'Vaihdettavat varistoripatruunat optisella vikatilailmaisimella.',
      ],
    },
    ats: {
      id: 'ats',
      title: 'Verkonerotuskytkentä / Varavoimakytkin (ATS)',
      code: 'ATS1 / 4P 40A / 63A',
      category: 'Varavoimatekniikka',
      icon: '🔀',
      voltage: '400V AC 3P+N',
      protection: 'Mekaanisesti & sähköisesti lukittu',
      cable: 'MCMK 4x10+10 / XPJ 5G10',
      standards: 'SFS 6000-5-551, SFS-EN 60947-6-1',
      description: '4-napainen (katkaisee myös nollajohtimen!) kytkentälaite, joka varmistaa, että sähkökatkon aikana kiinteistön varavoimaverkko on 100% galvaanisesti erotettu valtakunnanverkosta. Estää hengenvaarallisen takasyötön pimeään verkkoon.',
      specs: [
        { label: 'Toimintatapa', value: 'Automaattinen kontaktori + Manuaalinen 1-0-2 ohituskytkin' },
        { label: 'Kytkentäaika', value: 'Katkos < 20 ms (Invertterin sisäinen rele) / Ulkoinen ATS' },
        { label: 'Napaisuus', value: '4P (L1, L2, L3, N) samanaikaisesti katkaiseva' },
        { label: 'N-PE -siltaus katkolla', value: 'Invertterin maadoitusrele muodostaa TN-S saarekkeessa' },
      ],
      installationNotes: [
        'Vaaditaan aina sähkölaitoksen ja turvallisuusmääräysten mukaan varavoimalaitteistoihin.',
        'Manuaalinen ohituskytkin (Bypass) mahdollistaa invertterin huollon ilman talon sähkökatkoa.',
      ],
    },
    inverter: {
      id: 'inverter',
      title: '3-vaiheinen Hybridi-Invertteri (10–12 kW)',
      code: 'INV1 / 3-Phase Hybrid Inverter',
      category: 'Tehoelektroniikka',
      icon: '⚡',
      voltage: 'AC 400V 3N~ / DC PV 150–800V / DC Batt 40–60V (tai HV)',
      protection: 'C25A 3P+N (Grid) & C20A 3P+N (EPS/Load), Type B RCD',
      cable: 'Grid: XPJ 5G6 | EPS: XPJ 5G4/6 | Batt: 50mm² Cu | PV: Radox 6mm²',
      standards: 'SFS-EN 50549-1, VDE-AR-N 4105, CE, IP65',
      description: 'Järjestelmän sydän. Kaksisuuntainen 3-vaihe invertteri, jossa 2x MPPT aurinkopaneelisäädintä, korkeatehoinen akkulaturi/purkaja sekä itsenäinen EPS-varavoimalähtö saarekekäyttöön.',
      specs: [
        { label: 'Nimellisteho AC', value: '12 000 W (12 kW) jatkuva 3-vaihe' },
        { label: 'EPS-varavoimateho', value: '12 kW jatkuva, huippu 18 kW (10 s)' },
        { label: 'Akun lataus/purkuvirta', value: 'Max 240 A (48V LV) tai 50 A (HV)' },
        { label: 'MPPT-tulot', value: '2 kpl itsenäisiä (2x 15A/20A, jännitealue 150–800 V)' },
        { label: 'Tiedonsiirtoväylät', value: 'Modbus RS485 (Mittari), CAN-bus (BMS), WiFi/LAN (Kotiäly)' },
      ],
      installationNotes: [
        'Asennetaan tekniseen tilaan palamattomalle seinälle, vapaa tila ympärillä vähintään 50 cm.',
        'Sisäänrakennettu DC-kytkin aurinkopaneeleille.',
        'Kotiäly ohjaa tehoasetuksia ja hinta-arbitraasia suoraan Modbus TCP / MQTT -väylän kautta.',
      ],
    },
    battery: {
      id: 'battery',
      title: 'LiFePO4-Energiavarasto (15 kWh Akkupankki)',
      code: 'BAT1 / 51.2V 300Ah (tai HV 200–400V)',
      category: 'Energiavarasto',
      icon: '🔋',
      voltage: '51.2 V DC (16S LiFePO4) tai High Voltage 200–400V',
      protection: '2P DC 160A–200A NH00-sulake / Automaattierotin',
      cable: 'ÖLFLEX Solar/Battery 50 mm² tai 70 mm² kaksinkertaisesti eristetty',
      standards: 'UN38.3, IEC 62619, CE, VDE 2510-50',
      description: 'Turvallinen litiumrautafosfaatti (LiFePO4) -kemia, jossa ei ole termisen karkaamisen tai tulipalon riskiä kuten vanhoissa litiumioniakuissa. Yli 6000 lataussykliä 80% kapasiteetin säilyvyydellä (15–20 vuoden elinikä).',
      specs: [
        { label: 'Kapasiteetti', value: '15.36 kWh (300 Ah @ 51.2V)' },
        { label: 'Käytettävä kapasiteetti', value: '13.8 kWh (90% DoD suositeltu)' },
        { label: 'Jatkuva purkuteho', value: '10 kW (200 A @ 50V)' },
        { label: 'Syklien määrä', value: '≥ 6000 sykliä (0.5C / 25°C)' },
        { label: 'Hyötysuhde (Roundtrip)', value: '> 95%' },
      ],
      installationNotes: [
        'Sijoitus lämpimään tilaan (+10°C ... +25°C), LiFePO4-akkua ei saa ladata alle 0°C lämpötilassa.',
        'Akulle asennetaan erillinen 2-napainen DC-sulakekytkin (NH00 160A) molempiin napoihin (+ ja -).',
        'Kaapelipituudet invertterille pidetään lyhyinä (< 2 m) jännitehäviön minimoimiseksi.',
      ],
    },
    bms: {
      id: 'bms',
      title: 'Akkuhallintajärjestelmä (BMS & Active Balancer)',
      code: 'BMS1 / Smart CAN/RS485 BMS',
      category: 'Akkuvalvonta',
      icon: '🧠',
      voltage: '48V–60V DC',
      protection: 'Elektroninen ylijännite, alijännite, ylivirta & oikosulku',
      cable: 'CAN-bus 120 Ω suojattu parikaapeli',
      standards: 'ISO 26262 ASIL-C valmius, IEC 61508',
      description: 'Valvoo jokaisen 16 yksittäisen LiFePO4-kennon jännitettä millivolttitarkkuudella, akuston lämpötiloja ja virtoja. Kommunikoi invertterin kanssa CAN-väylää pitkin ja säätää latausvirran dynaamisesti.',
      specs: [
        { label: 'Väyläyhteys', value: 'CAN-bus 2.0B (500 kbps) / RS485' },
        { label: 'Aktiivitasapainotus', value: '1A–2A aktiivinen kondensaattoritasapainotus' },
        { label: 'Lämpötila-anturit', value: '4 kpl kennoantureita + 1 kpl BMS-jäähdytysanturi' },
        { label: 'Laukaisuajat', value: 'Oikosulku < 300 µs, Ylivirta < 10 ms' },
      ],
      installationNotes: [
        'Katkaisee latauksen automaattisesti jos kennolämpötila < 0°C tai > 55°C.',
        'Katkaisee purun jos yksittäinen kennojännite putoaa alle 2.60 V (suojaa syväpurkaukselta).',
      ],
    },
    backup_panel: {
      id: 'backup_panel',
      title: 'Kriittiset Kuormat (EPS-Varavoimakeskus)',
      code: 'RK-EPS / Varavoimaryhmäkeskus',
      category: 'Sähkönjakelu',
      icon: '💡',
      voltage: '400V 3N~ 50 Hz (Invertterin EPS-lähdöstä)',
      protection: 'Vikavirtasuojat 30mA Type A, Johdonsuojat B10A/C16A',
      cable: 'MMJ 3x1.5 / MMJ 3x2.5 / MMJ 5x2.5',
      standards: 'SFS 6000-7-710 / 5-551',
      description: 'Ryhmäkeskus kiinteistön tärkeimmille sähkölaitteille, jotka pidetään päällä sähkökatkon sattuessa. Saa virran invertterin EPS-portista ilman katkoa (<20ms vaihtoaika).',
      specs: [
        { label: 'Syöttöteho max', value: '12 kW (Invertterin EPS-kapasiteetti)' },
        { label: '1. Kriittinen kuorma', value: 'Panasonic VILP ohjaus & kiertovesipumput (Lämmitys)' },
        { label: '2. Kriittinen kuorma', value: 'Kotiäly-palvelin, kuitumuunnin, reititin, valvonta' },
        { label: '3. Kriittinen kuorma', value: 'Keittiön kylmälaitteet (Jääkaappi, pakastin)' },
        { label: '4. Kriittinen kuorma', value: 'Talon perusvalaistus & hätäpistorasioita' },
      ],
      installationNotes: [
        'EPS-keskuksen nollakisko (N) on saarekkeessa pidettävä erillään valtakunnanverkon nollasta.',
        'Keskukseen EI kytketä suuria ei-kriittisiä tehoja (kuten sauna tai autonlataus).',
      ],
    },
    normal_loads: {
      id: 'normal_loads',
      title: 'Ei-kriittiset Suurkuormat (Pääkeskuksen Grid-puoli)',
      code: 'PK-Grid / Suurkuormat',
      category: 'Sähkönjakelu',
      icon: '🔌',
      voltage: '400V 3N~ 50Hz',
      protection: 'C16A–C20A 3P johdonsuojat',
      cable: 'MMJ 5x2.5 / MMJ 5x4 / MCMK 4x6+6',
      standards: 'SFS 6000',
      description: 'Laitteet, jotka saavat normaalitilassa sähköä verkosta, auringosta tai akusta, mutta jotka KATKAISTAAN sähkökatkon aikana akun säästämiseksi.',
      specs: [
        { label: 'Sähkökiuas', value: '9.0 kW (3-vaihe, kuormittaisi akun tyhjäksi 1.5 tunnissa)' },
        { label: 'Sähköauton latausasema', value: '11.0 kW (3x16A EVSE, ohjataan Kotiälyn APC:llä)' },
        { label: 'VILP Tehovastukset', value: '9.0 kW (Aquarea sisäinen varalämmitin katkaistaan)' },
      ],
      installationNotes: [
        'Kytketty verkkopuolelle ennen ATS-erotuskytkintä, joten ne putoavat automaattisesti pois katkolla.',
      ],
    },
    pv_solar: {
      id: 'pv_solar',
      title: 'Aurinkosähköjärjestelmä (PV-paneelikenttä)',
      code: 'PV1 & PV2 / DC Solar Arrays',
      category: 'Uusiutuva Tuotanto',
      icon: '☀️',
      voltage: 'DC 350V–600V (String-jännite)',
      protection: 'DC-turvakytkimet 1000V 25A + DC Ylijännitesuoja T2',
      cable: 'Radox / KBE Solar 6 mm² UV-suojattu kaksoiseristetty',
      standards: 'SFS 6000-7-712, IEC 62548',
      description: 'Kaksi itsenäistä aurinkopaneeliketjua (stringiä). Ketju 1 suunnattu aamuaurinkoon (Itä/Kaakko) ja Ketju 2 iltapäiväaurinkoon (Länsi/Lounas) tasaisen tuotantoprofiilin saamiseksi.',
      specs: [
        { label: 'Kokonaisteho WP', value: '10–12 kWp (esim. 24–28 kpl 430W TopCon-paneeleita)' },
        { label: 'String 1 (Itä)', value: '12–14 paneelia sarjassa (~500V DC)' },
        { label: 'String 2 (Länsi)', value: '12–14 paneelia sarjassa (~500V DC)' },
        { label: 'Tuottoarvio', value: '~9 500 – 11 000 kWh / vuosi' },
      ],
      installationNotes: [
        'DC-kaapelit vedetään metallisessa suojaputkessa sisätiloissa paloturvallisuuden takaamiseksi.',
        'Katolle ja tekniseen tilaan asennetaan lakisääteiset varoituskilvet "Varoitus: Aurinkosähkölaitteisto DC".',
      ],
    },
    kotialy_ems: {
      id: 'kotialy_ems',
      title: 'Kotiäly EMS -Älyohjaus & Pörssisähköoptimointi',
      code: 'KOTIALY / AI Energy Manager',
      category: 'Älyohjaus',
      icon: '🤖',
      voltage: 'Ethernet LAN / Modbus TCP / MQTT',
      protection: 'Ohjelmistollinen rajapinta + Watchdog',
      cable: 'CAT6 UTP / Modbus RTU',
      standards: 'IEEE 802.3, REST API, MQTT v5',
      description: 'Kotiäly-palvelin toimii kiinteistön älykkäänä energianhallintana (EMS). Se yhdistää Nordpool-pörssisähkön hintaennusteet, sääennusteen, VILP-lämmitystarpeen ja akuston tilan (SoC) optimoidakseen sähkökustannukset minimiin.',
      specs: [
        { label: 'Arbitraasistrategia', value: 'Lataa halvimmilla tunneilla (< 3 snt) -> Pura kalliilla tunneilla (> 10 snt)' },
        { label: 'Peak Shaving', value: 'Leikkaa kiinteistön tehohuiput akun avulla alle 5 kW' },
        { label: 'VILP-synkronointi', value: 'Kun akku on 95% täynnä, ylijäämä ajetaan puskurivaraajaan ja LKV:hen' },
        { label: 'Storm Mode', value: 'Myrskyvaroituksessa akku ladataan ennakkoon 100% katkovaralle' },
      ],
      installationNotes: [
        'Kommunikoi suoraan hybridi-invertterin Modbus TCP / RTU -rekistereiden kanssa paikallisesti.',
        'Ei pilviriippuvuutta – optimointi toimii täysin itsenäisesti palvelimella.',
      ],
    },
  };

  const selectedInfo = selectedComponent ? componentDetails[selectedComponent] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 36 }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
        <div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>🔋</span> Akkukytkentäjärjestelmän Täydellinen Sähkökaavio
          </h2>
          <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: 3 }}>
            3-vaiheinen 400V TN-S päävirtakaavio, 12 kW hybridi-invertteri, 15 kWh LiFePO4 -energiavarasto, ATS-erotus & kriittiset varavoimakuormat
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div
          style={{
            display: 'flex',
            background: 'rgba(0, 0, 0, 0.4)',
            padding: '4px',
            borderRadius: 12,
            border: '1px solid rgba(255, 255, 255, 0.08)',
            gap: 4,
          }}
        >
          <button
            type="button"
            onClick={() => setActiveSubTab('diagram')}
            style={{
              padding: '7px 16px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              border: 'none',
              background: activeSubTab === 'diagram' ? 'rgba(16, 185, 129, 0.25)' : 'transparent',
              color: activeSubTab === 'diagram' ? '#34d399' : 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s ease',
            }}
          >
            <span>⚡</span> Päävirtakaavio
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('cables')}
            style={{
              padding: '7px 16px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              border: 'none',
              background: activeSubTab === 'cables' ? 'rgba(56, 189, 248, 0.25)' : 'transparent',
              color: activeSubTab === 'cables' ? '#38bdf8' : 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s ease',
            }}
          >
            <span>📋</span> Kaapeli- & Mitoitustaulukko
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('ems_strategy')}
            style={{
              padding: '7px 16px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              border: 'none',
              background: activeSubTab === 'ems_strategy' ? 'rgba(245, 158, 11, 0.25)' : 'transparent',
              color: activeSubTab === 'ems_strategy' ? '#fbbf24' : 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s ease',
            }}
          >
            <span>🤖</span> Kotiäly EMS -Älyohjaus
          </button>
        </div>
      </div>

      {activeSubTab === 'diagram' && (
        <>
          {/* Mode Selector Pill Bar */}
          <div
            className="card"
            style={{
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              background: 'rgba(15, 23, 42, 0.65)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Simuloi energiavirtaa eri toimintatiloissa:
              </div>
              <div style={{ fontSize: '0.78rem', color: '#34d399', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="live-dot" /> Klikkaa kaavion komponentteja nähdäksesi tarkat kytkentätiedot
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setMode('solar_charge')}
                style={{
                  padding: '8px 14px',
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: mode === 'solar_charge' ? '1px solid #34d399' : '1px solid rgba(255,255,255,0.08)',
                  background: mode === 'solar_charge' ? 'rgba(52, 211, 153, 0.2)' : 'rgba(255,255,255,0.03)',
                  color: mode === 'solar_charge' ? '#34d399' : 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease',
                }}
              >
                <span>☀️</span> Aurinko tuottaa & Lataa akkua
              </button>

              <button
                type="button"
                onClick={() => setMode('evening_discharge')}
                style={{
                  padding: '8px 14px',
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: mode === 'evening_discharge' ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.08)',
                  background: mode === 'evening_discharge' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.03)',
                  color: mode === 'evening_discharge' ? '#38bdf8' : 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease',
                }}
              >
                <span>🌙</span> Iltapurku taloon (Kallis pörssitunti)
              </button>

              <button
                type="button"
                onClick={() => setMode('night_grid_charge')}
                style={{
                  padding: '8px 14px',
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: mode === 'night_grid_charge' ? '1px solid #fbbf24' : '1px solid rgba(255,255,255,0.08)',
                  background: mode === 'night_grid_charge' ? 'rgba(251, 191, 36, 0.2)' : 'rgba(255,255,255,0.03)',
                  color: mode === 'night_grid_charge' ? '#fbbf24' : 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease',
                }}
              >
                <span>⚡</span> Yölataus verkosta (Halpa pörssitunti)
              </button>

              <button
                type="button"
                onClick={() => setMode('blackout_eps')}
                style={{
                  padding: '8px 14px',
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: mode === 'blackout_eps' ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.08)',
                  background: mode === 'blackout_eps' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(255,255,255,0.03)',
                  color: mode === 'blackout_eps' ? '#f87171' : 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease',
                }}
              >
                <span>🚨</span> Sähkökatko & Varavoima (EPS Saareke)
              </button>

              <button
                type="button"
                onClick={() => setMode('standby')}
                style={{
                  padding: '8px 14px',
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: mode === 'standby' ? '1px solid #94a3b8' : '1px solid rgba(255,255,255,0.08)',
                  background: mode === 'standby' ? 'rgba(148, 163, 184, 0.2)' : 'rgba(255,255,255,0.03)',
                  color: mode === 'standby' ? '#cbd5e1' : 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease',
                }}
              >
                <span>⏸️</span> Valmiustila (Standby / Bypass)
              </button>
            </div>
          </div>

          {/* Interactive Schematic Area + Inspector Sidebar */}
          <div style={{ display: 'grid', gridTemplateColumns: selectedComponent ? 'minmax(0, 1fr) 380px' : '1fr', gap: 16 }}>
            {/* SVG Canvas Card */}
            <div
              className="card"
              style={{
                padding: '20px 16px',
                background: 'radial-gradient(ellipse at 50% 30%, rgba(15, 23, 42, 0.98), rgba(8, 12, 22, 1))',
                border: '1px solid rgba(255,255,255,0.12)',
                boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                overflowX: 'auto',
                position: 'relative',
              }}
            >
              <div style={{ minWidth: 920, width: '100%' }}>
                <svg viewBox="0 0 1020 620" width="100%" height="620" style={{ overflow: 'visible', userSelect: 'none' }}>
                  <defs>
                    {/* Glowing Filters */}
                    <filter id="glowGreen" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="3.5" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                    <filter id="glowBlue" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="3.5" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                    <filter id="glowYellow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="3.5" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                    <filter id="glowRed" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="3.5" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>

                    {/* Component Box Gradients */}
                    <linearGradient id="inverterGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1e293b" />
                      <stop offset="100%" stopColor="#0f172a" />
                    </linearGradient>

                    <linearGradient id="batteryGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#064e3b" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#022c22" stopOpacity="0.95" />
                    </linearGradient>

                    <linearGradient id="solarGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#78350f" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#451a03" stopOpacity="0.95" />
                    </linearGradient>
                  </defs>

                  {/* ─── ELECTRICAL ZONES / BOUNDARY BOXES ─── */}
                  {/* Zone 1: Sähköliittymä & Pääkeskus */}
                  <rect x="20" y="30" width="260" height="560" rx="14" fill="rgba(255,255,255,0.015)" stroke="rgba(56, 189, 248, 0.2)" strokeDasharray="5 5" />
                  <text x="35" y="55" fill="#38bdf8" fontSize="11" fontWeight="800" letterSpacing="0.08em">ZONE 1: PÄÄKESKUS (PK) & VERKKO</text>

                  {/* Zone 2: Tekninen Tila (Invertteri & Akku) */}
                  <rect x="300" y="30" width="420" height="560" rx="14" fill="rgba(16, 185, 129, 0.02)" stroke="rgba(16, 185, 129, 0.25)" strokeDasharray="5 5" />
                  <text x="315" y="55" fill="#34d399" fontSize="11" fontWeight="800" letterSpacing="0.08em">ZONE 2: TEKNINEN TILA (HYBRIDI & AKKU)</text>

                  {/* Zone 3: Kuormat (EPS Varavoima & Suurkuormat) */}
                  <rect x="740" y="30" width="260" height="560" rx="14" fill="rgba(245, 158, 11, 0.015)" stroke="rgba(245, 158, 11, 0.2)" strokeDasharray="5 5" />
                  <text x="755" y="55" fill="#fbbf24" fontSize="11" fontWeight="800" letterSpacing="0.08em">ZONE 3: KIINTEISTÖN KUORMAT</text>

                  {/* ─── POWER FLOW LINES (WIRES) ─── */}

                  {/* 1. Grid -> Smart Meter -> ATS */}
                  <path
                    d="M 150 140 L 150 200 L 150 260"
                    stroke="#475569"
                    strokeWidth="8"
                    strokeLinecap="round"
                    fill="none"
                  />
                  {(mode === 'solar_charge' || mode === 'night_grid_charge' || mode === 'standby') && (
                    <path
                      d="M 150 140 L 150 200 L 150 260"
                      stroke={mode === 'night_grid_charge' ? '#fbbf24' : '#38bdf8'}
                      strokeWidth="3.5"
                      fill="none"
                      className="pipe-flow-active"
                      filter="url(#glowBlue)"
                    />
                  )}

                  {/* 2. ATS -> Inverter AC GRID Port */}
                  <path
                    d="M 150 300 L 150 340 L 360 340 L 360 270"
                    stroke="#475569"
                    strokeWidth="8"
                    strokeLinejoin="round"
                    fill="none"
                  />
                  {mode !== 'blackout_eps' && (
                    <path
                      d="M 150 300 L 150 340 L 360 340 L 360 270"
                      stroke={mode === 'night_grid_charge' ? '#fbbf24' : mode === 'evening_discharge' ? '#34d399' : '#38bdf8'}
                      strokeWidth="3.5"
                      strokeLinejoin="round"
                      fill="none"
                      className={mode === 'evening_discharge' ? 'pipe-flow-reverse' : 'pipe-flow-active'}
                      filter="url(#glowGreen)"
                    />
                  )}

                  {/* 3. Inverter EPS Backup Port -> ATS Varavoimatulo -> EPS Keskus */}
                  <path
                    d="M 470 270 L 470 380 L 760 380 L 760 250"
                    stroke="#475569"
                    strokeWidth="8"
                    strokeLinejoin="round"
                    fill="none"
                  />
                  {(mode === 'blackout_eps' || mode === 'evening_discharge' || mode === 'solar_charge') && (
                    <path
                      d="M 470 270 L 470 380 L 760 380 L 760 250"
                      stroke={mode === 'blackout_eps' ? '#ef4444' : '#34d399'}
                      strokeWidth="4"
                      strokeLinejoin="round"
                      fill="none"
                      className="pipe-flow-active"
                      filter={mode === 'blackout_eps' ? 'url(#glowRed)' : 'url(#glowGreen)'}
                    />
                  )}

                  {/* 4. Normal Loads branch (From PK Grid side before ATS) */}
                  <path
                    d="M 150 240 L 250 240 L 250 480 L 760 480"
                    stroke="#475569"
                    strokeWidth="7"
                    strokeLinejoin="round"
                    fill="none"
                  />
                  {mode !== 'blackout_eps' && (
                    <path
                      d="M 150 240 L 250 240 L 250 480 L 760 480"
                      stroke="#f59e0b"
                      strokeWidth="3"
                      strokeLinejoin="round"
                      fill="none"
                      className="pipe-flow-active"
                      filter="url(#glowYellow)"
                    />
                  )}

                  {/* 5. DC Battery Wires (Battery -> BMS -> Inverter DC Port) */}
                  <path
                    d="M 420 480 L 420 270"
                    stroke="#047857"
                    strokeWidth="10"
                    strokeLinecap="round"
                    fill="none"
                  />
                  {(mode === 'solar_charge' || mode === 'night_grid_charge' || mode === 'evening_discharge' || mode === 'blackout_eps') && (
                    <path
                      d="M 420 480 L 420 270"
                      stroke={mode === 'evening_discharge' || mode === 'blackout_eps' ? '#34d399' : '#fbbf24'}
                      strokeWidth="4.5"
                      fill="none"
                      className={mode === 'evening_discharge' || mode === 'blackout_eps' ? 'pipe-flow-reverse' : 'pipe-flow-active'}
                      filter="url(#glowGreen)"
                    />
                  )}

                  {/* 6. Solar DC Cables (PV Arrays -> Inverter MPPT) */}
                  <path
                    d="M 610 130 L 610 200 L 490 200 L 490 220"
                    stroke="#b45309"
                    strokeWidth="8"
                    strokeLinejoin="round"
                    fill="none"
                  />
                  {mode === 'solar_charge' && (
                    <path
                      d="M 610 130 L 610 200 L 490 200 L 490 220"
                      stroke="#f59e0b"
                      strokeWidth="4"
                      strokeLinejoin="round"
                      fill="none"
                      className="pipe-flow-active"
                      filter="url(#glowYellow)"
                    />
                  )}

                  {/* 7. Communication Data Busses (Dotted lines) */}
                  {/* Smart Meter RS485 -> Inverter */}
                  <path d="M 190 215 L 340 215 L 340 230" stroke="#38bdf8" strokeWidth="2" strokeDasharray="4 3" fill="none" opacity="0.75" />
                  {/* BMS CAN-bus -> Inverter */}
                  <path d="M 450 495 L 450 270" stroke="#a78bfa" strokeWidth="2" strokeDasharray="4 3" fill="none" opacity="0.75" />
                  {/* Kotiäly EMS Modbus TCP -> Inverter */}
                  <path d="M 640 400 L 640 250 L 520 250" stroke="#34d399" strokeWidth="2" strokeDasharray="4 3" fill="none" opacity="0.75" />

                  {/* ─── ELECTRICAL SCHEMATIC COMPONENTS ─── */}

                  {/* Component 1: VALTAKUNNANVERKKO */}
                  <g
                    onClick={() => setSelectedComponent('grid')}
                    style={{ cursor: 'pointer' }}
                  >
                    <rect
                      x="50"
                      y="80"
                      width="200"
                      height="65"
                      rx="10"
                      fill="#0f172a"
                      stroke={selectedComponent === 'grid' ? '#38bdf8' : 'rgba(56, 189, 248, 0.4)'}
                      strokeWidth={selectedComponent === 'grid' ? 2.5 : 1.2}
                    />
                    <text x="70" y="108" fill="#e2e8f0" fontSize="13" fontWeight="800">🏛️ Jakeluverkko</text>
                    <text x="70" y="128" fill="#94a3b8" fontSize="10.5">3x25A · 400V 50Hz (TN-C-S)</text>
                  </g>

                  {/* Component 2: SMART METER + SPD */}
                  <g
                    onClick={() => setSelectedComponent('smart_meter')}
                    style={{ cursor: 'pointer' }}
                  >
                    <rect
                      x="50"
                      y="185"
                      width="200"
                      height="65"
                      rx="10"
                      fill="#0f172a"
                      stroke={selectedComponent === 'smart_meter' ? '#38bdf8' : 'rgba(255,255,255,0.15)'}
                      strokeWidth={selectedComponent === 'smart_meter' ? 2.5 : 1.2}
                    />
                    <text x="70" y="213" fill="#e2e8f0" fontSize="13" fontWeight="800">📊 Smart Meter (CT 100A)</text>
                    <text x="70" y="233" fill="#94a3b8" fontSize="10.5">Eastron SDM630 · RS485 Modbus</text>
                  </g>

                  {/* Component 3: ATS / VERKONEROTUS */}
                  <g
                    onClick={() => setSelectedComponent('ats')}
                    style={{ cursor: 'pointer' }}
                  >
                    <rect
                      x="50"
                      y="275"
                      width="200"
                      height="65"
                      rx="10"
                      fill="#0f172a"
                      stroke={selectedComponent === 'ats' ? '#fbbf24' : mode === 'blackout_eps' ? '#ef4444' : 'rgba(255,255,255,0.15)'}
                      strokeWidth={selectedComponent === 'ats' ? 2.5 : 1.2}
                    />
                    <text x="70" y="303" fill="#e2e8f0" fontSize="13" fontWeight="800">🔀 ATS-Verkonerotuskytkin</text>
                    <text x="70" y="323" fill={mode === 'blackout_eps' ? '#f87171' : '#94a3b8'} fontSize="10.5">
                      {mode === 'blackout_eps' ? '⚠️ EROTETTU (Saareketila)' : '4P 63A · SFS 6000 Varavoima'}
                    </text>
                  </g>

                  {/* Component 4: HYBRID INVERTER (CENTRAL HUB) */}
                  <g
                    onClick={() => setSelectedComponent('inverter')}
                    style={{ cursor: 'pointer' }}
                  >
                    <rect
                      x="330"
                      y="140"
                      width="210"
                      height="130"
                      rx="12"
                      fill="url(#inverterGrad)"
                      stroke={selectedComponent === 'inverter' ? '#34d399' : 'rgba(52, 211, 153, 0.5)'}
                      strokeWidth={selectedComponent === 'inverter' ? 3 : 1.5}
                      filter="drop-shadow(0 10px 20px rgba(0,0,0,0.5))"
                    />
                    <rect x="345" y="155" width="180" height="24" rx="6" fill="rgba(16, 185, 129, 0.15)" />
                    <text x="355" y="171" fill="#34d399" fontSize="11" fontWeight="800" letterSpacing="0.05em">HYBRIDI-INVERTTERI 12 kW</text>

                    <text x="350" y="200" fill="#f8fafc" fontSize="12" fontWeight="700">⚡ 3-vaihe 400V Hybridi</text>
                    <text x="350" y="218" fill="#94a3b8" fontSize="10">2x MPPT (DC 150–800V)</text>
                    <text x="350" y="234" fill="#94a3b8" fontSize="10">AC Grid: 3x25A | EPS: 12kW</text>
                    <text x="350" y="250" fill="#38bdf8" fontSize="10" fontWeight="600">CAN / Modbus RTU & TCP</text>
                  </g>

                  {/* Component 5: PV SOLAR ARRAYS */}
                  <g
                    onClick={() => setSelectedComponent('pv_solar')}
                    style={{ cursor: 'pointer' }}
                  >
                    <rect
                      x="550"
                      y="70"
                      width="150"
                      height="65"
                      rx="10"
                      fill="url(#solarGrad)"
                      stroke={selectedComponent === 'pv_solar' ? '#fbbf24' : 'rgba(245, 158, 11, 0.4)'}
                      strokeWidth={selectedComponent === 'pv_solar' ? 2.5 : 1.2}
                    />
                    <text x="565" y="97" fill="#fef08a" fontSize="12" fontWeight="800">☀️ Aurinkopaneelit</text>
                    <text x="565" y="117" fill="#fde68a" fontSize="10">10–12 kWp (2x MPPT)</text>
                  </g>

                  {/* Component 6: BATTERY STORAGE (LIFEPO4) */}
                  <g
                    onClick={() => setSelectedComponent('battery')}
                    style={{ cursor: 'pointer' }}
                  >
                    <rect
                      x="330"
                      y="460"
                      width="210"
                      height="105"
                      rx="12"
                      fill="url(#batteryGrad)"
                      stroke={selectedComponent === 'battery' ? '#34d399' : 'rgba(52, 211, 153, 0.5)'}
                      strokeWidth={selectedComponent === 'battery' ? 3 : 1.5}
                    />
                    <text x="350" y="488" fill="#6ee7b7" fontSize="13" fontWeight="800">🔋 LiFePO4 -Akusto 15 kWh</text>
                    <text x="350" y="508" fill="#e2e8f0" fontSize="10.5">51.2V 300Ah (16S Prismatisch)</text>
                    <text x="350" y="526" fill="#a7f3d0" fontSize="10">6000+ sykliä · Palamaton kemia</text>
                    <text x="350" y="544" fill="#34d399" fontSize="10" fontWeight="700">2P 160A DC-sulakesuoja</text>
                  </g>

                  {/* Component 7: BMS CONTROLLER */}
                  <g
                    onClick={() => setSelectedComponent('bms')}
                    style={{ cursor: 'pointer' }}
                  >
                    <rect
                      x="440"
                      y="440"
                      width="95"
                      height="24"
                      rx="6"
                      fill="#1e1b4b"
                      stroke="#818cf8"
                      strokeWidth="1.2"
                    />
                    <text x="450" y="456" fill="#c7d2fe" fontSize="10" fontWeight="800">🧠 Smart BMS</text>
                  </g>

                  {/* Component 8: KOTIALY EMS (SOFTWARE CONTROLLER) */}
                  <g
                    onClick={() => setSelectedComponent('kotialy_ems')}
                    style={{ cursor: 'pointer' }}
                  >
                    <rect
                      x="570"
                      y="420"
                      width="135"
                      height="75"
                      rx="10"
                      fill="#0f172a"
                      stroke={selectedComponent === 'kotialy_ems' ? '#34d399' : 'rgba(52, 211, 153, 0.4)'}
                      strokeWidth={selectedComponent === 'kotialy_ems' ? 2 : 1}
                    />
                    <text x="585" y="445" fill="#34d399" fontSize="12" fontWeight="800">🤖 Kotiäly EMS</text>
                    <text x="585" y="465" fill="#94a3b8" fontSize="10">Nordpool Arbitraasi</text>
                    <text x="585" y="482" fill="#94a3b8" fontSize="10">Peak Shaving & VILP</text>
                  </g>

                  {/* Component 9: CRITICAL EPS BACKUP LOADS */}
                  <g
                    onClick={() => setSelectedComponent('backup_panel')}
                    style={{ cursor: 'pointer' }}
                  >
                    <rect
                      x="770"
                      y="160"
                      width="210"
                      height="145"
                      rx="12"
                      fill="#0f172a"
                      stroke={selectedComponent === 'backup_panel' ? '#34d399' : mode === 'blackout_eps' ? '#ef4444' : 'rgba(52, 211, 153, 0.4)'}
                      strokeWidth={selectedComponent === 'backup_panel' ? 2.5 : 1.2}
                    />
                    <rect x="785" y="175" width="180" height="22" rx="5" fill={mode === 'blackout_eps' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(52, 211, 153, 0.15)'} />
                    <text x="795" y="190" fill={mode === 'blackout_eps' ? '#f87171' : '#34d399'} fontSize="11" fontWeight="800">
                      {mode === 'blackout_eps' ? '🚨 VARAVOIMA AKTIIVINEN' : '💡 VARAVOIMAKUORMAT (EPS)'}
                    </text>

                    <text x="790" y="218" fill="#e2e8f0" fontSize="11">🌀 VILP ohjaus & kiertopumput</text>
                    <text x="790" y="238" fill="#e2e8f0" fontSize="11">🖥️ Kotiäly, reititin & kuitu</text>
                    <text x="790" y="258" fill="#e2e8f0" fontSize="11">🧊 Jääkaappi & pakastin</text>
                    <text x="790" y="278" fill="#e2e8f0" fontSize="11">💡 Talon perusvalaistus</text>
                    <text x="790" y="295" fill="#38bdf8" fontSize="9.5" fontWeight="600">Jatkuva virransyöttö &lt;20 ms</text>
                  </g>

                  {/* Component 10: NORMAL NON-CRITICAL LOADS */}
                  <g
                    onClick={() => setSelectedComponent('normal_loads')}
                    style={{ cursor: 'pointer' }}
                  >
                    <rect
                      x="770"
                      y="420"
                      width="210"
                      height="125"
                      rx="12"
                      fill="#0f172a"
                      stroke={selectedComponent === 'normal_loads' ? '#f59e0b' : 'rgba(245, 158, 11, 0.3)'}
                      strokeWidth={selectedComponent === 'normal_loads' ? 2.5 : 1.2}
                      opacity={mode === 'blackout_eps' ? 0.35 : 1}
                    />
                    <text x="790" y="448" fill="#f59e0b" fontSize="12" fontWeight="800">🔌 Suurkuormat (Grid-puoli)</text>
                    <text x="790" y="470" fill="#94a3b8" fontSize="11">🧖‍♂️ Sähkökiuas (9 kW)</text>
                    <text x="790" y="490" fill="#94a3b8" fontSize="11">🚗 Sähköauton lataus (11 kW)</text>
                    <text x="790" y="510" fill="#94a3b8" fontSize="11">🔥 VILP 9kW varavastukset</text>
                    <text x="790" y="530" fill={mode === 'blackout_eps' ? '#ef4444' : '#64748b'} fontSize="9.5" fontWeight="600">
                      {mode === 'blackout_eps' ? '❌ Katkaistu katkon ajaksi' : 'Päällä verkkosähköllä'}
                    </text>
                  </g>

                  {/* Explanatory Legend / Badges bottom left */}
                  <g transform="translate(40, 500)">
                    <rect x="0" y="0" width="220" height="70" rx="8" fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.08)" />
                    <circle cx="15" cy="18" r="5" fill="#38bdf8" />
                    <text x="28" y="22" fill="#94a3b8" fontSize="10">AC 400V 3N~ (L1, L2, L3, N, PE)</text>

                    <circle cx="15" cy="36" r="5" fill="#34d399" />
                    <text x="28" y="40" fill="#94a3b8" fontSize="10">DC Akku & EPS-varavoima</text>

                    <line x1="10" y1="54" x2="20" y2="54" stroke="#a78bfa" strokeWidth="2" strokeDasharray="3 2" />
                    <text x="28" y="58" fill="#94a3b8" fontSize="10">CAN-bus / RS485 Tiedonsiirto</text>
                  </g>
                </svg>
              </div>
            </div>

            {/* Inspector Details Sidebar */}
            {selectedInfo && (
              <div
                className="card"
                style={{
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                  background: 'rgba(15, 23, 42, 0.85)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
                  maxHeight: 660,
                  overflowY: 'auto',
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: '2rem' }}>{selectedInfo.icon}</span>
                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase' }}>
                        {selectedInfo.category} · {selectedInfo.code}
                      </div>
                      <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                        {selectedInfo.title}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedComponent(null)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      fontSize: '1.2rem',
                      cursor: 'pointer',
                    }}
                  >
                    ✕
                  </button>
                </div>

                {/* Description */}
                <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {selectedInfo.description}
                </p>

                {/* Quick Spec Badges */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Nimellisjännite</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#38bdf8' }}>{selectedInfo.voltage}</div>
                  </div>
                  <div style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Sulake / Suojaus</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f59e0b' }}>{selectedInfo.protection}</div>
                  </div>
                  <div style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Kaapeli & Poikkipinta</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#34d399' }}>{selectedInfo.cable}</div>
                  </div>
                  <div style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Standardi / Luokitus</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#c084fc' }}>{selectedInfo.standards}</div>
                  </div>
                </div>

                {/* Technical Specs List */}
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
                    Tekniset mitoitusarvot
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {selectedInfo.specs.map((s, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: '6px 8px',
                          background: 'rgba(0,0,0,0.2)',
                          borderRadius: 6,
                          fontSize: '0.82rem',
                        }}
                      >
                        <span style={{ color: 'var(--text-secondary)' }}>{s.label}</span>
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Installation Notes */}
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
                    Asennus- & Turvallisuusohjeet
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {selectedInfo.installationNotes.map((note, idx) => (
                      <li key={idx} style={{ marginBottom: 4 }}>{note}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* VIEW: CABLE & COMPONENT SCHEDULE TABLE */}
      {activeSubTab === 'cables' && (
        <div className="card" style={{ padding: '24px', background: 'rgba(15, 23, 42, 0.75)' }}>
          <div style={{ marginBottom: 18 }}>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              📋 Akkujärjestelmän Kaapelointi- & Suojaustaulukko (Sähköseloste)
            </h3>
            <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
              Tämä taulukko toimii suorana työohjeena sähköasentajalle ja viranomaistarkastukseen (SFS 6000 mukainen mitoitus).
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.15)', color: '#38bdf8' }}>
                  <th style={{ padding: '10px 12px' }}>Piiritunnus</th>
                  <th style={{ padding: '10px 12px' }}>Mistä / Mihin</th>
                  <th style={{ padding: '10px 12px' }}>Kaapelityyppi</th>
                  <th style={{ padding: '10px 12px' }}>Poikkipinta</th>
                  <th style={{ padding: '10px 12px' }}>Suojalaite</th>
                  <th style={{ padding: '10px 12px' }}>Jännite</th>
                  <th style={{ padding: '10px 12px' }}>Käyttötarkoitus</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: '#38bdf8' }}>W101 (Grid)</td>
                  <td style={{ padding: '10px 12px' }}>Pääkeskus PK ➔ Invertteri AC GRID</td>
                  <td style={{ padding: '10px 12px' }}>XPJ-HF / MCMK</td>
                  <td style={{ padding: '10px 12px' }}>5G6 mm² Cu</td>
                  <td style={{ padding: '10px 12px' }}>C25A 3P+N + Type A 300mA</td>
                  <td style={{ padding: '10px 12px' }}>400 V AC 3~</td>
                  <td style={{ padding: '10px 12px' }}>Verkkosyöttö / Verkkoonmyynti</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: '#ef4444' }}>W102 (EPS)</td>
                  <td style={{ padding: '10px 12px' }}>Invertteri EPS OUT ➔ ATS / Varavoimakeskus</td>
                  <td style={{ padding: '10px 12px' }}>XPJ-HF / MMJ</td>
                  <td style={{ padding: '10px 12px' }}>5G6 mm² Cu</td>
                  <td style={{ padding: '10px 12px' }}>C20A 3P+N + Type A 30mA</td>
                  <td style={{ padding: '10px 12px' }}>400 V AC 3~</td>
                  <td style={{ padding: '10px 12px' }}>Kriittisten kuormien varavoima (&lt;20ms)</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: '#34d399' }}>W103 (DC Batt +)</td>
                  <td style={{ padding: '10px 12px' }}>Akku BAT+ ➔ Invertteri BATT+</td>
                  <td style={{ padding: '10px 12px' }}>ÖLFLEX Battery / H07RN-F</td>
                  <td style={{ padding: '10px 12px' }}>50 mm² tai 70 mm² Cu</td>
                  <td style={{ padding: '10px 12px' }}>NH00 160A–200A gG/aR</td>
                  <td style={{ padding: '10px 12px' }}>48–58 V DC</td>
                  <td style={{ padding: '10px 12px' }}>Akuston päävirtajohdin (punainen)</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: '#64748b' }}>W104 (DC Batt -)</td>
                  <td style={{ padding: '10px 12px' }}>Akku BAT- ➔ Invertteri BATT-</td>
                  <td style={{ padding: '10px 12px' }}>ÖLFLEX Battery / H07RN-F</td>
                  <td style={{ padding: '10px 12px' }}>50 mm² tai 70 mm² Cu</td>
                  <td style={{ padding: '10px 12px' }}>2P DC-erotin (sulakkeeton/sulakkeellinen)</td>
                  <td style={{ padding: '10px 12px' }}>48–58 V DC</td>
                  <td style={{ padding: '10px 12px' }}>Akuston paluujohdin (musta)</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: '#f59e0b' }}>W105 (PV1 DC)</td>
                  <td style={{ padding: '10px 12px' }}>Aurinkokenttä 1 ➔ Invertteri MPPT 1</td>
                  <td style={{ padding: '10px 12px' }}>H1Z2Z2-K Solar Cable</td>
                  <td style={{ padding: '10px 12px' }}>2x 6 mm² Cu</td>
                  <td style={{ padding: '10px 12px' }}>DC Turvakytkin 1000V + DC SPD T2</td>
                  <td style={{ padding: '10px 12px' }}>300–600 V DC</td>
                  <td style={{ padding: '10px 12px' }}>Aurinkopaneeliketju 1 (Itä)</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: '#f59e0b' }}>W106 (PV2 DC)</td>
                  <td style={{ padding: '10px 12px' }}>Aurinkokenttä 2 ➔ Invertteri MPPT 2</td>
                  <td style={{ padding: '10px 12px' }}>H1Z2Z2-K Solar Cable</td>
                  <td style={{ padding: '10px 12px' }}>2x 6 mm² Cu</td>
                  <td style={{ padding: '10px 12px' }}>DC Turvakytkin 1000V + DC SPD T2</td>
                  <td style={{ padding: '10px 12px' }}>300–600 V DC</td>
                  <td style={{ padding: '10px 12px' }}>Aurinkopaneeliketju 2 (Länsi)</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: '#c084fc' }}>D101 (RS485)</td>
                  <td style={{ padding: '10px 12px' }}>Smart Meter ➔ Invertteri Meter Port</td>
                  <td style={{ padding: '10px 12px' }}>LiYCY / JAMAK</td>
                  <td style={{ padding: '10px 12px' }}>2x2x0.5 mm² Suojattu pari</td>
                  <td style={{ padding: '10px 12px' }}>Galvaaninen erotus / Transienttisurpr.</td>
                  <td style={{ padding: '10px 12px' }}>RS485 Modbus</td>
                  <td style={{ padding: '10px 12px' }}>Tehon ja suunnan mittaus 100ms</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: '#a78bfa' }}>D102 (BMS CAN)</td>
                  <td style={{ padding: '10px 12px' }}>BMS ➔ Invertteri CAN Port</td>
                  <td style={{ padding: '10px 12px' }}>CAT6 S/FTP tai LiYCY</td>
                  <td style={{ padding: '10px 12px' }}>120 Ω Parikaapeli</td>
                  <td style={{ padding: '10px 12px' }}>Sisäinen optoerotus</td>
                  <td style={{ padding: '10px 12px' }}>CAN 2.0B</td>
                  <td style={{ padding: '10px 12px' }}>Akuston jännite, lämpötilat ja SoC</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW: KOTIÄLY EMS STRATEGY */}
      {activeSubTab === 'ems_strategy' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          {/* Card 1: Nordpool Arbitrage */}
          <div className="card" style={{ padding: '20px', background: 'rgba(15, 23, 42, 0.75)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: '1.8rem' }}>📈</span>
              <div>
                <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#38bdf8' }}>
                  Pörssisähkö-Arbitraasi (Nordpool APC)
                </h4>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Automaattinen lataus & purku hintakäyrän mukaan</div>
              </div>
            </div>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 14px 0' }}>
              Kotiäly noutaa huomisen sähkön tuntihinnat klo 14:00. Algoritmi laskee automaattisesti edullisimmat 3–4 tuntia (tyypillisesti klo 01:00–05:00), jolloin akku ladataan täyteen halvalla sähköllä (esim. 1–3 snt/kWh).
            </p>
            <div style={{ padding: '10px', background: 'rgba(56, 189, 248, 0.08)', borderRadius: 8, border: '1px solid rgba(56, 189, 248, 0.2)', fontSize: '0.8rem', color: '#bae6fd' }}>
              💡 <b>Säästöpotentiaali:</b> 15 kWh akulla päivittäinen hintaswing (1 snt ➔ 15 snt) säästää n. 2.10 € / päivä (n. 60–75 € / kk) pelkällä arbitraasilla ilman aurinkopaneeleitakin.
            </div>
          </div>

          {/* Card 2: Peak Shaving & VILP Integration */}
          <div className="card" style={{ padding: '20px', background: 'rgba(15, 23, 42, 0.75)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: '1.8rem' }}>🔥</span>
              <div>
                <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#f59e0b' }}>
                  Tehohuippujen Leikkaus & VILP-integraatio
                </h4>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Lämpöpumpun ja akun saumaton yhteispeli</div>
              </div>
            </div>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 14px 0' }}>
              Kun Panasonic 12 kW VILP käynnistää tehokkaan käyttövesisyklin tai kompressori nostaa kierroksia, akusto syöttää tehon ilman että kiinteistön sähkönostopiikki kasvaa valtakunnanverkosta.
            </p>
            <div style={{ padding: '10px', background: 'rgba(245, 158, 11, 0.08)', borderRadius: 8, border: '1px solid rgba(245, 158, 11, 0.2)', fontSize: '0.8rem', color: '#fde68a' }}>
              ⚡ <b>Verkkotehon tasaus:</b> Estää pääsulakkeiden (3x25A) ylikuormituksen saunan (9kW), VILP:n ja autonlatauksen ollessa yhtä aikaa päällä.
            </div>
          </div>

          {/* Card 3: Battery Health & Longevity Rules */}
          <div className="card" style={{ padding: '20px', background: 'rgba(15, 23, 42, 0.75)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: '1.8rem' }}>🛡️</span>
              <div>
                <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#34d399' }}>
                  Akun Eliniän Maksimointi (BMS Guard)
                </h4>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>15–20 vuoden elinkaari optimoiduilla sykleillä</div>
              </div>
            </div>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 14px 0' }}>
              LiFePO4-kemia kestää parhaiten, kun akkua ei pidetä tarpeettomasti 100% varaustilassa päiväkausia eikä pureta aivan nollaan. Kotiäly säätää dynaamiset varaustilarajat (DoD):
            </p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              <li><b>Arkikäyttö:</b> 10% – 90% SoC (maksimoi kennojen syklikeston yli 6000 sykliin).</li>
              <li><b>Myrskyvaroitus (Storm Guard):</b> Lataus 100% vain kun Ilmatieteen laitos varoittaa myrskystä tai katkoriskistä.</li>
              <li><b>Tasapainotusjakso:</b> Akku nostetaan 100% kerran 14 vrk välein kennojen jännite-eron tasaamiseksi.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
