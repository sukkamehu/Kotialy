export interface NordpoolPrice {
  start_time: number;
  end_time: number;
  price: number;
  currency: string;
  resolution: number;
  area: string;
  fetched_at: number;
}

export interface NordpoolStats {
  min: number;
  max: number;
  avg: number;
  count: number;
}

export interface NordpoolWindow {
  start: number;
  end: number;
  avgPrice: number;
  totalPrice: number;
  quarters: NordpoolPrice[];
}
