import { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '../lib/api';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface ChartTopicConfig {
  key: string;
  label: string;
  color: string;
  unit: string;
  yAxisId: 'left' | 'right';
  dash?: string;
}

const CHART_TOPICS: ChartTopicConfig[] = [
  { key: 'main/Outside_Temp', label: 'VILP Ulkolämpö', color: '#22d3ee', unit: '°C', yAxisId: 'left' },
  { key: 'weather_temp', label: '🌤️ Sääennuste', color: '#06b6d4', unit: '°C', yAxisId: 'left', dash: '3 3' },
  { key: 'main/Main_Inlet_Temp', label: 'Tulo', color: '#38bdf8', unit: '°C', yAxisId: 'left' },
  { key: 'main/Main_Outlet_Temp', label: 'Meno', color: '#f59e0b', unit: '°C', yAxisId: 'left' },
  { key: 'main/DHW_Temp', label: 'Käyttövesi', color: '#10b981', unit: '°C', yAxisId: 'left' },
  { key: 'main/Buffer_Temp', label: 'Puskuri', color: '#a78bfa', unit: '°C', yAxisId: 'left' },
  { key: 'herrfors_power', label: '🔌 Talon sähköteho (Herrfors)', color: '#ec4899', unit: 'kW', yAxisId: 'right' },
  { key: 'tapo/total_power', label: '🔌 Tapo Yhteisteho', color: '#818cf8', unit: 'W', yAxisId: 'right' },
  { key: 'tapo/total_today_energy', label: '⚡ Tapo Yhteiskulutus tänään', color: '#6366f1', unit: 'kWh', yAxisId: 'right' },
  { key: 'tapo/isovarasto/power', label: '🔥 Isovarasto teho', color: '#fb923c', unit: 'W', yAxisId: 'right' },
  { key: 'tapo/isovarasto/energy', label: '⚡ Isovarasto kulutus', color: '#ea580c', unit: 'kWh', yAxisId: 'right' },
  { key: 'tapo/pikkuvarasto/power', label: '🔥 Pikkuvarasto teho', color: '#f97316', unit: 'W', yAxisId: 'right' },
  { key: 'tapo/pikkuvarasto/energy', label: '⚡ Pikkuvarasto kulutus', color: '#d97706', unit: 'kWh', yAxisId: 'right' },
  { key: 'tapo/pesukone/power', label: '🧺 Pesukone teho', color: '#0ea5e9', unit: 'W', yAxisId: 'right' },
  { key: 'tapo/pesukone/energy', label: '⚡ Pesukone kulutus', color: '#0284c7', unit: 'kWh', yAxisId: 'right' },
  { key: 'tapo/kuivausrumpu/power', label: '💨 Kuivausrumpu teho', color: '#c084fc', unit: 'W', yAxisId: 'right' },
  { key: 'tapo/kuivausrumpu/energy', label: '⚡ Kuivausrumpu kulutus', color: '#9333ea', unit: 'kWh', yAxisId: 'right' },
  { key: 'main/Compressor_Freq', label: 'Komp. Hz', color: '#fb923c', unit: 'Hz', yAxisId: 'right' },
  { key: 'main/Heat_Power_Consumption', label: 'VILP Ottoteho', color: '#f43f5e', unit: 'W', yAxisId: 'right' },
  { key: 'main/Heat_Power_Production', label: 'Lämmitysteho', color: '#f97316', unit: 'W', yAxisId: 'right' },
  { key: 'electricity_price', label: '⚡ Pörssisähkö', color: '#facc15', unit: 'snt/kWh', yAxisId: 'right', dash: '4 2' },
  { key: 'main/Pump_Flow', label: 'Virtaus', color: '#34d399', unit: 'L/min', yAxisId: 'right' },
  { key: 'main/Defrosting_State', label: '❄️ Sulatus', color: '#67e8f9', unit: '', yAxisId: 'right', dash: '3 3' },
];

type QuickPreset = '1h' | '6h' | '24h' | 'today' | 'yesterday' | '7d' | '30d' | 'custom_day' | 'custom_range';

interface HistoryRow {
  topic: string;
  value: number;
  recorded_at: number;
}

interface ChartDataPoint {
  time: number;
  [key: string]: number;
}

function toLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateInput(str: string, endOfDay = false): number {
  if (!str) return Date.now();
  const [y, m, d] = str.split('-').map(Number);
  const date = new Date(y, m - 1, d, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  return date.getTime();
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'rgba(15,20,32,0.95)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 10,
      padding: '10px 14px',
      backdropFilter: 'blur(12px)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      minWidth: 190,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>
        {new Date(label).toLocaleString('fi-FI', {
          weekday: 'short',
          day: 'numeric',
          month: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </div>
      {payload.map((p: any) => {
        const topic = CHART_TOPICS.find((t) => t.key === p.dataKey);
        const unit = topic?.unit ?? '';
        let valStr = typeof p.value === 'number' ? p.value.toFixed(1) : String(p.value);
        if (p.dataKey === 'main/Defrosting_State') {
          valStr = p.value === 1 ? 'Käynnissä' : 'Pois';
        } else if (p.dataKey === 'herrfors_power') {
          valStr = `${typeof p.value === 'number' ? p.value.toFixed(2) : p.value} kW`;
        } else if (p.dataKey === 'electricity_price') {
          valStr = `${typeof p.value === 'number' ? p.value.toFixed(2) : p.value} snt/kWh`;
        } else if (p.dataKey === 'weather_temp' || p.dataKey.includes('Temp')) {
          valStr = `${typeof p.value === 'number' && p.value > 0 ? '+' : ''}${typeof p.value === 'number' ? p.value.toFixed(1) : p.value} °C`;
        } else if (unit === 'W' && typeof p.value === 'number' && p.value >= 1000) {
          valStr = `${(p.value / 1000).toFixed(2)} kW`;
        } else if (unit === 'kWh' && typeof p.value === 'number') {
          valStr = `${p.value.toFixed(2)} kWh`;
        } else if (unit !== '') {
          valStr = `${valStr} ${unit}`;
        }
        return (
          <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.name}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: p.color, marginLeft: 'auto' }}>
              {valStr}
            </span>
          </div>
        );
      })}
    </div>
  );
};

function interpolateTimeline(
  selectedTopics: string[],
  sensorsData: Record<string, HistoryRow[]>,
  priceRows: any[],
  herrforsRows: any[],
  weatherRows: any[],
  maxGapMs: number = 75 * 60 * 1000
): ChartDataPoint[] {
  const seriesMap = new Map<string, { time: number; value: number }[]>();
  const timeSet = new Set<number>();

  // 1. Heatpump and MQTT Sensors
  for (const topic of selectedTopics) {
    if (topic === 'electricity_price' || topic === 'herrfors_power' || topic === 'weather_temp') continue;
    const rows = sensorsData[topic] || [];
    const sortedRows = rows
      .map((r) => ({ time: Number(r.recorded_at), value: Number(r.value) }))
      .sort((a, b) => a.time - b.time);

    seriesMap.set(topic, sortedRows);
    for (const r of sortedRows) timeSet.add(r.time);
  }

  // 2. Electricity Spot Price
  if (selectedTopics.includes('electricity_price') && Array.isArray(priceRows)) {
    const priceSeries: { time: number; value: number }[] = [];
    for (const p of priceRows) {
      const t = Number(p.start_time || p.timestamp || p.time);
      const rawPrice = Number(p.price_cents != null ? p.price_cents : (p.price != null ? p.price / 10 : 0));
      if (!isNaN(t)) {
        priceSeries.push({ time: t, value: Number(rawPrice.toFixed(2)) });
        timeSet.add(t);
      }
    }
    priceSeries.sort((a, b) => a.time - b.time);
    seriesMap.set('electricity_price', priceSeries);
  }

  // 3. Herrfors Whole House Power (kW = 15min kWh * 4)
  if (selectedTopics.includes('herrfors_power') && Array.isArray(herrforsRows)) {
    const herrforsSeries: { time: number; value: number }[] = [];
    for (const h of herrforsRows) {
      const t = Number(h.start_time || h.timestamp || h.time);
      const kwh = Number(h.consumption_kwh != null ? h.consumption_kwh : h.value || 0);
      if (!isNaN(t) && !isNaN(kwh)) {
        const kw = Number((kwh * 4).toFixed(2));
        herrforsSeries.push({ time: t, value: kw });
        timeSet.add(t);
      }
    }
    herrforsSeries.sort((a, b) => a.time - b.time);
    seriesMap.set('herrfors_power', herrforsSeries);
  }

  // 4. Weather Forecast / Temperature
  if (selectedTopics.includes('weather_temp') && Array.isArray(weatherRows)) {
    const weatherSeries: { time: number; value: number }[] = [];
    for (const w of weatherRows) {
      const t = Number(w.time || w.timestamp || w.start_time);
      const temp = Number(w.temperature != null ? w.temperature : w.temp);
      if (!isNaN(t) && !isNaN(temp)) {
        weatherSeries.push({ time: t, value: Number(temp.toFixed(1)) });
        timeSet.add(t);
      }
    }
    weatherSeries.sort((a, b) => a.time - b.time);
    seriesMap.set('weather_temp', weatherSeries);
  }

  const allTimes = Array.from(timeSet).sort((a, b) => a - b);
  if (allTimes.length === 0) return [];

  // Downsample if more than 600 points for smooth performance
  const sampledTimes: number[] = [];
  const maxPoints = 500;
  const step = Math.max(1, Math.floor(allTimes.length / maxPoints));
  for (let i = 0; i < allTimes.length; i += step) {
    sampledTimes.push(allTimes[i]);
  }
  if (sampledTimes[sampledTimes.length - 1] !== allTimes[allTimes.length - 1]) {
    sampledTimes.push(allTimes[allTimes.length - 1]);
  }

  const result: ChartDataPoint[] = [];

  for (const t of sampledTimes) {
    const pt: ChartDataPoint = { time: t };

    for (const topic of selectedTopics) {
      const series = seriesMap.get(topic);
      if (!series || series.length === 0) continue;

      let idx = 0;
      let low = 0;
      let high = series.length - 1;
      while (low <= high) {
        const mid = (low + high) >> 1;
        if (series[mid].time <= t) {
          idx = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      const p0 = series[idx];
      const p1 = series[idx + 1];

      if (!p0) continue;

      if (p0.time === t) {
        pt[topic] = p0.value;
      } else if (t < p0.time) {
        if (p0.time - t <= maxGapMs) {
          pt[topic] = p0.value;
        }
      } else if (!p1) {
        if (t - p0.time <= maxGapMs) {
          pt[topic] = p0.value;
        }
      } else {
        const gap = p1.time - p0.time;
        if (gap <= maxGapMs) {
          if (topic === 'main/Defrosting_State' || topic === 'electricity_price' || topic === 'herrfors_power') {
            pt[topic] = p0.value;
          } else {
            const ratio = (t - p0.time) / gap;
            pt[topic] = p0.value + ratio * (p1.value - p0.value);
          }
        }
      }
    }

    result.push(pt);
  }

  return result;
}

export function HistoryChart() {
  const [selectedTopics, setSelectedTopics] = useState<string[]>([
    'main/Outside_Temp', 'main/Main_Outlet_Temp', 'main/DHW_Temp', 'main/Buffer_Temp', 'herrfors_power',
  ]);
  const [preset, setPreset] = useState<QuickPreset>('24h');
  
  // Custom date controls
  const todayStr = useMemo(() => toLocalDateString(new Date()), []);
  const [selectedDay, setSelectedDay] = useState<string>(todayStr);
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return toLocalDateString(d);
  });
  const [endDate, setEndDate] = useState<string>(todayStr);

  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Compute fromMs and toMs
  const { fromMs, toMs, rangeDurationHours, formattedRangeLabel } = useMemo(() => {
    const now = Date.now();
    let from = now - 24 * 3600 * 1000;
    let to = now;
    let label = 'Viimeiset 24 tuntia';

    if (preset === '1h') {
      from = now - 3600 * 1000;
      to = now;
      label = 'Viimeinen 1 tunti';
    } else if (preset === '6h') {
      from = now - 6 * 3600 * 1000;
      to = now;
      label = 'Viimeiset 6 tuntia';
    } else if (preset === '24h') {
      from = now - 24 * 3600 * 1000;
      to = now;
      label = 'Viimeiset 24 tuntia';
    } else if (preset === 'today') {
      from = parseDateInput(todayStr, false);
      to = now;
      label = `Tänään (${new Date(from).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })})`;
    } else if (preset === 'yesterday') {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const yStr = toLocalDateString(y);
      from = parseDateInput(yStr, false);
      to = parseDateInput(yStr, true);
      label = `Eilen (${new Date(from).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })})`;
    } else if (preset === '7d') {
      from = now - 7 * 24 * 3600 * 1000;
      to = now;
      label = 'Viimeiset 7 päivää';
    } else if (preset === '30d') {
      from = now - 30 * 24 * 3600 * 1000;
      to = now;
      label = 'Viimeiset 30 päivää';
    } else if (preset === 'custom_day') {
      from = parseDateInput(selectedDay, false);
      const isToday = selectedDay === todayStr;
      to = isToday ? now : parseDateInput(selectedDay, true);
      const dObj = new Date(from);
      label = `Päivä: ${dObj.toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' })}`;
    } else if (preset === 'custom_range') {
      from = parseDateInput(startDate, false);
      const isToday = endDate === todayStr;
      to = isToday ? now : parseDateInput(endDate, true);
      const startObj = new Date(from);
      const endObj = new Date(to);
      label = `Aikajakso: ${startObj.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })} – ${endObj.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric', year: 'numeric' })}`;
    }

    const durationH = Math.max(1, (to - from) / (3600 * 1000));
    return { fromMs: from, toMs: to, rangeDurationHours: durationH, formattedRangeLabel: label };
  }, [preset, selectedDay, startDate, endDate, todayStr]);

  const hasRightAxis = useMemo(() => {
    return selectedTopics.some((k) => {
      const topic = CHART_TOPICS.find((t) => t.key === k);
      return topic?.yAxisId === 'right';
    });
  }, [selectedTopics]);

  useEffect(() => {
    if (selectedTopics.length === 0) {
      setData([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    const sensorTopics = selectedTopics.filter((t) => t !== 'electricity_price' && t !== 'herrfors_power' && t !== 'weather_temp');
    const includePrice = selectedTopics.includes('electricity_price');
    const includeHerrfors = selectedTopics.includes('herrfors_power');
    const includeWeather = selectedTopics.includes('weather_temp');

    const fetches: Promise<any>[] = [];

    if (sensorTopics.length > 0) {
      fetches.push(
        apiFetch(`/api/history/multi?topics=${encodeURIComponent(sensorTopics.join(','))}&from=${fromMs}&to=${toMs}`)
          .then((r) => {
            if (!r.ok) throw new Error(`Historiatietojen haku epäonnistui (${r.status})`);
            return r.json();
          })
          .then((res) => ({ type: 'sensors', data: res.data ?? {} }))
      );
    }

    if (includePrice) {
      const priceToMs = Math.max(toMs, Date.now() + 54 * 3600_000);
      fetches.push(
        apiFetch(`/api/nordpool/prices?from=${fromMs}&to=${priceToMs}`)
          .then((r) => {
            if (!r.ok) throw new Error(`Sähkön hintatietojen haku epäonnistui (${r.status})`);
            return r.json();
          })
          .then((res) => ({ type: 'price', prices: res.prices ?? [] }))
      );
    }

    if (includeHerrfors) {
      fetches.push(
        apiFetch(`/api/herrfors/readings?from=${fromMs}&to=${toMs}`)
          .then((r) => {
            if (!r.ok) throw new Error(`Herrfors-kulutustietojen haku epäonnistui (${r.status})`);
            return r.json();
          })
          .then((res) => ({ type: 'herrfors', readings: res.readings ?? [] }))
      );
    }

    if (includeWeather) {
      fetches.push(
        apiFetch(`/api/weather/forecast?hours=72`)
          .then((r) => {
            if (!r.ok) throw new Error(`Sääennusteen haku epäonnistui (${r.status})`);
            return r.json();
          })
          .then((res) => ({ type: 'weather', forecast: res.forecast ?? [] }))
      );
    }

    Promise.all(fetches)
      .then((results) => {
        if (cancelled) return;
        let sensorsData: Record<string, HistoryRow[]> = {};
        let pricesData: any[] = [];
        let herrforsData: any[] = [];
        let weatherData: any[] = [];

        for (const res of results) {
          if (res.type === 'sensors') {
            sensorsData = res.data;
          } else if (res.type === 'price') {
            pricesData = res.prices;
          } else if (res.type === 'herrfors') {
            herrforsData = res.readings;
          } else if (res.type === 'weather') {
            weatherData = res.forecast;
          }
        }

        const interpolated = interpolateTimeline(selectedTopics, sensorsData, pricesData, herrforsData, weatherData);
        setData(interpolated);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Historiatietojen lataus epäonnistui');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedTopics, fromMs, toMs]);

  function toggleTopic(key: string) {
    setSelectedTopics((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  function stepDay(offset: number) {
    const cur = new Date(selectedDay);
    cur.setDate(cur.getDate() + offset);
    const newStr = toLocalDateString(cur);
    if (newStr <= todayStr) {
      setSelectedDay(newStr);
      setPreset('custom_day');
    }
  }

  function formatXTick(value: number) {
    const d = new Date(value);
    if (rangeDurationHours > 72) {
      return d.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' });
    }
    if (rangeDurationHours > 24) {
      return d.toLocaleDateString('fi-FI', { weekday: 'short', hour: '2-digit' });
    }
    return d.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="card-icon">📈</span>
            <div>
              <span className="card-title" style={{ fontSize: 17 }}>Trendit ja historia</span>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                Lämpöpumpun diagnostiikka, talon kokonaiskulutus, sääennuste ja pörssihinta
              </div>
            </div>
          </div>

          {/* Quick preset buttons */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            {[
              { id: '1h', label: '1h' },
              { id: '6h', label: '6h' },
              { id: '24h', label: '24h' },
              { id: 'today', label: 'Tänään' },
              { id: 'yesterday', label: 'Eilen' },
              { id: '7d', label: '7 pv' },
              { id: '30d', label: '30 pv' },
              { id: 'custom_range', label: '🗓️ Aikajakso' },
            ].map((p) => (
              <button
                key={p.id}
                className={`btn btn-sm ${preset === p.id ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setPreset(p.id as QuickPreset)}
                style={{
                  padding: '4px 10px',
                  fontSize: 12,
                  fontWeight: preset === p.id ? 700 : 500,
                  borderRadius: 8,
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Date Selector Toolbars */}
        {(preset === 'custom_day' || preset === 'today' || preset === 'yesterday') && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255,255,255,0.03)',
            padding: '8px 14px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.06)',
            flexWrap: 'wrap',
            gap: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => stepDay(-1)}
                style={{ padding: '4px 10px', fontSize: 12 }}
                title="Edellinen päivä"
              >
                ◀ Edellinen
              </button>
              
              <input
                type="date"
                max={todayStr}
                value={preset === 'today' ? todayStr : preset === 'yesterday' ? (() => { const d = new Date(); d.setDate(d.getDate() - 1); return toLocalDateString(d); })() : selectedDay}
                onChange={(e) => {
                  if (e.target.value) {
                    setSelectedDay(e.target.value);
                    setPreset('custom_day');
                  }
                }}
                style={{
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 6,
                  color: '#60a5fa',
                  padding: '4px 8px',
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                }}
              />

              <button
                className="btn btn-sm btn-ghost"
                onClick={() => stepDay(1)}
                disabled={(preset === 'today' ? todayStr : selectedDay) >= todayStr}
                style={{ padding: '4px 10px', fontSize: 12, opacity: (preset === 'today' ? todayStr : selectedDay) >= todayStr ? 0.3 : 1 }}
                title="Seuraava päivä"
              >
                Seuraava ▶
              </button>
            </div>

            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
              📅 {formattedRangeLabel}
            </div>
          </div>
        )}

        {preset === 'custom_range' && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255,255,255,0.03)',
            padding: '8px 14px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.06)',
            flexWrap: 'wrap',
            gap: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Alkaen:</span>
              <input
                type="date"
                max={endDate || todayStr}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 6,
                  color: '#60a5fa',
                  padding: '4px 8px',
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                }}
              />

              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Päättyen:</span>
              <input
                type="date"
                min={startDate}
                max={todayStr}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 6,
                  color: '#60a5fa',
                  padding: '4px 8px',
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                }}
              />

              {/* Quick shortcuts */}
              <div style={{ display: 'flex', gap: 4, marginLeft: 6 }}>
                {[
                  { label: '3 pv', days: 3 },
                  { label: '7 pv', days: 7 },
                  { label: '14 pv', days: 14 },
                  { label: '30 pv', days: 30 },
                ].map((sc) => (
                  <button
                    key={sc.label}
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() - sc.days);
                      setStartDate(toLocalDateString(d));
                      setEndDate(todayStr);
                    }}
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: 'var(--text-secondary)',
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    {sc.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
              📅 {formattedRangeLabel}
            </div>
          </div>
        )}
      </div>

      <div className="card-body">
        {/* Topic toggles */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {CHART_TOPICS.map(({ key, label, color }) => {
            const active = selectedTopics.includes(key);
            return (
              <button
                key={key}
                onClick={() => toggleTopic(key)}
                id={`btn-topic-${label.replace(/[^a-zA-Z0-9]/g, '-')}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '4px 12px',
                  borderRadius: 100,
                  border: `1px solid ${active ? color + '60' : 'rgba(255,255,255,0.1)'}`,
                  background: active ? color + '18' : 'transparent',
                  color: active ? color : 'var(--text-muted)',
                  fontSize: 12,
                  fontWeight: active ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  fontFamily: 'inherit',
                }}
              >
                <div style={{
                  width: 8, height: 8, borderRadius: 2,
                  background: active ? color : 'rgba(255,255,255,0.2)',
                }} />
                {label}
              </button>
            );
          })}
        </div>

        {/* Chart */}
        {loading ? (
          <div style={{ height: 340, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Ladataan trenditietoja...</span>
          </div>
        ) : error ? (
          <div style={{ height: 340, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'var(--offline)', fontSize: 13 }}>{error}</span>
          </div>
        ) : data.length === 0 ? (
          <div style={{ height: 340, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 28 }}>📊</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              {selectedTopics.length === 0 ? 'Valitse kuvaajassa näytettävät kohteet yltä' : 'Ei historiadataa valitulle aikajaksolle'}
            </span>
          </div>
        ) : (
          <div className="chart-container" style={{ height: 360 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 5, right: hasRightAxis ? 10 : 15, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="time"
                  scale="time"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={formatXTick}
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                  tickLine={false}
                  minTickGap={40}
                />
                {/* Left Y Axis for Temperatures */}
                <YAxis
                  yAxisId="left"
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={38}
                  tickFormatter={(v) => `${Math.round(v)}°`}
                />
                {/* Right Y Axis for Price (c/kWh), Power (kW), Compressor Freq (Hz) */}
                {hasRightAxis && (
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={38}
                  />
                )}
                <Tooltip content={<CustomTooltip />} />
                {CHART_TOPICS.filter((t) => selectedTopics.includes(t.key)).map(({ key, label, color, yAxisId, dash }) => (
                  <Line
                    key={key}
                    yAxisId={yAxisId}
                    type="monotone"
                    dataKey={key}
                    name={label}
                    stroke={color}
                    strokeWidth={key === 'herrfors_power' || key === 'electricity_price' ? 2.5 : 2}
                    strokeDasharray={dash}
                    dot={false}
                    connectNulls
                    activeDot={{ r: 4, fill: color, stroke: 'none' }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
