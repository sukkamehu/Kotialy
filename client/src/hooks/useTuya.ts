import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import type { TuyaDevice, SaunaState, TuyaStatusResponse } from '../types/tuya';

export function useTuya() {
  const [devices, setDevices] = useState<TuyaDevice[]>([]);
  const [sauna, setSauna] = useState<SaunaState | null>(null);
  const [configured, setConfigured] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await apiFetch('/api/tuya/devices');
      if (res.ok) {
        const data: TuyaStatusResponse = await res.json();
        setDevices(data.devices || []);
        setSauna(data.sauna || null);
        setConfigured(data.configured ?? true);
        setError(null);
      }
    } catch (err: any) {
      setError(err.message || 'Virhe SmartLife-laitteiden haussa');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();

    // Periodic background refresh every 15s
    const interval = setInterval(fetchStatus, 15000);

    // WebSocket event listener
    const handleWsMessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'snapshot' && msg.tuya) {
          if (msg.tuya.devices) setDevices(msg.tuya.devices);
          if (msg.tuya.sauna) setSauna(msg.tuya.sauna);
        } else if (msg.type === 'tuya_devices') {
          if (msg.devices) setDevices(msg.devices);
          if (msg.sauna) setSauna(msg.sauna);
        } else if (msg.type === 'sauna_status') {
          if (msg.sauna) setSauna(msg.sauna);
        }
      } catch {
        // ignore
      }
    };

    // Attach to global WebSocket if exists or listen
    window.addEventListener('message', handleWsMessage);

    return () => {
      clearInterval(interval);
      window.removeEventListener('message', handleWsMessage);
    };
  }, [fetchStatus]);

  const setSaunaPower = async (state: boolean, durationMinutes = 180) => {
    setActionLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/tuya/sauna', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state, duration_minutes: durationMinutes }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Saunan kytkentä epäonnistui');
      }

      const data = await res.json();
      if (data.sauna) setSauna(data.sauna);
      return data.sauna;
    } catch (err: any) {
      setError(err.message || 'Saunan kytkentävirhe');
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  const refreshDevices = async () => {
    setRefreshing(true);
    try {
      const res = await apiFetch('/api/tuya/refresh', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.devices) setDevices(data.devices);
        if (data.sauna) setSauna(data.sauna);
      }
    } catch (err: any) {
      setError(err.message || 'Päivitys epäonnistui');
    } finally {
      setRefreshing(false);
    }
  };

  return {
    devices,
    sauna,
    configured,
    loading,
    refreshing,
    actionLoading,
    error,
    setSaunaPower,
    refreshDevices,
    refetch: fetchStatus,
  };
}
