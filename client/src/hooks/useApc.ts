import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import type { ApcStatus, ApcSettings, ApcLogEntry, ApcMode, ApcDirective } from '../types/apc';

export function useApc() {
  const [status, setStatus] = useState<ApcStatus | null>(null);
  const [logs, setLogs] = useState<ApcLogEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await apiFetch('/api/apc/status');
      if (res.ok) {
        const data: ApcStatus = await res.json();
        setStatus(data);
      }
    } catch (err: any) {
      console.error('Failed to fetch APC status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await apiFetch('/api/apc/logs?limit=30');
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (err: any) {
      console.error('Failed to fetch APC logs:', err);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchLogs();
    const interval = setInterval(() => {
      fetchStatus();
      fetchLogs();
    }, 30_000);
    return () => clearInterval(interval);
  }, [fetchStatus, fetchLogs]);

  const updateSettings = async (newSettings: Partial<ApcSettings>) => {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch('/api/apc/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data.status);
        fetchLogs();
        return true;
      } else {
        const errData = await res.json().catch(() => ({ error: 'Päivitys epäonnistui' }));
        setError(errData.error || 'Asetusten tallennus epäonnistui');
        return false;
      }
    } catch (err: any) {
      setError(err.message || 'Verkkovirhe');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async () => {
    if (!status) return;
    return updateSettings({ enabled: !status.enabled });
  };

  const setMode = async (mode: ApcMode) => {
    return updateSettings({ mode });
  };

  const setOverride = async (durationHours: number, directive: ApcDirective = 'NORMAL') => {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch('/api/apc/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration_hours: durationHours, directive }),
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data.status);
        fetchLogs();
        return true;
      } else {
        const errData = await res.json().catch(() => ({ error: 'Ohituksen asetus epäonnistui' }));
        setError(errData.error);
        return false;
      }
    } catch (err: any) {
      setError(err.message || 'Verkkovirhe');
      return false;
    } finally {
      setSaving(false);
    }
  };

  return {
    status,
    logs,
    loading,
    saving,
    error,
    refresh: fetchStatus,
    updateSettings,
    toggleEnabled,
    setMode,
    setOverride,
  };
}
