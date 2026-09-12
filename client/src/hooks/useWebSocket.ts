import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  HeishamonState,
  WsMessage,
  MqttStatus,
  SensorData,
} from '../types/heishamon';
import type { ZigbeeRegistry } from '../types/zigbee';

import { getStoredToken } from './useAuth';

function getWsUrl(): string {
  const base = import.meta.env.VITE_WS_URL || `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;
  const token = getStoredToken();
  if (token) {
    const separator = base.includes('?') ? '&' : '?';
    return `${base}${separator}token=${encodeURIComponent(token)}`;
  }
  return base;
}

const PING_INTERVAL = 20_000; // 20 seconds
const HEARTBEAT_TIMEOUT = 8_000; // 8 seconds watchdog for pong/activity

interface UseWebSocketReturn {
  state: HeishamonState;
  mqtt: MqttStatus;
  heishamonOnline: boolean | null;
  wsConnected: boolean;
  lastUpdate: number | null;
  zigbeeDevices: ZigbeeRegistry;
  zigbeeConnected: boolean;
  zigbeeState: Record<string, string>; // device -> prop -> value (flat from updates)
}

export function useWebSocket(): UseWebSocketReturn {
  const [state, setState] = useState<HeishamonState>({});
  const [mqtt, setMqtt] = useState<MqttStatus>({
    connected: false,
    lastReceivedAt: null,
  });
  const [heishamonOnline, setHeishamonOnline] = useState<boolean | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [zigbeeDevices, setZigbeeDevices] = useState<ZigbeeRegistry>({});
  const [zigbeeConnected, setZigbeeConnected] = useState(false);
  // Flat live values from zigbee_update messages: `device/prop` -> value
  const [zigbeeState, setZigbeeState] = useState<Record<string, string>>({});

  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchdogTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedRef = useRef(false);
  const lastActivityRef = useRef<number>(Date.now());
  const retryCountRef = useRef(0);

  // Batch buffer for rapid bursts of MQTT / Zigbee updates
  const pendingStateUpdatesRef = useRef<Record<string, SensorData>>({});
  const pendingZigbeePropsRef = useRef<Record<string, string>>({});
  const pendingZigbeeDeviceUpdatesRef = useRef<Record<string, { props: Record<string, string>; ts: number }>>({});
  const latestTsRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);

  const flushBatch = useCallback(() => {
    rafIdRef.current = null;

    const hasStateUpdates = Object.keys(pendingStateUpdatesRef.current).length > 0;
    if (hasStateUpdates) {
      const updates = { ...pendingStateUpdatesRef.current };
      pendingStateUpdatesRef.current = {};
      setState((prev) => ({ ...prev, ...updates }));
      if (latestTsRef.current !== null) {
        setLastUpdate(latestTsRef.current);
      }
    }

    const hasZigbeeProps = Object.keys(pendingZigbeePropsRef.current).length > 0;
    if (hasZigbeeProps) {
      const zUpdates = { ...pendingZigbeePropsRef.current };
      pendingZigbeePropsRef.current = {};
      setZigbeeState((prev) => ({ ...prev, ...zUpdates }));
    }

    const hasZigbeeDevUpdates = Object.keys(pendingZigbeeDeviceUpdatesRef.current).length > 0;
    if (hasZigbeeDevUpdates) {
      const devUpdates = { ...pendingZigbeeDeviceUpdatesRef.current };
      pendingZigbeeDeviceUpdatesRef.current = {};

      setZigbeeDevices((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const [device, data] of Object.entries(devUpdates)) {
          if (next[device]) {
            changed = true;
            next[device] = {
              ...next[device],
              properties: {
                ...next[device].properties,
                ...Object.fromEntries(
                  Object.entries(data.props).map(([k, v]) => [
                    k, { value: v, updated_at: data.ts }
                  ])
                ),
              },
            };
          }
        }
        return changed ? next : prev;
      });
    }
  }, []);

  const scheduleFlush = useCallback(() => {
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(flushBatch);
    }
  }, [flushBatch]);

  const clearTimers = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (watchdogTimeoutRef.current) {
      clearTimeout(watchdogTimeoutRef.current);
      watchdogTimeoutRef.current = null;
    }
    if (reconnectRef.current) {
      clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (closedRef.current) return;

    const currentRs = wsRef.current?.readyState;
    if (currentRs === WebSocket.OPEN || currentRs === WebSocket.CONNECTING) {
      return;
    }

    clearTimers();

    try {
      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        if (wsRef.current !== ws) return;
        setWsConnected(true);
        lastActivityRef.current = Date.now();
        retryCountRef.current = 0;

        // Start heartbeat ping interval
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({ type: 'ping' }));
            } catch {
              // Ignore send error, watchdog handles it
            }

            // Set watchdog timer expecting pong or any message
            if (watchdogTimeoutRef.current) clearTimeout(watchdogTimeoutRef.current);
            watchdogTimeoutRef.current = setTimeout(() => {
              const idleTime = Date.now() - lastActivityRef.current;
              if (idleTime > PING_INTERVAL + HEARTBEAT_TIMEOUT) {
                // Socket is dead/zombie — force terminate to trigger reconnect
                try { ws.close(); } catch { /* ignore */ }
              }
            }, HEARTBEAT_TIMEOUT);
          }
        }, PING_INTERVAL);
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          wsRef.current = null;
          setWsConnected(false);
        }
        clearTimers();
        if (closedRef.current) return;

        // Exponential backoff capped at 8s
        const backoff = Math.min(1000 * Math.pow(1.5, retryCountRef.current), 8000);
        retryCountRef.current += 1;
        reconnectRef.current = setTimeout(connect, backoff);
      };

      ws.onerror = () => {
        try { ws.close(); } catch { /* ignore */ }
      };

      ws.onmessage = (event) => {
        lastActivityRef.current = Date.now();
        if (watchdogTimeoutRef.current) {
          clearTimeout(watchdogTimeoutRef.current);
          watchdogTimeoutRef.current = null;
        }

        try {
          const msg: WsMessage = JSON.parse(event.data);
          handleMessage(msg);
        } catch {
          // ignore parsing error
        }
      };
    } catch {
      // Reconnect attempt on constructor failure
      reconnectRef.current = setTimeout(connect, 3000);
    }
  }, [clearTimers]);

  const handleMessage = useCallback((msg: WsMessage) => {
    switch (msg.type) {
      case 'snapshot':
        // Cancel pending batch and apply full snapshot directly
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        pendingStateUpdatesRef.current = {};
        pendingZigbeePropsRef.current = {};
        pendingZigbeeDeviceUpdatesRef.current = {};

        setState(msg.state);
        setMqtt(msg.mqtt);
        if (msg.state.LWT) {
          setHeishamonOnline(msg.state.LWT.value === 'Online');
        }
        setLastUpdate(msg.ts);
        if ((msg as any).zigbee) {
          const z = (msg as any).zigbee;
          if (z.devices) setZigbeeDevices(z.devices);
          if (typeof z.connected === 'boolean') setZigbeeConnected(z.connected);
        }
        break;

      case 'state_update':
        pendingStateUpdatesRef.current[msg.topic] = {
          value: msg.value,
          updated_at: msg.ts,
          label: msg.label,
          unit: msg.unit,
          category: msg.category,
          type: 'unknown',
          displayValue: msg.displayValue,
        };
        latestTsRef.current = msg.ts;
        scheduleFlush();
        break;

      case 'mqtt_status':
        setMqtt((prev) => ({
          ...prev,
          connected: msg.connected,
        }));
        break;

      case 'lwt':
        setHeishamonOnline(msg.online);
        break;

      default: {
        const m = msg as any;
        if (m.type === 'auth_required') {
          const token = getStoredToken();
          if (token && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'auth', token }));
          }
        } else if (m.type === 'zigbee_update') {
          for (const [prop, val] of Object.entries(m.properties as Record<string, string>)) {
            pendingZigbeePropsRef.current[`${m.device}/${prop}`] = val;
          }
          pendingZigbeeDeviceUpdatesRef.current[m.device] = {
            props: m.properties,
            ts: m.ts,
          };
          scheduleFlush();
        } else if (m.type === 'zigbee_devices') {
          setZigbeeDevices(m.devices);
        } else if (m.type === 'zigbee_status') {
          setZigbeeConnected(m.connected);
        } else if (m.type === 'zigbee_availability') {
          setZigbeeDevices((prev) => {
            if (!prev[m.device]) return prev;
            return { ...prev, [m.device]: { ...prev[m.device], online: m.online } };
          });
        }
        break;
      }
    }
  }, [scheduleFlush]);

  // Handle visibilitychange / sleep wake / online events
  useEffect(() => {
    const handleWakeOrOnline = () => {
      if (document.visibilityState === 'visible') {
        const idleTime = Date.now() - lastActivityRef.current;
        const rs = wsRef.current?.readyState;

        // If disconnected or if idle longer than a heartbeat cycle (tab slept), force reconnect
        if (!wsRef.current || rs !== WebSocket.OPEN || idleTime > PING_INTERVAL + HEARTBEAT_TIMEOUT) {
          if (wsRef.current) {
            try { wsRef.current.close(); } catch { /* ignore */ }
            wsRef.current = null;
          }
          retryCountRef.current = 0;
          connect();
        } else if (rs === WebSocket.OPEN) {
          // Socket still open — send immediate ping to verify link and refresh activity
          try {
            wsRef.current.send(JSON.stringify({ type: 'ping' }));
          } catch {
            try { wsRef.current.close(); } catch { /* ignore */ }
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleWakeOrOnline);
    window.addEventListener('pageshow', handleWakeOrOnline);
    window.addEventListener('online', handleWakeOrOnline);

    return () => {
      document.removeEventListener('visibilitychange', handleWakeOrOnline);
      window.removeEventListener('pageshow', handleWakeOrOnline);
      window.removeEventListener('online', handleWakeOrOnline);
    };
  }, [connect]);

  useEffect(() => {
    closedRef.current = false;
    connect();
    return () => {
      closedRef.current = true;
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
      if (wsRef.current) {
        try { wsRef.current.close(); } catch { /* ignore */ }
        wsRef.current = null;
      }
      clearTimers();
    };
  }, [connect, clearTimers]);

  return { state, mqtt, heishamonOnline, wsConnected, lastUpdate, zigbeeDevices, zigbeeConnected, zigbeeState };
}

