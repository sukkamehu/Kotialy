// Zigbee device and sensor types

export type ZigbeeDeviceType =
  | 'climate'      // temperature + humidity sensor
  | 'contact'      // door/window sensor
  | 'motion'       // PIR motion sensor
  | 'thermostat'   // TRV radiator valve / thermostat
  | 'water_leak'   // water leak sensor
  | 'power_meter'  // smart plug with power monitoring
  | 'light_sensor' // lux sensor
  | 'smoke'        // smoke detector
  | 'unknown';

export interface ZigbeeDeviceInfo {
  friendlyName: string;
  type: ZigbeeDeviceType;
  model: string;
  vendor: string;
  description: string;
  ieeeAddr: string;
  networkAddress: number;
  powerSource: string;
  interviewCompleted: boolean;
  online: boolean | null;
  properties: Record<string, { value: string; updated_at: number }>;
}

export type ZigbeeRegistry = Record<string, ZigbeeDeviceInfo>;

// WS message types
export interface ZigbeeUpdateMessage {
  type: 'zigbee_update';
  device: string;
  deviceType: ZigbeeDeviceType;
  properties: Record<string, string>;
  ts: number;
}

export interface ZigbeeDevicesMessage {
  type: 'zigbee_devices';
  devices: ZigbeeRegistry;
  ts: number;
}

export interface ZigbeeStatusMessage {
  type: 'zigbee_status';
  connected: boolean;
  broker?: string;
  ts: number;
}

export interface ZigbeeAvailabilityMessage {
  type: 'zigbee_availability';
  device: string;
  online: boolean;
  ts: number;
}

// Helpers
export function getProp(device: ZigbeeDeviceInfo, prop: string): string | null {
  return device.properties?.[prop]?.value ?? null;
}

export function getNumProp(device: ZigbeeDeviceInfo, prop: string): number | null {
  const v = getProp(device, prop);
  if (v === null) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

export function getBoolProp(device: ZigbeeDeviceInfo, prop: string): boolean | null {
  const v = getProp(device, prop);
  if (v === null) return null;
  return v === 'true' || v === '1';
}

export function batteryColor(pct: number | null): string {
  if (pct === null) return 'var(--text-muted)';
  if (pct > 50) return 'var(--online)';
  if (pct > 20) return 'var(--warning)';
  return 'var(--offline)';
}

export function batteryIcon(pct: number | null): string {
  if (pct === null) return '🔋';
  if (pct > 80) return '🔋';
  if (pct > 50) return '🪫';
  if (pct > 20) return '⚠️';
  return '🔴';
}

export function signalBars(lq: number | null): string {
  if (lq === null) return '·';
  if (lq > 150) return '▂▄▆█';
  if (lq > 100) return '▂▄▆·';
  if (lq > 50)  return '▂▄··';
  return '▂···';
}

export function timeAgo(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}
