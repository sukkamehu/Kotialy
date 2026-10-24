import React, { useState, useEffect, useMemo } from 'react';
import { useTuya } from '../hooks/useTuya';
import { useMitsubishi } from '../hooks/useMitsubishi';
import { apiFetch } from '../lib/api';
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

export interface SensorHistoryPoint {
  time: number;
  temperature?: number;
  humidity?: number;
  targetTemperature?: number;
}

export interface UnifiedClimateSensor {
  id: string;
  name: string;
  source: 'tuya' | 'mitsubishi';
  online: boolean;
  temperature: number | null;
  humidity?: number | null;
  targetTemperature?: number | null;
  battery?: number | null;
  mode?: string;
  action?: string;
  fanMode?: string;
  swingMode?: string;
  subtitle?: string;
  badge?: string;
  tempTopic: string;
  targetTempTopic?: string;
  humidTopic?: string;
  legacyTempTopic?: string;
  legacyHumidTopic?: string;
}

interface TemperaturesPageProps {
  state?: HeishamonState;
  readOnly?: boolean;
  onNavigateTab?: (tab: string) => void;
}

export const TemperaturesPage: React.FC<TemperaturesPageProps> = ({ state, onNavigateTab }) => {
  const { devices, loading, refreshing, refreshDevices } = useTuya();
  const { status: mitsuStatus, refresh: refreshMitsu } = useMitsubishi();

  const [selectedSensor, setSelectedSensor] = useState<UnifiedClimateSensor | null>(null);
  const [historyPreset, setHistoryPreset] = useState<TemperatureHistoryPreset>('today');
  const [selectedDate, setSelectedDate] = useState<string>(() => toLocalDateString());
  const [historyData, setHistoryData] = useState<SensorHistoryPoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);

  const todayStr = useMemo(() => toLocalDateString(), []);

  // Categorize Tuya devices
  const climateSensors = useMemo(() => devices.filter((d) => d.type === 'climate'), [devices]);
  const waterLeakSensors = useMemo(() => devices.filter((d) => d.type === 'water_leak'), [devices]);
  const doorSensors = useMemo(() => devices.filter((d) => d.type === 'door'), [devices]);

  // Mitsubishi units
  const mitsuAlakerta = mitsuStatus?.units.find((u) => u.id === 'mitsubishi_alakerta');
  const mitsuYlakerta = mitsuStatus?.units.find((u) => u.id === 'mitsubishi_ylakerta');

  // Key Tuya & Zigbee sensors
  const alakertaSensor = climateSensors.find((d) => d.name.toLowerCase().includes('alakerta'));
  const ylakertaSensor = climateSensors.find(
    (d) => d.name.toLowerCase().includes('ylakerta') || d.name.toLowerCase().includes('tyohuone') || d.name.toLowerCase().includes('työhuone')
  );
  const ulkoSensor = climateSensors.find(
    (d) => d.name.toLowerCase().includes('ulko') || d.name.toLowerCase().includes('ulkolampotila')
  );
  const saunaSensor = climateSensors.find((d) => d.name.toLowerCase().includes('sauna'));
  const isovarastoSensor = climateSensors.find(
    (d) => d.name.toLowerCase().includes('isovarasto')
  );
  const pikkuvarastoSensor = climateSensors.find(
    (d) => d.name.toLowerCase().includes('pikkuvarasto')
  );
  const autotalliSensor = climateSensors.find((d) => d.name.toLowerCase().includes('autotalli'));
  const naytollinenSensor = climateSensors.find(
    (d) => d.name.toLowerCase().includes('naytollinen') || d.name.toLowerCase().includes('sijoitus')
  );

  // Build unified climate sensors list (Tuya + Mitsubishi ILP)
  const unifiedSensors = useMemo<UnifiedClimateSensor[]>(() => {
    const list: UnifiedClimateSensor[] = [];

    // 1. Mitsubishi ILP Alakerta
    if (mitsuAlakerta) {
      list.push({
        id: 'mitsubishi_alakerta',
        name: 'Mitsubishi ILP Alakerta',
        source: 'mitsubishi',
        online: mitsuAlakerta.connected,
        temperature: mitsuAlakerta.currentTemperature,
        targetTemperature: mitsuAlakerta.targetTemperature,
        mode: mitsuAlakerta.mode,
        action: mitsuAlakerta.action,
        fanMode: mitsuAlakerta.fanMode,
        swingMode: mitsuAlakerta.swingMode,
        subtitle: `Pyynti ${mitsuAlakerta.targetTemperature != null ? mitsuAlakerta.targetTemperature + '°C' : '--'} · ${mitsuAlakerta.mode === 'HEAT' ? 'Lämmitys' : mitsuAlakerta.mode === 'COOL' ? 'Jäähdytys' : mitsuAlakerta.mode}`,
        badge: 'ILP Alakerta',
        tempTopic: 'mitsubishi/mitsubishi_alakerta/current_temperature',
        targetTempTopic: 'mitsubishi/mitsubishi_alakerta/target_temperature',
      });
    }

    // 2. Mitsubishi ILP Yläkerta
    if (mitsuYlakerta) {
      list.push({
        id: 'mitsubishi_ylakerta',
        name: 'Mitsubishi ILP Yläkerta',
        source: 'mitsubishi',
        online: mitsuYlakerta.connected,
        temperature: mitsuYlakerta.currentTemperature,
        targetTemperature: mitsuYlakerta.targetTemperature,
        mode: mitsuYlakerta.mode,
        action: mitsuYlakerta.action,
        fanMode: mitsuYlakerta.fanMode,
        swingMode: mitsuYlakerta.swingMode,
        subtitle: `Pyynti ${mitsuYlakerta.targetTemperature != null ? mitsuYlakerta.targetTemperature + '°C' : '--'} · ${mitsuYlakerta.mode === 'HEAT' ? 'Lämmitys' : mitsuYlakerta.mode === 'COOL' ? 'Jäähdytys' : mitsuYlakerta.mode}`,
        badge: 'ILP Yläkerta',
        tempTopic: 'mitsubishi/mitsubishi_ylakerta/current_temperature',
        targetTempTopic: 'mitsubishi/mitsubishi_ylakerta/target_temperature',
      });
    }

    // 3. Tuya & Zigbee climate sensors
    for (const d of climateSensors) {
      const lower = d.name.toLowerCase();
      // Skip redundant outdoor battery sensor entry if present (outdoor temp is measured by Panasonic VILP)
      if (lower.includes('ulko') || lower.includes('ulkolampotila')) continue;

      const slug = cleanTopicName(d.name);
      const legacySlug = d.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      const isApartment = lower.includes('naytollinen') || lower.includes('sijoitus');
      const isPikku = lower.includes('pikkuvarasto');
      const isIso = lower.includes('isovarasto');
      const isTyohuone = lower.includes('työhuone') || lower.includes('tyohuone');

      let badge = 'Zigbee';
      if (isApartment) badge = 'Etäkohde';
      else if (isPikku) badge = 'Pikkuvarasto';
      else if (isIso) badge = 'Isovarasto';
      else if (lower.includes('sauna')) badge = 'Sauna';
      else if (lower.includes('autotalli')) badge = 'Autotalli';
      else if (lower.includes('alakerta')) badge = 'Alakerta';
      else if (isTyohuone) badge = 'Työhuone';

      list.push({
        id: d.id,
        name: d.name,
        source: 'tuya',
        online: d.online,
        temperature: d.properties.temperature ?? null,
        humidity: d.properties.humidity ?? null,
        battery: d.properties.battery ?? null,
        badge,
        tempTopic: `tuya/${slug}/temperature`,
        humidTopic: `tuya/${slug}/humidity`,
        legacyTempTopic: `tuya/${legacySlug}/temperature`,
        legacyHumidTopic: `tuya/${legacySlug}/humidity`,
      });
    }

    return list;
  }, [mitsuAlakerta, mitsuYlakerta, climateSensors]);

  // Main house calculated average (Alakerta + Yläkerran työhuone / Mitsubishi ILP)
  const mainHouseAverage = useMemo(() => {
    const temps: number[] = [];
    const humids: number[] = [];

    const alakertaTemp = alakertaSensor?.properties.temperature ?? mitsuAlakerta?.currentTemperature;
    const ylakertaTemp = ylakertaSensor?.properties.temperature ?? mitsuYlakerta?.currentTemperature;

    if (alakertaTemp != null) temps.push(alakertaTemp);
    if (ylakertaTemp != null) temps.push(ylakertaTemp);
    if (alakertaSensor?.properties.humidity != null) humids.push(alakertaSensor.properties.humidity);
    if (ylakertaSensor?.properties.humidity != null) humids.push(ylakertaSensor.properties.humidity);

    const avgT = temps.length > 0 ? temps.reduce((a, b) => a + b, 0) / temps.length : null;
    const avgH = humids.length > 0 ? humids.reduce((a, b) => a + b, 0) / humids.length : null;

    return {
      temperature: avgT,
      humidity: avgH,
      count: temps.length,
    };
  }, [alakertaSensor, ylakertaSensor, mitsuAlakerta, mitsuYlakerta]);

  // Outside temperature: Panasonic VILP is the primary reliable measurement
  const panasonicOutsideTemp = state ? numVal(state, 'main/Outside_Temp') : null;
  const outsideDisplayTemp = panasonicOutsideTemp ?? ulkoSensor?.properties.temperature;

  // Auto-select first sensor (prefer Alakerta)
  useEffect(() => {
    if (!selectedSensor && unifiedSensors.length > 0) {
      const defaultSensor =
        unifiedSensors.find((s) => s.id === 'mitsubishi_alakerta') ||
        unifiedSensors.find((s) => s.name.toLowerCase().includes('alakerta')) ||
        unifiedSensors[0];
      setSelectedSensor(defaultSensor);
    } else if (selectedSensor) {
      const refreshed = unifiedSensors.find((s) => s.id === selectedSensor.id);
      if (refreshed && refreshed !== selectedSensor) {
        setSelectedSensor(refreshed);
      }
    }
  }, [unifiedSensors, selectedSensor]);

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

    let allTopics = '';
    if (selectedSensor.source === 'mitsubishi') {
      allTopics = [
        selectedSensor.tempTopic,
        `mitsubishi/${selectedSensor.id}/temperature`,
        selectedSensor.targetTempTopic,
      ].filter(Boolean).join(',');
    } else {
      const zName = selectedSensor.name;
      const norm = zName.toLowerCase();
      const isTyohuone = norm.includes('tyohuone') || norm.includes('työhuone');
      allTopics = Array.from(new Set([
        selectedSensor.tempTopic,
        selectedSensor.humidTopic,
        selectedSensor.legacyTempTopic,
        selectedSensor.legacyHumidTopic,
        `zigbee/${zName}/temperature`,
        `zigbee/${zName}/humidity`,
        isTyohuone ? 'zigbee/Työhuone/temperature' : null,
        isTyohuone ? 'zigbee/Työhuone/humidity' : null,
      ])).filter(Boolean).join(',');
    }

    apiFetch(`/api/history/multi?topics=${encodeURIComponent(allTopics)}&from=${fromMs}&to=${toMs}`)
      .then((res) => res.json())
      .then((json) => {
        if (!isMounted) return;
        const dataMap = json.data || {};
        const timeMap = new Map<number, SensorHistoryPoint>();

        if (selectedSensor.source === 'mitsubishi') {
          const tempRows = (dataMap[selectedSensor.tempTopic] || dataMap[`mitsubishi/${selectedSensor.id}/temperature`] || []);
          const targetRows = selectedSensor.targetTempTopic ? (dataMap[selectedSensor.targetTempTopic] || []) : [];

          for (const r of tempRows) {
            let v = Number(r.value);
            if (isNaN(v) || !isFinite(v)) continue;
            if (v < -20 || v > 50) continue;
            const t = Math.round(Number(r.recorded_at) / 60000) * 60000;
            const curr = timeMap.get(t) || { time: t };
            curr.temperature = Math.round(v * 10) / 10;
            timeMap.set(t, curr);
          }

          for (const r of targetRows) {
            let v = Number(r.value);
            if (isNaN(v) || !isFinite(v)) continue;
            if (v < 10 || v > 35) continue;
            const t = Math.round(Number(r.recorded_at) / 60000) * 60000;
            const curr = timeMap.get(t) || { time: t };
            curr.targetTemperature = Math.round(v * 10) / 10;
            timeMap.set(t, curr);
          }
        } else {
          const isSauna = selectedSensor.name.toLowerCase().includes('sauna');
          const isTyohuone = selectedSensor.name.toLowerCase().includes('tyohuone') || selectedSensor.name.toLowerCase().includes('työhuone');
          const tempRows = [
            ...(dataMap[selectedSensor.tempTopic] || []),
            ...(selectedSensor.legacyTempTopic && selectedSensor.legacyTempTopic !== selectedSensor.tempTopic ? dataMap[selectedSensor.legacyTempTopic] || [] : []),
            ...(dataMap[`zigbee/${selectedSensor.name}/temperature`] || []),
            ...(isTyohuone && dataMap['zigbee/Työhuone/temperature'] ? dataMap['zigbee/Työhuone/temperature'] : []),
          ];
          const humidRows = [
            ...(selectedSensor.humidTopic ? dataMap[selectedSensor.humidTopic] || [] : []),
            ...(selectedSensor.legacyHumidTopic && selectedSensor.legacyHumidTopic !== selectedSensor.humidTopic ? dataMap[selectedSensor.legacyHumidTopic] || [] : []),
            ...(dataMap[`zigbee/${selectedSensor.name}/humidity`] || []),
            ...(isTyohuone && dataMap['zigbee/Työhuone/humidity'] ? dataMap['zigbee/Työhuone/humidity'] : []),
          ];

          for (const r of tempRows) {
            let v = Number(r.value);
            if (isNaN(v) || !isFinite(v)) continue;
            if (v > 100 && v <= 1000) v = v / 10;
            if (isSauna) {
              if (v < -20 || v > 130) continue;
            } else {
              if (v < -30 || v > 45) continue;
            }
            const t = Math.round(Number(r.recorded_at) / 60000) * 60000;
            const curr = timeMap.get(t) || { time: t };
            curr.temperature = Math.round(v * 10) / 10;
            timeMap.set(t, curr);
          }

          for (const r of humidRows) {
            let v = Number(r.value);
            if (isNaN(v) || !isFinite(v)) continue;
            if (v > 100 && v <= 1000) v = v / 10;
            if (v > 100 && v <= 102) v = 100;
            if (v < 0 || v > 100) continue;
            const t = Math.round(Number(r.recorded_at) / 60000) * 60000;
            const curr = timeMap.get(t) || { time: t };
            curr.humidity = Math.round(v);
            timeMap.set(t, curr);
          }
        }

        let rawPoints: SensorHistoryPoint[] = Array.from(timeMap.values()).sort((a, b) => a.time - b.time);

        // Outlier spike filter on sequential series
        const isSauna = selectedSensor.name.toLowerCase().includes('sauna');
        if (!isSauna && rawPoints.length > 2) {
          rawPoints = rawPoints.map((pt, idx, arr) => {
            let temp = pt.temperature;
            let humid = pt.humidity;
            if (idx > 0 && idx < arr.length - 1) {
              const prev = arr[idx - 1];
              const next = arr[idx + 1];
              if (temp != null && prev.temperature != null && next.temperature != null) {
                const prevDiff = Math.abs(temp - prev.temperature);
                const nextDiff = Math.abs(temp - next.temperature);
                const baselineDiff = Math.abs(prev.temperature - next.temperature);
                // Isolated spike
                if (prevDiff >= 8 && nextDiff >= 8 && baselineDiff < 4) {
                  temp = Math.round(((prev.temperature + next.temperature) / 2) * 10) / 10;
                }
              }
              if (humid != null && prev.humidity != null && next.humidity != null) {
                const prevDiff = Math.abs(humid - prev.humidity);
                const nextDiff = Math.abs(humid - next.humidity);
                const baselineDiff = Math.abs(prev.humidity - next.humidity);
                if (prevDiff >= 30 && nextDiff >= 30 && baselineDiff < 15) {
                  humid = Math.round((prev.humidity + next.humidity) / 2);
                }
              }
            }
            return { ...pt, temperature: temp, humidity: humid };
          });
        }

        setHistoryData(rawPoints);
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

  const handleRefresh = async () => {
    await Promise.allSettled([refreshDevices(), refreshMitsu()]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginBottom: 40 }}>
      {/* Category Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>🌡️</span> Lämpömittarit & Sisäilma
          </h2>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 3 }}>
            Päärakennuksen ja ulkorakennusten lämpötila- ja kosteusvalvonta, Mitsubishi ILP -integraatio ja reaaliaikainen mittaushistoria
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={handleRefresh}
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

      {/* Hero Overview Cards: Main house average, Mitsubishi ILPs & key spots */}
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
                  Alakerta + Yläkerta keskiarvo
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, color: 'var(--text-muted)', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Alakerta:</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {alakertaSensor?.properties.temperature != null ? (
                  <span>Tuya <strong style={{ color: '#fb923c' }}>{alakertaSensor.properties.temperature} °C</strong></span>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>Tuya ei käytössä</span>
                )}
                {mitsuAlakerta?.currentTemperature != null && (
                  <span style={{ background: 'rgba(56, 189, 248, 0.12)', padding: '1px 6px', borderRadius: 4, border: '1px solid rgba(56, 189, 248, 0.25)' }}>
                    🛋️ ILP <strong style={{ color: '#38bdf8' }}>{mitsuAlakerta.currentTemperature.toFixed(1)} °C</strong>
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Työhuone / Yläkerta:</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {ylakertaSensor?.properties.temperature != null ? (
                  <span>Tuya <strong style={{ color: '#fb923c' }}>{ylakertaSensor.properties.temperature} °C</strong></span>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>Tuya ei käytössä</span>
                )}
                {mitsuYlakerta?.currentTemperature != null && (
                  <span style={{ background: 'rgba(56, 189, 248, 0.12)', padding: '1px 6px', borderRadius: 4, border: '1px solid rgba(56, 189, 248, 0.25)' }}>
                    🏠 ILP <strong style={{ color: '#38bdf8' }}>{mitsuYlakerta.currentTemperature.toFixed(1)} °C</strong>
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 2. Alakerta Mitsubishi ILP */}
        <div
          onClick={() => {
            const s = unifiedSensors.find((x) => x.id === 'mitsubishi_alakerta');
            if (s) setSelectedSensor(s);
          }}
          style={{
            background: 'linear-gradient(145deg, rgba(14, 165, 233, 0.14) 0%, rgba(15, 23, 42, 0.95) 100%)',
            border: selectedSensor?.id === 'mitsubishi_alakerta' ? '2px solid #38bdf8' : '1px solid rgba(14, 165, 233, 0.35)',
            borderRadius: 16,
            padding: '16px 18px',
            boxShadow: '0 8px 24px rgba(14, 165, 233, 0.12)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 10,
            cursor: 'pointer',
            transition: 'all 0.18s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>🛋️</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Alakerta (Mitsubishi ILP)
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Ilmalämpöpumppu & Mittaus
                </div>
              </div>
            </div>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 12,
                background: 'rgba(14, 165, 233, 0.2)',
                color: '#38bdf8',
                border: '1px solid rgba(14, 165, 233, 0.3)',
              }}
            >
              Pyynti {mitsuAlakerta?.targetTemperature != null ? `${mitsuAlakerta.targetTemperature} °C` : '--'}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
            <div>
              <span style={{ fontSize: '2rem', fontWeight: 800, color: '#38bdf8', letterSpacing: '-0.02em' }}>
                {mitsuAlakerta?.currentTemperature != null ? `${mitsuAlakerta.currentTemperature.toFixed(1)} °C` : '--'}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
              {mitsuAlakerta?.mode === 'HEAT' ? '🔥 Lämmittää' : mitsuAlakerta?.mode === 'COOL' ? '❄️ Jäähdyttää' : mitsuAlakerta?.mode ?? 'Valmiustila'}
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-muted)', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
            <span>Tuya: {alakertaSensor?.properties.temperature != null ? `${alakertaSensor.properties.temperature}°C` : 'Ei anturia'}</span>
            <span style={{ color: mitsuAlakerta?.connected ? '#4ade80' : '#f87171' }}>
              {mitsuAlakerta?.connected ? '● Online (WiFi)' : '○ Offline'}
            </span>
          </div>
        </div>

        {/* 3. Yläkerta Mitsubishi ILP */}
        <div
          onClick={() => {
            const s = unifiedSensors.find((x) => x.id === 'mitsubishi_ylakerta');
            if (s) setSelectedSensor(s);
          }}
          style={{
            background: 'linear-gradient(145deg, rgba(168, 85, 247, 0.14) 0%, rgba(15, 23, 42, 0.95) 100%)',
            border: selectedSensor?.id === 'mitsubishi_ylakerta' ? '2px solid #c084fc' : '1px solid rgba(168, 85, 247, 0.35)',
            borderRadius: 16,
            padding: '16px 18px',
            boxShadow: '0 8px 24px rgba(168, 85, 247, 0.12)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 10,
            cursor: 'pointer',
            transition: 'all 0.18s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>🏠</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Yläkerta (Mitsubishi ILP)
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Ilmalämpöpumppu & Työhuone
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
              Pyynti {mitsuYlakerta?.targetTemperature != null ? `${mitsuYlakerta.targetTemperature} °C` : '--'}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
            <div>
              <span style={{ fontSize: '2rem', fontWeight: 800, color: '#c084fc', letterSpacing: '-0.02em' }}>
                {mitsuYlakerta?.currentTemperature != null ? `${mitsuYlakerta.currentTemperature.toFixed(1)} °C` : '--'}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
              {mitsuYlakerta?.mode === 'HEAT' ? '🔥 Lämmittää' : mitsuYlakerta?.mode === 'COOL' ? '❄️ Jäähdyttää' : mitsuYlakerta?.mode ?? 'Valmiustila'}
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-muted)', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
            <span>Työhuone: {ylakertaSensor?.properties.temperature != null ? `${ylakertaSensor.properties.temperature}°C` : 'Ei anturia'}</span>
            <span style={{ color: mitsuYlakerta?.connected ? '#4ade80' : '#f87171' }}>
              {mitsuYlakerta?.connected ? '● Online (WiFi)' : '○ Offline'}
            </span>
          </div>
        </div>

        {/* 4. Ulkoilma */}
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
                  Panasonic VILP
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
              Panasonic VILP
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
            <div>
              <span style={{ fontSize: '2rem', fontWeight: 800, color: '#4ade80', letterSpacing: '-0.02em' }}>
                {panasonicOutsideTemp !== null ? `${panasonicOutsideTemp.toFixed(1)} °C` : (outsideDisplayTemp != null ? `${outsideDisplayTemp.toFixed(1)} °C` : '--')}
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#4ade80', fontWeight: 600 }}>
              {panasonicOutsideTemp !== null ? '● Luotettava VILP' : ''}
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-muted)', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
            <span>Lähde: WH-MXC12J9E8</span>
            <span style={{ color: panasonicOutsideTemp !== null ? '#4ade80' : 'var(--text-muted)' }}>
              {panasonicOutsideTemp !== null ? '● Aktiivinen' : '○ Ei dataa'}
            </span>
          </div>
        </div>

        {/* 5. Isovarasto */}
        <div
          onClick={() => {
            const s = unifiedSensors.find((x) => x.name.toLowerCase().includes('isovarasto'));
            if (s) setSelectedSensor(s);
          }}
          style={{
            background: 'linear-gradient(145deg, rgba(245, 158, 11, 0.12) 0%, rgba(15, 23, 42, 0.95) 100%)',
            border: selectedSensor?.name.toLowerCase().includes('isovarasto') ? '2px solid #fbbf24' : '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: 16,
            padding: '16px 18px',
            boxShadow: '0 8px 24px rgba(245, 158, 11, 0.1)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 10,
            cursor: 'pointer',
            transition: 'all 0.18s ease',
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
              Isovarasto
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

        {/* 6. Pikkuvarasto */}
        <div
          onClick={() => {
            const s = unifiedSensors.find((x) => x.name.toLowerCase().includes('pikkuvarasto'));
            if (s) setSelectedSensor(s);
          }}
          style={{
            background: 'linear-gradient(145deg, rgba(249, 115, 22, 0.12) 0%, rgba(15, 23, 42, 0.95) 100%)',
            border: selectedSensor?.name.toLowerCase().includes('pikkuvarasto') ? '2px solid #f97316' : '1px solid rgba(249, 115, 22, 0.3)',
            borderRadius: 16,
            padding: '16px 18px',
            boxShadow: '0 8px 24px rgba(249, 115, 22, 0.1)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 10,
            cursor: 'pointer',
            transition: 'all 0.18s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>📦</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Pikkuvarasto
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
                background: 'rgba(249, 115, 22, 0.2)',
                color: '#f97316',
                border: '1px solid rgba(249, 115, 22, 0.3)',
              }}
            >
              Pikkuvarasto
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
            <div>
              <span style={{ fontSize: '2rem', fontWeight: 800, color: '#f97316', letterSpacing: '-0.02em' }}>
                {pikkuvarastoSensor?.properties.temperature != null ? `${pikkuvarastoSensor.properties.temperature} °C` : '--'}
              </span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
              {pikkuvarastoSensor?.properties.humidity != null ? `💧 ${pikkuvarastoSensor.properties.humidity} % RH` : ''}
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-muted)', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
            <span>Paristo: {pikkuvarastoSensor?.properties.battery != null ? `${pikkuvarastoSensor.properties.battery}%` : '--'}</span>
            <span style={{ color: '#4ade80' }}>Pakkassuoja aktiivinen</span>
          </div>
        </div>

        {/* 7. Sauna */}
        <div
          onClick={() => {
            const s = unifiedSensors.find((x) => x.name.toLowerCase().includes('sauna'));
            if (s) setSelectedSensor(s);
          }}
          style={{
            background: 'linear-gradient(145deg, rgba(239, 68, 68, 0.12) 0%, rgba(15, 23, 42, 0.95) 100%)',
            border: selectedSensor?.name.toLowerCase().includes('sauna') ? '2px solid #ef4444' : '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 16,
            padding: '16px 18px',
            boxShadow: '0 8px 24px rgba(239, 68, 68, 0.1)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 10,
            cursor: 'pointer',
            transition: 'all 0.18s ease',
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
                background: 'rgba(239, 68, 68, 0.2)',
                color: '#f87171',
                border: '1px solid rgba(239, 68, 68, 0.3)',
              }}
            >
              Löylytila
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
            <div>
              <span style={{ fontSize: '2rem', fontWeight: 800, color: '#f87171', letterSpacing: '-0.02em' }}>
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

        {/* 8. Autotalli */}
        {autotalliSensor && (
          <div
            onClick={() => {
              const s = unifiedSensors.find((x) => x.name.toLowerCase().includes('autotalli'));
              if (s) setSelectedSensor(s);
            }}
            style={{
              background: 'linear-gradient(145deg, rgba(148, 163, 184, 0.12) 0%, rgba(15, 23, 42, 0.95) 100%)',
              border: selectedSensor?.name.toLowerCase().includes('autotalli') ? '2px solid #94a3b8' : '1px solid rgba(148, 163, 184, 0.3)',
              borderRadius: 16,
              padding: '16px 18px',
              boxShadow: '0 8px 24px rgba(148, 163, 184, 0.1)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: 10,
              cursor: 'pointer',
              transition: 'all 0.18s ease',
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

        {/* 8. Sijoitusasunto (Näytöllinen) */}
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
                Kaikki Lämpö- ja Kosteusanturit ({unifiedSensors.length} kpl)
              </span>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                Klikkaa mittaria tai ilmalämpöpumppua tutkiaksesi sen lämpötila- ja mittaushistoriaa eri aikajaksoilla
              </div>
            </div>
          </div>
          {onNavigateTab && (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => onNavigateTab('heating')}
              style={{
                fontSize: 12,
                borderRadius: 8,
                border: '1px solid rgba(56, 189, 248, 0.3)',
                background: 'rgba(56, 189, 248, 0.1)',
                color: '#38bdf8',
                cursor: 'pointer',
                fontWeight: 600,
                padding: '5px 12px',
              }}
            >
              Säädä pumppuja ⚙️
            </button>
          )}
        </div>

        {/* Unified Climate Sensors Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12, marginBottom: 20 }}>
          {unifiedSensors.map((sensor) => {
            const isSelected = selectedSensor?.id === sensor.id;
            const isMitsu = sensor.source === 'mitsubishi';
            const isApartment = sensor.name.toLowerCase().includes('naytollinen') || sensor.name.toLowerCase().includes('sijoitus');

            return (
              <div
                key={sensor.id}
                onClick={() => setSelectedSensor(sensor)}
                style={{
                  background: isSelected
                    ? (isMitsu ? 'rgba(14, 165, 233, 0.15)' : 'rgba(56, 189, 248, 0.12)')
                    : (isMitsu ? 'rgba(14, 165, 233, 0.04)' : 'rgba(255, 255, 255, 0.03)'),
                  border: isSelected
                    ? (isMitsu ? '2px solid #0284c7' : '2px solid #38bdf8')
                    : (isMitsu ? '1px solid rgba(14, 165, 233, 0.25)' : '1px solid rgba(255, 255, 255, 0.08)'),
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
                    <span style={{ fontWeight: 700, fontSize: 13.5, color: isSelected ? '#38bdf8' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                      {isMitsu ? (sensor.id.includes('alakerta') ? '🛋️' : '🏠') : '🌡️'} {sensor.name}
                    </span>
                    <span style={{ fontSize: 10, color: isMitsu ? '#38bdf8' : 'var(--text-muted)', fontStyle: isApartment ? 'italic' : 'normal' }}>
                      {sensor.subtitle || sensor.badge || (isApartment ? 'Etäkohde / sijoitusasunto' : 'Tuya Zigbee')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {isSelected && (
                      <span style={{ fontSize: 10, color: '#38bdf8', background: 'rgba(56, 189, 248, 0.2)', padding: '2px 6px', borderRadius: 6, fontWeight: 700 }}>
                        Valittu
                      </span>
                    )}
                    {sensor.online ? (
                      <span style={{ fontSize: 10, color: '#4ade80', background: 'rgba(34, 197, 94, 0.12)', padding: '2px 6px', borderRadius: 10 }}>Online</span>
                    ) : (
                      <span style={{ fontSize: 10, color: '#f87171', background: 'rgba(239, 68, 68, 0.12)', padding: '2px 6px', borderRadius: 10 }}>Offline</span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
                  <div>
                    <span style={{ fontSize: 22, fontWeight: 800, color: isMitsu ? '#38bdf8' : '#fb923c' }}>
                      {sensor.temperature != null ? `${sensor.temperature.toFixed(1)} °C` : '--'}
                    </span>
                  </div>
                  {isMitsu ? (
                    <div style={{ fontSize: 12.5, color: '#f59e0b', fontWeight: 600 }}>
                      Pyynti {sensor.targetTemperature != null ? `${sensor.targetTemperature}°C` : '--'}
                    </div>
                  ) : (
                    <div style={{ fontSize: 13.5, color: '#38bdf8', fontWeight: 600 }}>
                      {sensor.humidity != null ? `💧 ${sensor.humidity} %` : ''}
                    </div>
                  )}
                </div>

                {isMitsu ? (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 6, marginTop: 2 }}>
                    <span>Tila: <strong style={{ color: 'var(--text-secondary)' }}>{sensor.mode === 'HEAT' ? 'Lämmitys' : sensor.mode === 'COOL' ? 'Jäähdytys' : sensor.mode ?? 'AUTO'}</strong></span>
                    <span>Puhallin: <strong style={{ color: 'var(--text-secondary)' }}>{sensor.fanMode ?? 'AUTO'}</strong></span>
                  </div>
                ) : (
                  sensor.battery != null && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 6, marginTop: 2 }}>
                      <span>🔋 Paristo:</span>
                      <span style={{ color: sensor.battery > 30 ? 'var(--text-secondary)' : '#f87171', fontWeight: 600 }}>
                        {sensor.battery} %
                      </span>
                    </div>
                  )
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
                    {selectedSensor.source === 'mitsubishi' && ' · Huonelämpötila & Asetuspyynti'}
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
              <div style={{ background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 10.5, color: '#38bdf8', fontWeight: 600 }}>Min lämpötila</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>
                  {minTemp !== null ? `${minTemp.toFixed(1)} °C` : '--'}
                </div>
              </div>

              <div style={{ background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 10.5, color: '#38bdf8', fontWeight: 600 }}>Max lämpötila</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>
                  {maxTemp !== null ? `${maxTemp.toFixed(1)} °C` : '--'}
                </div>
              </div>

              <div style={{ background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 10.5, color: '#38bdf8', fontWeight: 600 }}>Keskilämpö</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#38bdf8', marginTop: 2 }}>
                  {avgTemp !== null ? `${avgTemp.toFixed(1)} °C` : '--'}
                </div>
              </div>

              {selectedSensor.source === 'mitsubishi' ? (
                <>
                  <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ fontSize: 10.5, color: '#fbbf24', fontWeight: 600 }}>Pyyntilämpötila</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#fbbf24', marginTop: 2 }}>
                      {selectedSensor.targetTemperature != null ? `${selectedSensor.targetTemperature} °C` : '--'}
                    </div>
                  </div>

                  <div style={{ background: 'rgba(168, 85, 247, 0.08)', border: '1px solid rgba(168, 85, 247, 0.25)', borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ fontSize: 10.5, color: '#c084fc', fontWeight: 600 }}>Käyttötila</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>
                      {selectedSensor.mode === 'HEAT' ? 'Lämmitys' : selectedSensor.mode === 'COOL' ? 'Jäähdytys' : selectedSensor.mode ?? 'AUTO'}
                    </div>
                  </div>

                  <div style={{ background: 'rgba(168, 85, 247, 0.08)', border: '1px solid rgba(168, 85, 247, 0.25)', borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ fontSize: 10.5, color: '#c084fc', fontWeight: 600 }}>Puhallusnopeus</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>
                      {selectedSensor.fanMode ?? 'AUTO'}
                    </div>
                  </div>
                </>
              ) : (
                <>
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
                </>
              )}
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
                      stroke={selectedSensor.source === 'mitsubishi' ? '#38bdf8' : '#fb923c'}
                      fontSize={11}
                      domain={['auto', 'auto']}
                      tickFormatter={(v) => `${v}°C`}
                    />
                    {selectedSensor.source !== 'mitsubishi' && (
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        stroke="#38bdf8"
                        fontSize={11}
                        domain={[0, 100]}
                        tickFormatter={(v) => `${v}%`}
                      />
                    )}
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
                              {payload.map((p, idx) => {
                                const isTarget = p.dataKey === 'targetTemperature';
                                const isTemp = p.dataKey === 'temperature';
                                const labelText = isTarget ? '🎯 Asetuspyynti:' : isTemp ? '🌡️ Huonelämpö:' : '💧 Kosteus:';
                                const unit = p.dataKey === 'humidity' ? '%' : '°C';
                                return (
                                  <div key={`tooltip-${idx}-${p.dataKey}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: p.color, fontWeight: 600 }}>
                                    <span>{labelText}</span>
                                    <span>{p.value != null ? `${Number(p.value).toFixed(1)} ${unit}` : '--'}</span>
                                  </div>
                                );
                              })}
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
                      stroke={selectedSensor.source === 'mitsubishi' ? '#38bdf8' : '#fb923c'}
                      strokeWidth={2.5}
                      dot={false}
                      name={selectedSensor.source === 'mitsubishi' ? 'Huonelämpötila (°C)' : 'Lämpötila (°C)'}
                    />
                    {selectedSensor.source === 'mitsubishi' ? (
                      <Line
                        yAxisId="left"
                        type="stepAfter"
                        dataKey="targetTemperature"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        strokeDasharray="4 3"
                        dot={false}
                        connectNulls={true}
                        name="Asetuspyynti (°C)"
                      />
                    ) : (
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
                    )}
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
