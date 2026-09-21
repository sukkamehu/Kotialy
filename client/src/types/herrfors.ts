export interface HerrforsStatus {
  enabled: boolean;
  configured: boolean;
  session_active?: boolean;
  co_id: string;
  token_expires: string | null;
  last_refresh_at: number | null;
  next_refresh_at: number | null;
  last_sync_at: number | null;
  last_sync_status: string | null;
  last_error: string | null;
  is_refreshing: boolean;
  is_syncing: boolean;
  stats: {
    totalReadings: number;
    latestReading: {
      start_time: number;
      date_str: string;
      consumption_kwh: number | null;
      price: number | null;
      temperature?: number | null;
      fetched_at: number;
    } | null;
  };
}

export interface HerrforsDataPoint {
  time: number;
  date_str: string;
  is_pending?: boolean;
  house_kwh: number | null;
  heatpump_kwh: number | null;
  heating_kwh: number | null;
  dhw_kwh: number | null;
  tapo_kwh?: number | null;
  other_kwh: number | null;
  price_cents: number;
  full_price_cents: number;
  house_power_kw: number | null;
  heatpump_power_kw: number | null;
  tapo_power_kw?: number | null;
  other_power_kw: number | null;
  temperature?: number | null;
}

export interface HerrforsDailyItem {
  date: string;
  timestamp: number;
  house_kwh: number;
  heatpump_kwh: number;
  heating_kwh: number;
  dhw_kwh: number;
  tapo_kwh?: number;
  other_kwh: number;
  house_cost_eur: number;
  heatpump_cost_eur: number;
  tapo_cost_eur?: number;
  other_cost_eur: number;
  heating_share_percent: number;
  tapo_share_percent?: number;
  other_share_percent?: number;
  slot_count: number;
  settled_slots?: number;
  pending_slots?: number;
  is_pending?: boolean;
  avg_temp?: number | null;
  min_temp?: number | null;
  max_temp?: number | null;
}

export interface HerrforsSummary {
  total_house_kwh: number;
  total_heatpump_kwh: number;
  total_heating_kwh: number;
  total_dhw_kwh: number;
  total_tapo_kwh?: number;
  total_other_kwh: number;
  heating_share_percent: number;
  tapo_share_percent?: number;
  other_share_percent: number;
  total_house_cost_eur: number;
  total_heatpump_cost_eur: number;
  total_tapo_cost_eur?: number;
  total_other_cost_eur: number;
  avg_realized_price_cents: number;
  cop: number | null;
  savings_eur: number;
  peak_power_kw: number;
  peak_power_time: number | null;
  last_settled_reading_time?: number | null;
  readings_count: number;
  settled_readings_count?: number;
  pending_readings_count?: number;
  avg_temp?: number | null;
  min_temp?: number | null;
  max_temp?: number | null;
}

export interface HerrforsAnalyticsResponse {
  summary: HerrforsSummary;
  daily: HerrforsDailyItem[];
  series: HerrforsDataPoint[];
  from: number;
  to: number;
}

