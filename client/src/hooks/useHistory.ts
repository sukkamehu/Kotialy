import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';

interface HistoryPoint {
  topic: string;
  value: number;
  recorded_at: number;
}

interface UseHistoryReturn {
  data: HistoryPoint[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useHistory(topic: string, hours = 24): UseHistoryReturn {
  const [data, setData] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!topic) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    apiFetch(`/api/history?topic=${encodeURIComponent(topic)}&hours=${hours}`)
      .then((r) => {
        if (!r.ok) throw new Error(`History request failed (${r.status})`);
        return r.json();
      })
      .then((res) => {
        if (!cancelled) setData(res.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load history');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [topic, hours, tick]);

  function refetch() { setTick((t) => t + 1); }

  return { data, loading, error, refetch };
}
