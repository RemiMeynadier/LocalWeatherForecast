// Flags potentially dangerous or unusual weather in the next 15 days and
// cross-checks it against official warnings.

import type { Hazard, OfficialWarning } from '../api/warnings'
import type { DayForecast } from './forecast'
import { weightedFraction } from './stats'

export type AlertLevel = 'watch' | 'warning'

export interface ForecastAlert {
  hazard: Hazard
  level: AlertLevel
  title: string
  start: string
  end: string
  peak: number // value on the worst day
  peakDate: string
  unit: string
  detail: string
  probability: number | null // share of ensemble scenarios exceeding the threshold
  official: OfficialWarning[]
}

interface DayFlag {
  hazard: Hazard
  level: AlertLevel
  title: string
  value: number
  unit: string
  threshold: string
  probability: number | null
}

const HORIZON = 15
const r0 = (v: number) => Math.round(v)

export function flagDay(d: DayForecast): DayFlag[] {
  const flags: DayFlag[] = []
  const e = d.ensemble
  const n = d.normal
  const prob = (k: 'tmax' | 'tmin' | 'precip', pred: (v: number) => boolean) =>
    e ? weightedFraction(e.samples[k], pred) : null

  // Heat: absolute thresholds, or unusual for the season.
  if (d.tmax != null) {
    if (d.tmax >= 35) {
      flags.push({
        hazard: 'heat', level: d.tmax >= 40 ? 'warning' : 'watch', title: 'Heat', value: d.tmax, unit: '°C',
        threshold: '35 °C', probability: prob('tmax', (v) => v >= 35),
      })
    } else if (n && d.tmax >= n.tmaxP975 && d.tmax - n.tmax >= 5) {
      flags.push({
        hazard: 'heat', level: 'watch', title: 'Unusual warmth', value: d.tmax, unit: '°C',
        threshold: `${r0(n.tmaxP975)} °C (warmest 2.5 % of days at this time of year)`,
        probability: prob('tmax', (v) => v >= n.tmaxP975),
      })
    }
  }

  // Cold and unseasonal frost.
  if (d.tmin != null) {
    if (d.tmin <= -10) {
      flags.push({
        hazard: 'cold', level: d.tmin <= -15 ? 'warning' : 'watch', title: 'Severe cold', value: d.tmin, unit: '°C',
        threshold: '−10 °C', probability: prob('tmin', (v) => v <= -10),
      })
    } else if (n && d.tmin <= n.tminP025 && n.tmin - d.tmin >= 5) {
      flags.push({
        hazard: 'cold', level: 'watch', title: 'Unusual cold', value: d.tmin, unit: '°C',
        threshold: `${r0(n.tminP025)} °C (coldest 2.5 % of nights at this time of year)`,
        probability: prob('tmin', (v) => v <= n.tminP025),
      })
    } else if (n && d.tmin <= 0 && n.tmin >= 4) {
      flags.push({
        hazard: 'cold', level: 'watch', title: 'Unseasonal frost', value: d.tmin, unit: '°C',
        threshold: '0 °C', probability: prob('tmin', (v) => v <= 0),
      })
    }
  }

  // Heavy rain: at least 20 mm, and at least the local 1-in-100-days amount.
  const rainThr = Math.max(20, n?.precipP99 ?? 20)
  const pRain = prob('precip', (v) => v >= rainThr)
  if ((d.precip != null && d.precip >= rainThr) || (pRain != null && pRain >= 0.3)) {
    const severe = (d.precip ?? 0) >= Math.max(50, rainThr * 2) || (prob('precip', (v) => v >= 50) ?? 0) >= 0.3
    flags.push({
      hazard: 'rain', level: severe ? 'warning' : 'watch', title: 'Heavy rain', value: d.precip ?? 0, unit: 'mm',
      threshold: `${r0(rainThr)} mm/day`, probability: pRain,
    })
  }

  // Wind gusts.
  if (d.gust != null && d.gust >= 70) {
    flags.push({
      hazard: 'wind', level: d.gust >= 90 ? 'warning' : 'watch', title: 'Strong winds', value: d.gust, unit: 'km/h',
      threshold: '70 km/h gusts', probability: null,
    })
  } else if (d.gustMax != null && d.gustMax >= 90) {
    flags.push({
      hazard: 'wind', level: 'watch', title: 'Possible strong winds', value: d.gustMax, unit: 'km/h',
      threshold: '90 km/h gusts in at least one model', probability: null,
    })
  }

  if (d.snow != null && d.snow >= 2) {
    flags.push({
      hazard: 'snow', level: d.snow >= 10 ? 'warning' : 'watch', title: 'Snow', value: d.snow, unit: 'cm',
      threshold: '2 cm', probability: null,
    })
  }

  if (d.stormModels >= 2) {
    flags.push({
      hazard: 'thunderstorm', level: 'watch', title: 'Thunderstorms', value: d.stormModels, unit: 'models',
      threshold: 'thunderstorm in 2+ models', probability: null,
    })
  }
  return flags
}

const fmt = (v: number, unit: string) => `${Math.round(v)} ${unit}`

const worse = (a: AlertLevel, b: AlertLevel): AlertLevel => (a === 'warning' || b === 'warning' ? 'warning' : 'watch')
const isWorse = (hazard: Hazard, a: number, b: number) => (hazard === 'cold' ? a < b : a > b)

// Daily flags merged into episodes (consecutive days, same title).
export function detectExtremes(days: DayForecast[]): ForecastAlert[] {
  const alerts: ForecastAlert[] = []
  let prevDate: string | null = null
  const open = new Map<string, ForecastAlert>()
  for (const d of days.filter((x) => x.lead <= HORIZON)) {
    const flags = flagDay(d)
    for (const title of [...open.keys()]) {
      if (!flags.some((f) => f.title === title)) open.delete(title)
    }
    for (const f of flags) {
      const cur = open.get(f.title)
      if (cur && prevDate === cur.end) {
        cur.end = d.date
        cur.level = worse(cur.level, f.level)
        if (isWorse(f.hazard, f.value, cur.peak)) {
          cur.peak = f.value
          cur.peakDate = d.date
          cur.probability = f.probability
        }
        continue
      }
      const alert: ForecastAlert = {
        hazard: f.hazard, level: f.level, title: f.title, start: d.date, end: d.date, peak: f.value, peakDate: d.date,
        unit: f.unit, detail: `Threshold: ${f.threshold}.`, probability: f.probability, official: [],
      }
      open.set(f.title, alert)
      alerts.push(alert)
    }
    prevDate = d.date
  }
  for (const a of alerts) a.detail = `Peak ${fmt(a.peak, a.unit)}. ${a.detail}`
  return alerts
}

const RELATED: Record<Hazard, Hazard[]> = {
  heat: ['heat', 'fire'],
  cold: ['cold', 'snow'],
  rain: ['rain', 'flood', 'thunderstorm'],
  flood: ['flood', 'rain'],
  wind: ['wind', 'coastal', 'thunderstorm'],
  snow: ['snow', 'cold', 'avalanche'],
  thunderstorm: ['thunderstorm', 'rain', 'wind'],
  fog: ['fog'],
  fire: ['fire', 'heat'],
  coastal: ['coastal', 'wind'],
  avalanche: ['avalanche', 'snow'],
  other: [],
}

// Local calendar date of an ISO timestamp with offset ("2026-10-22T10:01:02+02:00").
const dateOf = (s: string | null) => (s ? s.slice(0, 10) : null)

export function overlaps(a: ForecastAlert, w: OfficialWarning): boolean {
  if (!RELATED[a.hazard].includes(w.hazard)) return false
  const on = dateOf(w.onset) ?? a.start
  const off = dateOf(w.expires) ?? on
  return on <= a.end && off >= a.start
}

export function crossCheck(alerts: ForecastAlert[], warnings: OfficialWarning[]) {
  const used = new Set<OfficialWarning>()
  for (const a of alerts) {
    a.official = warnings.filter((w) => overlaps(a, w))
    a.official.forEach((w) => used.add(w))
  }
  return { alerts, unmatched: warnings.filter((w) => !used.has(w)) }
}
