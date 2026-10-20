import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import type { MitsubishiStatus, MitsubishiOperatingMode } from '../types/mitsubishi';

export function useMitsubishi() {
  const [status, setStatus] = useState<MitsubishiStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await apiFetch('/api/mitsu/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.warn('[useMitsubishi] Failed to load status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 8000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const setControl = async (params: {
    unitId: string;
    mode?: string;
    target_temperature?: number;
    fan_mode?: string;
    swing_mode?: string;
    duration_hours?: number;
    clearOverride?: boolean;
  }) => {
    setSaving(true);
    try {
      const res = await apiFetch('/api/mitsu/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (res.ok) {
        await fetchStatus();
        return true;
      }
    } catch (err) {
      console.error('[useMitsubishi] Failed to send control:', err);
    } finally {
      setSaving(false);
    }
    return false;
  };

  const updateSettings = async (settings: {
    mitsu_mode?: MitsubishiOperatingMode;
    mitsu_frost_assist_temp?: number;
    mitsu_max_price_cents?: number;
    mitsu_heat_target_c?: number;
    mitsu_cool_target_c?: number;
  }) => {
    setSaving(true);
    try {
      const res = await apiFetch('/api/mitsu/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        await fetchStatus();
        return true;
      }
    } catch (err) {
      console.error('[useMitsubishi] Failed to update settings:', err);
    } finally {
      setSaving(false);
    }
    return false;
  };

  const setOverride = async (mode: string | null, duration_hours: number = 0, target_temperature?: number) => {
    setSaving(true);
    try {
      const res = await apiFetch('/api/mitsu/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, duration_hours, target_temperature }),
      });
      if (res.ok) {
        await fetchStatus();
        return true;
      }
    } catch (err) {
      console.error('[useMitsubishi] Failed to set override:', err);
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
    setControl,
    updateSettings,
    setOverride,
  };
}
