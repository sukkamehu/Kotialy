import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';

interface ElectricityPriceInfo {
  priceEurMWh: number | null;
  priceCentsKWh: number | null;
  loading: boolean;
  /** Format cost per hour given power consumption in Watts */
  calcCostPerHour: (watts: number | null) => {
    cents: number | null;
    formatted: string;
  };
}

let cachedPrice: number | null = null;
let lastFetch = 0;

export function useElectricityPrice(): ElectricityPriceInfo {
  const [priceEurMWh, setPriceEurMWh] = useState<number | null>(cachedPrice);
  const [loading, setLoading] = useState<boolean>(cachedPrice === null);

  useEffect(() => {
    let cancelled = false;

    const fetchPrice = async () => {
      // Don't refetch more often than every 30 seconds across components
      const now = Date.now();
      if (cachedPrice !== null && now - lastFetch < 30_000) {
        setPriceEurMWh(cachedPrice);
        setLoading(false);
        return;
      }

      try {
        const res = await apiFetch('/api/nordpool/current');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled && data && typeof data.price === 'number') {
          cachedPrice = data.price;
          lastFetch = Date.now();
          setPriceEurMWh(data.price);
        }
      } catch (err) {
        console.error('Failed to fetch current electricity price:', err);
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

  const priceCentsKWh = priceEurMWh !== null ? priceEurMWh / 10 : null;

  const calcCostPerHour = (watts: number | null) => {
    if (watts === null || priceCentsKWh === null) {
      return { cents: null, formatted: '—' };
    }
    const kw = watts / 1000;
    const centsPerHour = kw * priceCentsKWh;

    // If more than 100 cents/h, show as €/h
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
    priceEurMWh,
    priceCentsKWh,
    loading,
    calcCostPerHour,
  };
}
