import { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { apiFetch } from '../lib/api';
import type { HerrforsAnalyticsResponse, HerrforsDailyItem, HerrforsDataPoint } from '../types/herrfors';

const MONTH_NAMES_FI = [
  'Tammikuu',
  'Helmikuu',
  'Maaliskuu',
  'Huhtikuu',
  'Toukokuu',
  'Kesäkuu',
  'Heinäkuu',
  'Elokuu',
  'Syyskuu',
  'Lokakuu',
  'Marraskuu',
  'Joulukuu',
];

const WEEKDAY_NAMES_FI = ['Ma', 'Ti', 'Ke', 'To', 'Pe', 'La', 'Su'];

function getMonthDateRange(year: number, monthIndex: number): { fromMs: number; toMs: number; daysInMonth: number } {
  // monthIndex is 0-indexed (0 = Jan, 11 = Dec)
  const from = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const to = new Date(year, monthIndex, daysInMonth, 23, 59, 59, 999);
  return {
    fromMs: from.getTime(),
    toMs: to.getTime(),
    daysInMonth,
  };
}

function formatLocalDate(year: number, monthIndex: number, day: number): string {
  const m = String(monthIndex + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

export function ElectricityCalendarCard() {
  const today = useMemo(() => new Date(), []);
  const [currentYear, setCurrentYear] = useState<number>(() => today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(() => today.getMonth());
  const [data, setData] = useState<HerrforsAnalyticsResponse | null>(null);
  const [saunaSessions, setSaunaSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDayStr, setSelectedDayStr] = useState<string | null>(null);

  const { fromMs, toMs, daysInMonth } = useMemo(
    () => getMonthDateRange(currentYear, currentMonth),
    [currentYear, currentMonth]
  );

  const isCurrentMonth = currentYear === today.getFullYear() && currentMonth === today.getMonth();

  // Fetch monthly analytics data & sauna sessions
  useEffect(() => {
    let isCancelled = false;
    setLoading(true);

    Promise.all([
      apiFetch(`/api/herrfors/analytics?from=${fromMs}&to=${toMs}`).then((res) => {
        if (!res.ok) throw new Error('Virhe haettaessa kuukausidataa');
        return res.json();
      }),
      apiFetch('/api/sauna/sessions?limit=100').then((res) => {
        if (!res.ok) return { sessions: [] };
        return res.json();
      }).catch(() => ({ sessions: [] })),
    ])
      .then(([resData, saunaData]) => {
        if (!isCancelled) {
          setData(resData);
          setSaunaSessions(saunaData.sessions || []);
          setLoading(false);

          // Select today if in current month, otherwise last available day with data or 1st day
          if (isCurrentMonth) {
            const todayStr = formatLocalDate(today.getFullYear(), today.getMonth(), today.getDate());
            setSelectedDayStr(todayStr);
          } else if (resData.daily && resData.daily.length > 0) {
            setSelectedDayStr(resData.daily[resData.daily.length - 1].date);
          } else {
            setSelectedDayStr(formatLocalDate(currentYear, currentMonth, 1));
          }
        }
      })
      .catch((err) => {
        console.error('Failed to load electricity calendar data:', err);
        if (!isCancelled) setLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [fromMs, toMs, currentYear, currentMonth, isCurrentMonth, today]);

  // Navigate to previous month
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentYear((prev) => prev - 1);
      setCurrentMonth(11);
    } else {
      setCurrentMonth((prev) => prev - 1);
    }
  };

  // Navigate to next month
  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentYear((prev) => prev + 1);
      setCurrentMonth(0);
    } else {
      setCurrentMonth((prev) => prev + 1);
    }
  };

  // Jump to current month
  const handleJumpToCurrentMonth = () => {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
  };

  // Daily map lookup
  const dailyMap = useMemo(() => {
    const map = new Map<string, HerrforsDailyItem>();
    if (data?.daily) {
      for (const item of data.daily) {
        map.set(item.date, item);
      }
    }
    return map;
  }, [data]);

  // Sauna sessions lookup by date (YYYY-MM-DD)
  const saunaSessionsByDate = useMemo(() => {
    const map = new Map<string, any>();
    if (saunaSessions && saunaSessions.length > 0) {
      for (const s of saunaSessions) {
        const time = s.start_time || s.startTime;
        if (time) {
          const d = new Date(time);
          const dateStr = formatLocalDate(d.getFullYear(), d.getMonth(), d.getDate());
          map.set(dateStr, s);
        }
      }
    }
    return map;
  }, [saunaSessions]);

  // Monthly summary stats
  const summary = data?.summary;

  // Compute calendar grid cells (Monday-first)
  const calendarCells = useMemo(() => {
    // Determine weekday of 1st day of month: 0=Sun, 1=Mon, ..., 6=Sat
    const firstDayDate = new Date(currentYear, currentMonth, 1);
    let firstWeekday = firstDayDate.getDay(); // 0 is Sun, 1 is Mon
    // Convert to Monday=0, Sunday=6
    firstWeekday = firstWeekday === 0 ? 6 : firstWeekday - 1;

    const cells: Array<{
      dayNumber: number;
      dateStr: string;
      isCurrentMonth: boolean;
      dailyData?: HerrforsDailyItem;
      saunaSession?: any;
      isSaunaDay?: boolean;
    }> = [];

    // Preceding empty/inactive cells
    for (let i = 0; i < firstWeekday; i++) {
      const prevDate = new Date(currentYear, currentMonth, 1 - (firstWeekday - i));
      const pStr = formatLocalDate(prevDate.getFullYear(), prevDate.getMonth(), prevDate.getDate());
      cells.push({
        dayNumber: prevDate.getDate(),
        dateStr: pStr,
        isCurrentMonth: false,
      });
    }

    // Days of current month
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = formatLocalDate(currentYear, currentMonth, d);
      const dItem = dailyMap.get(dateStr);
      const sSession = saunaSessionsByDate.get(dateStr);
      const isSauna = Boolean(sSession || (dItem?.sauna_kwh && dItem.sauna_kwh > 0.5));
      cells.push({
        dayNumber: d,
        dateStr,
        isCurrentMonth: true,
        dailyData: dItem,
        saunaSession: sSession,
        isSaunaDay: isSauna,
      });
    }

    // Trailing cells to fill full 7-day rows
    const totalCells = Math.ceil(cells.length / 7) * 7;
    let nextDay = 1;
    while (cells.length < totalCells) {
      const nextDate = new Date(currentYear, currentMonth + 1, nextDay);
      const nStr = formatLocalDate(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate());
      cells.push({
        dayNumber: nextDay,
        dateStr: nStr,
        isCurrentMonth: false,
      });
      nextDay++;
    }

    return cells;
  }, [currentYear, currentMonth, daysInMonth, dailyMap, saunaSessionsByDate]);

  // Find max consumption for color scaling
  const maxDailyKwh = useMemo(() => {
    let max = 0;
    if (data?.daily) {
      for (const item of data.daily) {
        if (item.house_kwh > max) max = item.house_kwh;
      }
    }
    return max > 0 ? max : 50;
  }, [data]);

  // Selected day data & hourly series
  const selectedDailyItem = useMemo(() => {
    if (!selectedDayStr) return null;
    return dailyMap.get(selectedDayStr) || null;
  }, [selectedDayStr, dailyMap]);

  const selectedDayHourlySeries = useMemo(() => {
    if (!data?.series || !selectedDayStr) return [];
    return data.series
      .filter((pt) => pt.date_str === selectedDayStr)
      .map((pt) => {
        const timeObj = new Date(pt.time);
        const hourStr = `${String(timeObj.getHours()).padStart(2, '0')}:${String(timeObj.getMinutes()).padStart(2, '0')}`;
        return {
          ...pt,
          timeLabel: hourStr,
          heatpump_kwh: pt.heatpump_kwh ?? 0,
          sauna_kwh: pt.sauna_kwh ?? 0,
          tapo_kwh: pt.tapo_kwh ?? 0,
          other_kwh: pt.other_kwh ?? 0,
          price_cents: pt.full_price_cents ?? pt.price_cents ?? 0,
        };
      });
  }, [data, selectedDayStr]);

  // Sauna days count in current month
  const saunaDaysCount = useMemo(() => {
    return calendarCells.filter((c) => c.isCurrentMonth && c.isSaunaDay).length;
  }, [calendarCells]);

  // Selected cell helper
  const selectedCell = useMemo(() => {
    if (!selectedDayStr) return null;
    return calendarCells.find((c) => c.dateStr === selectedDayStr) || null;
  }, [selectedDayStr, calendarCells]);

  // Best / Worst consumption days
  const { maxDay, minDay, avgKwhPerDay } = useMemo(() => {
    if (!data?.daily || data.daily.length === 0) {
      return { maxDay: null, minDay: null, avgKwhPerDay: 0 };
    }
    const daysWithData = data.daily.filter((d) => d.house_kwh > 0);
    if (daysWithData.length === 0) {
      return { maxDay: null, minDay: null, avgKwhPerDay: 0 };
    }
    let max = daysWithData[0];
    let min = daysWithData[0];
    let sum = 0;
    for (const d of daysWithData) {
      sum += d.house_kwh;
      if (d.house_kwh > max.house_kwh) max = d;
      if (d.house_kwh < min.house_kwh) min = d;
    }
    return {
      maxDay: max,
      minDay: min,
      avgKwhPerDay: Number((sum / daysWithData.length).toFixed(1)),
    };
  }, [data]);

  // Helper for heatmap badge style
  const getConsumptionHeatStyle = (kwh: number | undefined) => {
    if (kwh === undefined || kwh === 0) {
      return {
        bg: 'var(--bg-card)',
        border: 'var(--border-subtle)',
        badgeBg: 'rgba(255, 255, 255, 0.05)',
        badgeColor: 'var(--text-muted)',
      };
    }
    // Intensity scaling
    const ratio = Math.min(1, kwh / Math.max(45, maxDailyKwh));
    if (ratio < 0.3) {
      return {
        bg: 'rgba(16, 185, 129, 0.08)',
        border: 'rgba(16, 185, 129, 0.25)',
        badgeBg: 'rgba(16, 185, 129, 0.2)',
        badgeColor: '#10b981',
      };
    }
    if (ratio < 0.6) {
      return {
        bg: 'rgba(59, 130, 246, 0.08)',
        border: 'rgba(59, 130, 246, 0.25)',
        badgeBg: 'rgba(59, 130, 246, 0.2)',
        badgeColor: '#3b82f6',
      };
    }
    if (ratio < 0.85) {
      return {
        bg: 'rgba(245, 158, 11, 0.09)',
        border: 'rgba(245, 158, 11, 0.28)',
        badgeBg: 'rgba(245, 158, 11, 0.22)',
        badgeColor: '#f59e0b',
      };
    }
    return {
      bg: 'rgba(239, 68, 68, 0.12)',
      border: 'rgba(239, 68, 68, 0.35)',
      badgeBg: 'rgba(239, 68, 68, 0.25)',
      badgeColor: '#ef4444',
    };
  };

  return (
    <div className="card" style={{ padding: 20 }}>
      {/* 1. Header & Month Navigator */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.4rem' }}>📅</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Kokonaissähkön Kalenterinäkymä & Tilastot
              </h3>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                Koko kiinteistön sähkönkäyttö (Herrfors), kustannukset ja päivittäiset laitejakaumat
              </div>
            </div>
          </div>
        </div>

        {/* Month Selector Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-page)', padding: '4px 8px', borderRadius: 12, border: '1px solid var(--border-subtle)' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={handlePrevMonth}
            title="Edellinen kuukausi"
            style={{ padding: '6px 12px', fontSize: '1rem', fontWeight: 700 }}
          >
            ‹
          </button>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', minWidth: 140, textAlign: 'center', color: 'var(--text-primary)' }}>
            {MONTH_NAMES_FI[currentMonth]} {currentYear}
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleNextMonth}
            title="Seuraava kuukausi"
            style={{ padding: '6px 12px', fontSize: '1rem', fontWeight: 700 }}
          >
            ›
          </button>
          {!isCurrentMonth && (
            <button
              className="btn btn-primary btn-sm"
              onClick={handleJumpToCurrentMonth}
              style={{ fontSize: '0.75rem', padding: '4px 10px', marginLeft: 4 }}
            >
              Tämä kk
            </button>
          )}
        </div>
      </div>

      {/* 2. Key Monthly KPI Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 12,
        marginBottom: 24,
      }}>
        {/* Total Consumption */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, rgba(37, 99, 235, 0.04) 100%)',
          border: '1px solid rgba(59, 130, 246, 0.25)',
          borderRadius: 14,
          padding: '14px 16px',
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>⚡</span> KOKONAISSÄHKÖ
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#3b82f6', marginTop: 4 }}>
            {loading ? '…' : `${summary?.total_house_kwh.toLocaleString('fi-FI', { maximumFractionDigits: 1 }) ?? 0} kWh`}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
            Keskikulutus: {loading ? '…' : `${avgKwhPerDay} kWh/vrk`}
          </div>
          {maxDay && (
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 4 }}>
              Huippupäivä: {maxDay.date.split('-')[2]}.{maxDay.date.split('-')[1]}. ({maxDay.house_kwh.toFixed(1)} kWh)
            </div>
          )}
        </div>

        {/* Total Cost */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(217, 119, 6, 0.04) 100%)',
          border: '1px solid rgba(245, 158, 11, 0.25)',
          borderRadius: 14,
          padding: '14px 16px',
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>💶</span> KOKONAISKUSTANNUS
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#f59e0b', marginTop: 4 }}>
            {loading ? '…' : `${summary?.total_house_cost_eur.toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? 0} €`}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
            Keskihinta: {loading ? '…' : `${summary?.avg_realized_price_cents ?? 0} c/kWh`}
          </div>
          {minDay && (
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 4 }}>
              Matalin päivä: {minDay.date.split('-')[2]}.{minDay.date.split('-')[1]}. ({minDay.house_kwh.toFixed(1)} kWh)
            </div>
          )}
        </div>

        {/* VILP Share */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.12) 0%, rgba(14, 116, 144, 0.04) 100%)',
          border: '1px solid rgba(6, 182, 212, 0.25)',
          borderRadius: 14,
          padding: '14px 16px',
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>🌡️</span> VILP LÄMPÖPUMPPU
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#06b6d4', marginTop: 4 }}>
            {loading ? '…' : `${summary?.total_heatpump_kwh.toLocaleString('fi-FI', { maximumFractionDigits: 1 }) ?? 0} kWh`}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
            Osuus: {loading ? '…' : `${summary?.heating_share_percent ?? 0} % (${summary?.total_heatpump_cost_eur.toFixed(2) ?? 0} €)`}
          </div>
        </div>

        {/* Sauna & Plugs */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.12) 0%, rgba(126, 34, 206, 0.04) 100%)',
          border: '1px solid rgba(168, 85, 247, 0.25)',
          borderRadius: 14,
          padding: '14px 16px',
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>🧖</span> SAUNA & ÄLYPISTORASIAT
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#a855f7', marginTop: 4 }}>
            {loading ? '…' : `${((summary?.total_sauna_kwh ?? 0) + (summary?.total_tapo_kwh ?? 0)).toFixed(1)} kWh`}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
            Sauna: {summary?.total_sauna_kwh?.toFixed(1) ?? 0} kWh {saunaDaysCount > 0 ? `(${saunaDaysCount} saunapäivää)` : ''} · Tapo: {summary?.total_tapo_kwh?.toFixed(1) ?? 0} kWh
          </div>
        </div>

        {/* Other Household Electricity */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(5, 150, 105, 0.04) 100%)',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          borderRadius: 14,
          padding: '14px 16px',
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>🏠</span> MUU TALOUSSÄHKÖ
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#10b981', marginTop: 4 }}>
            {loading ? '…' : `${summary?.total_other_kwh.toLocaleString('fi-FI', { maximumFractionDigits: 1 }) ?? 0} kWh`}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
            Osuus: {loading ? '…' : `${summary?.other_share_percent ?? 0} % (${summary?.total_other_cost_eur.toFixed(2) ?? 0} €)`}
          </div>
        </div>
      </div>

      {/* 3. Interactive Monthly Calendar Heatmap Grid */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Päiväkohtainen kulutuskalenteri (klikkaa päivää tutkiaksesi tuntijakaumaa)
          </div>
          {/* Heatmap Legend */}
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: '#10b981' }} /> &lt; 20 kWh
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: '#3b82f6' }} /> 20-40 kWh
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: '#f59e0b' }} /> 40-60 kWh
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: '#ef4444' }} /> &gt; 60 kWh
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(239, 68, 68, 0.12)', padding: '2px 6px', borderRadius: 6, border: '1px solid rgba(239, 68, 68, 0.25)', color: '#ef4444', fontWeight: 600 }}>
              <span>🧖</span> Saunapäivä
            </span>
          </div>
        </div>

        {/* Weekday headers */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 6,
          marginBottom: 6,
          textAlign: 'center',
          fontWeight: 700,
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
        }}>
          {WEEKDAY_NAMES_FI.map((day) => (
            <div key={day} style={{ padding: '4px 0' }}>{day}</div>
          ))}
        </div>

        {/* Day Cells */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 6,
        }}>
          {calendarCells.map((cell, idx) => {
            const isSelected = cell.dateStr === selectedDayStr;
            const isToday = cell.dateStr === formatLocalDate(today.getFullYear(), today.getMonth(), today.getDate());
            const dData = cell.dailyData;
            const hasData = dData && dData.house_kwh > 0;
            const heat = getConsumptionHeatStyle(dData?.house_kwh);

            if (!cell.isCurrentMonth) {
              return (
                <div
                  key={`inactive-${idx}`}
                  style={{
                    minHeight: 74,
                    padding: '6px 8px',
                    borderRadius: 10,
                    background: 'var(--bg-page)',
                    opacity: 0.3,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{cell.dayNumber}</span>
                </div>
              );
            }

            return (
              <div
                key={cell.dateStr}
                onClick={() => setSelectedDayStr(cell.dateStr)}
                style={{
                  minHeight: 74,
                  padding: '6px 8px',
                  borderRadius: 10,
                  background: isSelected ? 'rgba(59, 130, 246, 0.2)' : heat.bg,
                  border: isSelected
                    ? '2px solid #3b82f6'
                    : isToday
                    ? '2px solid rgba(245, 158, 11, 0.8)'
                    : `1px solid ${heat.border}`,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  transition: 'all 0.15s ease',
                  boxShadow: isSelected ? '0 0 12px rgba(59, 130, 246, 0.35)' : 'none',
                  position: 'relative',
                }}
              >
                {/* Top: Day number + Sauna icon + Temp */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{
                      fontSize: '0.8rem',
                      fontWeight: isToday || isSelected ? 800 : 600,
                      color: isToday ? '#f59e0b' : isSelected ? '#60a5fa' : 'var(--text-primary)',
                    }}>
                      {cell.dayNumber}
                    </span>
                    {cell.isSaunaDay && (
                      <span
                        title={cell.saunaSession ? `Saunapäivä (${cell.saunaSession.duration_minutes || cell.saunaSession.durationMinutes || ''} min, max ${cell.saunaSession.peak_temp || cell.saunaSession.peakTemp || ''}°C)` : 'Saunapäivä'}
                        style={{
                          fontSize: '0.82rem',
                          lineHeight: 1,
                          filter: 'drop-shadow(0 0 3px rgba(239, 68, 68, 0.6))',
                        }}
                      >
                        🧖
                      </span>
                    )}
                  </div>
                  {dData?.avg_temp != null && (
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                      {dData.avg_temp > 0 ? `+${dData.avg_temp.toFixed(0)}°` : `${dData.avg_temp.toFixed(0)}°`}
                    </span>
                  )}
                </div>

                {/* Middle: Consumption Badge */}
                {hasData ? (
                  <div>
                    <div style={{
                      fontSize: '0.82rem',
                      fontWeight: 800,
                      color: heat.badgeColor,
                      lineHeight: 1.2,
                    }}>
                      {dData.house_kwh.toFixed(1)} <span style={{ fontSize: '0.65rem', fontWeight: 500 }}>kWh</span>
                    </div>
                    <div style={{
                      fontSize: '0.68rem',
                      color: 'var(--text-secondary)',
                      marginTop: 2,
                    }}>
                      {dData.house_cost_eur.toFixed(2)} €
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    {isToday ? 'Ei vielä dataa' : '-'}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Selected Day Deep-Dive Panel */}
      {selectedDayStr && (
        <div style={{
          background: 'var(--bg-page)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 14,
          padding: 16,
          marginBottom: 20,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🔍</span> Päivän {selectedDayStr} tuntikohtainen erittely
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                Tuntitason sähkönkulutus, laitejakauma ja pörssisähkön hinta
              </div>
            </div>

            {selectedDailyItem && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {selectedCell?.isSaunaDay && (
                  <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    🧖 Saunapäivä {selectedDailyItem?.sauna_kwh && selectedDailyItem.sauna_kwh > 0 ? `(${selectedDailyItem.sauna_kwh.toFixed(1)} kWh)` : ''}
                  </span>
                )}
                <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', fontWeight: 700 }}>
                  Yhteensä: {selectedDailyItem.house_kwh.toFixed(2)} kWh
                </span>
                <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', fontWeight: 700 }}>
                  Hinta: {selectedDailyItem.house_cost_eur.toFixed(2)} €
                </span>
                {selectedDailyItem.avg_temp != null && (
                  <span className="badge" style={{ background: 'rgba(255, 255, 255, 0.08)', color: 'var(--text-secondary)' }}>
                    Ulko: {selectedDailyItem.avg_temp.toFixed(1)} °C
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Hourly Stacked Bar Chart */}
          {selectedDayHourlySeries.length > 0 ? (
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={selectedDayHourlySeries} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" opacity={0.5} />
                  <XAxis dataKey="timeLabel" stroke="var(--text-muted)" fontSize={11} tickLine={false} />
                  <YAxis
                    yAxisId="left"
                    stroke="var(--text-muted)"
                    fontSize={11}
                    unit=" kWh"
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#f59e0b"
                    fontSize={11}
                    unit=" c"
                    tickLine={false}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload || !payload.length) return null;
                      const pt = payload[0].payload as HerrforsDataPoint & { timeLabel: string };
                      return (
                        <div style={{
                          background: '#0b1329',
                          border: '1px solid rgba(255, 255, 255, 0.25)',
                          borderRadius: 10,
                          padding: '10px 14px',
                          fontSize: '0.8rem',
                          boxShadow: '0 16px 36px rgba(0, 0, 0, 0.95), 0 0 0 1px rgba(255, 255, 255, 0.12)',
                          minWidth: 210,
                          color: '#f8fafc',
                          zIndex: 1000,
                        }}>
                          <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#f8fafc', marginBottom: 6, borderBottom: '1px solid rgba(255, 255, 255, 0.15)', paddingBottom: 4 }}>
                            ⏰ Klo {label}
                          </div>
                          <div style={{ color: '#60a5fa', fontWeight: 800, fontSize: '0.85rem', marginBottom: 8 }}>
                            Kokonaiskulutus: <span style={{ color: '#ffffff' }}>{(pt.house_kwh ?? 0).toFixed(3)} kWh</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.78rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#cbd5e1' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#06b6d4', display: 'inline-block' }} />
                                VILP lämpöpumppu:
                              </span>
                              <b style={{ color: '#ffffff', marginLeft: 8 }}>{(pt.heatpump_kwh ?? 0).toFixed(3)} kWh</b>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#cbd5e1' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
                                Sauna:
                              </span>
                              <b style={{ color: '#ffffff', marginLeft: 8 }}>{(pt.sauna_kwh ?? 0).toFixed(3)} kWh</b>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#cbd5e1' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#a855f7', display: 'inline-block' }} />
                                Älypistorasiat:
                              </span>
                              <b style={{ color: '#ffffff', marginLeft: 8 }}>{(pt.tapo_kwh ?? 0).toFixed(3)} kWh</b>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#cbd5e1' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                                Muu taloussähkö:
                              </span>
                              <b style={{ color: '#ffffff', marginLeft: 8 }}>{(pt.other_kwh ?? 0).toFixed(3)} kWh</b>
                            </div>
                          </div>
                          <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(255, 255, 255, 0.12)', color: '#fbbf24', fontSize: '0.78rem', fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                            <span>Sähkön kokonaishinta:</span>
                            <b>{(pt.full_price_cents ?? pt.price_cents ?? 0).toFixed(2)} c/kWh</b>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    height={32}
                    iconType="circle"
                    wrapperStyle={{ fontSize: '0.75rem' }}
                  />
                  <Bar yAxisId="left" dataKey="heatpump_kwh" name="VILP" stackId="elec" fill="#06b6d4" />
                  <Bar yAxisId="left" dataKey="sauna_kwh" name="Sauna" stackId="elec" fill="#ef4444" />
                  <Bar yAxisId="left" dataKey="tapo_kwh" name="Älypistorasiat" stackId="elec" fill="#a855f7" />
                  <Bar yAxisId="left" dataKey="other_kwh" name="Muu taloussähkö" stackId="elec" fill="#10b981" />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="price_cents"
                    name="Hinta (c/kWh)"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Ei tuntitason mittauksia saatavilla valitulle päivälle ({selectedDayStr}).
            </div>
          )}
        </div>
      )}

      {/* 5. Monthly Daily Trend Bar Chart */}
      {data?.daily && data.daily.length > 0 && (
        <div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
            Kuukauden päivittäinen kulutushistoria
          </div>
          <div style={{ width: '100%', height: 230 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.daily} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" opacity={0.5} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(val) => val.split('-')[2]}
                  stroke="var(--text-muted)"
                  fontSize={11}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="left"
                  stroke="var(--text-muted)"
                  fontSize={11}
                  unit=" kWh"
                  tickLine={false}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#3b82f6"
                  fontSize={11}
                  unit=" °C"
                  tickLine={false}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const d = payload[0].payload as HerrforsDailyItem;
                    return (
                      <div style={{
                        background: '#0b1329',
                        border: '1px solid rgba(255, 255, 255, 0.25)',
                        borderRadius: 10,
                        padding: '10px 14px',
                        fontSize: '0.8rem',
                        boxShadow: '0 16px 36px rgba(0, 0, 0, 0.95), 0 0 0 1px rgba(255, 255, 255, 0.12)',
                        minWidth: 210,
                        color: '#f8fafc',
                        zIndex: 1000,
                      }}>
                        <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#f8fafc', marginBottom: 6, borderBottom: '1px solid rgba(255, 255, 255, 0.15)', paddingBottom: 4 }}>
                          📅 Päivä: {d.date}
                        </div>
                        <div style={{ color: '#60a5fa', fontWeight: 800, fontSize: '0.85rem', marginBottom: 8 }}>
                          Kokonaissähkö: <span style={{ color: '#ffffff' }}>{d.house_kwh.toFixed(2)} kWh</span> <span style={{ color: '#fbbf24', fontWeight: 700 }}>({d.house_cost_eur.toFixed(2)} €)</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.78rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#cbd5e1' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#06b6d4', display: 'inline-block' }} />
                              VILP:
                            </span>
                            <b style={{ color: '#ffffff', marginLeft: 8 }}>{d.heatpump_kwh.toFixed(2)} kWh</b>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#cbd5e1' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
                              Sauna:
                            </span>
                            <b style={{ color: '#ffffff', marginLeft: 8 }}>{(d.sauna_kwh ?? 0).toFixed(2)} kWh</b>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#cbd5e1' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#a855f7', display: 'inline-block' }} />
                              Pistorasiat:
                            </span>
                            <b style={{ color: '#ffffff', marginLeft: 8 }}>{(d.tapo_kwh ?? 0).toFixed(2)} kWh</b>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#cbd5e1' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                              Muu sähkö:
                            </span>
                            <b style={{ color: '#ffffff', marginLeft: 8 }}>{d.other_kwh.toFixed(2)} kWh</b>
                          </div>
                        </div>
                        {d.avg_temp != null && (
                          <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(255, 255, 255, 0.12)', color: '#93c5fd', fontSize: '0.75rem', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                            <span>Keskilämpötila:</span>
                            <b style={{ color: '#bfdbfe' }}>{d.avg_temp > 0 ? `+${d.avg_temp.toFixed(1)}` : d.avg_temp.toFixed(1)} °C</b>
                          </div>
                        )}
                      </div>
                    );
                  }}
                />
                <Legend verticalAlign="top" height={30} iconType="circle" wrapperStyle={{ fontSize: '0.75rem' }} />
                <Bar yAxisId="left" dataKey="heatpump_kwh" name="VILP" stackId="daily" fill="#06b6d4" />
                <Bar yAxisId="left" dataKey="sauna_kwh" name="Sauna" stackId="daily" fill="#ef4444" />
                <Bar yAxisId="left" dataKey="tapo_kwh" name="Älypistorasiat" stackId="daily" fill="#a855f7" />
                <Bar yAxisId="left" dataKey="other_kwh" name="Muu taloussähkö" stackId="daily" fill="#10b981" />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="avg_temp"
                  name="Ulkolämpötila (°C)"
                  stroke="#60a5fa"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
