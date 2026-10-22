// Backtesting: how good was each model over the last 7 days at the nearest
// observing station, and how much should that change its weight?

import { BACKTEST_LEADS, type PastRuns } from '../api/openMeteo'
import type { Observations } from '../api/observations'
import { DETERMINISTIC_MODELS } from './models'
import { quantile } from './stats'

export interface LeadScore {
  n: number // hourly pairs
  mae: number
  bias: number // forecast - observed
  // Rain occurrence over 3-hour blocks.
  rain: { hits: number; misses: number; falseAlarms: number; correctNegatives: number; ets: number | null }
}

export interface ModelScore {
  model: string
  // index = lead day (1..7); undefined when the model has no data at that lead
  leads: (LeadScore | undefined)[]
}

export interface BacktestResult {
  windowStart: string
  windowEnd: string
  scores: ModelScore[]
  rainBlocks: number // observed rainy 3-h blocks in the window
  // Weight multipliers, [model][lead day 0..15]
  tempSkill: Record<string, number[]>
  precipSkill: Record<string, number[]>
  // Hourly series used for the plot (lead 1)
  series: { time: string; obs: number | null; byModel: Record<string, number | null> }[]
}

const WINDOW_DAYS = 7
const RAIN_MM_3H = 0.3
// Shrinkage: with n days of data a full-strength multiplier is damped to
// m^(n / (n + PRIOR_DAYS)), so one lucky week cannot dominate.
const PRIOR_DAYS = 3
const MIN_RAIN_BLOCKS = 4

function ets(hits: number, misses: number, falseAlarms: number, total: number): number | null {
  const random = ((hits + misses) * (hits + falseAlarms)) / Math.max(1, total)
  const denom = hits + misses + falseAlarms - random
  return denom > 0 ? (hits - random) / denom : null
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function scoreModel(run: PastRuns, obs: Observations, from: string, to: string, maxLead: number): ModelScore {
  const leads: (LeadScore | undefined)[] = []
  for (let lead = 1; lead <= Math.min(BACKTEST_LEADS, maxLead); lead++) {
    const temp = run.temp[lead] ?? []
    const precip = run.precip[lead] ?? []
    let n = 0
    let absSum = 0
    let biasSum = 0
    const blocks = new Map<string, { obs: boolean; mm: number; hours: number }>()
    run.time.forEach((t, i) => {
      if (t < from || t >= to) return
      const f = temp[i]
      const o = obs.temp.get(t)
      if (f != null && o != null) {
        n++
        absSum += Math.abs(f - o)
        biasSum += f - o
      }
      const p = precip[i]
      const r = obs.rain.get(t)
      if (p == null || r == null) return
      const key = `${t.slice(0, 11)}${Math.floor(Number(t.slice(11, 13)) / 3)}`
      const b = blocks.get(key) ?? { obs: false, mm: 0, hours: 0 }
      b.obs ||= r
      b.mm += p
      b.hours++
      blocks.set(key, b)
    })
    if (n < 24) continue
    let hits = 0
    let misses = 0
    let falseAlarms = 0
    let correctNegatives = 0
    for (const b of blocks.values()) {
      if (b.hours < 2) continue
      const fc = b.mm >= RAIN_MM_3H
      if (fc && b.obs) hits++
      else if (!fc && b.obs) misses++
      else if (fc && !b.obs) falseAlarms++
      else correctNegatives++
    }
    const total = hits + misses + falseAlarms + correctNegatives
    leads[lead] = {
      n,
      mae: absSum / n,
      bias: biasSum / n,
      rain: { hits, misses, falseAlarms, correctNegatives, ets: ets(hits, misses, falseAlarms, total) },
    }
  }
  return { model: run.model, leads }
}

// Multiplier for each forecast lead day 0..15 from per-lead multipliers
// 1..7: lead 0 uses day 1, and beyond day 7 the effect fades out by day 15.
function spread(perLead: (number | undefined)[]): number[] {
  const out: number[] = []
  let last = 1
  for (let d = 0; d <= 15; d++) {
    if (d <= BACKTEST_LEADS) {
      last = perLead[Math.max(1, d)] ?? last
      out.push(last)
    } else {
      out.push(last ** Math.max(0, 1 - (d - BACKTEST_LEADS) / 8))
    }
  }
  return out
}

export function computeBacktest(runs: PastRuns[], obs: Observations, now = new Date()): BacktestResult {
  // Last 7 complete UTC days up to the latest whole hour.
  const end = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000)
  const start = new Date(end.getTime() - WINDOW_DAYS * 86_400_000)
  const iso = (d: Date) => d.toISOString().slice(0, 13) + ':00'
  const from = iso(start)
  const to = iso(end)

  const scores = runs.map((r) => {
    const spec = DETERMINISTIC_MODELS.find((m) => m.id === r.model)
    // A model is only scored within its native range (see models.ts).
    return scoreModel(r, obs, from, to, spec ? spec.days - 1 : BACKTEST_LEADS)
  })

  const tempSkill: Record<string, number[]> = {}
  const precipSkill: Record<string, number[]> = {}
  const tempPer: Record<string, (number | undefined)[]> = {}
  const precipPer: Record<string, (number | undefined)[]> = {}
  for (let lead = 1; lead <= BACKTEST_LEADS; lead++) {
    const at = scores.flatMap((s) => (s.leads[lead] ? [{ model: s.model, sc: s.leads[lead]! }] : []))
    if (at.length < 2) continue
    const refMae = quantile(at.map((x) => x.sc.mae), 0.5)!
    const etsValues = at.map((x) => x.sc.rain.ets).filter((v): v is number => v != null)
    const refEts = etsValues.length ? quantile(etsValues, 0.5)! : null
    for (const { model, sc } of at) {
      const k = sc.n / 24 / (sc.n / 24 + PRIOR_DAYS)
      ;(tempPer[model] ??= [])[lead] = clamp((refMae / Math.max(0.3, sc.mae)) ** 2, 0.25, 4) ** k
      const rainy = sc.rain.hits + sc.rain.misses
      if (refEts != null && sc.rain.ets != null && rainy >= MIN_RAIN_BLOCKS) {
        ;(precipPer[model] ??= [])[lead] = clamp((sc.rain.ets + 0.2) / (refEts + 0.2), 0.33, 3) ** k
      }
    }
  }
  for (const s of scores) {
    tempSkill[s.model] = spread(tempPer[s.model] ?? [])
    precipSkill[s.model] = spread(precipPer[s.model] ?? [])
  }

  const rainBlocks = new Set(
    [...obs.rain].filter(([t, r]) => r && t >= from && t < to).map(([t]) => `${t.slice(0, 11)}${Math.floor(Number(t.slice(11, 13)) / 3)}`),
  ).size

  const times = runs[0]?.time.filter((t) => t >= from && t < to) ?? []
  const series = times.map((t) => {
    const byModel: Record<string, number | null> = {}
    for (const r of runs) byModel[r.model] = r.temp[1]?.[r.time.indexOf(t)] ?? null
    return { time: t, obs: obs.temp.get(t) ?? null, byModel }
  })

  return { windowStart: from, windowEnd: to, scores, rainBlocks, tempSkill, precipSkill, series }
}
