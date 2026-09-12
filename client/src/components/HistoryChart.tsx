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
  { key: 'main/Outside_Temp', label: 'Ulkoilma', color: '#22d3ee', unit: '°C', yAxisId: 'left' },
  { key: 'main/Main_Inlet_Temp', label: 'Tulo', color: '#38bdf8', unit: '°C', yAxisId: 'left' },
  { key: 'main/Main_Outlet_Temp', label: 'Meno', color: '#f59e0b', unit: '°C', yAxisId: 'left' },
  { key: 'main/DHW_Temp', label: 'Käyttövesi', color: '#10b981', unit: '°C', yAxisId: 'left' },
  { key: 'main/Buffer_Temp', label: 'Puskuri', color: '#a78bfa', unit: '°C', yAxisId: 'left' },
  { key: 'main/Compressor_Freq', label: 'Komp. Hz', color: '#fb923c', unit: 'Hz', yAxisId: 'right' },
  { key: 'main/Pump_Flow', label: 'Virtaus', color: '#34d399', unit: 'L/min', yAxisId: 'right' },
  { key: 'main/Heat_Power_Production', label: 'Lämmitysteho', color: '#f97316', unit: 'W', yAxisId: 'right' },
  { key: 'main/Heat_Power_Consumption', label: 'Ottoteho', color: '#f43f5e', unit: 'W', yAxisId: 'right' },
  { key: 'main/DHW_Power_Production', label: 'KV-teho', color: '#059669', unit: 'W', yAxisId: 'right' },
  { key: 'main/Defrosting_State', label: '❄️ Sulatus', color: '#67e8f9', unit: '', yAxisId: 'right', dash: '3 3' },
  { key: 'electricity_price', label: '⚡ Pörssisähkö', color: '#facc15', unit: 'snt/kWh', yAxisId: 'right', dash: '4 2' },
];

type TimeRange = '1h' | '6h' | '24h' | '7d';

const HOURS: Record<TimeRange, number> = { '1h': 1, '6h': 6, '24h': 24, '7d': 168 };

interface HistoryRow {
  topic: string;
  value: number;
  recorded_at: number;
}

interface ChartDataPoint {
  time: number;
  [key: string]: number;
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
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
        {new Date(label).toLocaleString('fi-FI')}
      </div>
      {payload.map((p: any) => {
        const topic = CHART_TOPICS.find((t) => t.key === p.dataKey);
        const unit = topic?.unit ?? '';
        let valStr = typeof p.value === 'number' ? p.value.toFixed(1) : String(p.value);
        if (p.dataKey === 'main/Defrosting_State') {
          valStr = p.value === 1 ? 'Käynnissä' : 'Pois';
        } else if (unit === 'W' && typeof p.value === 'number' && p.value >= 1000) {
          valStr = `${(p.value / 1000).toFixed(2)} kW`;
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
  maxGapMs: number = 30 * 60 * 1000
): ChartDataPoint[] {
  const seriesMap = new Map<string, { time: number; value: number }[]>();
  const timeSet = new Set<number>();

  for (const topic of selectedTopics) {
    if (topic === 'electricity_price') continue;
    const rows = sensorsData[topic] || [];
    const sortedRows = rows
      .map((r) => ({ time: Number(r.recorded_at), value: Number(r.value) }))
      .sort((a, b) => a.time - b.time);

    seriesMap.set(topic, sortedRows);
    sortedRows.forEach((r) => timeSet.add(r.time));
  }

  const parsedPrices = (priceRows || []).map((p) => ({
    start: Number(p.start_time),
    end: Number(p.end_time),
    priceCents: Number(p.price) / 10,
  }));

  if (selectedTopics.includes('electricity_price')) {
    parsedPrices.forEach((p) => {
      timeSet.add(p.start);
      if (p.end - 1000 > p.start) timeSet.add(p.end - 1000);
    });
  }

  const allTimes = Array.from(timeSet).sort((a, b) => a - b);
  if (allTimes.length === 0) return [];

  const pointers = new Map<string, number>();
  for (const topic of selectedTopics) {
    pointers.set(topic, 0);
  }

  const result: ChartDataPoint[] = [];

  for (const t of allTimes) {
    const pt: ChartDataPoint = { time: t };

    for (const topic of selectedTopics) {
      if (topic === 'electricity_price') {
        const found = parsedPrices.find((p) => t >= p.start && t < p.end);
        if (found) {
          pt['electricity_price'] = found.priceCents;
        }
        continue;
      }

      const series = seriesMap.get(topic);
      if (!series || series.length === 0) continue;

      let idx = pointers.get(topic) || 0;
      while (idx + 1 < series.length && series[idx + 1].time <= t) {
        idx++;
      }
      pointers.set(topic, idx);

      const p0 = series[idx];
      const p1 = series[idx + 1];

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
          if (topic === 'main/Defrosting_State') {
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
    'main/Outside_Temp', 'main/Main_Outlet_Temp', 'main/DHW_Temp', 'main/Buffer_Temp',
  ]);
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    const hours = HOURS[timeRange];
    const now = Date.now();
    const from = now - hours * 3600 * 1000;
    const to = now;

    const sensorTopics = selectedTopics.filter((t) => t !== 'electricity_price');
    const includePrice = selectedTopics.includes('electricity_price');

    const fetches: Promise<any>[] = [];

    if (sensorTopics.length > 0) {
      fetches.push(
        apiFetch(`/api/history/multi?topics=${encodeURIComponent(sensorTopics.join(','))}&hours=${hours}`)
          .then((r) => {
            if (!r.ok) throw new Error(`Historiatietojen haku epäonnistui (${r.status})`);
            return r.json();
          })
          .then((res) => ({ type: 'sensors', data: res.data ?? {} }))
      );
    }

    if (includePrice) {
      fetches.push(
        apiFetch(`/api/nordpool/prices?from=${from}&to=${to}`)
          .then((r) => {
            if (!r.ok) throw new Error(`Sähkön hintatietojen haku epäonnistui (${r.status})`);
            return r.json();
          })
          .then((res) => ({ type: 'price', prices: res.prices ?? [] }))
      );
    }

    Promise.all(fetches)
      .then((results) => {
        if (cancelled) return;
        let sensorsData: Record<string, HistoryRow[]> = {};
        let pricesData: any[] = [];

        for (const res of results) {
          if (res.type === 'sensors') {
            sensorsData = res.data;
          } else if (res.type === 'price') {
            pricesData = res.prices;
          }
        }

        const interpolated = interpolateTimeline(selectedTopics, sensorsData, pricesData);
        setData(interpolated);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Historiatietojen lataus epäonnistui');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedTopics, timeRange]);

  function toggleTopic(key: string) {
    setSelectedTopics((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  function formatXTick(value: number) {
    const d = new Date(value);
    if (timeRange === '7d') return d.toLocaleDateString('fi-FI', { day: '2-digit', month: '2-digit' });
    return d.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-icon">📈</span>
        <span className="card-title">Trendit ja historia</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {(['1h', '6h', '24h', '7d'] as TimeRange[]).map((r) => (
            <button
              key={r}
              className={`btn btn-sm ${timeRange === r ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setTimeRange(r)}
              id={`btn-range-${r}`}
            >
              {r}
            </button>
          ))}
        </div>
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
          <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Ladataan trenditietoja...</span>
          </div>
        ) : error ? (
          <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'var(--offline)', fontSize: 13 }}>{error}</span>
          </div>
        ) : data.length === 0 ? (
          <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 24 }}>📊</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              {selectedTopics.length === 0 ? 'Valitse kuvaajassa näytettävät kohteet yltä' : 'Ei vielä historiadataa — tiedot kertyvät ajan kuluessa'}
            </span>
          </div>
        ) : (
          <div className="chart-container" style={{ height: 320 }}>
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
                {/* Right Y Axis for Price (c/kWh) & Compressor Freq (Hz) */}
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
                    strokeWidth={key === 'electricity_price' ? 2.5 : 2}
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

