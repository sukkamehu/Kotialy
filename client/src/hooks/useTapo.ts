import { useState, useEffect, useCallback } from 'react';
import type { TapoDevice } from '../types/tapo';
import { apiFetch } from '../lib/api';

export function useTapo() {
  const [devices, setDevices] = useState<TapoDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDevices = useCallback(async () => {
    try {
      const res = await apiFetch('/api/tapo/devices');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.devices) {
        setDevices(data.devices);
      }
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
    const interval = setInterval(fetchDevices, 10000);
    return () => clearInterval(interval);
  }, [fetchDevices]);

  // Handle WebSocket updates
  const handleWsMessage = useCallback((msg: any) => {
    if (msg.type === 'snapshot' && msg.tapo) {
      setDevices(msg.tapo);
    } else if (msg.type === 'tapo_update') {
      setDevices((prev) =>
        prev.map((dev) => {
          if (dev.id === msg.deviceId) {
            return {
              ...dev,
              state: msg.state ?? dev.state,
              power_w: msg.powerW != null ? msg.powerW : dev.power_w,
              today_energy_kwh: msg.todayKwh != null ? msg.todayKwh : dev.today_energy_kwh,
              last_action_reason: msg.reason ?? dev.last_action_reason,
              last_seen: msg.ts ?? Date.now(),
            };
          }
          return dev;
        })
      );
    }
  }, []);

  const togglePower = useCallback(
    async (id: string, state?: 'ON' | 'OFF') => {
      try {
        const res = await apiFetch(`/api/tapo/${id}/toggle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state }),
        });
        if (!res.ok) throw new Error('Kytkentä epäonnistui');
        await fetchDevices();
      } catch (err: any) {
        console.error('togglePower failed:', err);
        throw err;
      }
    },
    [fetchDevices]
  );

  const setOverride = useCallback(
    async (id: string, state: 'ON' | 'OFF' | null, durationHours: number = 2) => {
      try {
        const res = await apiFetch(`/api/tapo/${id}/override`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state, duration_hours: durationHours }),
        });
        if (!res.ok) throw new Error('Ohituksen asetus epäonnistui');
        await fetchDevices();
      } catch (err: any) {
        console.error('setOverride failed:', err);
        throw err;
      }
    },
    [fetchDevices]
  );

  const updateSettings = useCallback(
    async (id: string, newSettings: Partial<TapoDevice>) => {
      try {
        const res = await apiFetch(`/api/tapo/${id}/settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newSettings),
        });
        if (!res.ok) throw new Error('Asetusten tallennus epäonnistui');
        await fetchDevices();
      } catch (err: any) {
        console.error('updateSettings failed:', err);
        throw err;
      }
    },
    [fetchDevices]
  );

  const pollNow = useCallback(async () => {
    try {
      await apiFetch('/api/tapo/poll', { method: 'POST' });
      await fetchDevices();
    } catch (err) {
      console.error('pollNow error:', err);
    }
  }, [fetchDevices]);

  const totalPowerW = devices.reduce((sum, d) => sum + (d.power_w || 0), 0);
  const totalTodayEnergyKwh = devices.reduce((sum, d) => sum + (d.today_energy_kwh || 0), 0);

  return {
    devices,
    loading,
    error,
    togglePower,
    setOverride,
    updateSettings,
    pollNow,
    handleWsMessage,
    totalPowerW: Math.round(totalPowerW * 10) / 10,
    totalTodayEnergyKwh: Math.round(totalTodayEnergyKwh * 100) / 100,
  };
}
