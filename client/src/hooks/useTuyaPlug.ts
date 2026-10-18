import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';

export interface TuyaPlugTelemetry {
  power_w: number;
  voltage_v: number;
  current_a: number;
  today_energy_kwh: number;
}

export interface TuyaPlugStatus {
  driver: string;
  name: string;
  type: string;
  deviceId: string;
  connected: boolean;
  currentState: 'ON' | 'OFF';
  isOn: boolean;
  mode: 'auto' | 'constant_on' | 'constant_off';
  maxPriceLimit: number;
  overrideActive: boolean;
  overrideUntil: number;
  overrideState: 'ON' | 'OFF' | null;
  overrideMinutesRemaining: number;
  hasPowerMetering?: boolean;
  reason: string;
  lastAppliedAt: number;
  telemetry: TuyaPlugTelemetry;
}

export function useTuyaPlug() {
  const [status, setStatus] = useState<TuyaPlugStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await apiFetch('/api/apc/tuya-plug/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.warn('[useTuyaPlug] Failed to load status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const togglePower = async (nextPower: boolean) => {
    if (!status?.deviceId) return false;
    setSaving(true);
    try {
      const res = await apiFetch('/api/tuya/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: status.deviceId, power: nextPower }),
      });
      if (res.ok) {
        await fetchStatus();
        return true;
      }
    } catch (err) {
      console.error('[useTuyaPlug] Failed to toggle power:', err);
    } finally {
      setSaving(false);
    }
    return false;
  };

  const setOverride = async (state: 'ON' | 'OFF' | null, hours: number) => {
    setSaving(true);
    try {
      const res = await apiFetch('/api/apc/tuya-plug/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state, hours }),
      });
      if (res.ok) {
        await fetchStatus();
        return true;
      }
    } catch (err) {
      console.error('[useTuyaPlug] Failed to set override:', err);
    } finally {
      setSaving(false);
    }
    return false;
  };

  const updateSettings = async (settings: { mode?: string; maxPriceLimit?: number; name?: string }) => {
    setSaving(true);
    try {
      const res = await apiFetch('/api/apc/tuya-plug/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        await fetchStatus();
        return true;
      }
    } catch (err) {
      console.error('[useTuyaPlug] Failed to update settings:', err);
    } finally {
      setSaving(false);
    }
    return false;
  };

  return {
    status,
    loading,
    saving,
    refresh: fetchStatus,
    togglePower,
    setOverride,
    updateSettings,
  };
}
