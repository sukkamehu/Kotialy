/**
 * Heishamon MQTT Topic Map
 * Maps topic path → metadata (label, unit, category, etc.)
 *
 * Base topic: panasonic_heat_pump (configurable in .env)
 * Full topic example: panasonic_heat_pump/main/Heatpump_State
 */

const TOPICS = {
  // ─── Core Heat Pump ───────────────────────────────────────────────────────
  'main/Heatpump_State': {
    label: 'Lämpöpumppu',
    unit: '',
    category: 'heatpump',
    type: 'enum',
    map: { 0: 'Pois päältä', 1: 'Päällä' },
    writable: true,
    setTopic: 'commands/SetHeatpump',
    min: 0,
    max: 1,
    step: 1,
  },
  'main/Operating_Mode_State': {
    label: 'Käyttötila',
    unit: '',
    category: 'heatpump',
    type: 'enum',
    map: {
      0: 'Vain lämmitys',
      1: 'Vain jäähdytys',
      2: 'Auto (lämmitys)',
      3: 'Vain käyttövesi',
      4: 'Lämmitys + KV',
      5: 'Jäähdytys + KV',
      6: 'Auto (lämmitys) + KV',
      7: 'Auto (jäähdytys)',
      8: 'Auto (jäähdytys) + KV',
    },
    writable: true,
    setTopic: 'commands/SetOperationMode',
    min: 0,
    max: 8,
    step: 1,
  },
  'main/Compressor_Freq': {
    label: 'Kompressorin taajuus',
    unit: 'Hz',
    category: 'heatpump',
    type: 'number',
  },
  'main/Pump_Flow': {
    label: 'Virtausnopeus',
    unit: 'L/min',
    category: 'heatpump',
    type: 'number',
  },
  'main/Pump_Speed': {
    label: 'Pumpun nopeus',
    unit: 'RPM',
    category: 'heatpump',
    type: 'number',
  },
  'main/Main_Inlet_Temp': {
    label: 'Tulovesi',
    unit: '°C',
    category: 'heatpump',
    type: 'number',
  },
  'main/Main_Outlet_Temp': {
    label: 'Menovesi',
    unit: '°C',
    category: 'heatpump',
    type: 'number',
  },
  'main/Main_Target_Temp': {
    label: 'Menoveden tavoite',
    unit: '°C',
    category: 'heatpump',
    type: 'number',
  },
  'main/Defrosting_State': {
    label: 'Sulatus',
    unit: '',
    category: 'heatpump',
    type: 'enum',
    map: { 0: 'Pois', 1: 'Käynnissä' },
  },
  'main/Operations_Hours': {
    label: 'Käyttötunnit',
    unit: 'h',
    category: 'heatpump',
    type: 'number',
  },
  'main/Operations_Counter': {
    label: 'Käynnistyskerrat',
    unit: '',
    category: 'heatpump',
    type: 'number',
  },
  'main/Error': {
    label: 'Virhe',
    unit: '',
    category: 'heatpump',
    type: 'string',
  },
  'main/Internal_Heater_State': {
    label: 'Sisäinen vastus',
    unit: '',
    category: 'heatpump',
    type: 'enum',
    map: { 0: 'Ei käytössä', 1: 'Päällä' },
  },
  'main/External_Heater_State': {
    label: 'Ulkoinen vastus',
    unit: '',
    category: 'heatpump',
    type: 'enum',
    map: { 0: 'Ei käytössä', 1: 'Päällä' },
  },

  // ─── DHW (Domestic Hot Water) Tank ────────────────────────────────────────
  'main/DHW_Temp': {
    label: 'Käyttövesi',
    unit: '°C',
    category: 'dhw',
    type: 'number',
  },
  'main/DHW_Target_Temp': {
    label: 'Käyttöveden tavoite',
    unit: '°C',
    category: 'dhw',
    type: 'number',
    writable: true,
    setTopic: 'commands/SetDHWTemp',
    min: 40,
    max: 75,
    step: 1,
  },
  'main/Force_DHW_State': {
    label: 'Pikakäyttövesi',
    unit: '',
    category: 'dhw',
    type: 'enum',
    map: { 0: 'Pois', 1: 'Päällä' },
    writable: true,
    setTopic: 'commands/SetForceDHW',
    min: 0,
    max: 1,
    step: 1,
  },
  'main/DHW_Heater_State': {
    label: 'Käyttövesivastus',
    unit: '',
    category: 'dhw',
    type: 'enum',
    map: { 0: 'Pois käytöstä', 1: 'Käytössä' },
  },
  'main/DHW_Power_Production': {
    label: 'Käyttöveden tuotto',
    unit: 'W',
    category: 'dhw',
    type: 'number',
  },
  'main/DHW_Power_Consumption': {
    label: 'Käyttöveden kulutus',
    unit: 'W',
    category: 'dhw',
    type: 'number',
  },

  // ─── Buffer Tank (100L) ───────────────────────────────────────────────────
  'main/Buffer_Temp': {
    label: 'Puskurivaraaja',
    unit: '°C',
    category: 'buffer',
    type: 'number',
  },
  /*
   * With a buffer tank the heating circuit target IS the Z1 heat request
   * temperature, so this is the buffer setpoint in practice.
   *
   * Its meaning depends on how the pump is configured:
   *   - "direct"       -> an absolute water temperature (modes.direct)
   *   - compensation   -> a shift applied to the heat curve (modes.curve)
   * The server cannot see which is active, so it validates against the union
   * of both ranges and the UI clamps to the mode the user selected.
   */
  'main/Z1_Heat_Request_Temp': {
    label: 'Lämmityspiirin pyynti',
    unit: '°C',
    category: 'buffer',
    type: 'number',
    writable: true,
    setTopic: 'commands/SetZ1HeatRequestTemperature',
    min: -5,
    max: 60,
    step: 1,
    modes: {
      direct: { min: 20, max: 60, step: 1, label: 'Menoveden tavoitelämpötila' },
      curve:  { min: -5, max: 5,  step: 1, label: 'Lämpökäyrän siirtymä' },
    },
  },

  // ─── 3-Way Valve ─────────────────────────────────────────────────────────
  'main/ThreeWay_Valve_State': {
    label: '3-tieventtiili',
    unit: '',
    category: 'valve',
    type: 'enum',
    map: { 0: 'Lämmitys', 1: 'Käyttövesi' },
  },

  // ─── Power & Energy ───────────────────────────────────────────────────────
  'main/Heat_Power_Production': {
    label: 'Lämmitysteho (tuotto)',
    unit: 'W',
    category: 'power',
    type: 'number',
  },
  'main/Heat_Power_Consumption': {
    label: 'Ottoteho (lämmitys)',
    unit: 'W',
    category: 'power',
    type: 'number',
  },
  'main/Cool_Power_Production': {
    label: 'Jäähdytysteho (tuotto)',
    unit: 'W',
    category: 'power',
    type: 'number',
  },
  'main/Cool_Power_Consumption': {
    label: 'Ottoteho (jäähdytys)',
    unit: 'W',
    category: 'power',
    type: 'number',
  },
  'main/Compressor_Current': {
    label: 'Kompressorin virta',
    unit: 'A',
    category: 'power',
    type: 'number',
  },

  // XTOP (extra data block, M-series preferred values)
  'extra/Heat_Power_Consumption': {
    label: 'Ottoteho (XT)',
    unit: 'W',
    category: 'power',
    type: 'number',
  },
  'extra/Heat_Power_Production': {
    label: 'Lämmitysteho XT (tuotto)',
    unit: 'W',
    category: 'power',
    type: 'number',
  },
  'extra/Cool_Power_Consumption': {
    label: 'Jäähdytys ottoteho (XT)',
    unit: 'W',
    category: 'power',
    type: 'number',
  },
  'extra/Cool_Power_Production': {
    label: 'Jäähdytysteho XT (tuotto)',
    unit: 'W',
    category: 'power',
    type: 'number',
  },
  'extra/DHW_Power_Consumption': {
    label: 'Käyttövesi ottoteho (XT)',
    unit: 'W',
    category: 'power',
    type: 'number',
  },
  'extra/DHW_Power_Production': {
    label: 'Käyttövesiteho XT (tuotto)',
    unit: 'W',
    category: 'power',
    type: 'number',
  },

  // ─── Outdoor Unit ─────────────────────────────────────────────────────────
  'main/Outside_Temp': {
    label: 'Ulkolämpötila',
    unit: '°C',
    category: 'outdoor',
    type: 'number',
  },
  'main/Outside_Pipe_Temp': {
    label: 'Ulkoyksikön putki',
    unit: '°C',
    category: 'outdoor',
    type: 'number',
  },
  'main/Discharge_Temp': {
    label: 'Kuuma-kaasu',
    unit: '°C',
    category: 'outdoor',
    type: 'number',
  },
  'main/Inside_Pipe_Temp': {
    label: 'Sisäyksikön putki',
    unit: '°C',
    category: 'outdoor',
    type: 'number',
  },
  'main/Eva_Outlet_Temp': {
    label: 'Höyrystimen poisto',
    unit: '°C',
    category: 'outdoor',
    type: 'number',
  },
  'main/Bypass_Outlet_Temp': {
    label: 'Ohitusputken poisto',
    unit: '°C',
    category: 'outdoor',
    type: 'number',
  },
  'main/Ipm_Temp': {
    label: 'IPM-lämpötila',
    unit: '°C',
    category: 'outdoor',
    type: 'number',
  },
  'main/Fan1_Motor_Speed': {
    label: 'Puhallin 1',
    unit: 'RPM',
    category: 'outdoor',
    type: 'number',
  },
  'main/Fan2_Motor_Speed': {
    label: 'Puhallin 2',
    unit: 'RPM',
    category: 'outdoor',
    type: 'number',
  },
  'main/High_Pressure': {
    label: 'Korkeapaine',
    unit: 'kgf/cm²',
    category: 'outdoor',
    type: 'number',
  },
  'main/Low_Pressure': {
    label: 'Matalapaine',
    unit: 'kgf/cm²',
    category: 'outdoor',
    type: 'number',
  },

  // ─── Modes / Settings ─────────────────────────────────────────────────────
  'main/Quiet_Mode_Level': {
    label: 'Hiljainen tila',
    unit: '',
    category: 'settings',
    type: 'enum',
    map: { 0: 'Pois', 1: 'Taso 1', 2: 'Taso 2', 3: 'Taso 3' },
    writable: true,
    setTopic: 'commands/SetQuietMode',
    min: 0,
    max: 3,
    step: 1,
  },
  'main/Powerful_Mode_Time': {
    label: 'Tehotila',
    unit: 'min',
    category: 'settings',
    type: 'enum',
    map: { 0: 'Pois', 1: '30 min', 2: '60 min', 3: '90 min' },
    writable: true,
    setTopic: 'commands/SetPowerfulMode',
    min: 0,
    max: 3,
    step: 1,
  },
  'main/Holiday_Mode_State': {
    label: 'Lomatila',
    unit: '',
    category: 'settings',
    type: 'enum',
    map: { 0: 'Pois', 1: 'Ajastettu', 2: 'Aktiivinen' },
    writable: true,
    setTopic: 'commands/SetHolidayMode',
    min: 0,
    max: 2,
    step: 1,
  },
  'main/Quiet_Mode_Schedule': {
    label: 'Hiljainen ajastus',
    unit: '',
    category: 'settings',
    type: 'enum',
    map: { 0: 'Pois', 1: 'Aktiivinen' },
  },
  'main/Force_Heater_State': {
    label: 'Pakkolämmitys',
    unit: '',
    category: 'settings',
    type: 'enum',
    map: { 0: 'Pois', 1: 'Päällä' },
    writable: true,
    setTopic: 'commands/SetForceHeater',
    min: 0,
    max: 1,
    step: 1,
  },
  'main/Force_Defrost_State': {
    label: 'Pakkosulatus',
    unit: '',
    category: 'settings',
    type: 'enum',
    map: { 0: 'Pois', 1: 'Päällä' },
    writable: true,
    setTopic: 'commands/SetForceDefrost',
    min: 0,
    max: 1,
    step: 1,
  },
};

// Topics that are chartable (numeric, interesting to plot over time)
const CHART_TOPICS = [
  'main/Outside_Temp',
  'main/Main_Inlet_Temp',
  'main/Main_Outlet_Temp',
  'main/DHW_Temp',
  'main/Buffer_Temp',
  'main/Compressor_Freq',
  'main/Pump_Flow',
  'main/Heat_Power_Production',
  'main/Heat_Power_Consumption',
  'extra/Heat_Power_Consumption',
  'extra/Heat_Power_Production',
];

/**
 * Enrich a raw `{ topic: { value, updated_at } }` state map with the
 * label/unit/category/type/displayValue metadata the frontend expects.
 *
 * Used by both the REST snapshot and the WebSocket snapshot so the two
 * cannot drift apart.
 */
function enrichState(raw) {
  const enriched = {};

  for (const [topic, data] of Object.entries(raw)) {
    const meta = TOPICS[topic];
    let displayValue = data.value;

    if (meta?.type === 'enum' && meta.map) {
      displayValue = meta.map[parseInt(data.value)] ?? data.value;
    }

    enriched[topic] = {
      ...data,
      label: meta?.label || topic.split('/').pop(),
      unit: meta?.unit || '',
      category: meta?.category || 'misc',
      type: meta?.type || 'string',
      displayValue,
    };
  }

  return enriched;
}

module.exports = { TOPICS, CHART_TOPICS, enrichState };
