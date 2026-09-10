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
  },
  'main/Force_DHW_State': {
    label: 'Force DHW',
    unit: '',
    category: 'dhw',
    type: 'enum',
    map: { 0: 'Off', 1: 'On' },
    writable: true,
    setTopic: 'commands/SetForceDHW',
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
  },
  'main/Powerful_Mode_Time': {
    label: 'Powerful Mode',
    unit: 'min',
    category: 'settings',
    type: 'enum',
    map: { 0: 'Off', 1: '30 min', 2: '60 min', 3: '90 min' },
    writable: true,
    setTopic: 'commands/SetPowerfulMode',
  },
  'main/Holiday_Mode_State': {
    label: 'Holiday Mode',
    unit: '',
    category: 'settings',
    type: 'enum',
    map: { 0: 'Off', 1: 'Scheduled', 2: 'Active' },
    writable: true,
    setTopic: 'commands/SetHolidayMode',
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

module.exports = { TOPICS, CHART_TOPICS };
