import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import type { Rtl433Device } from '../types/rtl433';

export interface OutdoorConsensusData {
  heatpump: {
    temperature: number | null;
    pipeTemperature: number | null;
    isDefrosting: boolean;
    isBaseHeater: boolean;
    updatedAt: number | null;
  };
  outdoorSensors: Rtl433Device[];
  freshCount?: number;
  staleCount?: number;
  candidateSensors: Rtl433Device[];
  consensus: {
    temperature: number | null;
    median?: number | null;
    average?: number | null;
    trimmedAverage?: number | null;
    humidity: number | null;
    medianHumidity?: number | null;
    averageHumidity?: number | null;
    sensorCount: number;
    totalTaggedCount?: number;
    deltaToHeatpump: number | null;
    minTemp: number | null;
    maxTemp: number | null;
  };
  ts: number;
}

let cachedConsensus: OutdoorConsensusData | null = null;
let lastConsensusFetch = 0;
let inflightConsensusPromise: Promise<OutdoorConsensusData | null> | null = null;

async function doFetchConsensus(): Promise<OutdoorConsensusData | null> {
  const now = Date.now();
  if (cachedConsensus && now - lastConsensusFetch < 10000) {
    return cachedConsensus;
  }
  if (inflightConsensusPromise) {
    return inflightConsensusPromise;
  }
  inflightConsensusPromise = (async () => {
    try {
      const res = await apiFetch('/api/outdoor/consensus');
      if (res.ok) {
        const json: OutdoorConsensusData = await res.json();
        cachedConsensus = json;
        lastConsensusFetch = Date.now();
        return json;
      }
    } finally {
      inflightConsensusPromise = null;
    }
    return cachedConsensus;
  })();
  return inflightConsensusPromise;
}

export function useOutdoorConsensus() {
  const [data, setData] = useState<OutdoorConsensusData | null>(cachedConsensus);
  const [loading, setLoading] = useState<boolean>(cachedConsensus === null);
  const [error, setError] = useState<string | null>(null);

  const fetchConsensus = useCallback(async () => {
    try {
      const json = await doFetchConsensus();
      if (json) {
        setData(json);
        setError(null);
      }
    } catch (err: any) {
      setError(err.message || 'Ulkolämpötilakonsensuksen haku epäonnistui');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConsensus();
    const interval = setInterval(fetchConsensus, 15000); // 15s refresh
    return () => clearInterval(interval);
  }, [fetchConsensus]);

  const setOutdoorFlag = useCallback(
    async (deviceId: string, isOutdoor: boolean) => {
      try {
        const res = await apiFetch(`/api/rtl433/devices/${encodeURIComponent(deviceId)}/alias`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_outdoor: isOutdoor }),
        });
        if (res.ok) {
          lastConsensusFetch = 0; // Invalidate cache
          await fetchConsensus();
          return true;
        }
      } catch (err: any) {
        console.error('Virhe ulkotilan määrityksessä:', err);
      }
      return false;
    },
    [fetchConsensus]
  );

  return {
    data,
    loading,
    error,
    refresh: fetchConsensus,
    setOutdoorFlag,
  };
}

