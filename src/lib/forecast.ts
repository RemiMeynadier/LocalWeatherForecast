import type { DeterministicSeries, EnsembleSeries, Num } from '../api/openMeteo'
import type { Climatology, DayNormal } from './climate'
import { DETERMINISTIC_MODELS, ENSEMBLE_MODELS, modelWeight } from './models'
import { type Sample, weightedFraction, weightedMean, weightedQuantile } from './stats'

export interface Quantiles {
  p10: number
  p25: number
  p50: number
  p75: number
  p90: number
}

export type Confidence = 'high' | 'good' | 'medium' | 'low' | 'trend'

export interface ModelValue {
  model: string
  tmax: number | null
  tmin: number | null
  precip: number | null
  gust: number | null
  snow: number | null
  code: number | null
  weight: number // temperature consensus weight
  precipWeight: number // precipitation consensus weight
  priorWeight: number // before backtesting
}

export interface SkillWeights {
  temp: Record<string, number[]>
  precip: Record<string, number[]>
}

export interface DayForecast {
  date: string
  lead: number // 0 = today
  // Best estimate: weighted multi-model consensus, or ensemble median beyond
  // the deterministic horizon.
  tmax: number | null
  tmin: number | null
  precip: number | null
  code: number | null
  wind: number | null
  gust: number | null // weighted median of the models that provide gusts
  gustMax: number | null // strongest model, for "possible" wording
  snow: number | null // cm
  stormModels: number // models showing thunderstorms
  source: 'consensus' | 'ensemble' | 'none'
  models: ModelValue[]
  ensemble: {
    tmax: Quantiles
    tmin: Quantiles
    precipMean: number
    rainProb: number // P(precip >= 1 mm)
    members: number
    sources: string[]
    samples: { tmax: Sample[]; tmin: Sample[]; precip: Sample[] }
  } | null
  normal: DayNormal | null
  confidence: Confidence
}

export interface WeekOutlook {
  start: string
  end: string
  days: number
  sources: string[]
  tempMean: number // weighted median of member period means
  tempAnomaly: number | null // vs climate median
  tempProbs: [number, number, number] | null // below / near / above normal
  precipTotal: number
  precipProbs: [number, number, number] | null
}

const RAIN_THRESHOLD = 1

function val(arr: Num[] | undefined, i: number): number | null {
  const v = arr?.[i]
  return v == null || Number.isNaN(v) ? null : v
}

function quantiles(samples: Sample[]): Quantiles | null {
  if (!samples.length) return null
  return {
    p10: weightedQuantile(samples, 0.1)!,
    p25: weightedQuantile(samples, 0.25)!,
    p50: weightedQuantile(samples, 0.5)!,
    p75: weightedQuantile(samples, 0.75)!,
    p90: weightedQuantile(samples, 0.9)!,
  }
}

const LEVELS: Confidence[] = ['high', 'good', 'medium', 'low', 'trend']

// Lead time sets the baseline; a wide ensemble spread knocks it down a level.
export function confidenceFor(lead: number, tmaxSpread: number | null): Confidence {
  let level = lead <= 2 ? 0 : lead <= 5 ? 1 : lead <= 9 ? 2 : lead <= 14 ? 3 : 4
  if (tmaxSpread != null && tmaxSpread > 4 && level < 4) level++
  return LEVELS[level]
}

// Ensemble members, each weighted so that every ensemble system counts by
// its own weight regardless of how many members it has.
function ensembleSamples(ens: EnsembleSeries[], date: string, pick: (e: EnsembleSeries) => Num[][]) {
  const samples: Sample[] = []
  const sources: string[] = []
  for (const e of ens) {
    const spec = ENSEMBLE_MODELS.find((m) => m.id === e.model)
    const i = e.time.indexOf(date)
    if (!spec || i < 0) continue
    const values = pick(e).map((m) => val(m, i)).filter((v): v is number => v != null)
    if (!values.length) continue
    sources.push(spec.label)
    for (const value of values) samples.push({ value, weight: spec.weight / values.length })
  }
  return { samples, sources }
}

export function buildDailyForecast(
  det: DeterministicSeries[],
  ens: EnsembleSeries[],
  climate: Climatology | null,
  lat: number,
  lon: number,
  skill: SkillWeights | null = null,
): DayForecast[] {
  const dates = new Set<string>()
  for (const s of [...det, ...ens]) s.time.forEach((t) => dates.add(t))
  const sorted = [...dates].sort()

  return sorted.map((date, lead) => {
    const models: ModelValue[] = []
    for (const s of det) {
      const spec = DETERMINISTIC_MODELS.find((m) => m.id === s.model)
      const i = s.time.indexOf(date)
      if (!spec || i < 0) continue
      const priorWeight = modelWeight(spec, lead, lat, lon)
      const tmax = val(s.tmax, i)
      if (priorWeight === 0 || tmax == null) continue
      models.push({
        model: s.model,
        tmax,
        tmin: val(s.tmin, i),
        precip: val(s.precip, i),
        gust: val(s.gust, i),
        snow: val(s.snow, i),
        code: val(s.code, i),
        priorWeight,
        weight: priorWeight * (skill?.temp[s.model]?.[lead] ?? 1),
        precipWeight: priorWeight * (skill?.precip[s.model]?.[lead] ?? 1),
      })
    }

    const tx = ensembleSamples(ens, date, (e) => e.tmax)
    const tn = ensembleSamples(ens, date, (e) => e.tmin)
    const pr = ensembleSamples(ens, date, (e) => e.precip)
    const tmaxQ = quantiles(tx.samples)
    const tminQ = quantiles(tn.samples)
    const ensemble =
      tmaxQ && tminQ && pr.samples.length
        ? {
            tmax: tmaxQ,
            tmin: tminQ,
            precipMean: weightedMean(pr.samples)!,
            rainProb: weightedFraction(pr.samples, (v) => v >= RAIN_THRESHOLD)!,
            members: tx.samples.length,
            sources: tx.sources,
            samples: { tmax: tx.samples, tmin: tn.samples, precip: pr.samples },
          }
        : null

    const consensus = (key: 'tmax' | 'tmin' | 'precip' | 'snow') =>
      weightedMean(
        models.flatMap((m) =>
          m[key] == null ? [] : [{ value: m[key]!, weight: key === 'tmax' || key === 'tmin' ? m.weight : m.precipWeight }],
        ),
      )
    const gusts = models.flatMap((m) => (m.gust == null ? [] : [{ value: m.gust, weight: m.weight }]))

    // Weather icon & wind come from the most trusted model of the day.
    const top = det.find((s) => s.model === [...models].sort((a, b) => b.weight - a.weight)[0]?.model)
    const ti = top ? top.time.indexOf(date) : -1

    const hasConsensus = models.length > 0
    return {
      date,
      lead,
      tmax: hasConsensus ? consensus('tmax') : (ensemble?.tmax.p50 ?? null),
      tmin: hasConsensus ? consensus('tmin') : (ensemble?.tmin.p50 ?? null),
      precip: hasConsensus ? consensus('precip') : (ensemble?.precipMean ?? null),
      code: top ? val(top.code, ti) : null,
      wind: top ? val(top.wind, ti) : null,
      gust: weightedQuantile(gusts, 0.5),
      gustMax: gusts.length ? Math.max(...gusts.map((g) => g.value)) : null,
      snow: hasConsensus ? consensus('snow') : null,
      stormModels: models.filter((m) => m.code != null && m.code >= 95).length,
      source: hasConsensus ? 'consensus' : ensemble ? 'ensemble' : 'none',
      models,
      ensemble,
      normal: climate?.normal(date) ?? null,
      confidence: confidenceFor(lead, ensemble ? ensemble.tmax.p90 - ensemble.tmax.p10 : null),
    }
  })
}

function terciles(samples: Sample[], [lo, hi]: [number, number]): [number, number, number] {
  const below = weightedFraction(samples, (v) => v < lo)!
  const above = weightedFraction(samples, (v) => v > hi)!
  return [below, Math.max(0, 1 - below - above), above]
}

// Weekly outlooks from the ensembles, in the style of extended-range
// forecasts: tercile probabilities against the 1991-2020 climate.
export function buildWeeklyOutlook(
  ens: EnsembleSeries[],
  climate: Climatology | null,
  startLead = 1,
  weeks = 5,
): WeekOutlook[] {
  const ref = ens.find((e) => e.time.length)?.time
  if (!ref) return []
  // Last day any system still has data for (the final week is often partial).
  const lastDate = ens
    .map((e) => e.time[e.tmax[0]?.findLastIndex((v) => v != null) ?? -1])
    .filter(Boolean)
    .sort()
    .pop()
  const end = lastDate ? ref.indexOf(lastDate) + 1 : ref.length
  const out: WeekOutlook[] = []
  for (let w = 0; w < weeks; w++) {
    const from = startLead + w * 7
    const dates = ref.slice(from, Math.min(from + 7, end))
    if (dates.length < 5) break

    const temp: Sample[] = []
    const precip: Sample[] = []
    const sources: string[] = []
    for (const e of ens) {
      const spec = ENSEMBLE_MODELS.find((m) => m.id === e.model)
      if (!spec) continue
      const idx = dates.map((d) => e.time.indexOf(d))
      // A system only votes on a week it fully covers.
      const memberStats = e.tmax.flatMap((mx, m) => {
        let t = 0
        let p = 0
        for (const i of idx) {
          const a = val(mx, i)
          const b = val(e.tmin[m], i)
          const c = val(e.precip[m], i)
          if (i < 0 || a == null || b == null || c == null) return []
          t += (a + b) / 2
          p += c
        }
        return [{ t: t / idx.length, p }]
      })
      if (!memberStats.length) continue
      sources.push(spec.label)
      for (const s of memberStats) {
        temp.push({ value: s.t, weight: spec.weight / memberStats.length })
        precip.push({ value: s.p, weight: spec.weight / memberStats.length })
      }
    }
    if (!temp.length) continue

    const clim = climate?.period(dates[0], dates.length) ?? null
    const tempMean = weightedQuantile(temp, 0.5)!
    out.push({
      start: dates[0],
      end: dates[dates.length - 1],
      days: dates.length,
      sources,
      tempMean,
      tempAnomaly: clim ? tempMean - clim.tempMedian : null,
      tempProbs: clim ? terciles(temp, clim.tempTerciles) : null,
      precipTotal: weightedQuantile(precip, 0.5)!,
      precipProbs: clim ? terciles(precip, clim.precipTerciles) : null,
    })
  }
  return out
}
