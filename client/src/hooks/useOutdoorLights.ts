import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import type { OutdoorLightsStatus } from '../types/outdoorLights';

export function useOutdoorLights() {
  const [status, setStatus] = useState<OutdoorLightsStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await apiFetch('/api/outdoor-lights');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.error('[useOutdoorLights] Failed to load status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const setOverride = async (state: 'ON' | 'OFF' | 'AUTO', durationMinutes = 120) => {
    setSaving(true);
    try {
      const res = await apiFetch('/api/outdoor-lights/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state, durationMinutes }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status) setStatus(data.status);
        return true;
      }
    } catch (err) {
      console.error('[useOutdoorLights] Failed to set override:', err);
    } finally {
      setSaving(false);
    }
    return false;
  };

  const updateSettings = async (updates: Partial<OutdoorLightsStatus['settings']>) => {
    setSaving(true);
    try {
      const res = await apiFetch('/api/outdoor-lights/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status) setStatus(data.status);
        return true;
      }
    } catch (err) {
      console.error('[useOutdoorLights] Failed to update settings:', err);
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
    setOverride,
    updateSettings,
  };
}
