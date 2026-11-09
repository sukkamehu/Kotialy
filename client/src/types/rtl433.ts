export interface Rtl433Properties {
  temperature?: number;
  humidity?: number;
  battery?: number;
  battery_ok?: boolean;
  battery_mV?: number;
  pressure?: number;
  wind_speed?: number;
  wind_direction?: number;
  rain?: number;
  rssi?: number;
  snr?: number;
  [key: string]: any;
}

export interface Rtl433Device {
  id: string;
  model: string;
  rawId?: string;
  channel?: number | null;
  customName?: string | null;
  category?: string;
  location?: string | null;
  isOutdoor?: boolean;
  isIgnored?: boolean;
  lastSeen?: number | null;
  online?: boolean;
  isOnline?: boolean;
  isStale?: boolean;
  ageMinutes?: number | null;
  ageSeconds?: number | null;
  packetCount?: number;
  properties: Rtl433Properties;
  raw?: any;
}

export interface Rtl433Status {
  connected: boolean;
  packetCount: number;
  deviceCount: number;
  lastReceivedAt: number | null;
  baseTopic?: string;
}

export interface Rtl433DevicesResponse {
  devices: Rtl433Device[];
  count: number;
  status: Rtl433Status;
  ts: number;
}

export type Rtl433WsMessage =
  | {
      type: 'rtl433_update';
      deviceId: string;
      properties: Rtl433Properties;
      lastSeen: number;
      ts: number;
    }
  | {
      type: 'rtl433_devices';
      devices: Rtl433Device[];
      ts: number;
    }
  | {
      type: 'rtl433_status';
      connected: boolean;
      ts: number;
    };

