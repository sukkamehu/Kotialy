import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  HeishamonState,
  WsMessage,
  MqttStatus,
} from '../types/heishamon';
import type { ZigbeeRegistry } from '../types/zigbee';

const WS_URL = import.meta.env.VITE_WS_URL || `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;
const PING_INTERVAL = 30_000; // 30 seconds

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
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set on unmount so a socket we close ourselves does not schedule a reconnect
  const closedRef = useRef(false);

  const connect = useCallback(() => {
    if (closedRef.current) return;
    // CONNECTING counts as live too, otherwise a reconnect can open a second
    // socket while the first is still handshaking.
    const rs = wsRef.current?.readyState;
    if (rs === WebSocket.OPEN || rs === WebSocket.CONNECTING) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      // Start ping interval
      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, PING_INTERVAL);
    };

    ws.onclose = () => {
      setWsConnected(false);
      if (pingRef.current) clearInterval(pingRef.current);
      if (closedRef.current) return;
      // Reconnect after 3 seconds
      reconnectRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };

    ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data);
        handleMessage(msg);
      } catch {
        // ignore
      }
    };
  }, []);

  function handleMessage(msg: WsMessage) {
    switch (msg.type) {
      case 'snapshot':
        setState(msg.state);
        setMqtt(msg.mqtt);
        if (msg.state.LWT) {
          setHeishamonOnline(msg.state.LWT.value === 'Online');
        }
        setLastUpdate(msg.ts);
        // Hydrate Zigbee from snapshot
        if ((msg as any).zigbee) {
          const z = (msg as any).zigbee;
          if (z.devices) setZigbeeDevices(z.devices);
          if (typeof z.connected === 'boolean') setZigbeeConnected(z.connected);
        }
        break;

      case 'state_update':
        setState((prev) => ({
          ...prev,
          [msg.topic]: {
            value: msg.value,
            updated_at: msg.ts,
            label: msg.label,
            unit: msg.unit,
            category: msg.category,
            type: 'unknown',
            displayValue: msg.displayValue,
          },
        }));
        setLastUpdate(msg.ts);
        break;

      case 'mqtt_status':
        // Functional update — `handleMessage` is captured by the socket on the
        // first render, so reading `mqtt` directly here is always stale.
        setMqtt((prev) => ({
          ...prev,
          connected: msg.connected,
        }));
        break;

      case 'lwt':
        setHeishamonOnline(msg.online);
        break;

      default: {
        // Handle Zigbee message types (not in WsMessage union)
        const m = msg as any;
        if (m.type === 'zigbee_update') {
          setZigbeeState((prev) => {
            const next = { ...prev };
            for (const [prop, val] of Object.entries(m.properties as Record<string, string>)) {
              next[`${m.device}/${prop}`] = val;
            }
            return next;
          });
          // Also update device properties in registry
          setZigbeeDevices((prev) => {
            if (!prev[m.device]) return prev;
            return {
              ...prev,
              [m.device]: {
                ...prev[m.device],
                properties: {
                  ...prev[m.device].properties,
                  ...Object.fromEntries(
                    Object.entries(m.properties as Record<string, string>).map(([k, v]) => [
                      k, { value: v, updated_at: m.ts }
                    ])
                  ),
                },
              },
            };
          });
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
  }

  useEffect(() => {
    closedRef.current = false;
    connect();
    return () => {
      closedRef.current = true;
      if (wsRef.current) wsRef.current.close();
      if (pingRef.current) clearInterval(pingRef.current);
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, [connect]);

  return { state, mqtt, heishamonOnline, wsConnected, lastUpdate, zigbeeDevices, zigbeeConnected, zigbeeState };
}
