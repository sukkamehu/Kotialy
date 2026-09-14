import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';

interface ElectricityPriceInfo {
  priceEurMWh: number | null;
  priceCentsKWh: number | null;
  avgPriceCentsKWh: number | null;
  minPriceCentsKWh: number | null;
  maxPriceCentsKWh: number | null;
  priceLevel: 'cheap' | 'normal' | 'expensive' | 'unknown';
  loading: boolean;
  /** Format cost per hour given power consumption in Watts */
  calcCostPerHour: (watts: number | null) => {
    cents: number | null;
    formatted: string;
  };
}

interface PriceState {
  currentPriceEur: number | null;
  stats: { min: number | null; max: number | null; avg: number | null; count: number } | null;
}

let cachedData: PriceState = { currentPriceEur: null, stats: null };
let lastFetch = 0;

export function useElectricityPrice(): ElectricityPriceInfo {
  const [data, setData] = useState<PriceState>(cachedData);
  const [loading, setLoading] = useState<boolean>(cachedData.currentPriceEur === null);

  useEffect(() => {
    let cancelled = false;

    const fetchPrice = async () => {
      const now = Date.now();
      if (cachedData.currentPriceEur !== null && now - lastFetch < 30_000) {
        setData(cachedData);
        setLoading(false);
        return;
      }

      try {
        const [curRes, statsRes] = await Promise.all([
          apiFetch('/api/nordpool/current'),
          apiFetch('/api/nordpool/stats'),
        ]);

        const curJson = curRes.ok ? await curRes.json() : null;
        const statsJson = statsRes.ok ? await statsRes.json() : null;

        if (!cancelled) {
          const newState: PriceState = {
            currentPriceEur: curJson && typeof curJson.price === 'number' ? curJson.price : null,
            stats: statsJson && typeof statsJson.count === 'number' ? statsJson : null,
          };
          cachedData = newState;
          lastFetch = Date.now();
          setData(newState);
        }
      } catch (err) {
        console.error('Failed to fetch electricity prices:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchPrice();
    const interval = setInterval(fetchPrice, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const priceCentsKWh = data.currentPriceEur !== null ? data.currentPriceEur / 10 : null;
  const avgPriceCentsKWh = data.stats?.avg != null ? data.stats.avg / 10 : null;
  const minPriceCentsKWh = data.stats?.min != null ? data.stats.min / 10 : null;
  const maxPriceCentsKWh = data.stats?.max != null ? data.stats.max / 10 : null;

  // Determine price level compared to day's range
  let priceLevel: 'cheap' | 'normal' | 'expensive' | 'unknown' = 'unknown';
  if (data.currentPriceEur != null && data.stats?.min != null && data.stats?.max != null) {
    const range = data.stats.max - data.stats.min;
    if (range > 0) {
      const pos = (data.currentPriceEur - data.stats.min) / range;
      if (pos <= 0.33) priceLevel = 'cheap';
      else if (pos >= 0.67) priceLevel = 'expensive';
      else priceLevel = 'normal';
    } else {
      priceLevel = 'normal';
    }
  }

  const calcCostPerHour = (watts: number | null) => {
    if (watts === null || priceCentsKWh === null) {
      return { cents: null, formatted: '—' };
    }
    const kw = watts / 1000;
    const centsPerHour = kw * priceCentsKWh;

    if (Math.abs(centsPerHour) >= 100) {
      return {
        cents: centsPerHour,
        formatted: `${(centsPerHour / 100).toFixed(2)} €/h`,
      };
    }

    return {
      cents: centsPerHour,
      formatted: `${centsPerHour.toFixed(1)} snt/h`,
    };
  };

  return {
    priceEurMWh: data.currentPriceEur,
    priceCentsKWh,
    avgPriceCentsKWh,
    minPriceCentsKWh,
    maxPriceCentsKWh,
    priceLevel,
    loading,
    calcCostPerHour,
  };
}
