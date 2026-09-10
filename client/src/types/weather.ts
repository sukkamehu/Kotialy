export interface WeatherForecast {
  source: string;
  time: number;
  temperature: number;
  feels_like: number | null;
  humidity: number;
  wind_speed: number;
  wind_dir: number;
  symbol: string;
  rain_mm: number;
  pressure: number;
  fetched_at: number;
}

export interface DailyWeather {
  day: string;
  minTemp: number;
  maxTemp: number;
  avgRain: number;
  symbols: string;
}
