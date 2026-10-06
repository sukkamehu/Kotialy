import React, { useState, useEffect, useMemo } from 'react';
import { useTuya } from '../hooks/useTuya';
import { apiFetch } from '../lib/api';
import type { TuyaDevice } from '../types/tuya';
import type { HeishamonState } from '../types/heishamon';
import { numVal } from '../types/heishamon';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

function cleanTopicName(name: string): string {
  if (!name) return 'unknown';
  return name
    .toLowerCase()
    .replace(/ä|å/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function toLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

type TemperatureHistoryPreset = 'today' | 'yesterday' | '2d' | '7d' | '14d' | '30d' | 'day';

interface SensorHistoryPoint {
  time: number;
  temperature?: number;
  humidity?: number;
}

interface TemperaturesPageProps {
  state?: HeishamonState;
  readOnly?: boolean;
}

export const TemperaturesPage: React.FC<TemperaturesPageProps> = ({ state }) => {
  const { devices, loading, refreshing, refreshDevices } = useTuya();
  const [selectedSensor, setSelectedSensor] = useState<TuyaDevice | null>(null);
  const [historyPreset, setHistoryPreset] = useState<TemperatureHistoryPreset>('today');
  const [selectedDate, setSelectedDate] = useState<string>(() => toLocalDateString());
  const [historyData, setHistoryData] = useState<SensorHistoryPoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);

  const todayStr = useMemo(() => toLocalDateString(), []);

  // Categorize Tuya devices
  const climateSensors = useMemo(() => devices.filter((d) => d.type === 'climate'), [devices]);
  const waterLeakSensors = useMemo(() => devices.filter((d) => d.type === 'water_leak'), [devices]);
  const doorSensors = useMemo(() => devices.filter((d) => d.type === 'door'), [devices]);

  // Find key sensors
  const alakertaSensor = climateSensors.find((d) => d.name.toLowerCase().includes('alakerta'));
  const ylakertaSensor = climateSensors.find(
    (d) => d.name.toLowerCase().includes('ylakerta') || d.name.toLowerCase().includes('tyohuone')
  );
  const ulkoSensor = climateSensors.find(
    (d) => d.name.toLowerCase().includes('ulko') || d.name.toLowerCase().includes('ulkolampotila')
  );
  const saunaSensor = climateSensors.find((d) => d.name.toLowerCase().includes('sauna'));
  const isovarastoSensor = climateSensors.find(
    (d) => d.name.toLowerCase().includes('isovarasto') || d.name.toLowerCase().includes('varasto')
  );
  const autotalliSensor = climateSensors.find((d) => d.name.toLowerCase().includes('autotalli'));
  const naytollinenSensor = climateSensors.find(
    (d) => d.name.toLowerCase().includes('naytollinen') || d.name.toLowerCase().includes('sijoitus')
  );

  // Main house calculated average (Alakerta + Yläkerran työhuone)
  const mainHouseAverage = useMemo(() => {
    const temps: number[] = [];
    const humids: number[] = [];
    if (alakertaSensor?.properties.temperature != null) temps.push(alakertaSensor.properties.temperature);
    if (ylakertaSensor?.properties.temperature != null) temps.push(ylakertaSensor.properties.temperature);
    if (alakertaSensor?.properties.humidity != null) humids.push(alakertaSensor.properties.humidity);
    if (ylakertaSensor?.properties.humidity != null) humids.push(ylakertaSensor.properties.humidity);

    const avgT = temps.length > 0 ? temps.reduce((a, b) => a + b, 0) / temps.length : null;
    const avgH = humids.length > 0 ? humids.reduce((a, b) => a + b, 0) / humids.length : null;

    return {
      temperature: avgT,
      humidity: avgH,
      count: temps.length,
    };
  }, [alakertaSensor, ylakertaSensor]);

  // Outside temperature (from Tuya or Panasonic VILP)
  const panasonicOutsideTemp = state ? numVal(state, 'main/Outside_Temp') : null;
  const outsideDisplayTemp = ulkoSensor?.properties.temperature ?? panasonicOutsideTemp;

  // Auto-select first sensor (or Alakerta)
  useEffect(() => {
    if (!selectedSensor && climateSensors.length > 0) {
      setSelectedSensor(alakertaSensor || climateSensors[0]);
    }
  }, [climateSensors, selectedSensor, alakertaSensor]);

  // Compute time range for history query
  const { fromMs, toMs, dateLabel } = useMemo(() => {
    const nowMs = Date.now();
    if (historyPreset === 'today') {
      const [y, m, d] = todayStr.split('-').map(Number);
      const from = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
      return { fromMs: from, toMs: nowMs, dateLabel: 'Tänään' };
    }
    if (historyPreset === 'yesterday') {
      const yest = new Date();
      yest.setDate(yest.getDate() - 1);
      const [y, m, d] = toLocalDateString(yest).split('-').map(Number);
      const from = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
      const to = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
      const dayName = new Date(from).toLocaleDateString('fi-FI', { weekday: 'short', day: 'numeric', month: 'numeric' });
      return { fromMs: from, toMs: to, dateLabel: `Eilen (${dayName})` };
    }
    if (historyPreset === '2d') {
      return { fromMs: nowMs - 2 * 24 * 3600 * 1000, toMs: nowMs, dateLabel: '2 päivää' };
    }
    if (historyPreset === '7d') {
      return { fromMs: nowMs - 7 * 24 * 3600 * 1000, toMs: nowMs, dateLabel: '7 päivää' };
    }
    if (historyPreset === '14d') {
      return { fromMs: nowMs - 14 * 24 * 3600 * 1000, toMs: nowMs, dateLabel: '14 päivää' };
    }
    if (historyPreset === '30d') {
      return { fromMs: nowMs - 30 * 24 * 3600 * 1000, toMs: nowMs, dateLabel: '30 päivää' };
    }

    // Custom day
    const [y, m, d] = selectedDate.split('-').map(Number);
    const from = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
    const isSelectedToday = selectedDate === todayStr;
    const to = isSelectedToday ? nowMs : new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
    const dayName = new Date(from).toLocaleDateString('fi-FI', { weekday: 'short', day: 'numeric', month: 'numeric' });
    return { fromMs: from, toMs: to, dateLabel: isSelectedToday ? `Tänään (${dayName})` : dayName };
  }, [historyPreset, selectedDate, todayStr]);

  const handlePrevDay = () => {
    const base = historyPreset === 'today' ? todayStr : historyPreset === 'yesterday' ? (() => {
      const y = new Date(); y.setDate(y.getDate() - 1); return toLocalDateString(y);
    })() : selectedDate;
    const [y, m, d] = base.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    dateObj.setDate(dateObj.getDate() - 1);
    const prevStr = toLocalDateString(dateObj);
    setSelectedDate(prevStr);
    setHistoryPreset('day');
  };

  const handleNextDay = () => {
    const base = historyPreset === 'yesterday' ? (() => {
      const y = new Date(); y.setDate(y.getDate() - 1); return toLocalDateString(y);
    })() : selectedDate;
    const [y, m, d] = base.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    dateObj.setDate(dateObj.getDate() + 1);
    const nextStr = toLocalDateString(dateObj);
    if (nextStr > todayStr) return;
    setSelectedDate(nextStr);
    setHistoryPreset(nextStr === todayStr ? 'today' : 'day');
  };

  // Fetch history for selected sensor
  useEffect(() => {
    if (!selectedSensor) {
      setHistoryData([]);
      return;
    }

    let isMounted = true;
    setHistoryLoading(true);

    const slug = cleanTopicName(selectedSensor.name);
    const legacySlug = selectedSensor.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const tempTopic = `tuya/${slug}/temperature`;
    const humidTopic = `tuya/${slug}/humidity`;
    const legacyTempTopic = `tuya/${legacySlug}/temperature`;
    const legacyHumidTopic = `tuya/${legacySlug}/humidity`;

    const allTopics = Array.from(new Set([tempTopic, humidTopic, legacyTempTopic, legacyHumidTopic])).join(',');

    apiFetch(`/api/history/multi?topics=${encodeURIComponent(allTopics)}&from=${fromMs}&to=${toMs}`)
      .then((res) => res.json())
      .then((json) => {
        if (!isMounted) return;
        const dataMap = json.data || {};
        const tempRows = (dataMap[tempTopic] || dataMap[legacyTempTopic] || []);
        const humidRows = (dataMap[humidTopic] || dataMap[legacyHumidTopic] || []);

        const timeMap = new Map<number, { temperature?: number; humidity?: number }>();

        for (const r of tempRows) {
          const t = Math.round(Number(r.recorded_at) / 60000) * 60000;
          const curr = timeMap.get(t) || {};
          curr.temperature = Number(r.value);
          timeMap.set(t, curr);
        }

        for (const r of humidRows) {
          const t = Math.round(Number(r.recorded_at) / 60000) * 60000;
          const curr = timeMap.get(t) || {};
          curr.humidity = Number(r.value);
          timeMap.set(t, curr);
        }

        const points: SensorHistoryPoint[] = Array.from(timeMap.entries())
          .map(([time, vals]) => ({ time, ...vals }))
          .sort((a, b) => a.time - b.time);

        setHistoryData(points);
      })
      .catch((err) => {
        console.error('Failed to load temperature sensor history:', err);
      })
      .finally(() => {
        if (isMounted) setHistoryLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedSensor, fromMs, toMs]);

  // Compute min/max/avg for history summary
  const temps = historyData.map((d) => d.temperature).filter((t): t is number => typeof t === 'number');
  const humids = historyData.map((d) => d.humidity).filter((h): h is number => typeof h === 'number');

  const minTemp = temps.length ? Math.min(...temps) : null;
  const maxTemp = temps.length ? Math.max(...temps) : null;
  const avgTemp = temps.length ? (temps.reduce((a, b) => a + b, 0) / temps.length) : null;

  const minHumid = humids.length ? Math.min(...humids) : null;
  const maxHumid = humids.length ? Math.max(...humids) : null;
  const avgHumid = humids.length ? (humids.reduce((a, b) => a + b, 0) / humids.length) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginBottom: 40 }}>
      {/* Category Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>🌡️</span> Lämpömittarit & Sisäilma
          </h2>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 3 }}>
            Päärakennuksen ja ulkorakennusten lämpötila- ja kosteusvalvonta, reaaliaikainen historia ja hälytykset
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={refreshDevices}
            disabled={refreshing || loading}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              borderRadius: 10,
              border: '1px solid rgba(255, 255, 255, 0.12)',
              background: 'rgba(255, 255, 255, 0.05)',
              color: 'var(--text-primary)',
              cursor: refreshing ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontWeight: 600,
            }}
          >
            <span>{refreshing ? '⏳' : '🔄'}</span>
            <span>{refreshing ? 'Päivitetään...' : 'Päivitä anturit'}</span>
          </button>
        </div>
      </div>

      {/* Hero Overview Cards: Main house average & key spots */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 14,
        }}
      >
        {/* 1. Main House Average */}
        <div
          style={{
            background: 'linear-gradient(145deg, rgba(56, 189, 248, 0.15) 0%, rgba(15, 23, 42, 0.95) 100%)',
            border: '1px solid rgba(56, 189, 248, 0.4)',
            borderRadius: 16,
            padding: '16px 18px',
            boxShadow: '0 8px 24px rgba(56, 189, 248, 0.15)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>🏠</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Päärakennus (Talo)
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Alakerta + Työhuone keskiarvo
                </div>
              </div>
            </div>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 12,
                background: 'rgba(56, 189, 248, 0.2)',
                color: '#38bdf8',
                border: '1px solid rgba(56, 189, 248, 0.3)',
              }}
            >
              Tavoite ~21.3 °C
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
            <div>
              <span style={{ fontSize: '2rem', fontWeight: 800, color: '#38bdf8', letterSpacing: '-0.02em' }}>
                {mainHouseAverage.temperature !== null ? `${mainHouseAverage.temperature.toFixed(1)} °C` : '--'}
              </span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
              {mainHouseAverage.humidity !== null ? `💧 ${mainHouseAverage.humidity.toFixed(0)} % RH` : ''}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
            <span>Alakerta: <strong style={{ color: '#fb923c' }}>{alakertaSensor?.properties.temperature != null ? `${alakertaSensor.properties.temperature} °C` : '--'}</strong></span>
            <span>Työhuone: <strong style={{ color: '#fb923c' }}>{ylakertaSensor?.properties.temperature != null ? `${ylakertaSensor.properties.temperature} °C` : '--'}</strong></span>
          </div>
        </div>

        {/* 2. Ulkoilma */}
        <div
          style={{
            background: 'linear-gradient(145deg, rgba(34, 197, 94, 0.12) 0%, rgba(15, 23, 42, 0.95) 100%)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            borderRadius: 16,
            padding: '16px 18px',
            boxShadow: '0 8px 24px rgba(34, 197, 94, 0.1)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>🌲</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Ulkolämpötila
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Piha-anturi & VILP
                </div>
              </div>
            </div>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 12,
                background: 'rgba(34, 197, 94, 0.2)',
                color: '#4ade80',
                border: '1px solid rgba(34, 197, 94, 0.3)',
              }}
            >
              Ulkoilma
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
            <div>
              <span style={{ fontSize: '2rem', fontWeight: 800, color: '#4ade80', letterSpacing: '-0.02em' }}>
                {outsideDisplayTemp !== null ? `${outsideDisplayTemp.toFixed(1)} °C` : '--'}
              </span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
              {ulkoSensor?.properties.humidity != null ? `💧 ${ulkoSensor.properties.humidity} % RH` : ''}
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-muted)', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
            <span>Tuya: {ulkoSensor?.properties.temperature != null ? `${ulkoSensor.properties.temperature}°C` : '--'}</span>
            <span>VILP: {panasonicOutsideTemp !== null ? `${panasonicOutsideTemp.toFixed(1)}°C` : '--'}</span>
          </div>
        </div>

        {/* 3. Isovarasto */}
        <div
          style={{
            background: 'linear-gradient(145deg, rgba(245, 158, 11, 0.12) 0%, rgba(15, 23, 42, 0.95) 100%)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: 16,
            padding: '16px 18px',
            boxShadow: '0 8px 24px rgba(245, 158, 11, 0.1)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>📦</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Isovarasto
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Pakkassuojaus & Lämpöpatteri
                </div>
              </div>
            </div>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 12,
                background: 'rgba(245, 158, 11, 0.2)',
                color: '#fbbf24',
                border: '1px solid rgba(245, 158, 11, 0.3)',
              }}
            >
              Varasto
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
            <div>
              <span style={{ fontSize: '2rem', fontWeight: 800, color: '#fbbf24', letterSpacing: '-0.02em' }}>
                {isovarastoSensor?.properties.temperature != null ? `${isovarastoSensor.properties.temperature} °C` : '--'}
              </span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
              {isovarastoSensor?.properties.humidity != null ? `💧 ${isovarastoSensor.properties.humidity} % RH` : ''}
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-muted)', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
            <span>Paristo: {isovarastoSensor?.properties.battery != null ? `${isovarastoSensor.properties.battery}%` : '--'}</span>
            <span style={{ color: '#4ade80' }}>Pakkassuoja aktiivinen</span>
          </div>
        </div>

        {/* 4. Sauna */}
        <div
          style={{
            background: 'linear-gradient(145deg, rgba(249, 115, 22, 0.12) 0%, rgba(15, 23, 42, 0.95) 100%)',
            border: '1px solid rgba(249, 115, 22, 0.3)',
            borderRadius: 16,
            padding: '16px 18px',
            boxShadow: '0 8px 24px rgba(249, 115, 22, 0.1)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>🧖‍♂️</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Sauna
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Löylytilan mittaus
                </div>
              </div>
            </div>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 12,
                background: 'rgba(249, 115, 22, 0.2)',
                color: '#f97316',
                border: '1px solid rgba(249, 115, 22, 0.3)',
              }}
            >
              Löylytila
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
            <div>
              <span style={{ fontSize: '2rem', fontWeight: 800, color: '#f97316', letterSpacing: '-0.02em' }}>
                {saunaSensor?.properties.temperature != null ? `${saunaSensor.properties.temperature} °C` : '--'}
              </span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
              {saunaSensor?.properties.humidity != null ? `💧 ${saunaSensor.properties.humidity} % RH` : ''}
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-muted)', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
            <span>Paristo: {saunaSensor?.properties.battery != null ? `${saunaSensor.properties.battery}%` : '--'}</span>
            <span>{saunaSensor?.properties.temperature && saunaSensor.properties.temperature > 50 ? '🔥 Lämmin' : 'Valmiustila'}</span>
          </div>
        </div>

        {/* 5. Autotalli */}
        {autotalliSensor && (
          <div
            style={{
              background: 'linear-gradient(145deg, rgba(148, 163, 184, 0.12) 0%, rgba(15, 23, 42, 0.95) 100%)',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              borderRadius: 16,
              padding: '16px 18px',
              boxShadow: '0 8px 24px rgba(148, 163, 184, 0.1)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>🚗</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                    Autotalli
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Autotallin anturi
                  </div>
                </div>
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 12,
                  background: 'rgba(148, 163, 184, 0.2)',
                  color: '#94a3b8',
                  border: '1px solid rgba(148, 163, 184, 0.3)',
                }}
              >
                Autotalli
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
              <div>
                <span style={{ fontSize: '2rem', fontWeight: 800, color: '#cbd5e1', letterSpacing: '-0.02em' }}>
                  {autotalliSensor.properties.temperature != null ? `${autotalliSensor.properties.temperature} °C` : '--'}
                </span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
                {autotalliSensor.properties.humidity != null ? `💧 ${autotalliSensor.properties.humidity} % RH` : ''}
              </div>
            </div>

            <div style={{ fontSize: 11, color: 'var(--text-muted)', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
              <span>Paristo: {autotalliSensor.properties.battery != null ? `${autotalliSensor.properties.battery}%` : '--'}</span>
              <span>{autotalliSensor.online ? 'Online' : 'Offline'}</span>
            </div>
          </div>
        )}

        {/* 6. Sijoitusasunto (Näytöllinen) */}
        {naytollinenSensor && (
          <div
            style={{
              background: 'linear-gradient(145deg, rgba(168, 85, 247, 0.12) 0%, rgba(15, 23, 42, 0.95) 100%)',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              borderRadius: 16,
              padding: '16px 18px',
              boxShadow: '0 8px 24px rgba(168, 85, 247, 0.1)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>🏢</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                    Sijoitusasunto
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Näytöllinen mittari (etäkohde)
                  </div>
                </div>
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 12,
                  background: 'rgba(168, 85, 247, 0.2)',
                  color: '#c084fc',
                  border: '1px solid rgba(168, 85, 247, 0.3)',
                }}
              >
                Etäkohde
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
              <div>
                <span style={{ fontSize: '2rem', fontWeight: 800, color: '#c084fc', letterSpacing: '-0.02em' }}>
                  {naytollinenSensor.properties.temperature != null ? `${naytollinenSensor.properties.temperature} °C` : '--'}
                </span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
                {naytollinenSensor.properties.humidity != null ? `💧 ${naytollinenSensor.properties.humidity} % RH` : ''}
              </div>
            </div>

            <div style={{ fontSize: 11, color: 'var(--text-muted)', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
              <span>Paristo: {naytollinenSensor.properties.battery != null ? `${naytollinenSensor.properties.battery}%` : '--'}</span>
              <span>{naytollinenSensor.online ? 'Online' : 'Offline'}</span>
            </div>
          </div>
        )}
      </div>

      {/* Main Climate Sensors Grid & Interactive History Graph Card */}
      <div className="card" style={{ background: 'linear-gradient(165deg, rgba(19, 29, 51, 0.95) 0%, rgba(10, 15, 29, 0.98) 100%)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: 18, padding: '20px' }}>
        <div className="card-header" style={{ flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="card-icon" style={{ fontSize: 22 }}>📊</span>
            <div>
              <span className="card-title" style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                Kaikki Lämpö- ja Kosteusanturit ({climateSensors.length} kpl)
              </span>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                Klikkaa mittaria tutkiaksesi sen lämpötila- ja kosteushistoriaa eri aikajaksoilla
              </div>
            </div>
          </div>
        </div>

        {/* Climate Sensors Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 20 }}>
          {climateSensors.map((d: TuyaDevice) => {
            const isSelected = selectedSensor?.id === d.id;
            const isApartment = d.name.toLowerCase().includes('naytollinen') || d.name.toLowerCase().includes('sijoitus');
            return (
              <div
                key={d.id}
                onClick={() => setSelectedSensor(d)}
                style={{
                  background: isSelected ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                  border: isSelected ? '2px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 14,
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  cursor: 'pointer',
                  transition: 'all 0.18s ease',
                  boxShadow: isSelected ? '0 0 16px rgba(56, 189, 248, 0.25)' : 'none',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 700, fontSize: 13.5, color: isSelected ? '#38bdf8' : 'var(--text-primary)' }}>
                      {d.name}
                    </span>
                    {isApartment && (
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        Etäkohde / sijoitusasunto
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {isSelected && (
                      <span style={{ fontSize: 10, color: '#38bdf8', background: 'rgba(56, 189, 248, 0.2)', padding: '2px 6px', borderRadius: 6, fontWeight: 700 }}>
                        Valittu
                      </span>
                    )}
                    {d.online ? (
                      <span style={{ fontSize: 10, color: '#4ade80', background: 'rgba(34, 197, 94, 0.12)', padding: '2px 6px', borderRadius: 10 }}>Online</span>
                    ) : (
                      <span style={{ fontSize: 10, color: '#f87171', background: 'rgba(239, 68, 68, 0.12)', padding: '2px 6px', borderRadius: 10 }}>Offline</span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
                  <div>
                    <span style={{ fontSize: 22, fontWeight: 800, color: '#fb923c' }}>
                      {d.properties.temperature != null ? `${d.properties.temperature} °C` : '--'}
                    </span>
                  </div>
                  <div style={{ fontSize: 13.5, color: '#38bdf8', fontWeight: 600 }}>
                    {d.properties.humidity != null ? `💧 ${d.properties.humidity} %` : ''}
                  </div>
                </div>

                {d.properties.battery != null && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 6, marginTop: 2 }}>
                    <span>🔋 Paristo:</span>
                    <span style={{ color: d.properties.battery > 30 ? 'var(--text-secondary)' : '#f87171', fontWeight: 600 }}>
                      {d.properties.battery} %
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Selected Sensor Deep Dive Graph Section */}
        {selectedSensor && (
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.35)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderRadius: 14,
              padding: '18px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            {/* Top Toolbar of Graph */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>📈</span>
                <div>
                  <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {selectedSensor.name} — Mittaushistoria
                  </span>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                    Aikajakso: <strong style={{ color: '#38bdf8' }}>{dateLabel}</strong>
                  </div>
                </div>
              </div>

              {/* Timeframe Presets */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { preset: 'today' as TemperatureHistoryPreset, label: 'Tänään' },
                  { preset: 'yesterday' as TemperatureHistoryPreset, label: 'Eilen' },
                  { preset: '2d' as TemperatureHistoryPreset, label: '2 pv' },
                  { preset: '7d' as TemperatureHistoryPreset, label: '7 pv' },
                  { preset: '14d' as TemperatureHistoryPreset, label: '14 pv' },
                  { preset: '30d' as TemperatureHistoryPreset, label: '30 pv' },
                ].map(({ preset, label }) => {
                  const isPresetActive = historyPreset === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setHistoryPreset(preset)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 600,
                        border: isPresetActive ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.08)',
                        background: isPresetActive ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255,255,255,0.04)',
                        color: isPresetActive ? '#38bdf8' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Day Navigator Stepper */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(255, 255, 255, 0.03)',
                padding: '8px 14px',
                borderRadius: 10,
                border: '1px solid rgba(255, 255, 255, 0.06)',
                flexWrap: 'wrap',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handlePrevDay}
                  title="Edellinen päivä"
                  style={{
                    padding: '5px 12px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  ◀ Edellinen päivä
                </button>

                <button
                  type="button"
                  onClick={handleNextDay}
                  title="Seuraava päivä"
                  disabled={selectedDate >= todayStr && historyPreset !== 'yesterday'}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: selectedDate >= todayStr && historyPreset !== 'yesterday' ? 'var(--text-muted)' : 'var(--text-primary)',
                    cursor: selectedDate >= todayStr && historyPreset !== 'yesterday' ? 'not-allowed' : 'pointer',
                  }}
                >
                  Seuraava päivä ▶
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedDate(todayStr);
                    setHistoryPreset('today');
                  }}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    background: historyPreset === 'today' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                    border: historyPreset === 'today' ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                    color: historyPreset === 'today' ? '#38bdf8' : 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  Tänään
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Valitse päivä:</span>
                <input
                  type="date"
                  max={todayStr}
                  value={historyPreset === 'today' ? todayStr : historyPreset === 'yesterday' ? (() => {
                    const y = new Date(); y.setDate(y.getDate() - 1); return toLocalDateString(y);
                  })() : selectedDate}
                  onChange={(e) => {
                    if (e.target.value) {
                      setSelectedDate(e.target.value);
                      setHistoryPreset(e.target.value === todayStr ? 'today' : 'day');
                    }
                  }}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    fontSize: 12,
                    background: 'rgba(15, 23, 42, 0.9)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: 'var(--text-primary)',
                    colorScheme: 'dark',
                    cursor: 'pointer',
                  }}
                />
              </div>
            </div>

            {/* Min / Max / Avg Summary Badges */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
              <div style={{ background: 'rgba(251, 146, 60, 0.08)', border: '1px solid rgba(251, 146, 60, 0.25)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 10.5, color: '#fb923c', fontWeight: 600 }}>Min lämpötila</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>
                  {minTemp !== null ? `${minTemp.toFixed(1)} °C` : '--'}
                </div>
              </div>

              <div style={{ background: 'rgba(251, 146, 60, 0.08)', border: '1px solid rgba(251, 146, 60, 0.25)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 10.5, color: '#fb923c', fontWeight: 600 }}>Max lämpötila</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>
                  {maxTemp !== null ? `${maxTemp.toFixed(1)} °C` : '--'}
                </div>
              </div>

              <div style={{ background: 'rgba(251, 146, 60, 0.08)', border: '1px solid rgba(251, 146, 60, 0.25)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 10.5, color: '#fb923c', fontWeight: 600 }}>Keskilämpö</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#fb923c', marginTop: 2 }}>
                  {avgTemp !== null ? `${avgTemp.toFixed(1)} °C` : '--'}
                </div>
              </div>

              <div style={{ background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 10.5, color: '#38bdf8', fontWeight: 600 }}>Min kosteus</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>
                  {minHumid !== null ? `${minHumid.toFixed(0)} %` : '--'}
                </div>
              </div>

              <div style={{ background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 10.5, color: '#38bdf8', fontWeight: 600 }}>Max kosteus</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>
                  {maxHumid !== null ? `${maxHumid.toFixed(0)} %` : '--'}
                </div>
              </div>

              <div style={{ background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 10.5, color: '#38bdf8', fontWeight: 600 }}>Keskikosteus</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#38bdf8', marginTop: 2 }}>
                  {avgHumid !== null ? `${avgHumid.toFixed(0)} %` : '--'}
                </div>
              </div>
            </div>

            {/* Recharts Line Graph */}
            <div style={{ width: '100%', height: 320, marginTop: 6, position: 'relative' }}>
              {historyLoading && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', borderRadius: 8, zIndex: 10 }}>
                  <span style={{ fontSize: 13, color: '#38bdf8', fontWeight: 600 }}>Ladataan mittausdataa...</span>
                </div>
              )}

              {historyData.length === 0 && !historyLoading ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  Ei mittaushistoriaa saatavilla valitulta ajanjaksolta.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={historyData} margin={{ top: 10, right: 15, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis
                      dataKey="time"
                      type="number"
                      domain={['dataMin', 'dataMax']}
                      scale="time"
                      tickFormatter={(val) => {
                        const d = new Date(val);
                        if (historyPreset === 'today' || historyPreset === 'yesterday' || historyPreset === 'day') {
                          return d.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
                        }
                        return `${d.getDate()}.${d.getMonth() + 1}. ${d.getHours()}:00`;
                      }}
                      stroke="var(--text-muted)"
                      fontSize={11}
                    />
                    <YAxis
                      yAxisId="left"
                      orientation="left"
                      stroke="#fb923c"
                      fontSize={11}
                      domain={['auto', 'auto']}
                      tickFormatter={(v) => `${v}°C`}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      stroke="#38bdf8"
                      fontSize={11}
                      domain={[0, 100]}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length && label) {
                          const dateObj = new Date(label);
                          const dateStr = dateObj.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric', year: 'numeric' });
                          const timeStr = dateObj.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
                          return (
                            <div style={{
                              background: 'rgba(15, 23, 42, 0.96)',
                              border: '1px solid rgba(255, 255, 255, 0.15)',
                              borderRadius: 8,
                              padding: '10px 14px',
                              boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                            }}>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                                {dateStr} klo {timeStr}
                              </div>
                              {payload.map((p, idx) => (
                                <div key={`tooltip-${idx}-${p.dataKey}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: p.color, fontWeight: 600 }}>
                                  <span>{p.dataKey === 'temperature' ? '🌡️ Lämpötila:' : '💧 Kosteus:'}</span>
                                  <span>{p.value != null ? `${Number(p.value).toFixed(1)} ${p.dataKey === 'temperature' ? '°C' : '%'}` : '--'}</span>
                                </div>
                              ))}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="temperature"
                      stroke="#fb923c"
                      strokeWidth={2.5}
                      dot={false}
                      name="Lämpötila (°C)"
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="humidity"
                      stroke="#38bdf8"
                      strokeWidth={2}
                      strokeDasharray="4 2"
                      dot={false}
                      name="Kosteus (%)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Leak & Door Environmental Security Sensors */}
      {(waterLeakSensors.length > 0 || doorSensors.length > 0) && (
        <div className="card" style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 16, padding: '18px 20px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🛡️</span> Turva- ja Ympäristöanturit (Vuoto- ja Ovianturit)
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {waterLeakSensors.map((d) => {
              const isLeak = Boolean(d.properties.watersensor_state === 'alarm' || d.properties.leak);
              return (
                <div
                  key={d.id}
                  style={{
                    background: isLeak ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                    border: isLeak ? '2px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: 12,
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: isLeak ? '#f87171' : 'var(--text-primary)' }}>
                      💧 {d.name}
                    </span>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: 10,
                      background: isLeak ? 'rgba(239, 68, 68, 0.25)' : 'rgba(34, 197, 94, 0.15)',
                      color: isLeak ? '#ef4444' : '#4ade80',
                    }}>
                      {isLeak ? '⚠️ VUOTOHÄLYTYS' : 'OK (Kuiva)'}
                    </span>
                  </div>
                  {d.properties.battery != null && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                      <span>Paristo:</span>
                      <span>{d.properties.battery} %</span>
                    </div>
                  )}
                </div>
              );
            })}

            {doorSensors.map((d) => {
              const isOpen = Boolean(d.properties.doorcontact_state || d.properties.contact === 'open');
              return (
                <div
                  key={d.id}
                  style={{
                    background: isOpen ? 'rgba(245, 158, 11, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                    border: isOpen ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: 12,
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
                      🚪 {d.name}
                    </span>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: 10,
                      background: isOpen ? 'rgba(245, 158, 11, 0.2)' : 'rgba(34, 197, 94, 0.12)',
                      color: isOpen ? '#fbbf24' : '#4ade80',
                    }}>
                      {isOpen ? 'AUKI' : 'SULJETTU'}
                    </span>
                  </div>
                  {d.properties.battery != null && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                      <span>Paristo:</span>
                      <span>{d.properties.battery} %</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
