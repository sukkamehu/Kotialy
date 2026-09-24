export type TuyaDeviceType = 
  | 'sauna_switch'
  | 'climate'
  | 'water_leak'
  | 'door'
  | 'gateway'
  | 'switch'
  | 'unknown';

export interface TuyaDevice {
  id: string;
  name: string;
  type: TuyaDeviceType;
  category: string;
  model: string;
  product_name: string;
  online: boolean;
  ip?: string;
  properties: {
    switch_1?: boolean;
    state?: boolean | string;
    temperature?: number;
    humidity?: number;
    battery?: number | null;
    leak_detected?: boolean;
    is_open?: boolean;
    mode?: string;
    [key: string]: any;
  };
  raw_status?: Record<string, any>;
  update_time: number;
}

export interface SaunaState {
  id: string;
  name: string;
  isOn: boolean;
  startedAt: number | null;
  autoOffAt: number | null;
  durationMinutes: number;
  scheduledStartAt?: number | null;
  scheduledDurationMinutes?: number | null;
  temperature: number | null;
  humidity: number | null;
  remainingMinutes: number;
  remainingSeconds: number;
  scheduledRemainingSeconds?: number;
  maxHours: number;
  maxMinutes: number;
  lastSeen: number | null;
  lastAction: string | null;
}

export interface TuyaStatusResponse {
  ok: boolean;
  configured: boolean;
  devices: TuyaDevice[];
  sauna: SaunaState;
  ts: number;
}
