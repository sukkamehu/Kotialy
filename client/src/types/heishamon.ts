// Heishamon topic types and state types for the frontend

export interface SensorData {
  value: string;
  updated_at: number;
  label: string;
  unit: string;
  category: string;
  type: string;
  displayValue: string;
}

export type HeishamonState = Record<string, SensorData>;

export interface SnapshotMessage {
  type: 'snapshot';
  state: HeishamonState;
  mqtt: MqttStatus;
  ts: number;
}

export interface StateUpdateMessage {
  type: 'state_update';
  topic: string;
  value: string;
  label: string;
  unit: string;
  category: string;
  displayValue: string;
  ts: number;
}

export interface MqttStatusMessage {
  type: 'mqtt_status';
  connected: boolean;
  broker?: string;
  error?: string;
  reconnecting?: boolean;
  ts: number;
}

export interface LwtMessage {
  type: 'lwt';
  online: boolean;
  ts: number;
}

export interface PongMessage {
  type: 'pong';
  ts: number;
}

export type WsMessage =
  | SnapshotMessage
  | StateUpdateMessage
  | MqttStatusMessage
  | LwtMessage
  | PongMessage;

export interface MqttStatus {
  connected: boolean;
  lastReceivedAt: number | null;
}

// Helper to get a numeric value from state
export function numVal(state: HeishamonState, topic: string): number | null {
  const v = state[topic]?.value;
  if (v === undefined || v === null) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

// Helper to get a display value from state
export function dispVal(
  state: HeishamonState,
  topic: string,
  fallback = '—'
): string {
  return state[topic]?.displayValue ?? fallback;
}

// Helper to format a number with unit
export function fmt(
  state: HeishamonState,
  topic: string,
  decimals = 1,
  fallback = '—'
): string {
  const n = numVal(state, topic);
  if (n === null) return fallback;
  return `${n.toFixed(decimals)}`;
}

export const OPERATING_MODES: Record<number, string> = {
  0: 'Heat Only',
  1: 'Cool Only',
  2: 'Auto (Heat)',
  3: 'DHW Only',
  4: 'Heat + DHW',
  5: 'Cool + DHW',
  6: 'Auto Heat + DHW',
  7: 'Auto (Cool)',
  8: 'Auto Cool + DHW',
};
