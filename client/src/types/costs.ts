export interface DailyCost {
  date: string;
  heat_consumption_kwh: number;
  dhw_consumption_kwh: number;
  cool_consumption_kwh: number;
  total_consumption_kwh: number;
  heat_production_kwh: number;
  dhw_production_kwh: number;
  total_production_kwh: number;
  cop: number | null;
  spot_cost_eur: number;
  transfer_cost_eur: number;
  total_cost_eur: number;
  avg_price_cents_kwh: number | null;
  savings_eur: number;
  is_final: number;
  updated_at: number;
}

export interface CostSettings {
  margin_cents_kwh: number;
  transfer_cents_kwh: number;
  vat_percent: number;
}

export interface MonthSummary {
  month: string;
  days_count: number;
  total_cost_eur: number;
  total_consumption_kwh: number;
  total_production_kwh: number;
  savings_eur: number;
  cop: number | null;
  avg_price_cents_kwh: number | null;
}

export interface CostSummary {
  today: DailyCost;
  yesterday: DailyCost | null;
  month: MonthSummary;
  settings: CostSettings;
}
