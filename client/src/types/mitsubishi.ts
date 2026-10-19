export type MitsubishiOperatingMode = 'smart_assist' | 'fan_only' | 'cool' | 'heat' | 'off';

export interface MitsubishiUnitStatus {
  id: string;
  name: string;
  type: string;
  host: string;
  connected: boolean;
  lastSeen: number;
  currentTemperature: number | null;
  targetTemperature: number | null;
  mode: 'HEAT' | 'COOL' | 'FAN_ONLY' | 'DRY' | 'AUTO' | 'OFF';
  action: 'HEATING' | 'COOLING' | 'IDLE' | 'FAN' | 'OFF';
  fanMode: 'AUTO' | 'QUIET' | 'LOW' | 'MEDIUM' | 'MIDDLE' | 'HIGH';
  swingMode: string;
  lastDirective: string | null;
  lastAppliedAt: number;
  reason: string;
  overrideActive?: boolean;
  overrideUntil?: number;
  overrideState?: {
    mode: string;
    target_temp: number;
    fan_mode: string;
  } | null;
  overrideMinutesRemaining?: number;
}

export interface MitsubishiSettings {
  mode: MitsubishiOperatingMode;
  frostAssistTemp: number; // e.g. -12.0
  maxPriceLimit: number; // e.g. 20.0
  heatTarget: number; // e.g. 21.0
  coolTarget: number; // e.g. 23.0
}

export interface MitsubishiStatus {
  driver: string;
  name: string;
  units: MitsubishiUnitStatus[];
  settings: MitsubishiSettings;
  overrideActive: boolean;
  overrideUntil: number;
  overrideState: {
    mode: string;
    target_temp: number;
    fan_mode: string;
  } | null;
  overrideMinutesRemaining: number;
  reason: string;
  lastAppliedAt: number;
  outdoorTemp: number | null;
}
