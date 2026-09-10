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
    label: 'Heat Pump',
    unit: '',
    category: 'heatpump',
    type: 'enum',
    map: { 0: 'Off', 1: 'On' },
    writable: true,
    setTopic: 'commands/SetHeatpump',
    min: 0,
    max: 1,
    step: 1,
  },
  'main/Operating_Mode_State': {
    label: 'Operating Mode',
    unit: '',
    category: 'heatpump',
    type: 'enum',
    map: {
      0: 'Heat Only',
      1: 'Cool Only',
      2: 'Auto (Heat)',
      3: 'DHW Only',
      4: 'Heat + DHW',
      5: 'Cool + DHW',
      6: 'Auto (Heat) + DHW',
      7: 'Auto (Cool)',
      8: 'Auto (Cool) + DHW',
    },
    writable: true,
    setTopic: 'commands/SetOperationMode',
    min: 0,
    max: 8,
    step: 1,
  },
  'main/Compressor_Freq': {
    label: 'Compressor Freq',
    unit: 'Hz',
    category: 'heatpump',
    type: 'number',
  },
  'main/Pump_Flow': {
    label: 'Pump Flow',
    unit: 'L/min',
    category: 'heatpump',
    type: 'number',
  },
  'main/Pump_Speed': {
    label: 'Pump Speed',
    unit: 'RPM',
    category: 'heatpump',
    type: 'number',
  },
  'main/Main_Inlet_Temp': {
    label: 'Water Inlet',
    unit: '°C',
    category: 'heatpump',
    type: 'number',
  },
  'main/Main_Outlet_Temp': {
    label: 'Water Outlet',
    unit: '°C',
    category: 'heatpump',
    type: 'number',
  },
  'main/Main_Target_Temp': {
    label: 'Target Outlet',
    unit: '°C',
    category: 'heatpump',
    type: 'number',
  },
  'main/Defrosting_State': {
    label: 'Defrost',
    unit: '',
    category: 'heatpump',
    type: 'enum',
    map: { 0: 'Off', 1: 'Active' },
  },
  'main/Operations_Hours': {
    label: 'Total Runtime',
    unit: 'h',
    category: 'heatpump',
    type: 'number',
  },
  'main/Operations_Counter': {
    label: 'Start Count',
    unit: '',
    category: 'heatpump',
    type: 'number',
  },
  'main/Error': {
    label: 'Error',
    unit: '',
    category: 'heatpump',
    type: 'string',
  },
  'main/Internal_Heater_State': {
    label: 'Internal Heater',
    unit: '',
    category: 'heatpump',
    type: 'enum',
    map: { 0: 'Inactive', 1: 'Active' },
  },
  'main/External_Heater_State': {
    label: 'External Heater',
    unit: '',
    category: 'heatpump',
    type: 'enum',
    map: { 0: 'Inactive', 1: 'Active' },
  },

  // ─── DHW (Domestic Hot Water) Tank ────────────────────────────────────────
  'main/DHW_Temp': {
    label: 'DHW Temp',
    unit: '°C',
    category: 'dhw',
    type: 'number',
  },
  'main/DHW_Target_Temp': {
    label: 'DHW Target',
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
    label: 'Force DHW',
    unit: '',
    category: 'dhw',
    type: 'enum',
    map: { 0: 'Off', 1: 'On' },
    writable: true,
    setTopic: 'commands/SetForceDHW',
    min: 0,
    max: 1,
    step: 1,
  },
  'main/DHW_Heater_State': {
    label: 'DHW Heater',
    unit: '',
    category: 'dhw',
    type: 'enum',
    map: { 0: 'Disabled', 1: 'Enabled' },
  },
  'main/DHW_Power_Production': {
    label: 'DHW Heat Production',
    unit: 'W',
    category: 'dhw',
    type: 'number',
  },
  'main/DHW_Power_Consumption': {
    label: 'DHW Consumption',
    unit: 'W',
    category: 'dhw',
    type: 'number',
  },

  // ─── Buffer Tank (100L) ───────────────────────────────────────────────────
  'main/Buffer_Temp': {
    label: 'Buffer Tank',
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
    label: 'Z1 Heat Request',
    unit: '°C',
    category: 'buffer',
    type: 'number',
    writable: true,
    setTopic: 'commands/SetZ1HeatRequestTemperature',
    min: -5,
    max: 60,
    step: 1,
    modes: {
      direct: { min: 20, max: 60, step: 1, label: 'Target water temperature' },
      curve:  { min: -5, max: 5,  step: 1, label: 'Heat curve shift' },
    },
  },

  // ─── 3-Way Valve ─────────────────────────────────────────────────────────
  'main/ThreeWay_Valve_State': {
    label: '3-Way Valve',
    unit: '',
    category: 'valve',
    type: 'enum',
    map: { 0: 'Room/Heating', 1: 'DHW' },
  },

  // ─── Power & Energy ───────────────────────────────────────────────────────
  'main/Heat_Power_Production': {
    label: 'Heat Production',
    unit: 'W',
    category: 'power',
    type: 'number',
  },
  'main/Heat_Power_Consumption': {
    label: 'Heat Consumption',
    unit: 'W',
    category: 'power',
    type: 'number',
  },
  'main/Cool_Power_Production': {
    label: 'Cool Production',
    unit: 'W',
    category: 'power',
    type: 'number',
  },
  'main/Cool_Power_Consumption': {
    label: 'Cool Consumption',
    unit: 'W',
    category: 'power',
    type: 'number',
  },
  'main/Compressor_Current': {
    label: 'Compressor Current',
    unit: 'A',
    category: 'power',
    type: 'number',
  },

  // XTOP (extra data block, M-series preferred values)
  'extra/Heat_Power_Consumption': {
    label: 'Heat Consumption (XT)',
    unit: 'W',
    category: 'power',
    type: 'number',
  },
  'extra/Heat_Power_Production': {
    label: 'Heat Production (XT)',
    unit: 'W',
    category: 'power',
    type: 'number',
  },
  'extra/Cool_Power_Consumption': {
    label: 'Cool Consumption (XT)',
    unit: 'W',
    category: 'power',
    type: 'number',
  },
  'extra/Cool_Power_Production': {
    label: 'Cool Production (XT)',
    unit: 'W',
    category: 'power',
    type: 'number',
  },
  'extra/DHW_Power_Consumption': {
    label: 'DHW Consumption (XT)',
    unit: 'W',
    category: 'power',
    type: 'number',
  },
  'extra/DHW_Power_Production': {
    label: 'DHW Production (XT)',
    unit: 'W',
    category: 'power',
    type: 'number',
  },

  // ─── Outdoor Unit ─────────────────────────────────────────────────────────
  'main/Outside_Temp': {
    label: 'Outdoor Temp',
    unit: '°C',
    category: 'outdoor',
    type: 'number',
  },
  'main/Outside_Pipe_Temp': {
    label: 'Outdoor Pipe',
    unit: '°C',
    category: 'outdoor',
    type: 'number',
  },
  'main/Discharge_Temp': {
    label: 'Discharge Temp',
    unit: '°C',
    category: 'outdoor',
    type: 'number',
  },
  'main/Inside_Pipe_Temp': {
    label: 'Inside Pipe',
    unit: '°C',
    category: 'outdoor',
    type: 'number',
  },
  'main/Eva_Outlet_Temp': {
    label: 'Eva Outlet',
    unit: '°C',
    category: 'outdoor',
    type: 'number',
  },
  'main/Bypass_Outlet_Temp': {
    label: 'Bypass Outlet',
    unit: '°C',
    category: 'outdoor',
    type: 'number',
  },
  'main/Ipm_Temp': {
    label: 'IPM Temp',
    unit: '°C',
    category: 'outdoor',
    type: 'number',
  },
  'main/Fan1_Motor_Speed': {
    label: 'Fan 1 Speed',
    unit: 'RPM',
    category: 'outdoor',
    type: 'number',
  },
  'main/Fan2_Motor_Speed': {
    label: 'Fan 2 Speed',
    unit: 'RPM',
    category: 'outdoor',
    type: 'number',
  },
  'main/High_Pressure': {
    label: 'High Pressure',
    unit: 'kgf/cm²',
    category: 'outdoor',
    type: 'number',
  },
  'main/Low_Pressure': {
    label: 'Low Pressure',
    unit: 'kgf/cm²',
    category: 'outdoor',
    type: 'number',
  },

  // ─── Modes / Settings ─────────────────────────────────────────────────────
  'main/Quiet_Mode_Level': {
    label: 'Quiet Mode',
    unit: '',
    category: 'settings',
    type: 'enum',
    map: { 0: 'Off', 1: 'Level 1', 2: 'Level 2', 3: 'Level 3' },
    writable: true,
    setTopic: 'commands/SetQuietMode',
    min: 0,
    max: 3,
    step: 1,
  },
  'main/Powerful_Mode_Time': {
    label: 'Powerful Mode',
    unit: 'min',
    category: 'settings',
    type: 'enum',
    map: { 0: 'Off', 1: '30 min', 2: '60 min', 3: '90 min' },
    writable: true,
    setTopic: 'commands/SetPowerfulMode',
    min: 0,
    max: 3,
    step: 1,
  },
  'main/Holiday_Mode_State': {
    label: 'Holiday Mode',
    unit: '',
    category: 'settings',
    type: 'enum',
    map: { 0: 'Off', 1: 'Scheduled', 2: 'Active' },
    writable: true,
    setTopic: 'commands/SetHolidayMode',
    min: 0,
    max: 2,
    step: 1,
  },
  'main/Quiet_Mode_Schedule': {
    label: 'Quiet Schedule',
    unit: '',
    category: 'settings',
    type: 'enum',
    map: { 0: 'Inactive', 1: 'Active' },
  },
  'main/Force_Heater_State': {
    label: 'Force Heater',
    unit: '',
    category: 'settings',
    type: 'enum',
    map: { 0: 'Inactive', 1: 'Active' },
    writable: true,
    setTopic: 'commands/SetForceHeater',
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
