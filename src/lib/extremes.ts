// Flags potentially dangerous or unusual weather in the next 15 days and
// cross-checks it against official warnings.

import type { Hazard, OfficialWarning } from '../api/warnings'
import type { DayForecast } from './forecast'
import { weightedFraction } from './stats'

export type AlertLevel = 'watch' | 'warning'

// Doubles as the translation key of the alert's title.
export type AlertKind =
  | 'xHeat' | 'xWarmth' | 'xSevereCold' | 'xUnusualCold' | 'xFrost'
  | 'xRain' | 'xWind' | 'xWindPossible' | 'xSnow' | 'xStorms'

export interface Threshold {
  value: number
  unit: string
  // abs: fixed value · local: local climate extreme · oneModel: reached by
  // one model · twoModels: flagged by 2+ models
  type: 'abs' | 'local' | 'oneModel' | 'twoModels'
}

export interface ForecastAlert {
  hazard: Hazard
  level: AlertLevel
  kind: AlertKind
  start: string
  end: string
  peak: number // value on the worst day
  peakDate: string
  unit: string
  threshold: Threshold
  probability: number | null // share of ensemble scenarios exceeding the threshold
  official: OfficialWarning[]
}

interface DayFlag {
  hazard: Hazard
  level: AlertLevel
  kind: AlertKind
  value: number
  unit: string
  threshold: Threshold
  probability: number | null
}

const HORIZON = 15

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
        hazard: 'heat', level: d.tmax >= 40 ? 'warning' : 'watch', kind: 'xHeat', value: d.tmax, unit: '°C',
        threshold: { value: 35, unit: '°C', type: 'abs' }, probability: prob('tmax', (v) => v >= 35),
      })
    } else if (n && d.tmax >= n.tmaxP975 && d.tmax - n.tmax >= 5) {
      flags.push({
        hazard: 'heat', level: 'watch', kind: 'xWarmth', value: d.tmax, unit: '°C',
        threshold: { value: n.tmaxP975, unit: '°C', type: 'local' },
        probability: prob('tmax', (v) => v >= n.tmaxP975),
      })
    }
  }

  // Cold and unseasonal frost.
  if (d.tmin != null) {
    if (d.tmin <= -10) {
      flags.push({
        hazard: 'cold', level: d.tmin <= -15 ? 'warning' : 'watch', kind: 'xSevereCold', value: d.tmin, unit: '°C',
        threshold: { value: -10, unit: '°C', type: 'abs' }, probability: prob('tmin', (v) => v <= -10),
      })
    } else if (n && d.tmin <= n.tminP025 && n.tmin - d.tmin >= 5) {
      flags.push({
        hazard: 'cold', level: 'watch', kind: 'xUnusualCold', value: d.tmin, unit: '°C',
        threshold: { value: n.tminP025, unit: '°C', type: 'local' },
        probability: prob('tmin', (v) => v <= n.tminP025),
      })
    } else if (n && d.tmin <= 0 && n.tmin >= 4) {
      flags.push({
        hazard: 'cold', level: 'watch', kind: 'xFrost', value: d.tmin, unit: '°C',
        threshold: { value: 0, unit: '°C', type: 'abs' }, probability: prob('tmin', (v) => v <= 0),
      })
    }
  }

  // Heavy rain: at least 20 mm, and at least the local 1-in-100-days amount.
  const rainThr = Math.max(20, n?.precipP99 ?? 20)
  const pRain = prob('precip', (v) => v >= rainThr)
  if ((d.precip != null && d.precip >= rainThr) || (pRain != null && pRain >= 0.3)) {
    const severe = (d.precip ?? 0) >= Math.max(50, rainThr * 2) || (prob('precip', (v) => v >= 50) ?? 0) >= 0.3
    flags.push({
      hazard: 'rain', level: severe ? 'warning' : 'watch', kind: 'xRain', value: d.precip ?? 0, unit: 'mm',
      threshold: { value: rainThr, unit: 'mm', type: rainThr > 20 ? 'local' : 'abs' }, probability: pRain,
    })
  }

  // Wind gusts.
  if (d.gust != null && d.gust >= 70) {
    flags.push({
      hazard: 'wind', level: d.gust >= 90 ? 'warning' : 'watch', kind: 'xWind', value: d.gust, unit: 'km/h',
      threshold: { value: 70, unit: 'km/h', type: 'abs' }, probability: null,
    })
  } else if (d.gustMax != null && d.gustMax >= 90) {
    flags.push({
      hazard: 'wind', level: 'watch', kind: 'xWindPossible', value: d.gustMax, unit: 'km/h',
      threshold: { value: 90, unit: 'km/h', type: 'oneModel' }, probability: null,
    })
  }

  if (d.snow != null && d.snow >= 2) {
    flags.push({
      hazard: 'snow', level: d.snow >= 10 ? 'warning' : 'watch', kind: 'xSnow', value: d.snow, unit: 'cm',
      threshold: { value: 2, unit: 'cm', type: 'abs' }, probability: null,
    })
  }

  if (d.stormModels >= 2) {
    flags.push({
      hazard: 'thunderstorm', level: 'watch', kind: 'xStorms', value: d.stormModels, unit: '',
      threshold: { value: 2, unit: '', type: 'twoModels' }, probability: null,
    })
  }
  return flags
}

const worse = (a: AlertLevel, b: AlertLevel): AlertLevel => (a === 'warning' || b === 'warning' ? 'warning' : 'watch')
const isWorse = (hazard: Hazard, a: number, b: number) => (hazard === 'cold' ? a < b : a > b)

// Daily flags merged into episodes (consecutive days, same kind).
export function detectExtremes(days: DayForecast[]): ForecastAlert[] {
  const alerts: ForecastAlert[] = []
  let prevDate: string | null = null
  const open = new Map<AlertKind, ForecastAlert>()
  for (const d of days.filter((x) => x.lead <= HORIZON)) {
    const flags = flagDay(d)
    for (const kind of [...open.keys()]) {
      if (!flags.some((f) => f.kind === kind)) open.delete(kind)
    }
    for (const f of flags) {
      const cur = open.get(f.kind)
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
        hazard: f.hazard, level: f.level, kind: f.kind, start: d.date, end: d.date, peak: f.value, peakDate: d.date,
        unit: f.unit, threshold: f.threshold, probability: f.probability, official: [],
      }
      open.set(f.kind, alert)
      alerts.push(alert)
    }
    prevDate = d.date
  }
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
