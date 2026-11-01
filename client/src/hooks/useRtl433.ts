import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import type { Rtl433Device, Rtl433Status, Rtl433DevicesResponse } from '../types/rtl433';

export function useRtl433() {
  const [devices, setDevices] = useState<Rtl433Device[]>([]);
  const [status, setStatus] = useState<Rtl433Status>({
    connected: false,
    packetCount: 0,
    deviceCount: 0,
    lastReceivedAt: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDevices = useCallback(async () => {
    try {
      const res = await apiFetch('/api/rtl433/devices');
      if (res.ok) {
        const data: Rtl433DevicesResponse = await res.json();
        setDevices(data.devices || []);
        if (data.status) setStatus(data.status);
        setError(null);
      }
    } catch (err: any) {
      setError(err.message || 'Virhe 433 MHz -laitteiden haussa');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices();

    // Polling interval every 10s as fallback
    const interval = setInterval(fetchDevices, 10000);

    const handleWsMessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'snapshot' && msg.rtl433) {
          if (Array.isArray(msg.rtl433.devices)) setDevices(msg.rtl433.devices);
          setStatus((prev) => ({
            ...prev,
            connected: Boolean(msg.rtl433.connected),
            lastReceivedAt: msg.rtl433.lastReceivedAt ?? prev.lastReceivedAt,
          }));
        } else if (msg.type === 'rtl433_devices') {
          if (Array.isArray(msg.devices)) setDevices(msg.devices);
        } else if (msg.type === 'rtl433_status') {
          setStatus((prev) => ({ ...prev, connected: msg.connected }));
        } else if (msg.type === 'rtl433_update') {
          setDevices((prev) =>
            prev.map((d) => {
              if (d.id === msg.deviceId) {
                return {
                  ...d,
                  lastSeen: msg.lastSeen,
                  online: true,
                  properties: { ...d.properties, ...msg.properties },
                };
              }
              return d;
            })
          );
          setStatus((prev) => ({
            ...prev,
            packetCount: prev.packetCount + 1,
            lastReceivedAt: msg.lastSeen || Date.now(),
          }));
        }
      } catch {
        // ignore
      }
    };

    window.addEventListener('message', handleWsMessage);

    return () => {
      clearInterval(interval);
      window.removeEventListener('message', handleWsMessage);
    };
  }, [fetchDevices]);

  const updateAlias = useCallback(
    async (
      id: string,
      updates: {
        custom_name?: string | null;
        category?: string;
        location?: string | null;
        is_outdoor?: boolean;
        is_ignored?: boolean;
      }
    ) => {
      try {
        const res = await apiFetch(`/api/rtl433/devices/${encodeURIComponent(id)}/alias`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.device) {
            setDevices((prev) =>
              prev.map((d) => (d.id === id ? { ...d, ...data.device } : d))
            );
          }
          return { ok: true, device: data.device };
        }
        return { ok: false, error: 'Päivitys epäonnistui' };
      } catch (err: any) {
        return { ok: false, error: err.message };
      }
    },
    []
  );

  const deleteDevice = useCallback(async (id: string) => {
    try {
      const res = await apiFetch(`/api/rtl433/devices/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setDevices((prev) =>
          prev.map((d) => (d.id === id ? { ...d, isIgnored: true } : d))
        );
        return { ok: true };
      }
      return { ok: false };
    } catch {
      return { ok: false };
    }
  }, []);

  const restoreDevice = useCallback(async (id: string) => {
    try {
      const res = await apiFetch(`/api/rtl433/devices/${encodeURIComponent(id)}/restore`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        setDevices((prev) =>
          prev.map((d) => (d.id === id ? { ...d, isIgnored: false, ...data.device } : d))
        );
        return { ok: true };
      }
      return { ok: false };
    } catch {
      return { ok: false };
    }
  }, []);

  const permanentDeleteDevice = useCallback(async (id: string) => {
    try {
      const res = await apiFetch(`/api/rtl433/devices/${encodeURIComponent(id)}/permanent`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setDevices((prev) => prev.filter((d) => d.id !== id));
        return { ok: true };
      }
      return { ok: false };
    } catch {
      return { ok: false };
    }
  }, []);

  return {
    devices,
    status,
    loading,
    error,
    refresh: fetchDevices,
    updateAlias,
    deleteDevice,
    restoreDevice,
    permanentDeleteDevice,
  };
}

