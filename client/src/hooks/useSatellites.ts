import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import type { SatellitePass, SatelliteStatus, SatellitePassesResponse } from '../types/satellites';

export function useSatellites() {
  const [status, setStatus] = useState<SatelliteStatus | null>(null);
  const [passes, setPasses] = useState<SatellitePass[]>([]);
  const [currentOverhead, setCurrentOverhead] = useState<SatellitePass | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPasses = useCallback(async () => {
    try {
      const [statusRes, passesRes] = await Promise.all([
        apiFetch('/api/satellites/status'),
        apiFetch('/api/satellites/passes?hours=48'),
      ]);

      if (statusRes.ok && passesRes.ok) {
        const statusData: SatelliteStatus = await statusRes.json();
        const passesData: SatellitePassesResponse = await passesRes.json();
        setStatus(statusData);
        setPasses(passesData.passes || []);
        setCurrentOverhead(passesData.currentOverhead || null);
        setError(null);
      } else {
        setError('Satelliittidatan haku epäonnistui');
      }
    } catch (err: any) {
      setError(err.message || 'Yhteysvirhe satelliittipalveluun');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPasses();
    const interval = setInterval(fetchPasses, 60000); // 1 min update
    return () => clearInterval(interval);
  }, [fetchPasses]);

  const refreshTles = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await apiFetch('/api/satellites/refresh-tles', { method: 'POST' });
      if (res.ok) {
        await fetchPasses();
      }
    } catch (err: any) {
      setError(err.message || 'Rataparametrien päivitys epäonnistui');
    } finally {
      setRefreshing(false);
    }
  }, [fetchPasses]);

  return {
    status,
    passes,
    currentOverhead,
    loading,
    refreshing,
    error,
    refreshPasses: fetchPasses,
    refreshTles,
  };
}
