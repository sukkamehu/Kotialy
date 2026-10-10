import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../lib/api';

export interface SterilizationSettings {
  enabled: boolean;
  min_interval_days: number;
  max_interval_days: number;
  target_temp_c: number;
  hold_duration_minutes: number;
  last_completed_at: number;
  days_since_last: number;
}

export type SterilizationPhase = 'IDLE' | 'PREHEATING' | 'BOOSTING' | 'HOLDING' | 'COMPLETED' | 'CANCELLED' | 'TIMEOUT';

export interface SterilizationStatus {
  phase: SterilizationPhase;
  isActive: boolean;
  reason: string;
  startedAt: number | null;
  holdStartedAt: number | null;
  holdRemainingSeconds: number;
  totalElapsedMinutes: number;
  currentDhwTemp: number | null;
  targetTemp: number;
  isManual: boolean;
  settings: SterilizationSettings;
}

export function useSterilization() {
  const [status, setStatus] = useState<SterilizationStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionPending, setActionPending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await apiFetch('/api/dhw/sterilization/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err: any) {
      console.error('Failed to fetch sterilization status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    // Poll faster (every 5s) if active sequence is running, otherwise every 30s
    const pollInterval = status?.isActive ? 5_000 : 30_000;
    const interval = setInterval(fetchStatus, pollInterval);
    return () => clearInterval(interval);
  }, [fetchStatus, status?.isActive]);

  const startSterilization = async (reason = 'Käyttäjän manuaalinen käynnistys') => {
    setActionPending(true);
    setError(null);
    try {
      const res = await apiFetch('/api/dhw/sterilization/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status) setStatus(data.status);
        return true;
      } else {
        const errData = await res.json().catch(() => ({ error: 'Käynnistys epäonnistui' }));
        setError(errData.error || 'Steriloinnin käynnistys epäonnistui');
        return false;
      }
    } catch (err: any) {
      setError(err.message || 'Verkkovirhe');
      return false;
    } finally {
      setActionPending(false);
    }
  };

  const cancelSterilization = async (reason = 'Käyttäjä keskeytti steriloinnin') => {
    setActionPending(true);
    setError(null);
    try {
      const res = await apiFetch('/api/dhw/sterilization/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status) setStatus(data.status);
        return true;
      } else {
        const errData = await res.json().catch(() => ({ error: 'Keskeytys epäonnistui' }));
        setError(errData.error || 'Steriloinnin keskeytys epäonnistui');
        return false;
      }
    } catch (err: any) {
      setError(err.message || 'Verkkovirhe');
      return false;
    } finally {
      setActionPending(false);
    }
  };

  const updateSettings = async (newSettings: Partial<{
    enabled: boolean;
    min_days: number;
    max_days: number;
    target_temp: number;
    hold_minutes: number;
  }>) => {
    setActionPending(true);
    setError(null);
    try {
      const res = await apiFetch('/api/dhw/sterilization/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
      });
      if (res.ok) {
        fetchStatus();
        return true;
      } else {
        const errData = await res.json().catch(() => ({ error: 'Asetusten tallennus epäonnistui' }));
        setError(errData.error);
        return false;
      }
    } catch (err: any) {
      setError(err.message || 'Verkkovirhe');
      return false;
    } finally {
      setActionPending(false);
    }
  };

  return {
    status,
    loading,
    actionPending,
    error,
    refresh: fetchStatus,
    startSterilization,
    cancelSterilization,
    updateSettings,
  };
}
