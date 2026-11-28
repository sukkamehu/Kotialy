import React from 'react';
import type { HeishamonState } from '../types/heishamon';
import { numVal } from '../types/heishamon';
import { useElectricityPrice } from '../hooks/useElectricityPrice';
import { useTuya } from '../hooks/useTuya';
import { useOutdoorLights } from '../hooks/useOutdoorLights';
import { useTapo } from '../hooks/useTapo';
import { useMitsubishi } from '../hooks/useMitsubishi';
import { useOutdoorConsensus } from '../hooks/useOutdoorConsensus';
import { PageHeader } from './PageHeader';

export type CategoryId = 'heating' | 'temperatures' | 'sauna' | 'controls' | 'trends' | 'apc' | 'technical';

interface CategoryHubProps {
  state: HeishamonState;
  onSelectCategory: (cat: CategoryId) => void;
}

export const CategoryHub: React.FC<CategoryHubProps> = ({
  state,
  onSelectCategory,
}) => {
  const { priceCentsKWh, priceLevel } = useElectricityPrice();
  const { sauna, devices: tuyaDevices } = useTuya();
  const { status: outdoorLightsStatus } = useOutdoorLights();
  const { devices: tapoDevices } = useTapo();
  const { status: mitsuStatus } = useMitsubishi();
  const { data: outdoorConsensusData } = useOutdoorConsensus();

  // Outdoor temp (prefer 433 MHz consensus median, fallback to VILP)
  const consensusOutdoorTemp =
    outdoorConsensusData?.consensus?.median ??
    outdoorConsensusData?.consensus?.temperature ??
    numVal(state, 'rtl433/outdoor/temperature');
  const outsideTemp = consensusOutdoorTemp ?? numVal(state, 'main/Outside_Temp');
  const inletTemp = numVal(state, 'main/Main_Inlet_Temp');
  const outletTemp = numVal(state, 'main/Main_Outlet_Temp');
  const dhwTemp = numVal(state, 'main/DHW_Temp');
  const heatPumpState = state['main/Heatpump_State']?.value === '1';

  // Climate info (Tuya & Mitsubishi ILP)
  const climateSensors = tuyaDevices.filter((d) => d.type === 'climate');
  const alakertaClimate = climateSensors.find((d) => d.name.toLowerCase().includes('alakerta'));
  const ylakertaClimate = climateSensors.find(
    (d) =>
      d.name.toLowerCase().includes('ylakerta') ||
      d.name.toLowerCase().includes('tyohuone') ||
      d.name.toLowerCase().includes('työhuone')
  );
  const mitsuAlakerta = mitsuStatus?.units.find((u) => u.id === 'mitsubishi_alakerta');
  const mitsuYlakerta = mitsuStatus?.units.find((u) => u.id === 'mitsubishi_ylakerta');

  const alakertaTemp = alakertaClimate?.properties.temperature ?? mitsuAlakerta?.currentTemperature;
  const ylakertaTemp = ylakertaClimate?.properties.temperature ?? mitsuYlakerta?.currentTemperature;
  const houseTemps = [alakertaTemp, ylakertaTemp].filter((t): t is number => typeof t === 'number');
  const houseAvgTemp =
    houseTemps.length > 0 ? houseTemps.reduce((a, b) => a + b, 0) / houseTemps.length : null;

  // Sauna info
  const isSaunaOn = sauna?.isOn ?? false;
  const saunaClimate = climateSensors.find((d) => d.name.toLowerCase().includes('sauna'));
  const saunaTemp = saunaClimate?.properties.temperature ?? null;

  // Lighting & Plugs unified summary
  const areOutdoorLightsOn = outdoorLightsStatus?.isOn ?? false;
  const lightDevices = tuyaDevices.filter((d) => d.type === 'light');
  const activeIndoorLightsCount = lightDevices.filter((d) => Boolean(d.properties.switch_led)).length;

  const tuyaPlugs = tuyaDevices.filter(
    (d) =>
      (d.category === 'cz' || d.type === 'meter_switch') &&
      !d.name.toLowerCase().includes('ulkovalot') &&
      !d.name.toLowerCase().includes('wifi switch')
  );
  const activeTuyaPlugsCount = tuyaPlugs.filter((d) =>
    Boolean(d.properties?.state ?? d.properties?.switch_1)
  ).length;
  const tuyaPlugsPower = tuyaPlugs.reduce((sum, d) => sum + (d.properties?.power || 0), 0);
  const activePlugsCount = tapoDevices.filter((d) => d.state === 'ON').length + activeTuyaPlugsCount;
  const totalPlugPower =
    tapoDevices.reduce((sum, d) => sum + (d.power_w || 0), 0) +
    (outdoorLightsStatus?.telemetry?.power_w || 0) +
    tuyaPlugsPower;

  const categories = [
    {
      id: 'heating' as CategoryId,
      title: 'Lämmitys',
      subtitle: 'VILP 12kW, Mitsubishi ILP, LKV, Puskuri & Kamera',
      icon: '🔥',
      color: '#f59e0b',
      borderColor: 'rgba(245, 158, 11, 0.32)',
      gradient: 'linear-gradient(145deg, rgba(245, 158, 11, 0.12) 0%, rgba(15, 23, 42, 0.88) 100%)',
      badges: [
        {
          label: heatPumpState ? 'VILP Päällä' : 'VILP Valmiustila',
          value:
            outletTemp !== null
              ? `${outletTemp.toFixed(1)}°C${inletTemp !== null ? ` / ${inletTemp.toFixed(1)}°C` : ''}`
              : 'Live',
          color: heatPumpState ? '#4ade80' : '#94a3b8',
          bg: heatPumpState ? 'rgba(34, 197, 94, 0.15)' : 'rgba(148, 163, 184, 0.1)',
        },
        {
          label: 'Käyttövesi',
          value: dhwTemp !== null ? `${dhwTemp.toFixed(1)} °C` : '--',
          color: '#10b981',
          bg: 'rgba(16, 185, 129, 0.15)',
        },
      ],
      description:
        'Panasonic VILP, Mitsubishi ILP -hybridiohjaus, menovedet, puskurin lämmöt, kiertovesipumput ja valvontakamera.',
    },
    {
      id: 'temperatures' as CategoryId,
      title: 'Lämpömittarit & Sisäilma',
      subtitle: 'Päärakennus, Ulkoilma, Varastot & Turva-anturit',
      icon: '🌡️',
      color: '#38bdf8',
      borderColor: 'rgba(56, 189, 248, 0.32)',
      gradient: 'linear-gradient(145deg, rgba(56, 189, 248, 0.12) 0%, rgba(15, 23, 42, 0.88) 100%)',
      badges: [
        {
          label: 'Talo (ka.)',
          value: houseAvgTemp !== null ? `${houseAvgTemp.toFixed(1)} °C` : '--',
          color: '#38bdf8',
          bg: 'rgba(56, 189, 248, 0.15)',
        },
        {
          label: 'Ulkoilma',
          value: outsideTemp !== null ? `${outsideTemp > 0 ? '+' : ''}${outsideTemp.toFixed(1)} °C` : '--',
          color: '#4ade80',
          bg: 'rgba(34, 197, 94, 0.12)',
        },
      ],
      description:
        'Huonekohtaiset lämpötilat ja kosteudet, 433 MHz ulkoanturit, mittaushistoria sekä vuoto- ja ovianturit.',
    },
    {
      id: 'sauna' as CategoryId,
      title: 'Sauna',
      subtitle: 'Kiuasohjaus, Ajastin, Tunnelmavalot & Sessiot',
      icon: '🧖‍♂️',
      color: '#fb923c',
      borderColor: isSaunaOn ? 'rgba(249, 115, 22, 0.6)' : 'rgba(251, 146, 60, 0.32)',
      gradient: 'linear-gradient(145deg, rgba(234, 88, 12, 0.13) 0%, rgba(15, 23, 42, 0.88) 100%)',
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
      description:
        'Kiukaan etäkäynnistys, turva-ajastin, saunan tunnelmavalaistus sekä saunasessioiden kulutus ja historia.',
    },
    {
      id: 'controls' as CategoryId,
      title: 'Valot & Pistorasiat',
      subtitle: 'Tapo P115, Energy+ Tuya, Ulkovalot & Sisävalot',
      icon: '🔌',
      color: '#facc15',
      borderColor: 'rgba(250, 204, 21, 0.3)',
      gradient: 'linear-gradient(145deg, rgba(250, 204, 21, 0.1) 0%, rgba(15, 23, 42, 0.88) 100%)',
      badges: [
        {
          label: 'Kuorma',
          value: `${totalPlugPower.toFixed(0)} W (${activePlugsCount} päällä)`,
          color: '#38bdf8',
          bg: 'rgba(56, 189, 248, 0.14)',
        },
        {
          label: 'Ulkovalot',
          value: areOutdoorLightsOn ? 'PÄÄLLÄ' : 'POIS',
          color: areOutdoorLightsOn ? '#facc15' : '#94a3b8',
          bg: areOutdoorLightsOn ? 'rgba(250, 204, 21, 0.15)' : 'rgba(148, 163, 184, 0.1)',
        },
        {
          label: 'Sisävalot',
          value: `${activeIndoorLightsCount} päällä`,
          color: activeIndoorLightsCount > 0 ? '#4ade80' : '#94a3b8',
          bg: 'rgba(34, 197, 94, 0.12)',
        },
      ],
      description:
        'Varastojen pakkassuojaus, kodinkoneiden hintaleikkuri, ulkovalojen hämäräautomaatio sekä WC-, mancave- ja saunavalot.',
    },
    {
      id: 'trends' as CategoryId,
      title: 'Trendit & Kulutus',
      subtitle: 'Kalenteri, Herrfors SPOT, VILP COP & Mittarihistoria',
      icon: '📈',
      color: '#c084fc',
      borderColor: 'rgba(192, 132, 252, 0.32)',
      gradient: 'linear-gradient(145deg, rgba(168, 85, 247, 0.12) 0%, rgba(15, 23, 42, 0.88) 100%)',
      badges: [
        {
          label: 'Sähkö nyt',
          value: priceCentsKWh !== null ? `${priceCentsKWh.toFixed(1)} snt` : '—',
          color:
            priceLevel === 'cheap'
              ? '#10b981'
              : priceLevel === 'expensive'
              ? '#f43f5e'
              : '#facc15',
          bg: 'rgba(255, 255, 255, 0.06)',
        },
        {
          label: 'Data',
          value: 'Herrfors + VILP + 433 MHz',
          color: '#c084fc',
          bg: 'rgba(168, 85, 247, 0.15)',
        },
      ],
      description:
        'Kuukausikalenteri, tuntitason sähködata, sähkölaskun kustannukset, lämpöpumpun COP ja kaikkien anturien trendit.',
    },
    {
      id: 'apc' as CategoryId,
      title: 'APC-Strategia',
      subtitle: 'Pörssisähköoptimointi, Tariffit, Rajat & Päätösloki',
      icon: '⚡',
      color: '#10b981',
      borderColor: 'rgba(16, 185, 129, 0.32)',
      gradient: 'linear-gradient(145deg, rgba(16, 185, 129, 0.12) 0%, rgba(15, 23, 42, 0.88) 100%)',
      badges: [
        {
          label: 'Ohjaus',
          value: 'Reaaliaikainen APC',
          color: '#4ade80',
          bg: 'rgba(34, 197, 94, 0.15)',
        },
        {
          label: 'Anturit',
          value: `${climateSensors.length + (mitsuStatus?.units.length || 0)} kpl live`,
          color: '#38bdf8',
          bg: 'rgba(56, 189, 248, 0.12)',
        },
      ],
      description:
        'Pörssisähkön hintahuippujen väistö, halpojen tuntien varaustehot, pumppujen automaatio ja reaaliaikainen päätösloki.',
    },
    {
      id: 'technical' as CategoryId,
      title: 'Tekniikka & Akku',
      subtitle: 'Hydraulikaavio, 12kW Hybridi & Asetusmuistio',
      icon: '🛠️',
      color: '#22d3ee',
      borderColor: 'rgba(34, 211, 238, 0.32)',
      gradient: 'linear-gradient(145deg, rgba(6, 182, 212, 0.11) 0%, rgba(15, 23, 42, 0.88) 100%)',
      badges: [
        {
          label: 'Hydrauliikka',
          value: '4-putki + 100L',
          color: '#22d3ee',
          bg: 'rgba(6, 182, 212, 0.15)',
        },
        {
          label: 'Akusto',
          value: '15 kWh LiFePO4',
          color: '#10b981',
          bg: 'rgba(16, 185, 129, 0.15)',
        },
      ],
      description:
        'Putkiston interaktiivinen kytkentäkaavio, 3-vaiheinen akkujärjestelmä (ATS & EPS) ja Panasonic-asetusmuistio.',
    },
  ];

  return (
    <div className="page-stack">
      <PageHeader
        icon="🏠"
        title="Kotiäly Hub"
        subtitle="Valitse aihepiiri nähdäksesi laitteet, ohjaukset ja mittaukset"
      />

      <div
        className="category-hub-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 16,
        }}
      >
        {categories.map((cat) => (
          <div
            key={cat.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelectCategory(cat.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectCategory(cat.id);
              }
            }}
            style={{
              background: cat.gradient,
              border: `1px solid ${cat.borderColor}`,
              borderRadius: 16,
              padding: 20,
              cursor: 'pointer',
              position: 'relative',
              overflow: 'hidden',
              boxShadow: '0 6px 24px rgba(0, 0, 0, 0.32)',
              transition: 'transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 12px 32px rgba(0, 0, 0, 0.45)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 6px 24px rgba(0, 0, 0, 0.32)';
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 12,
                      background: 'rgba(0, 0, 0, 0.35)',
                      border: `1px solid ${cat.borderColor}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 21,
                      flexShrink: 0,
                    }}
                  >
                    {cat.icon}
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {cat.title}
                    </h3>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      {cat.subtitle}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    background: 'rgba(255, 255, 255, 0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: cat.color,
                    fontSize: 13,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  ➔
                </div>
              </div>

              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.48, margin: '6px 0 14px 0' }}>
                {cat.description}
              </p>
            </div>

            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', paddingTop: 10, borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
              {cat.badges.map((b, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    background: b.bg,
                    padding: '4px 9px',
                    borderRadius: 8,
                    fontSize: '0.73rem',
                    fontVariantNumeric: 'tabular-nums',
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
