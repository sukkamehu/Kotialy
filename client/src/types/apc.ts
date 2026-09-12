export type ApcMode = 'balanced' | 'eco' | 'comfort' | 'dhw_only';

export type ApcDirective = 'BOOST' | 'NORMAL' | 'SETBACK' | 'ECO' | 'DHW_CYCLE';

export interface ApcSettings {
  enabled: boolean;
  mode: ApcMode;
  base_z1_shift?: number;
  buffer_boost_c: number;
  buffer_setback_c: number;
  dhw_target_c: number;
  dhw_min_c: number;
  cheap_threshold_cents: number;
  peak_threshold_cents: number;
  dhw_duration_hours: number;
  override_until: number;
  override_directive: ApcDirective | null;
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
