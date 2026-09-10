import { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';

const CHART_TOPICS = [
  { key: 'main/Outside_Temp', label: 'Outdoor', color: '#22d3ee' },
  { key: 'main/Main_Inlet_Temp', label: 'Inlet', color: '#38bdf8' },
  { key: 'main/Main_Outlet_Temp', label: 'Outlet', color: '#f59e0b' },
  { key: 'main/DHW_Temp', label: 'DHW', color: '#10b981' },
  { key: 'main/Buffer_Temp', label: 'Buffer', color: '#a78bfa' },
  { key: 'main/Compressor_Freq', label: 'Comp. Hz', color: '#fb923c' },
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
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
        {new Date(label).toLocaleString('fi-FI')}
      </div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.name}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: p.color, marginLeft: 'auto' }}>
            {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
};

export function HistoryChart() {
  const [selectedTopics, setSelectedTopics] = useState<string[]>([
    'main/Outside_Temp', 'main/Main_Outlet_Temp', 'main/DHW_Temp', 'main/Buffer_Temp',
  ]);
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedTopics.length === 0) { setData([]); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);

    const topics = selectedTopics.join(',');
    const hours = HOURS[timeRange];

    fetch(`/api/history/multi?topics=${encodeURIComponent(topics)}&hours=${hours}`)
      .then((r) => {
        if (!r.ok) throw new Error(`History request failed (${r.status})`);
        return r.json();
      })
      .then((res) => {
        if (cancelled) return;
        // Merge all topic data into time-indexed points
        const byTime = new Map<number, ChartDataPoint>();

        Object.entries((res.data ?? {}) as Record<string, HistoryRow[]>).forEach(([topic, rows]) => {
          (rows as any[]).forEach((row) => {
            const t = Number(row.recorded_at);
            if (!byTime.has(t)) byTime.set(t, { time: t });
            byTime.get(t)![topic] = Number(row.value);
          });
        });

        const sorted = Array.from(byTime.values()).sort((a, b) => a.time - b.time);
        setData(sorted);
      })
      .catch(() => { if (!cancelled) setError('Failed to load history'); })
      .finally(() => { if (!cancelled) setLoading(false); });

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
        <span className="card-title">History</span>
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
                id={`btn-topic-${label.replace(/\s/g, '-')}`}
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
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading history...</span>
          </div>
        ) : error ? (
          <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'var(--offline)', fontSize: 13 }}>{error}</span>
          </div>
        ) : data.length === 0 ? (
          <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 24 }}>📊</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              {selectedTopics.length === 0 ? 'Select topics above to chart' : 'No history yet — data builds up over time'}
            </span>
          </div>
        ) : (
          <div className="chart-container" style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
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
                <YAxis
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                />
                <Tooltip content={<CustomTooltip />} />
                {CHART_TOPICS.filter((t) => selectedTopics.includes(t.key)).map(({ key, label, color }) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    name={label}
                    stroke={color}
                    strokeWidth={2}
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
