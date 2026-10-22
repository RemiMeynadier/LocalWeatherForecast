import type { DeterministicModel, EnsembleModel } from '../lib/models'

export interface Place {
  name: string
  admin?: string
  country?: string
  lat: number
  lon: number
  elevation?: number
}

export type Num = number | null

export interface DeterministicSeries {
  model: string
  time: string[]
  tmax: Num[]
  tmin: Num[]
  precip: Num[]
  code: Num[]
  wind: Num[]
}

export interface EnsembleSeries {
  model: string
  time: string[]
  // [member][day]
  tmax: Num[][]
  tmin: Num[][]
  precip: Num[][]
}

export interface ClimateSeries {
  time: string[]
  tmax: Num[]
  tmin: Num[]
  precip: Num[]
}

const FORECAST = 'https://api.open-meteo.com/v1/forecast'
const ENSEMBLE = 'https://ensemble-api.open-meteo.com/v1/ensemble'
const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive'
const GEOCODING = 'https://geocoding-api.open-meteo.com/v1/search'

async function getJson(url: string): Promise<any> {
  const res = await fetch(url)
  const body = await res.json().catch(() => null)
  if (!res.ok || body?.error) {
    throw new Error(body?.reason ?? `Erreur HTTP ${res.status}`)
  }
  return body
}

export async function searchPlaces(query: string): Promise<Place[]> {
  const url = `${GEOCODING}?name=${encodeURIComponent(query)}&count=8&language=fr&format=json`
  const body = await getJson(url)
  return (body.results ?? []).map((r: any) => ({
    name: r.name,
    admin: r.admin1,
    country: r.country,
    lat: r.latitude,
    lon: r.longitude,
    elevation: r.elevation,
  }))
}

const coords = (p: Place) => `latitude=${p.lat.toFixed(4)}&longitude=${p.lon.toFixed(4)}`

// The last day of a run usually covers only a few hours (e.g. 5 of 24), yet
// Open-Meteo still returns daily max/min/sums for it, which biases them badly.
// Drop it in every series.
function dropLastDay(series: Num[][]): Num[][] {
  const last = Math.max(...series.map((a) => a.findLastIndex((v) => v != null)))
  if (last < 0) return series
  return series.map((a) => a.map((v, i) => (i === last ? null : v)))
}

export async function fetchDeterministic(place: Place, models: DeterministicModel[]): Promise<DeterministicSeries[]> {
  const vars = 'temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code,wind_speed_10m_max'
  const ids = models.map((m) => m.id).join(',')
  const url = `${FORECAST}?${coords(place)}&daily=${vars}&models=${ids}&forecast_days=16&timezone=auto`
  const body = await getJson(url)
  const d = body.daily
  // With several models, every variable key is suffixed with `_<model id>`.
  return models.map((m) => {
    const keys = ['temperature_2m_max', 'temperature_2m_min', 'precipitation_sum', 'weather_code', 'wind_speed_10m_max']
    const [tmax, tmin, precip, code, wind] = dropLastDay(keys.map((k) => d[`${k}_${m.id}`] ?? []))
    return { model: m.id, time: d.time, tmax, tmin, precip, code, wind }
  })
}

// Collects the control run (`var`) and every `var_memberNN` key.
function members(daily: Record<string, Num[]>, variable: string): Num[][] {
  const keys = Object.keys(daily).filter((k) => k === variable || k.startsWith(`${variable}_member`))
  return keys.map((k) => daily[k])
}

export async function fetchEnsemble(place: Place, model: EnsembleModel): Promise<EnsembleSeries> {
  const vars = 'temperature_2m_max,temperature_2m_min,precipitation_sum'
  const url = `${ENSEMBLE}?${coords(place)}&daily=${vars}&models=${model.id}&forecast_days=35&timezone=auto`
  const body = await getJson(url)
  const d = body.daily
  const tmax = members(d, 'temperature_2m_max')
  const tmin = members(d, 'temperature_2m_min')
  const precip = members(d, 'precipitation_sum')
  const all = dropLastDay([...tmax, ...tmin, ...precip])
  return {
    model: model.id,
    time: d.time,
    tmax: all.slice(0, tmax.length),
    tmin: all.slice(tmax.length, tmax.length + tmin.length),
    precip: all.slice(tmax.length + tmin.length),
  }
}

export const CLIMATE_START = 1991
export const CLIMATE_END = 2020

// 1991-2020 ERA5 reanalysis, the WMO reference period for "normals".
// Heavy (~11k days), so it is cached per ~10 km cell.
export async function fetchClimate(place: Place): Promise<ClimateSeries> {
  const key = `lwf.climate.v1.${place.lat.toFixed(1)}.${place.lon.toFixed(1)}`
  try {
    const cached = localStorage.getItem(key)
    if (cached) return JSON.parse(cached)
  } catch {
    // Storage unavailable: just refetch.
  }
  const vars = 'temperature_2m_max,temperature_2m_min,precipitation_sum'
  const url = `${ARCHIVE}?${coords(place)}&start_date=${CLIMATE_START}-01-01&end_date=${CLIMATE_END}-12-31&daily=${vars}&timezone=auto`
  const body = await getJson(url)
  const series: ClimateSeries = {
    time: body.daily.time,
    tmax: body.daily.temperature_2m_max,
    tmin: body.daily.temperature_2m_min,
    precip: body.daily.precipitation_sum,
  }
  try {
    localStorage.setItem(key, JSON.stringify(series))
  } catch {
    // Quota exceeded: keep working without the cache.
  }
  return series
}
