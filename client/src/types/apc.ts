export type ApcMode = 'balanced' | 'eco' | 'comfort' | 'dhw_only';

export type ApcDirective = 'BOOST' | 'NORMAL' | 'SETBACK' | 'ECO' | 'DHW_CYCLE';

export type FloorPumpMode = 'auto' | 'constant_on' | 'constant_off';
export type DefrostCableMode = 'auto' | 'constant_on' | 'constant_off';

export interface ApcSettings {
  enabled: boolean;
  mode: ApcMode;
  base_z1_shift?: number;
  buffer_boost_c: number;
  buffer_setback_c: number;
  dhw_target_c: number;
  dhw_boost_target_c?: number;
  dhw_normal_target_c?: number;
  dhw_min_c: number;
  dhw_boost_on_cheap?: boolean;
  cheap_threshold_cents: number;
  peak_threshold_cents: number;
  dhw_duration_hours: number;
  override_until: number;
  override_directive: ApcDirective | null;
  heating_cutoff_c?: number;
  prevent_curve_shift_above_cutoff?: boolean;
  auto_mode_switch_enabled?: boolean;
  auto_mode_switch_hysteresis_c?: number;
  floor_pump_mode?: FloorPumpMode;
  floor_pump_summer_cutoff_temp?: number;
  floor_pump_summer_pulse_enabled?: boolean;
  floor_pump_anti_seize_enabled?: boolean;
  floor_pump_override_until?: number;
  floor_pump_override_state?: 'ON' | 'OFF' | null;
  defrost_cable_mode?: DefrostCableMode;
  defrost_cable_temp_threshold?: number;
  defrost_cable_hard_freeze_temp?: number;
  defrost_cable_defrost_runover_min?: number;
  defrost_cable_override_until?: number;
  defrost_cable_override_state?: 'ON' | 'OFF' | null;
  quiet_mode_auto_enabled?: boolean;
  quiet_mode_level_3_temp?: number;
  quiet_mode_level_2_temp?: number;
  quiet_mode_level_1_temp?: number;
}

export interface FloorPumpStatus {
  driver: 'floor_pump';
  name: string;
  type: string;
  connected: boolean;
  currentState: 'ON' | 'OFF' | string;
  mode: FloorPumpMode;
  overrideActive: boolean;
  overrideUntil: number;
  overrideState: 'ON' | 'OFF' | null;
  reason: string;
  antiSeizeActive: boolean;
  lastAppliedAt: number;
  summerCutoffTemp: number;
  summerPulseEnabled?: boolean;
  antiSeizeEnabled: boolean;
}

export interface DefrostCableStatus {
  driver: 'defrost_cable';
  name: string;
  type: string;
  connected: boolean;
  currentState: 'ON' | 'OFF' | string;
  mode: DefrostCableMode;
  overrideActive: boolean;
  overrideUntil: number;
  overrideState: 'ON' | 'OFF' | null;
  reason: string;
  lastAppliedAt: number;
  tempThreshold: number;
  hardFreezeTemp: number;
  defrostRunoverMin: number;
}

export interface ApcPlanSlot {
  start_time: number;
  end_time: number;
  price: number;
  directive: ApcDirective;
  reason: string;
  buffer_shift: number;
  dhw_target: number;
  is_dhw_slot: boolean;
}

export interface ApcDeviceStatus {
  driver: string;
  name: string;
  type: string;
  connected?: boolean;
  enabled?: boolean;
  lastDirective?: ApcDirective;
  currentOffset?: number;
  targetOffset?: number;
  currentState?: string;
  mode?: string;
  overrideActive?: boolean;
  overrideUntil?: number;
  overrideState?: string | null;
  reason?: string;
  antiSeizeActive?: boolean;
}

export interface ApcPriceStats {
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
  spread: number;
  isFlatHorizon: boolean;
}

export interface ApcStatus {
  enabled: boolean;
  mode: ApcMode;
  currentDirective: ApcDirective;
  activeDhwSlot: boolean;
  lastEvaluatedAt: number;
  currentPrice: number | null;
  sensors: {
    bufferTemp: number | null;
    dhwTemp: number | null;
    outsideTemp: number | null;
  };
  settings: ApcSettings;
  overrideActive: boolean;
  overrideUntil: number;
  overrideDirective: ApcDirective | null;
  devices: ApcDeviceStatus[];
  stats?: ApcPriceStats;
  plan: ApcPlanSlot[];
}

export interface ApcLogEntry {
  id: number;
  timestamp: number;
  action: string;
  reason: string;
  price_cents: number | null;
  outdoor_temp: number | null;
  buffer_temp: number | null;
  dhw_temp: number | null;
  directive: ApcDirective;
  details: any;
}
