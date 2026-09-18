import { useState } from 'react';
import type { HeishamonState } from '../types/heishamon';
import { numVal } from '../types/heishamon';
import { useCommand } from '../hooks/useCommand';
import { useApc } from '../hooks/useApc';

interface HydraulicDiagramPageProps {
  state: HeishamonState;
  readOnly?: boolean;
}

type DiagramMode = 'live' | 'dhw' | 'heating' | 'defrost';

interface SelectedComponentInfo {
  id: string;
  title: string;
  icon: string;
  category: string;
  description: string;
  metrics: { label: string; value: string | number | null; unit?: string }[];
  technicalDetails: string[];
}

export function HydraulicDiagramPage({ state, readOnly = false }: HydraulicDiagramPageProps) {
  const [diagramMode, setDiagramMode] = useState<DiagramMode>('live');
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const { send, pending } = useCommand();
  const { setFloorPumpOverride } = useApc();

  // Extract real sensor data from state
  const rawOutsideTemp = numVal(state, 'main/Outside_Temp');
  const rawInletTemp = numVal(state, 'main/Main_Inlet_Temp');
  const rawOutletTemp = numVal(state, 'main/Main_Outlet_Temp');
  const rawBufferTemp = numVal(state, 'main/Buffer_Temp');
  const rawDhwTemp = numVal(state, 'main/DHW_Temp');
  const rawDhwTarget = numVal(state, 'main/DHW_Target_Temp');
  const rawPumpFlow = numVal(state, 'main/Pump_Flow');
  const rawPumpSpeed = numVal(state, 'main/Pump_Speed');
  const rawCompressorFreq = numVal(state, 'main/Compressor_Freq');
  const rawWaterPressure = numVal(state, 'main/Water_Pressure');
  const rawHeatPowerProd = numVal(state, 'main/Heat_Power_Production');
  const rawHeatPowerCons = numVal(state, 'main/Heat_Power_Consumption');
  const rawValveState = state['main/ThreeWay_Valve_State']?.value;
  const rawForceDhw = state['main/Force_DHW_State']?.value === '1';
  const rawSterilization = state['main/Sterilization_State']?.value === '1';
  const rawFan1Speed = numVal(state, 'main/Fan1_Motor_Speed');
  const floorPumpRaw = state['lattialampopumppu/stat/POWER']?.value;

  // Simulated or Live values depending on selected diagramMode
  const isSimulated = diagramMode !== 'live';
  
  const isDhwMode = isSimulated
    ? diagramMode === 'dhw'
    : rawValveState === '1';

  const isHeatingMode = isSimulated
    ? diagramMode === 'heating'
    : rawValveState === '0';

  const isFloorPumpRunning = isSimulated
    ? (diagramMode === 'heating' || diagramMode === 'dhw')
    : (floorPumpRaw === 'ON' || floorPumpRaw === '1' || floorPumpRaw === 'true');

  const outsideTemp = rawOutsideTemp ?? 4.5;
  const dhwTemp = isSimulated && diagramMode === 'dhw' ? 53.5 : rawDhwTemp ?? 49.0;
  const dhwTarget = rawDhwTarget ?? 55.0;
  const bufferTemp = isSimulated && diagramMode === 'dhw' ? 38.2 : isSimulated && diagramMode === 'heating' ? 32.5 : rawBufferTemp ?? 30.5;
  const outletTemp = isSimulated && diagramMode === 'dhw' ? 55.0 : isSimulated && diagramMode === 'heating' ? 34.0 : isSimulated && diagramMode === 'defrost' ? 22.0 : rawOutletTemp ?? 32.0;
  const inletTemp = isSimulated && diagramMode === 'dhw' ? 48.0 : isSimulated && diagramMode === 'heating' ? 28.5 : isSimulated && diagramMode === 'defrost' ? 26.0 : rawInletTemp ?? 28.0;
  const pumpFlow = isSimulated ? (diagramMode === 'dhw' ? 18.5 : diagramMode === 'heating' ? 15.2 : 21.0) : rawPumpFlow ?? 0.0;
  const compressorFreq = isSimulated ? (diagramMode === 'dhw' ? 62 : diagramMode === 'heating' ? 38 : 55) : rawCompressorFreq ?? 0;
  const waterPressure = rawWaterPressure ?? 1.6;

  // Active pump logic
  const isMainPumpRunning = (pumpFlow !== null && pumpFlow >= 0.3) || (rawPumpSpeed !== null && rawPumpSpeed > 0);

  // Helper color for temperatures
  const getTempColor = (t: number | null) => {
    if (t === null) return '#94a3b8';
    if (t >= 50) return '#ef4444'; // Hot red
    if (t >= 40) return '#f59e0b'; // Amber hot
    if (t >= 30) return '#fbbf24'; // Warm yellow
    if (t >= 20) return '#34d399'; // Room warm green
    if (t >= 10) return '#22d3ee'; // Cool cyan
    return '#38bdf8'; // Freezing blue
  };

  // Node details directory
  const componentDetails: Record<string, SelectedComponentInfo> = {
    vilp: {
      id: 'vilp',
      title: 'Panasonic Aquarea VILP (Ulkoyksikkö)',
      icon: '❄️',
      category: 'Lämmönlähde',
      description: 'Panasonic WH-MXC12J9E8 ilmavesilämpöpumpun ulkoyksikkö tuottaa lämpöenergian ulkoilmasta ja sisältää kompressorin, invertterin, höyrystimen ja sisäisen pääkiertovesipumpun.',
      metrics: [
        { label: 'Ulkolämpötila', value: outsideTemp.toFixed(1), unit: '°C' },
        { label: 'Kompressori', value: compressorFreq, unit: 'Hz' },
        { label: 'Pääpumpun virtaus', value: pumpFlow.toFixed(1), unit: 'L/min' },
        { label: 'Puhallin 1', value: rawFan1Speed ? Math.round(rawFan1Speed) : 0, unit: 'RPM' },
        { label: 'Ottoteho', value: rawHeatPowerCons, unit: 'W' },
        { label: 'Tuottoteho', value: rawHeatPowerProd, unit: 'W' },
      ],
      technicalDetails: [
        'Monobloc-yksikkö: Kylmäainepiiri on kokonaisuudessaan ulkoyksikössä.',
        'Lämmittää menovettä ja kierrättää sen eristettyjä runkoputkia pitkin tekniseen tilaan.',
        'Varustettu automaattisella pohjavastuksella ja älykkäällä sulatustoiminnolla (Defrost).',
      ],
    },
    valve: {
      id: 'valve',
      title: 'Moottoroitu 3-tieventtiili (PAW-3WYVLV4HW)',
      icon: '🔀',
      category: 'Virtausohjaus',
      description: 'Kääntää VILPin kuuman menoveden joko käyttövesivaraajan latauskierukalle (Asento 1 / Oikealle) tai suoraan puskurivaraajalle & lattialämmitykseen (Asento 0 / Vasemmalle).',
      metrics: [
        { label: 'Venttiilin asento', value: isDhwMode ? '1 (Käyttövesi)' : '0 (Lämmitys)' },
        { label: 'Ohjaustila', value: rawForceDhw ? 'Pakotettu KV (Force DHW)' : 'Automaatti (VILP)' },
        { label: 'Aktiivinen virtaus', value: pumpFlow.toFixed(1), unit: 'L/min' },
      ],
      technicalDetails: [
        'Panasonic PAW-3WYVLV4HW moottoritoimilaite jousipalautteella / 230V ohjauksella.',
        'Käyttövesitilassa korkealämpöinen vesi (~50–55 °C) menee käyttövesikierukkaan.',
        'Lämmitystilassa matalalämpöinen vesi (~28–35 °C) menee puskurisäiliöön.',
      ],
    },
    dhw: {
      id: 'dhw',
      title: 'Lämmin käyttövesivaraaja (284 L)',
      icon: '🚿',
      category: 'Käyttövesi',
      description: '284-litrainen eristetty käyttövesivaraaja, jonka sisällä on laaja latauskierukka. VILP lämmittää säiliön käyttöveden kierukan kautta.',
      metrics: [
        { label: 'Veden lämpötila', value: dhwTemp.toFixed(1), unit: '°C' },
        { label: 'Tavoitelämpötila', value: dhwTarget.toFixed(1), unit: '°C' },
        { label: 'Tilavuus', value: 284, unit: 'L' },
        { label: 'Sterilointi', value: rawSterilization ? 'Aktiivinen' : 'Lepotilassa' },
      ],
      technicalDetails: [
        'Kierukan paluuputki yhdistyy puskurivaraajan tulosillalle.',
        'Kun käyttövettä ladataan, kierukasta palaava lämmin vesi varastoituu puskuriin.',
        'Säiliön päällä on Grundfos Comfort PM LKV-kiertopumppu yläkerran hanoille.',
      ],
    },
    buffer: {
      id: 'buffer',
      title: 'Puskurivaraaja (100 L · 4-putkikytkentä A/B)',
      icon: '🗄️',
      category: 'Lämpöakku & Erotin',
      description: '100 litran puskurisäiliö toimii hydraulisena erottimena ja termisenä akkuna lämpöpumpun ja lattialämmityksen välillä. Päällä 4 liitäntäporttia (A, A, B, B) ja ilmanpoistin.',
      metrics: [
        { label: 'Puskurin lämpö', value: bufferTemp.toFixed(1), unit: '°C' },
        { label: 'ΔT vs tulovesi', value: (bufferTemp - inletTemp).toFixed(1), unit: '°C' },
        { label: 'Tilavuus', value: 100, unit: 'L' },
        { label: 'Liitännät', value: '4 kpl (A, A, B, B)' },
      ],
      technicalDetails: [
        'Tasaa virtauserot VILPin pääpumpun ja lattialämmityksen toisiopumpun välillä.',
        'Estää lämpöpumpun pätkäkäyntiä ja antaa riittävän sulatusenergian talvella.',
        'Ottaa vastaan käyttövesisyklin paluulämmön ja varastoi sen lattialämmitykseen.',
      ],
    },
    manifold: {
      id: 'manifold',
      title: 'Lattialämmityksen jakotukki & Piirit',
      icon: '🏠',
      category: 'Lämmönjako',
      description: 'Monipiirinen jakotukki virtausmittareilla ja toimilaitteilla. Jakaa lämpimän veden huonekohtaisiin lattialämmitysputkistoihin.',
      metrics: [
        { label: 'Menoveden lämpö', value: outletTemp.toFixed(1), unit: '°C' },
        { label: 'Paluuveden lämpö', value: inletTemp.toFixed(1), unit: '°C' },
        { label: 'Lämmitysverkoston paine', value: waterPressure.toFixed(2), unit: 'bar' },
      ],
      technicalDetails: [
        'Betonilaatan suuri massa toimii erinomaisena passiivisena lämpöakkuna.',
        'Yöllä ladattu ylilämpö luovutetaan hitaasti huoneisiin päivän aikana.',
        'Seinällä oleva punainen kalvopaisunta-astia pitää paineen tasaisena.',
      ],
    },
    lkv_pump: {
      id: 'lkv_pump',
      title: 'LKV-kiertopumppu (Grundfos COMFORT PM)',
      icon: '🔁',
      category: 'Käyttövesikierto',
      description: 'Lämpimän käyttöveden mukavuuskiertopumppu LKV-varaajan päällä. Pitää kuuman veden välittömästi saatavilla yläkerran ja kaukaisten hanojen linjoissa.',
      metrics: [
        { label: 'Pumppumalli', value: 'Grundfos COMFORT 15-14 BA PM' },
        { label: 'Toimintaperiaate', value: 'Jatkuva / Termostaattinen' },
        { label: 'Kiertoalue', value: 'Yläkerran suihkut & kaukohanat' },
      ],
      technicalDetails: [
        'Kierrättää valmista käyttövettä erillisessä LKV-paluuputkessa.',
        'Ei vaikuta lämpöpumpun vesikiertoon tai lämmitysverkostoon.',
      ],
    },
    floor_pump: {
      id: 'floor_pump',
      title: 'Lattialämmityksen kiertopumppu (Sonoff)',
      icon: '🌀',
      category: 'Toisiopiiri · Lämmönjako',
      description: 'Älyohjattu toisiopiirin kiertovesipumppu puskurivaraajan ja jakotukin välissä. Ohjataan Sonoff/Tasmota-älyreleellä Kotiäly APC -strategian mukaisesti.',
      metrics: [
        { label: 'Tila', value: isFloorPumpRunning ? 'Käynnissä (ON)' : 'Lepotilassa (OFF)' },
        { label: 'Teho (arvio)', value: isFloorPumpRunning ? '45 W' : '0 W' },
        { label: 'Ohjaustapa', value: 'Sonoff Smart Relay (MQTT)' },
        { label: 'Strategia', value: 'APC Kesäkatkaisu & Jumiutumissuoja' },
      ],
      technicalDetails: [
        'Kierrättää puskurivaraajan lämpöä huonekohtaisille lattialämmityspiireille.',
        'Sammutetaan automaattisesti kesällä (≥ 14 °C) sähkön ja kompressorin säästämiseksi.',
        'Pyöritetään 5 min päivittäin klo 12:00 jumiutumisen estämiseksi kesäkaudella.',
        'Hyödyntää käyttövesisyklin paluulämmön puskurista suoraan betonilaattaan.',
      ],
    },
  };

  const selectedInfo = selectedNode ? componentDetails[selectedNode] : null;

  function toggleValveManual() {
    if (readOnly) return;
    const nextVal = isDhwMode ? 0 : 1;
    send(
      'commands/SetForceDHW',
      nextVal,
      nextVal === 1 ? 'Pakotettu käyttövesitila (Force DHW)' : 'Palautettu normaaliin lämmitystilaan (Auto)'
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header & Mode Bar */}
      <div
        className="card"
        style={{
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.8))',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 24 }}>🛠️</span>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
              Tekninen tila & Hydrauliikkakaavio
            </h2>
            <span
              className="badge"
              style={{
                background: isSimulated ? 'rgba(245,158,11,0.2)' : 'rgba(34,211,238,0.15)',
                color: isSimulated ? '#f59e0b' : '#22d3ee',
                border: `1px solid ${isSimulated ? 'rgba(245,158,11,0.4)' : 'rgba(34,211,238,0.3)'}`,
                fontSize: 11,
              }}
            >
              {isSimulated ? `Simulaatio: ${diagramMode.toUpperCase()}` : 'Live-anturitila 🔴'}
            </span>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            Reaaliaikainen kytkentäkaavio ja vesivirtausten reititys teknisessä tilassa
          </p>
        </div>

        {/* Mode Selector Tabs */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            className={`btn btn-sm ${diagramMode === 'live' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setDiagramMode('live')}
            style={{ fontSize: 12, padding: '5px 12px' }}
          >
            🔴 Live-tila
          </button>
          <button
            className={`btn btn-sm ${diagramMode === 'dhw' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setDiagramMode('dhw')}
            style={{ fontSize: 12, padding: '5px 12px', background: diagramMode === 'dhw' ? 'rgba(16, 185, 129, 0.25)' : undefined, color: diagramMode === 'dhw' ? '#10b981' : undefined }}
          >
            💧 Käyttövesilataus
          </button>
          <button
            className={`btn btn-sm ${diagramMode === 'heating' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setDiagramMode('heating')}
            style={{ fontSize: 12, padding: '5px 12px', background: diagramMode === 'heating' ? 'rgba(167, 139, 250, 0.25)' : undefined, color: diagramMode === 'heating' ? '#a78bfa' : undefined }}
          >
            ♨️ Lattialämmitys
          </button>
          <button
            className={`btn btn-sm ${diagramMode === 'defrost' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setDiagramMode('defrost')}
            style={{ fontSize: 12, padding: '5px 12px', background: diagramMode === 'defrost' ? 'rgba(56, 189, 248, 0.25)' : undefined, color: diagramMode === 'defrost' ? '#38bdf8' : undefined }}
          >
            ❄️ Sulatustoiminto
          </button>
        </div>
      </div>

      {/* Main Diagram Area */}
      <div
        className="card"
        style={{
          padding: '24px 20px',
          overflowX: 'auto',
          background: 'radial-gradient(ellipse at 50% 30%, rgba(15, 23, 42, 0.95), rgba(8, 12, 22, 1))',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
          position: 'relative',
        }}
      >
        {/* SVG Schematic Canvas */}
        <div style={{ minWidth: 880, width: '100%', position: 'relative' }}>
          <svg viewBox="0 0 960 560" width="100%" height="560" style={{ overflow: 'visible', userSelect: 'none' }}>
            <defs>
              {/* Gradients */}
              <linearGradient id="dhwTankGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity="0.4" />
                <stop offset="70%" stopColor="#f59e0b" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.15" />
              </linearGradient>

              <linearGradient id="bufferTankGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.15" />
              </linearGradient>

              <linearGradient id="copperPipeGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#b45309" />
                <stop offset="50%" stopColor="#d97706" />
                <stop offset="100%" stopColor="#92400e" />
              </linearGradient>

              {/* Filters */}
              <filter id="glowHeat" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <filter id="glowCool" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Background Room Boundaries / Zones */}
            <rect x="20" y="40" width="220" height="480" rx="12" fill="rgba(255,255,255,0.015)" stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" />
            <text x="35" y="65" fill="rgba(255,255,255,0.4)" fontSize="12" fontWeight="700" letterSpacing="0.05em">ULKOYKSIKKÖ (VILP)</text>

            <rect x="260" y="40" width="680" height="480" rx="12" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.08)" />
            <text x="280" y="65" fill="rgba(255,255,255,0.4)" fontSize="12" fontWeight="700" letterSpacing="0.05em">TEKNINEN TILA (HYDRAULIIKKA)</text>

            {/* ─── PIPEWORK PATHS (BACKGROUND LAYERS) ─── */}

            {/* 1. Main VILP Supply Pipe (Out of VILP -> 3-way valve) */}
            <path
              d="M 200 160 L 390 160"
              stroke="#b45309"
              strokeWidth="10"
              strokeLinecap="round"
              fill="none"
            />
            {isMainPumpRunning && (
              <path
                d="M 200 160 L 390 160"
                stroke={isDhwMode ? '#ef4444' : '#fbbf24'}
                strokeWidth="4"
                strokeLinecap="round"
                fill="none"
                className="pipe-flow-active"
                filter="url(#glowHeat)"
              />
            )}

            {/* 2. 3-Way Valve -> DHW Tank Coil (Top Right Branch) */}
            <path
              d="M 390 160 L 390 120 L 530 120 L 530 180"
              stroke="#b45309"
              strokeWidth="10"
              strokeLinejoin="round"
              strokeLinecap="round"
              fill="none"
            />
            {isMainPumpRunning && isDhwMode && (
              <path
                d="M 390 160 L 390 120 L 530 120 L 530 180"
                stroke="#ef4444"
                strokeWidth="4"
                strokeLinejoin="round"
                strokeLinecap="round"
                fill="none"
                className="pipe-flow-fast"
                filter="url(#glowHeat)"
              />
            )}

            {/* 3. DHW Internal Coil (Inside 284L Tank) */}
            <path
              d="M 530 180 Q 580 200 530 230 Q 480 260 530 290 Q 580 320 530 350 L 530 380"
              stroke={isDhwMode ? '#ef4444' : '#b45309'}
              strokeWidth={isDhwMode ? 5 : 3}
              fill="none"
              strokeDasharray={isDhwMode ? '6 4' : 'none'}
              style={{ transition: 'all 0.5s' }}
            />

            {/* 4. DHW Coil Return -> Buffer Tank Port Bridge (Key hydraulic link from user photos!) */}
            <path
              d="M 530 380 L 530 420 L 710 420 L 710 260 L 730 260"
              stroke="#b45309"
              strokeWidth="10"
              strokeLinejoin="round"
              strokeLinecap="round"
              fill="none"
            />
            {isMainPumpRunning && isDhwMode && (
              <path
                d="M 530 380 L 530 420 L 710 420 L 710 260 L 730 260"
                stroke="#f59e0b"
                strokeWidth="4"
                strokeLinejoin="round"
                strokeLinecap="round"
                fill="none"
                className="pipe-flow-active"
                filter="url(#glowHeat)"
              />
            )}

            {/* 5. 3-Way Valve -> Buffer Tank (Heating Mode Branch) */}
            <path
              d="M 390 160 L 390 220 L 750 220 L 750 260"
              stroke="#b45309"
              strokeWidth="10"
              strokeLinejoin="round"
              strokeLinecap="round"
              fill="none"
            />
            {isMainPumpRunning && isHeatingMode && (
              <path
                d="M 390 160 L 390 220 L 750 220 L 750 260"
                stroke="#fbbf24"
                strokeWidth="4"
                strokeLinejoin="round"
                strokeLinecap="round"
                fill="none"
                className="pipe-flow-active"
                filter="url(#glowHeat)"
              />
            )}

            {/* 6. Buffer Tank -> Floor Heating Manifold (Supply from Buffer via Sonoff Pump) */}
            <path
              d="M 770 260 L 770 200 L 880 200 L 880 340"
              stroke="#b45309"
              strokeWidth="10"
              strokeLinejoin="round"
              strokeLinecap="round"
              fill="none"
            />
            {isFloorPumpRunning && (
              <path
                d="M 770 260 L 770 200 L 880 200 L 880 340"
                stroke="#fbbf24"
                strokeWidth="4"
                strokeLinejoin="round"
                strokeLinecap="round"
                fill="none"
                className="pipe-flow-active"
                filter="url(#glowHeat)"
              />
            )}

            {/* 7. Floor Heating Return -> Buffer Tank -> VILP Main Return */}
            <path
              d="M 880 430 L 790 430 L 790 260"
              stroke="#38bdf8"
              strokeWidth="8"
              strokeLinejoin="round"
              strokeLinecap="round"
              fill="none"
              opacity="0.8"
            />
            <path
              d="M 790 430 L 340 430 L 340 380 L 200 380"
              stroke="#38bdf8"
              strokeWidth="10"
              strokeLinejoin="round"
              strokeLinecap="round"
              fill="none"
            />
            {isMainPumpRunning && (
              <path
                d="M 880 430 L 340 430 L 340 380 L 200 380"
                stroke="#38bdf8"
                strokeWidth="4"
                strokeLinejoin="round"
                strokeLinecap="round"
                fill="none"
                className="pipe-flow-active"
                filter="url(#glowCool)"
              />
            )}

            {/* 8. Domestic Hot Water Comfort Recirculation (Grundfos Comfort PM to faucets) */}
            <path
              d="M 550 90 L 550 70 L 630 70 L 630 140 L 565 140"
              stroke="#ef4444"
              strokeWidth="4"
              strokeDasharray="4 4"
              strokeLinejoin="round"
              fill="none"
              opacity="0.7"
            />
            <text x="635" y="95" fill="#f87171" fontSize="10" fontWeight="600">LKV-kierto (Yläkerta)</text>

            {/* ─── HARDWARE NODES & TANKS ─── */}

            {/* NODE 1: VILP Outdoor Unit */}
            <g
              className="diagram-node-clickable"
              onClick={() => setSelectedNode('vilp')}
              transform="translate(40, 110)"
            >
              <rect
                x="0" y="0" width="160" height="310" rx="10"
                fill="rgba(30, 41, 59, 0.9)"
                stroke={selectedNode === 'vilp' ? '#22d3ee' : 'rgba(255,255,255,0.2)'}
                strokeWidth={selectedNode === 'vilp' ? 2 : 1}
              />
              <rect x="0" y="0" width="160" height="36" rx="10" fill="rgba(255,255,255,0.06)" />
              <text x="12" y="24" fill="#fff" fontSize="13" fontWeight="700">Panasonic VILP</text>
              <circle cx="142" cy="18" r="5" fill={isMainPumpRunning ? '#22c55e' : '#64748b'} />

              {/* Fan icon */}
              <circle cx="80" cy="90" r="36" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.1)" />
              <text x="80" y="96" fill="#67e8f9" fontSize="24" textAnchor="middle" className={isMainPumpRunning ? 'spinning' : ''}>⚙️</text>
              <text x="80" y="140" fill="var(--text-muted)" fontSize="11" textAnchor="middle">
                {rawFan1Speed ? `${Math.round(rawFan1Speed)} rpm` : 'Puhallin'}
              </text>

              {/* Metrics grid inside VILP */}
              <rect x="12" y="160" width="136" height="60" rx="6" fill="rgba(0,0,0,0.3)" />
              <text x="20" y="180" fill="var(--text-muted)" fontSize="11">Ulkoilma:</text>
              <text x="138" y="180" fill="#67e8f9" fontSize="12" fontWeight="700" textAnchor="end">{outsideTemp.toFixed(1)} °C</text>

              <text x="20" y="204" fill="var(--text-muted)" fontSize="11">Kompressori:</text>
              <text x="138" y="204" fill="#f59e0b" fontSize="12" fontWeight="700" textAnchor="end">{compressorFreq} Hz</text>

              {/* Water pump indicator inside VILP */}
              <rect x="12" y="232" width="136" height="64" rx="6" fill="rgba(0,0,0,0.3)" />
              <text x="20" y="252" fill="var(--text-muted)" fontSize="11">Pääpumppu:</text>
              <text x="138" y="252" fill="#22c55e" fontSize="12" fontWeight="700" textAnchor="end">{pumpFlow.toFixed(1)} L/min</text>

              <text x="20" y="278" fill="var(--text-muted)" fontSize="11">Vedenpaine:</text>
              <text x="138" y="278" fill="#38bdf8" fontSize="12" fontWeight="700" textAnchor="end">{waterPressure.toFixed(2)} bar</text>

              {/* Port labels */}
              <text x="165" y="55" fill="#f59e0b" fontSize="11" fontWeight="700">Meno ({outletTemp.toFixed(1)}°)</text>
              <text x="165" y="275" fill="#38bdf8" fontSize="11" fontWeight="700">Tulo ({inletTemp.toFixed(1)}°)</text>
            </g>

            {/* NODE 2: 3-Way Valve (Moottoriventtiili) */}
            <g
              className="diagram-node-clickable"
              onClick={() => setSelectedNode('valve')}
              transform="translate(365, 135)"
            >
              <circle
                cx="25" cy="25" r="28"
                fill="rgba(30, 41, 59, 0.95)"
                stroke={selectedNode === 'valve' ? '#22d3ee' : isDhwMode ? '#ef4444' : '#fbbf24'}
                strokeWidth="2.5"
              />
              <text x="25" y="22" fill="#fff" fontSize="11" fontWeight="700" textAnchor="middle">3-TIE</text>
              <text x="25" y="36" fill={isDhwMode ? '#ef4444' : '#fbbf24'} fontSize="9" fontWeight="700" textAnchor="middle">
                {isDhwMode ? 'KV (1)' : 'LÄMPÖ (0)'}
              </text>

              {/* Arrow indicators */}
              <path
                d={isDhwMode ? 'M 25 15 L 45 5' : 'M 25 35 L 45 45'}
                stroke="#fff"
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
              />
            </g>

            {/* NODE 3: Domestic Hot Water Cylinder (284 L Käyttövesivaraaja) */}
            <g
              className="diagram-node-clickable"
              onClick={() => setSelectedNode('dhw')}
              transform="translate(460, 100)"
            >
              {/* Cylinder body */}
              <rect
                x="0" y="30" width="130" height="340" rx="14"
                fill="url(#dhwTankGrad)"
                stroke={selectedNode === 'dhw' ? '#22d3ee' : 'rgba(239, 68, 68, 0.4)'}
                strokeWidth={selectedNode === 'dhw' ? 2.5 : 1.5}
              />
              {/* Top dome */}
              <ellipse cx="65" cy="30" rx="65" ry="12" fill="rgba(255,255,255,0.08)" stroke="rgba(239, 68, 68, 0.4)" />
              {/* Bottom dome */}
              <ellipse cx="65" cy="370" rx="65" ry="12" fill="rgba(255,255,255,0.08)" stroke="rgba(239, 68, 68, 0.4)" />

              {/* Title & icon */}
              <text x="65" y="65" fill="#fff" fontSize="13" fontWeight="700" textAnchor="middle">Käyttövesi</text>
              <text x="65" y="82" fill="var(--text-muted)" fontSize="11" textAnchor="middle">284 L (LKV)</text>

              {/* Big temp gauge */}
              <rect x="15" y="105" width="100" height="60" rx="8" fill="rgba(0,0,0,0.4)" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
              <text x="65" y="132" fill={getTempColor(dhwTemp)} fontSize="22" fontWeight="800" textAnchor="middle">
                {dhwTemp.toFixed(1)} <tspan fontSize="13">°C</tspan>
              </text>
              <text x="65" y="152" fill="var(--text-muted)" fontSize="10" textAnchor="middle">
                Tavoite: {dhwTarget.toFixed(0)} °C
              </text>

              {/* Coil status label */}
              <rect x="15" y="240" width="100" height="42" rx="6" fill="rgba(0,0,0,0.3)" />
              <text x="65" y="258" fill="#fca5a5" fontSize="10" fontWeight="600" textAnchor="middle">
                Latauskierukka
              </text>
              <text x="65" y="272" fill="var(--text-muted)" fontSize="9" textAnchor="middle">
                {isDhwMode ? '🔥 Lämmittää nyt' : 'Lepotilassa'}
              </text>

              {/* Grundfos Comfort PM circulation pump on top */}
              <g onClick={(e) => { e.stopPropagation(); setSelectedNode('lkv_pump'); }}>
                <rect x="35" y="-12" width="60" height="26" rx="6" fill="#1e293b" stroke="#ef4444" strokeWidth="1.5" />
                <text x="65" y="5" fill="#fff" fontSize="9" fontWeight="700" textAnchor="middle">Grundfos PM</text>
              </g>
            </g>

            {/* NODE 4: Buffer Tank (100 L Puskurivaraaja · 4-putkikytkentä) */}
            <g
              className="diagram-node-clickable"
              onClick={() => setSelectedNode('buffer')}
              transform="translate(680, 240)"
            >
              {/* Shorter cylinder body */}
              <rect
                x="0" y="20" width="120" height="200" rx="12"
                fill="url(#bufferTankGrad)"
                stroke={selectedNode === 'buffer' ? '#22d3ee' : 'rgba(245, 158, 11, 0.4)'}
                strokeWidth={selectedNode === 'buffer' ? 2.5 : 1.5}
              />
              <ellipse cx="60" cy="20" rx="60" ry="10" fill="rgba(255,255,255,0.08)" stroke="rgba(245, 158, 11, 0.4)" />
              <ellipse cx="60" cy="220" rx="60" ry="10" fill="rgba(255,255,255,0.08)" stroke="rgba(245, 158, 11, 0.4)" />

              {/* 4 Ports indicators on top (A, A, B, B) */}
              <circle cx="20" cy="18" r="4" fill="#fbbf24" />
              <circle cx="45" cy="18" r="4" fill="#fbbf24" />
              <circle cx="75" cy="18" r="4" fill="#38bdf8" />
              <circle cx="100" cy="18" r="4" fill="#38bdf8" />
              <text x="20" y="10" fill="#fbbf24" fontSize="8" textAnchor="middle">A</text>
              <text x="45" y="10" fill="#fbbf24" fontSize="8" textAnchor="middle">A</text>
              <text x="75" y="10" fill="#38bdf8" fontSize="8" textAnchor="middle">B</text>
              <text x="100" y="10" fill="#38bdf8" fontSize="8" textAnchor="middle">B</text>

              {/* Title & temp */}
              <text x="60" y="50" fill="#fff" fontSize="13" fontWeight="700" textAnchor="middle">Puskurisäiliö</text>
              <text x="60" y="66" fill="var(--text-muted)" fontSize="11" textAnchor="middle">100 L (4-putki)</text>

              <rect x="15" y="85" width="90" height="50" rx="8" fill="rgba(0,0,0,0.4)" />
              <text x="60" y="112" fill={getTempColor(bufferTemp)} fontSize="20" fontWeight="800" textAnchor="middle">
                {bufferTemp.toFixed(1)} <tspan fontSize="12">°C</tspan>
              </text>
              <text x="60" y="127" fill="var(--text-muted)" fontSize="9" textAnchor="middle">
                ΔT: {(bufferTemp - inletTemp).toFixed(1)} °C
              </text>

              <text x="60" y="165" fill="#fde68a" fontSize="10" textAnchor="middle">
                {isDhwMode ? '🔥 LKV-paluulämpö' : '♨️ Lämmitysvesi'}
              </text>
            </g>

            {/* NODE 5.5: Floor Heating Secondary Pump (Sonoff) */}
            <g
              className="diagram-node-clickable"
              onClick={() => setSelectedNode('floor_pump')}
              transform="translate(805, 178)"
            >
              <circle
                cx="20"
                cy="22"
                r="18"
                fill="rgba(30, 41, 59, 0.95)"
                stroke={isFloorPumpRunning ? '#22c55e' : 'rgba(255,255,255,0.3)'}
                strokeWidth="2"
                filter={isFloorPumpRunning ? 'url(#glowHeat)' : undefined}
              />
              <text
                x="20"
                y="28"
                fontSize="16"
                textAnchor="middle"
                className={isFloorPumpRunning ? 'spinning' : ''}
              >
                🌀
              </text>
              <rect x="-10" y="44" width="60" height="18" rx="4" fill="rgba(0,0,0,0.6)" />
              <text x="20" y="56" fill="#60a5fa" fontSize="8.5" fontWeight="700" textAnchor="middle">
                Sonoff-pumppu
              </text>
              <circle cx="20" cy="1" r="3.5" fill={isFloorPumpRunning ? '#22c55e' : '#64748b'} />
            </g>

            {/* NODE 5: Floor Heating Manifold & Loops */}
            <g
              className="diagram-node-clickable"
              onClick={() => setSelectedNode('manifold')}
              transform="translate(850, 320)"
            >
              {/* Manifold body */}
              <rect x="0" y="0" width="70" height="120" rx="8" fill="rgba(30, 41, 59, 0.9)" stroke="rgba(255,255,255,0.2)" />
              <text x="35" y="20" fill="#fff" fontSize="10" fontWeight="700" textAnchor="middle">Jakotukki</text>

              {/* Loop tubes */}
              {[35, 55, 75, 95].map((y, idx) => (
                <g key={idx}>
                  <line x1="20" y1={y} x2="50" y2={y} stroke={idx % 2 === 0 ? '#fbbf24' : '#38bdf8'} strokeWidth="3" />
                  <circle cx="55" cy={y} r="3" fill="#ef4444" />
                </g>
              ))}

              <text x="35" y="145" fill="var(--text-secondary)" fontSize="11" fontWeight="600" textAnchor="middle">
                Lattialämmitys
              </text>
            </g>

            {/* Pressure Gauge & Expansion Vessel Icon */}
            <g transform="translate(840, 110)">
              {/* Expansion tank */}
              <circle cx="40" cy="40" r="22" fill="#ef4444" opacity="0.85" stroke="#b91c1c" strokeWidth="1.5" />
              <text x="40" y="44" fill="#fff" fontSize="9" fontWeight="700" textAnchor="middle">Paisunta</text>
            </g>
          </svg>
        </div>

        {/* Interactive Legend & Quick Actions */}
        <div
          style={{
            marginTop: 20,
            paddingTop: 16,
            borderTop: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 12, height: 4, background: '#ef4444', borderRadius: 2 }} />
              <span style={{ color: 'var(--text-secondary)' }}>Kuuma käyttövesi (50–55 °C)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 12, height: 4, background: '#fbbf24', borderRadius: 2 }} />
              <span style={{ color: 'var(--text-secondary)' }}>Lämmitysmenovesi (28–35 °C)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 12, height: 4, background: '#38bdf8', borderRadius: 2 }} />
              <span style={{ color: 'var(--text-secondary)' }}>Paluuvesi VILPiin</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13 }}>💡</span>
              <span style={{ color: 'var(--text-muted)' }}>Klikkaa kaavion laitteita nähdäksesi tarkat tekniset tiedot</span>
            </div>
          </div>

          {!readOnly && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                className="btn btn-sm btn-secondary"
                onClick={toggleValveManual}
                disabled={pending}
                style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <span>🔀</span>
                {isDhwMode ? 'Vaihda lämmitystilaan' : 'Pakota käyttövesitila'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Detail Inspector Drawer / Component Specs */}
      {selectedInfo && (
        <div
          className="card"
          style={{
            padding: '20px 24px',
            background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9))',
            border: '1px solid rgba(34, 211, 238, 0.3)',
            boxShadow: '0 12px 36px rgba(0,0,0,0.6)',
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: 'rgba(34, 211, 238, 0.12)',
                  border: '1px solid rgba(34, 211, 238, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 24,
                }}
              >
                {selectedInfo.icon}
              </div>
              <div>
                <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#22d3ee', fontWeight: 700, letterSpacing: '0.05em' }}>
                  {selectedInfo.category}
                </div>
                <h3 style={{ margin: '2px 0 0', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {selectedInfo.title}
                </h3>
              </div>
            </div>

            <button
              className="btn btn-ghost"
              onClick={() => setSelectedNode(null)}
              style={{ padding: '4px 10px', fontSize: 13 }}
            >
              ✕ Sulje
            </button>
          </div>

          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 16 }}>
            {selectedInfo.description}
          </p>

          {/* Metrics Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 16 }}>
            {selectedInfo.metrics.map((m, idx) => (
              <div
                key={idx}
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 8,
                  padding: '10px 12px',
                }}
              >
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.label}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>
                  {m.value ?? '—'} {m.unit || ''}
                </div>
              </div>
            ))}
          </div>

          {/* Technical bullet points */}
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px 16px', borderRadius: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
              🔍 Tekniset huomiot:
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              {selectedInfo.technicalDetails.map((t, idx) => (
                <li key={idx}>{t}</li>
              ))}
            </ul>
          </div>

          {/* Quick Override Action Buttons for Floor Pump */}
          {selectedNode === 'floor_pump' && !readOnly && (
            <div style={{
              marginTop: 16,
              paddingTop: 14,
              borderTop: '1px solid rgba(255,255,255,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                Pakkokytkentä / Ohitus:
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-sm btn-success"
                  onClick={() => setFloorPumpOverride('ON', 0)}
                  disabled={pending}
                  style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <span>🟢</span> Pakota Päälle
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => setFloorPumpOverride('OFF', 0)}
                  disabled={pending}
                  style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <span>🔴</span> Pakota Pois
                </button>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => setFloorPumpOverride(null, 0)}
                  disabled={pending}
                  style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <span>⚡</span> Palauta Auto
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Hydraulic System Architecture & Operational Guide Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        {/* Card 1: 4-putkikytkentä */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 20 }}>🗄️</span>
            <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
              100L Puskurivaraajan 4-putkikytkentä (A/B)
            </h4>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
            Puskurivaraajan kannessa on 4 liitäntää (A, A, B, B). Se toimii hydraulisena erottimena, joka varmistaa esteettömän virtauksen ulkoyksikölle riippumatta lattialämmityksen termostaattien asennoista. Tämä estää lämpöpumpun virtauskatkoja ja takaa tehokkaan sulatuksen talvipakkasilla.
          </p>
        </div>

        {/* Card 2: LKV-kierukan ja puskurin yhteys */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 20 }}>💧</span>
            <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
              LKV-kierukan paluuvirtaus puskuriin (Lämpöakku)
            </h4>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
            Käyttövesivaraajan (284L) latauskierukan paluuputki yhdistyy puskurivaraajan tulolinjaan. Kun VILP lämmittää käyttövettä 50–55 °C lämpötilaan, kierukasta poistuva vesi luovuttaa ylijäämälämpönsä puskurivaraajaan. Tämä lämpö siirtyy lattialämmityksen betonilaattaan, mikä tehostaa pörssisähkön halpatuntilatausta.
          </p>
        </div>

        {/* Card 3: LKV-kierto Grundfos Comfort */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 20 }}>🔁</span>
            <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
              Käyttöveden mukavuuskierto (LKV-kierto)
            </h4>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
            Varaajan päällä sijaitseva pieni Grundfos COMFORT PM -pumppu kierrättää valmista lämmintä käyttövettä erillisessä hanakierrossa yläkertaan. Se takaa välittömän lämpimän veden suihkuihin ilman pitkää odotusaikaa ja toimii itsenäisesti lämmitysverkostosta erillään.
          </p>
        </div>
      </div>
    </div>
  );
}
