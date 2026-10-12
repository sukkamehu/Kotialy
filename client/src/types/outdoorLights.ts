export interface OutdoorLightsTelemetry {
  power_w: number;
  voltage_v: number;
  current_a: number;
  energy_kwh: number;
  device_temp?: number | null;
}

export interface OutdoorLightRelay {
  id: string;
  relayNum: number;
  name: string;
  label: string;
  state: 'ON' | 'OFF';
  isOn: boolean;
  online: boolean;
  telemetry?: OutdoorLightsTelemetry | null;
  isOverrideActive: boolean;
  overrideState: 'ON' | 'OFF' | null;
  overrideMinutesRemaining: number;
}

export interface OutdoorLightsStatus {
  state: 'ON' | 'OFF';
  isOn: boolean;
  reason: string;
  enabled: boolean;
  deviceId: string;
  deviceId2?: string;
  deviceName?: string;
  deviceOnline?: boolean;
  relays?: OutdoorLightRelay[];
  telemetry?: OutdoorLightsTelemetry;
  settings: {
    enabled: string;
    device_id: string;
    device_id_2?: string;
    dusk_offset_minutes: string;
    dawn_offset_minutes: string;
    night_off_enabled: string;
    night_off_start: string;
    night_off_end: string;
    override_state: string;
    override_until: string;
    override_relay1_state?: string;
    override_relay1_until?: string;
    override_relay2_state?: string;
    override_relay2_until?: string;
  };
  sunTimes: {
    sunrise: string | null;
    sunset: string | null;
    dawn: string | null;
    dusk: string | null;
  };
  isOverrideActive: boolean;
  overrideState: 'ON' | 'OFF' | null;
  overrideMinutesRemaining: number;
  lastEvaluatedAt: number;
}
