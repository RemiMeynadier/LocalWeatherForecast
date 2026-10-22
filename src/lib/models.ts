// Catalogue of the numerical weather models we query through Open-Meteo,
// and the heuristics that decide which ones count for a given place and lead time.

export interface BBox {
  latMin: number
  latMax: number
  lonMin: number
  lonMax: number
}

export interface DeterministicModel {
  id: string // Open-Meteo `models=` value
  label: string
  provider: string
  // Number of days (today included) the model really covers. Open-Meteo's
  // "seamless" products silently fall back to ECMWF beyond that, which would
  // double-count ECMWF, so we cut there.
  days: number
  baseWeight: number
  // Only queried when the location is inside this domain.
  domain?: BBox
  // High-resolution nest: inside it the model gets a boost for the first days.
  highRes?: { name: string; bbox: BBox }
  // Machine-learning model (trained on reanalysis rather than solving physics).
  ai?: boolean
}

export interface EnsembleModel {
  id: string
  label: string
  members: number
  days: number
  weight: number
  ai?: boolean
}

const EUROPE: BBox = { latMin: 20, latMax: 72, lonMin: -32, lonMax: 42 }

export const DETERMINISTIC_MODELS: DeterministicModel[] = [
  {
    id: 'ecmwf_ifs025',
    label: 'ECMWF IFS',
    provider: 'ECMWF',
    days: 15,
    baseWeight: 1,
  },
  {
    id: 'ecmwf_aifs025_single',
    label: 'ECMWF AIFS',
    provider: 'ECMWF (AI)',
    days: 15,
    baseWeight: 0.95,
    ai: true,
  },
  {
    id: 'ncep_aigfs025',
    label: 'NOAA AIGFS',
    provider: 'NOAA (AI)',
    days: 16,
    baseWeight: 0.75,
    ai: true,
  },
  {
    id: 'icon_seamless',
    label: 'ICON',
    provider: 'DWD (Germany)',
    days: 7,
    baseWeight: 0.8,
    highRes: { name: 'ICON-D2 2 km', bbox: { latMin: 44.5, latMax: 56.5, lonMin: 0, lonMax: 18 } },
  },
  {
    id: 'ukmo_seamless',
    label: 'UKMO',
    provider: 'Met Office (UK)',
    days: 7,
    baseWeight: 0.85,
    highRes: { name: 'UKV 2 km', bbox: { latMin: 49, latMax: 61, lonMin: -11, lonMax: 3 } },
  },
  {
    id: 'gfs_seamless',
    label: 'GFS',
    provider: 'NOAA (USA)',
    days: 16,
    baseWeight: 0.7,
    highRes: { name: 'HRRR 3 km', bbox: { latMin: 21, latMax: 53, lonMin: -134, lonMax: -60 } },
  },
  {
    id: 'gem_seamless',
    label: 'GEM',
    provider: 'ECCC (Canada)',
    days: 10,
    baseWeight: 0.6,
    highRes: { name: 'HRDPS 2.5 km', bbox: { latMin: 27, latMax: 70, lonMin: -152, lonMax: -40 } },
  },
  {
    id: 'jma_seamless',
    label: 'JMA',
    provider: 'JMA (Japan)',
    days: 11,
    baseWeight: 0.6,
    highRes: { name: 'MSM 5 km', bbox: { latMin: 22.4, latMax: 47.6, lonMin: 120, lonMax: 150 } },
  },
  {
    id: 'meteofrance_seamless',
    label: 'ARPEGE / AROME',
    provider: 'Météo-France',
    days: 4,
    baseWeight: 0.8,
    domain: EUROPE,
    highRes: { name: 'AROME 1.3 km', bbox: { latMin: 37.5, latMax: 55.4, lonMin: -12, lonMax: 16 } },
  },
  {
    id: 'knmi_seamless',
    label: 'HARMONIE (KNMI)',
    provider: 'KNMI (Netherlands)',
    days: 3,
    baseWeight: 0.7,
    domain: { latMin: 49, latMax: 56, lonMin: 0, lonMax: 11 },
    highRes: { name: 'HARMONIE 2 km', bbox: { latMin: 49, latMax: 56, lonMin: 0, lonMax: 11 } },
  },
  {
    id: 'dmi_seamless',
    label: 'HARMONIE (DMI)',
    provider: 'DMI (Denmark)',
    days: 3,
    baseWeight: 0.7,
    domain: { latMin: 50, latMax: 75, lonMin: -25, lonMax: 40 },
    highRes: { name: 'HARMONIE 2 km', bbox: { latMin: 50, latMax: 75, lonMin: -25, lonMax: 40 } },
  },
  {
    id: 'metno_seamless',
    label: 'MET Nordic',
    provider: 'MET Norway',
    days: 3,
    baseWeight: 0.7,
    domain: { latMin: 53, latMax: 72, lonMin: 0, lonMax: 32 },
    highRes: { name: 'MET Nordic 1 km', bbox: { latMin: 53, latMax: 72, lonMin: 0, lonMax: 32 } },
  },
]

export const ENSEMBLE_MODELS: EnsembleModel[] = [
  { id: 'ecmwf_ifs025', label: 'ECMWF ENS', members: 51, days: 15, weight: 1 },
  { id: 'ecmwf_aifs025', label: 'ECMWF AIFS ENS', members: 51, days: 15, weight: 1, ai: true },
  { id: 'ncep_aigefs025', label: 'NOAA AIGEFS', members: 31, days: 16, weight: 0.7, ai: true },
  { id: 'gfs05', label: 'NOAA GEFS', members: 31, days: 35, weight: 0.7 },
  { id: 'icon_seamless', label: 'DWD ICON-EPS', members: 40, days: 7, weight: 0.7 },
]

export function inBBox(lat: number, lon: number, b: BBox): boolean {
  return lat >= b.latMin && lat <= b.latMax && lon >= b.lonMin && lon <= b.lonMax
}

export function selectDeterministicModels(lat: number, lon: number): DeterministicModel[] {
  return DETERMINISTIC_MODELS.filter((m) => !m.domain || inBBox(lat, lon, m.domain))
}

export function hasLocalHighRes(m: DeterministicModel, lat: number, lon: number): boolean {
  return !!m.highRes && inBBox(lat, lon, m.highRes.bbox)
}

// Prior weight of a deterministic model at a given lead (0 = today), or 0
// when the model does not cover that day. Local high-resolution nests resolve
// relief, coasts and convection far better, so they dominate the first two
// days and fade back to their base weight by day 5. `skill` is the multiplier
// learnt from backtesting (1 = no evidence either way).
export function modelWeight(m: DeterministicModel, lead: number, lat: number, lon: number, skill = 1): number {
  if (lead >= m.days) return 0
  let w = m.baseWeight
  if (hasLocalHighRes(m, lat, lon)) {
    const boost = [2.5, 2.2, 1.8, 1.4, 1.15][lead] ?? 1
    w *= boost
  }
  // Past day 5, ECMWF's measured skill lead grows; slightly favour it.
  if (m.id === 'ecmwf_ifs025' && lead >= 5) w *= 1.25
  return w * skill
}
