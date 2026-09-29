export interface OutdoorLightsStatus {
  state: 'ON' | 'OFF';
  isOn: boolean;
  reason: string;
  enabled: boolean;
  deviceId: string;
  settings: {
    enabled: string;
    device_id: string;
    dusk_offset_minutes: string;
    dawn_offset_minutes: string;
    night_off_enabled: string;
    night_off_start: string;
    night_off_end: string;
    override_state: string;
    override_until: string;
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
