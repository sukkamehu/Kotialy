import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';

export interface CompressorAnalytics {
  current: {
    operationsCounter: number | null;
    operationsHours: number | null;
    compressorFreq: number | null;
    heatpumpState: string;
  };
  today: {
    cycles: number;
    hours: number;
    avgCycleHours: number | null;
    elapsedHours: number;
    forecastCycles: number;
    forecastHours: number;
  };
  dailyAverage: {
    avgCyclesPerDay: number | null;
    avgHoursPerDay: number | null;
    avgCycleDuration: number | null;
    daysAnalyzed: number;
  };
  lifetime: {
    totalHours: number | null;
    totalCycles: number | null;
    avgCycleHours: number | null;
  };
  history: Array<{
    date: string;
    cycles: number;
    hours: number;
    avgCycleHours: number | null;
  }>;
}

export function useCompressorAnalytics() {
  const [data, setData] = useState<CompressorAnalytics | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await apiFetch('/api/analytics/compressor?days=7');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
    const id = setInterval(fetchAnalytics, 60_000);
    return () => clearInterval(id);
  }, [fetchAnalytics]);

  return { analytics: data, loading, refresh: fetchAnalytics };
}
