export type TapoDeviceType =
  | 'storage_heating'
  | 'appliance_washing_machine'
  | 'appliance_dryer'
  | 'general_plug';

export type TapoAutoMode = 'auto' | 'constant_on' | 'constant_off';

export interface TapoDevice {
  id: string;
  name: string;
  ip: string;
  type: TapoDeviceType | string;
  state: 'ON' | 'OFF' | string;
  power_w: number;
  today_energy_kwh: number;
  total_energy_kwh: number;
  voltage_v?: number | null;
  current_a?: number | null;
  auto_mode: TapoAutoMode;
  max_price_cents?: number | null;
  min_temp_c?: number | null;
  max_temp_c?: number | null;
  temp_sensor_topic?: string | null;
  override_until?: number;
  override_state?: 'ON' | 'OFF' | null;
  isOverrideActive?: boolean;
  last_seen?: number | null;
  last_action_reason?: string | null;
}
