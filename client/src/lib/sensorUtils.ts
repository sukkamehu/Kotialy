import type { Rtl433Device } from '../types/rtl433';
import type { TuyaDevice } from '../types/tuya';

/**
 * High-contrast, dark-theme-friendly color palette for dynamic sensors (433 MHz RF, etc.).
 * Colors are assigned deterministically by hashing each sensor's immutable ID so
 * trend line colors NEVER change when sensor packets arrive or list membership changes.
 */
export const SENSOR_COLOR_PALETTE = [
  '#10b981', // emerald
  '#06b6d4', // cyan
  '#8b5cf6', // violet
  '#f59e0b', // amber
  '#ec4899', // pink
  '#3b82f6', // blue
  '#14b8a6', // teal
  '#f97316', // orange
  '#a855f7', // purple
  '#84cc16', // lime
  '#38bdf8', // sky
  '#fb7185', // rose
  '#eab308', // yellow
  '#2dd4bf', // bright teal
  '#818cf8', // indigo
  '#4ade80', // green
] as const;

/**
 * FNV-1a 32-bit hash for stable, collision-resistant color selection.
 */
function hashString(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Returns a deterministic color for a given sensor/topic key.
 * Guaranteed identical across renders, reloads, and sensor ordering changes.
 */
export function getStableSensorColor(sensorIdOrKey: string): string {
  const idx = hashString(sensorIdOrKey) % SENSOR_COLOR_PALETTE.length;
  return SENSOR_COLOR_PALETTE[idx];
}

/**
 * Display name helper for RTL433 devices.
 */
export function getRtlDeviceDisplayName(d: Rtl433Device): string {
  return d.customName?.trim() || `${d.model} #${d.rawId || d.id}`;
}

/**
 * Deterministic, stable sort for 433 MHz RF devices:
 * 1. Non-ignored before ignored
 * 2. Outdoor sensors before indoor/other sensors
 * 3. Natural Finnish alphabetical/numeric order by display name (e.g., Ulko 1, Ulko 2, ..., Ulko 10)
 * 4. Immutable device ID tie-breaker
 *
 * Never sorts by `lastSeen` or live measurement values so UI lists never jump around.
 */
export function stableSortRtlDevices<T extends Rtl433Device>(devices: T[]): T[] {
  return [...devices].sort((a, b) => {
    const ignoredDiff = Number(Boolean(a.isIgnored)) - Number(Boolean(b.isIgnored));
    if (ignoredDiff !== 0) return ignoredDiff;

    const outdoorDiff = Number(Boolean(b.isOutdoor)) - Number(Boolean(a.isOutdoor));
    if (outdoorDiff !== 0) return outdoorDiff;

    const nameA = getRtlDeviceDisplayName(a);
    const nameB = getRtlDeviceDisplayName(b);
    const nameDiff = nameA.localeCompare(nameB, 'fi', { numeric: true, sensitivity: 'base' });
    if (nameDiff !== 0) return nameDiff;

    return a.id.localeCompare(b.id);
  });
}

/**
 * Structural fingerprint for RTL433 devices that only changes when sensor identity,
 * display name, outdoor/ignored flag, or available metric types (temperature/humidity) change.
 * Live reading values and `lastSeen` timestamps are intentionally excluded so charts
 * and topic selectors do not re-render or flicker on every incoming RF packet.
 */
export function getRtlStructureKey(devices: Rtl433Device[]): string {
  return stableSortRtlDevices(devices)
    .filter((d) => !d.isIgnored)
    .map((d) => {
      const hasT = typeof d.properties?.temperature === 'number' ? 'T' : '';
      const hasH = typeof d.properties?.humidity === 'number' ? 'H' : '';
      return `${d.id}|${d.customName || ''}|${d.isOutdoor ? '1' : '0'}|${hasT}${hasH}`;
    })
    .join(';');
}

/**
 * Deterministic, stable sort for Tuya / Zigbee devices by natural Finnish name + ID.
 */
export function stableSortTuyaDevices<T extends TuyaDevice>(devices: T[]): T[] {
  return [...devices].sort((a, b) => {
    const nameDiff = (a.name || '').localeCompare(b.name || '', 'fi', {
      numeric: true,
      sensitivity: 'base',
    });
    if (nameDiff !== 0) return nameDiff;
    return a.id.localeCompare(b.id);
  });
}
