export interface SatellitePass {
  satellite: string;
  noradId: number;
  frequency: string;
  mode: string;
  description: string;
  aos: number; // ms timestamp
  azAos: number;
  maxElevation: number; // degrees
  maxElTime: number; // ms timestamp
  azMax: number;
  los: number; // ms timestamp
  azLos: number;
  durationMin: number;
  quality: 'excellent' | 'good' | 'marginal';
  qualityLabel: string;
  trajectory: string; // e.g. "SSE → ESE → NNW"
  azAosCompass: string;
  azMaxCompass: string;
  azLosCompass: string;
}

export interface SatelliteImageFeed {
  id: string;
  title: string;
  description: string;
  source: string;
  type: 'satellite_ir' | 'satellite_rgb' | 'radar';
  url: string;
}

export interface SatelliteStatus {
  observer: {
    name: string;
    latitude: number;
    longitude: number;
    altitudeKm: number;
  };
  catalog: Array<{
    name: string;
    noradId: number;
    frequency: string;
    mode: string;
    status: string;
    description: string;
  }>;
  currentOverhead: SatellitePass | null;
  nextPass: SatellitePass | null;
  feeds: Record<string, SatelliteImageFeed>;
  ts: number;
}

export interface SatellitePassesResponse {
  observer: {
    name: string;
    latitude: number;
    longitude: number;
    altitudeKm: number;
  };
  passes: SatellitePass[];
  currentOverhead: SatellitePass | null;
  count: number;
  ts: number;
}

