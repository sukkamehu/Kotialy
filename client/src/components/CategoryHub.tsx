import React from 'react';
import type { HeishamonState } from '../types/heishamon';
import { numVal } from '../types/heishamon';
import { useElectricityPrice } from '../hooks/useElectricityPrice';
import { useTuya } from '../hooks/useTuya';
import { useOutdoorLights } from '../hooks/useOutdoorLights';
import { useTapo } from '../hooks/useTapo';

export type CategoryId = 'heating' | 'temperatures' | 'sauna' | 'lighting' | 'plugs' | 'trends' | 'technical' | 'apc';

interface CategoryHubProps {
  state: HeishamonState;
  onSelectCategory: (cat: CategoryId) => void;
  onOpenPriceModal?: () => void;
  onOpenOutdoorModal?: () => void;
}

export const CategoryHub: React.FC<CategoryHubProps> = ({
  state,
  onSelectCategory,
  onOpenPriceModal,
  onOpenOutdoorModal,
}) => {
  const { priceCentsKWh, priceLevel } = useElectricityPrice();
  const { sauna, devices: tuyaDevices } = useTuya();
  const { status: outdoorLightsStatus } = useOutdoorLights();
  const { devices: tapoDevices } = useTapo();

  // Metrics for quick summary badges
  const outsideTemp = numVal(state, 'main/Outside_Temp');
  const inletTemp = numVal(state, 'main/Main_Inlet_Temp');
  const outletTemp = numVal(state, 'main/Main_Outlet_Temp');
  const dhwTemp = numVal(state, 'main/DHW_Temp');
  const heatPumpState = state['main/Heatpump_State']?.value === '1';
  const flowRate = numVal(state, 'main/Pump_Flow');

  // Climate info
  const climateSensors = tuyaDevices.filter((d) => d.type === 'climate');
  const alakertaClimate = climateSensors.find((d) => d.name.toLowerCase().includes('alakerta'));
  const ylakertaClimate = climateSensors.find(
    (d) => d.name.toLowerCase().includes('ylakerta') || d.name.toLowerCase().includes('tyohuone')
  );
  const houseTemps = [alakertaClimate?.properties.temperature, ylakertaClimate?.properties.temperature].filter(
    (t): t is number => typeof t === 'number'
  );
  const houseAvgTemp = houseTemps.length > 0 ? houseTemps.reduce((a, b) => a + b, 0) / houseTemps.length : null;

  // Sauna info
  const isSaunaOn = sauna?.isOn ?? false;
  const saunaClimate = climateSensors.find(
    (d) => d.name.toLowerCase().includes('sauna')
  );
  const saunaTemp = saunaClimate?.properties.temperature ?? null;

  // Lighting info
  const areOutdoorLightsOn = outdoorLightsStatus?.isOn ?? false;
  const lightDevices = tuyaDevices.filter((d) => d.type === 'light');
  const activeIndoorLightsCount = lightDevices.filter((d) => Boolean(d.properties.switch_led)).length;

  // Plugs & Isovarasto info
  const isovarastoPlug = tapoDevices.find((d) => d.id === 'isovarasto');
  const isovarastoClimate = climateSensors.find(
    (d) => d.name.toLowerCase().includes('isovarasto') || d.name.toLowerCase().includes('varasto')
  );
  const isovarastoTemp = isovarastoClimate?.properties.temperature ?? null;
  const activePlugsCount = tapoDevices.filter((d) => d.state === 'ON').length;
  const totalPlugPower = tapoDevices.reduce((sum, d) => sum + (d.power_w || 0), 0) + (outdoorLightsStatus?.telemetry?.power_w || 0);

  const categories = [
    {
      id: 'heating' as CategoryId,
      title: 'Lämmitys',
      subtitle: 'VILP 12kW, LKV, Puskurivaraaja, Venttiili & Kamera',
      icon: '🔥',
      color: '#f59e0b',
      glow: 'rgba(245, 158, 11, 0.25)',
      gradient: 'linear-gradient(145deg, rgba(245, 158, 11, 0.15) 0%, rgba(15, 23, 42, 0.9) 100%)',
      borderColor: 'rgba(245, 158, 11, 0.35)',
      badges: [
        {
          label: heatPumpState ? 'VILP Päällä' : 'VILP Valmiustila',
          value: outletTemp !== null ? `${outletTemp.toFixed(1)}°C${inletTemp !== null ? ` (Paluu ${inletTemp.toFixed(1)}°C)` : ''}` : 'Live',
          color: heatPumpState ? '#4ade80' : '#94a3b8',
          bg: heatPumpState ? 'rgba(34, 197, 94, 0.15)' : 'rgba(148, 163, 184, 0.1)',
        },
        {
          label: 'Käyttövesi',
          value: dhwTemp !== null ? `${dhwTemp.toFixed(1)}°C` : '--',
          color: '#10b981',
          bg: 'rgba(16, 185, 129, 0.15)',
        },
      ],
      description: 'Lämpöpumpun tila, menovedet, puskurin lämmöt, kiertovesipumppu ja teknisen tilan kamera.',
    },
    {
      id: 'temperatures' as CategoryId,
      title: 'Lämpömittarit & Sisäilma',
      subtitle: 'Päärakennus, Ulkoilma, Varastot & Sijoitusasunto',
      icon: '🌡️',
      color: '#38bdf8',
      glow: 'rgba(56, 189, 248, 0.25)',
      gradient: 'linear-gradient(145deg, rgba(56, 189, 248, 0.15) 0%, rgba(15, 23, 42, 0.9) 100%)',
      borderColor: 'rgba(56, 189, 248, 0.35)',
      badges: [
        {
          label: 'Talo (keskiarvo)',
          value: houseAvgTemp !== null ? `${houseAvgTemp.toFixed(1)} °C` : '--',
          color: '#38bdf8',
          bg: 'rgba(56, 189, 248, 0.15)',
        },
        {
          label: 'Anturit',
          value: `${climateSensors.length} kpl live`,
          color: '#4ade80',
          bg: 'rgba(34, 197, 94, 0.12)',
        },
      ],
      description: 'Huonekohtaiset lämpötilat ja kosteudet, kattava mittaushistoria eri aikaväleillä ja turva-anturit.',
    },
    {
      id: 'sauna' as CategoryId,
      title: 'Sauna',
      subtitle: 'Kiuasohjaus, Saunavalaistus, Lämpötilat & Historia',
      icon: '🧖‍♂️',
      color: '#fb923c',
      glow: 'rgba(251, 146, 60, 0.25)',
      gradient: 'linear-gradient(145deg, rgba(234, 88, 12, 0.15) 0%, rgba(15, 23, 42, 0.9) 100%)',
      borderColor: isSaunaOn ? 'rgba(249, 115, 22, 0.6)' : 'rgba(251, 146, 60, 0.35)',
      badges: [
        {
          label: 'Kiuas',
          value: isSaunaOn ? '🔥 LÄMMITTÄÄ' : 'POIS',
          color: isSaunaOn ? '#f97316' : '#94a3b8',
          bg: isSaunaOn ? 'rgba(249, 115, 22, 0.2)' : 'rgba(148, 163, 184, 0.1)',
        },
        {
          label: 'Lämpö',
          value: saunaTemp !== null ? `${saunaTemp.toFixed(1)} °C` : '--',
          color: '#fb923c',
          bg: 'rgba(251, 146, 60, 0.15)',
        },
      ],
      description: 'Kiukaan etäkäynnistys, turva-ajastin, saunan tunnelmavalaistus ja tarkat saunasessiot.',
    },
    {
      id: 'lighting' as CategoryId,
      title: 'Valaistus',
      subtitle: 'Ulkovalojen hämäräkytkin & Kaikki sisävalot',
      icon: '💡',
      color: '#facc15',
      glow: 'rgba(250, 204, 21, 0.25)',
      gradient: 'linear-gradient(145deg, rgba(250, 204, 21, 0.12) 0%, rgba(15, 23, 42, 0.9) 100%)',
      borderColor: 'rgba(250, 204, 21, 0.35)',
      badges: [
        {
          label: 'Ulkovalot',
          value: areOutdoorLightsOn ? 'PÄÄLLÄ (Hämärä)' : 'POIS',
          color: areOutdoorLightsOn ? '#facc15' : '#94a3b8',
          bg: areOutdoorLightsOn ? 'rgba(250, 204, 21, 0.15)' : 'rgba(148, 163, 184, 0.1)',
        },
        {
          label: 'Sisävalot',
          value: `${activeIndoorLightsCount} päällä`,
          color: activeIndoorLightsCount > 0 ? '#38bdf8' : '#94a3b8',
          bg: 'rgba(56, 189, 248, 0.12)',
        },
      ],
      description: 'Auringonlaskuun ja hämärään synkronoitu ulkovalaistus sekä WC-, mancave- ja saunavalot.',
    },
    {
      id: 'plugs' as CategoryId,
      title: 'Älypistorasiat',
      subtitle: 'Tapo P115, Kuormat & Isovaraston Lämpömittari',
      icon: '🔌',
      color: '#38bdf8',
      glow: 'rgba(56, 189, 248, 0.25)',
      gradient: 'linear-gradient(145deg, rgba(56, 189, 248, 0.12) 0%, rgba(15, 23, 42, 0.9) 100%)',
      borderColor: 'rgba(56, 189, 248, 0.35)',
      badges: [
        {
          label: 'Isovarasto',
          value: isovarastoTemp !== null ? `${isovarastoTemp.toFixed(1)}°C` : isovarastoPlug?.state === 'ON' ? 'Lämmittää' : 'Valmius',
          color: '#fb923c',
          bg: 'rgba(251, 146, 60, 0.15)',
        },
        {
          label: 'Kuorma',
          value: `${totalPlugPower.toFixed(0)} W (${activePlugsCount} päällä)`,
          color: '#38bdf8',
          bg: 'rgba(56, 189, 248, 0.12)',
        },
      ],
      description: 'Isovaraston ja pikkuvaraston pakkassuojaus/varaava lämmitys, pesukone & kuivausrumpu.',
    },
    {
      id: 'trends' as CategoryId,
      title: 'Trendit & Kulutus',
      subtitle: 'Herrfors Sähkönkulutus, Mittarihistoria & COP-Analyysi',
      icon: '📈',
      color: '#c084fc',
      glow: 'rgba(192, 132, 252, 0.25)',
      gradient: 'linear-gradient(145deg, rgba(168, 85, 247, 0.12) 0%, rgba(15, 23, 42, 0.9) 100%)',
      borderColor: 'rgba(192, 132, 252, 0.35)',
      badges: [
        {
          label: 'Sähkö nyt',
          value: priceCentsKWh !== null ? `${priceCentsKWh.toFixed(1)} snt` : '—',
          color: priceLevel === 'cheap' ? '#10b981' : priceLevel === 'expensive' ? '#f43f5e' : '#facc15',
          bg: 'rgba(255, 255, 255, 0.06)',
        },
        {
          label: 'Data',
          value: 'Herrfors + VILP',
          color: '#c084fc',
          bg: 'rgba(168, 85, 247, 0.15)',
        },
      ],
      description: 'Tuntitason sähködata, sähkölaskun kustannukset, lämpöpumpun tuotot, kulutukset ja COP-hyötysuhde.',
    },
    {
      id: 'technical' as CategoryId,
      title: 'Tekninen tila & Muistio',
      subtitle: 'Hydraulikaavio, Virtausanturit & Panasonic-asetukset',
      icon: '🛠️',
      color: '#22d3ee',
      glow: 'rgba(34, 211, 238, 0.25)',
      gradient: 'linear-gradient(145deg, rgba(6, 182, 212, 0.12) 0%, rgba(15, 23, 42, 0.9) 100%)',
      borderColor: 'rgba(34, 211, 238, 0.35)',
      badges: [
        {
          label: 'Virtaus',
          value: flowRate !== null ? `${flowRate.toFixed(1)} l/min` : '--',
          color: '#22d3ee',
          bg: 'rgba(6, 182, 212, 0.15)',
        },
        {
          label: 'Kytkentä',
          value: '4-putki + 100L',
          color: '#a78bfa',
          bg: 'rgba(167, 139, 250, 0.12)',
        },
      ],
      description: 'Interaktiivinen kytkentäkaavio ja putkistolämmöt yhdistettynä Panasonic-asetusmuistioon.',
    },
    {
      id: 'apc' as CategoryId,
      title: 'APC-Automaatiostrategia',
      subtitle: 'Pörssisähköoptimointi, Rajat & Ennakoiva Säätö',
      icon: '⚡',
      color: '#10b981',
      glow: 'rgba(16, 185, 129, 0.25)',
      gradient: 'linear-gradient(145deg, rgba(16, 185, 129, 0.12) 0%, rgba(15, 23, 42, 0.9) 100%)',
      borderColor: 'rgba(16, 185, 129, 0.35)',
      badges: [
        {
          label: 'Ohjaus',
          value: 'Reaaliaikainen APC',
          color: '#4ade80',
          bg: 'rgba(34, 197, 94, 0.15)',
        },
        {
          label: 'Ulkoilma',
          value: outsideTemp !== null ? `${outsideTemp.toFixed(1)} °C` : '--',
          color: '#38bdf8',
          bg: 'rgba(56, 189, 248, 0.12)',
        },
      ],
      description: 'Pörssisähkön hintahuippujen väistö, halpojen tuntien varaustehot ja automaattiset suojarajat.',
    },
  ];

  return (
    <div style={{ marginBottom: 36 }}>
      {/* Welcome & Quick Summary Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Kotiäly Hub
          </h2>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>
            Valitse aihepiiri nähdäksesi laitteet, ohjaukset ja mittaukset
          </div>
        </div>

        {/* Global Summary Badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(255, 255, 255, 0.04)',
            padding: '6px 14px',
            borderRadius: 20,
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <span style={{ fontSize: 13 }}>🏠</span>
          <span
            onClick={onOpenOutdoorModal}
            style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              cursor: onOpenOutdoorModal ? 'pointer' : 'default',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
            title={onOpenOutdoorModal ? 'Klikkaa avataksesi ulkolämpötilan ja sään ennustemodaali' : undefined}
          >
            Ulkoilma: <strong style={{ color: 'var(--cool-primary)' }}>{outsideTemp !== null ? `${outsideTemp.toFixed(1)}°C` : '—'}</strong>
          </span>
          <span style={{ opacity: 0.3 }}>•</span>
          <span
            onClick={onOpenPriceModal}
            style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              cursor: onOpenPriceModal ? 'pointer' : 'default',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
            title={onOpenPriceModal ? 'Klikkaa avataksesi sähkön hinnankehitys- ja ennustemodaali' : undefined}
          >
            Sähkö: <strong style={{ color: priceLevel === 'cheap' ? '#10b981' : priceLevel === 'expensive' ? '#f43f5e' : '#facc15' }}>
              {priceCentsKWh !== null ? `${priceCentsKWh.toFixed(1)} snt` : '—'}
            </strong>
          </span>
        </div>
      </div>

      {/* Grid of Categories (Optimized for Mobile Touch & Desktop) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        {categories.map((cat) => (
          <div
            key={cat.id}
            onClick={() => onSelectCategory(cat.id)}
            style={{
              background: cat.gradient,
              border: `1px solid ${cat.borderColor}`,
              borderRadius: 18,
              padding: '20px',
              cursor: 'pointer',
              position: 'relative',
              overflow: 'hidden',
              boxShadow: `0 8px 30px ${cat.glow}`,
              transition: 'transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-3px)';
              e.currentTarget.style.boxShadow = `0 14px 36px ${cat.glow}`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = `0 8px 30px ${cat.glow}`;
            }}
          >
            {/* Top Bar: Icon, Title, Forward Arrow */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      background: 'rgba(0, 0, 0, 0.35)',
                      border: `1px solid ${cat.borderColor}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 22,
                      boxShadow: `0 0 15px ${cat.glow}`,
                    }}
                  >
                    {cat.icon}
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {cat.title}
                    </h3>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      {cat.subtitle}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: 'rgba(255, 255, 255, 0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: cat.color,
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  ➔
                </div>
              </div>

              {/* Description */}
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.45, margin: '8px 0 14px 0' }}>
                {cat.description}
              </p>
            </div>

            {/* Live Badges Footer */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 10, borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
              {cat.badges.map((b, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: b.bg,
                    padding: '4px 10px',
                    borderRadius: 8,
                    fontSize: '0.74rem',
                  }}
                >
                  <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{b.label}:</span>
                  <strong style={{ color: b.color, fontWeight: 700 }}>{b.value}</strong>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
