import { describe, expect, it } from 'vitest'
import type { ClimateSeries, DeterministicSeries, EnsembleSeries } from '../api/openMeteo'
import { Climatology } from './climate'
import { buildDailyForecast, buildWeeklyOutlook, confidenceFor } from './forecast'
import { DETERMINISTIC_MODELS, modelWeight, selectDeterministicModels } from './models'

const TOULOUSE = { lat: 43.6, lon: 1.44 }
const NEW_YORK = { lat: 40.7, lon: -74 }

function dates(n: number, start = '2026-10-22'): string[] {
  const t0 = Date.parse(`${start}T00:00:00Z`)
  return Array.from({ length: n }, (_, i) => new Date(t0 + i * 86_400_000).toISOString().slice(0, 10))
}

function det(model: string, n: number, tmax: number): DeterministicSeries {
  const filled = (v: number) => Array.from({ length: 16 }, (_, i) => (i < n ? v : null))
  return { model, time: dates(16), tmax: filled(tmax), tmin: filled(tmax - 10), precip: filled(1), code: filled(3), wind: filled(10) }
}

function ens(model: string, days: number, members: number[]): EnsembleSeries {
  const series = (offset: number) =>
    members.map((m) => Array.from({ length: 35 }, (_, i) => (i < days ? m + offset : null)))
  return { model, time: dates(35), tmax: series(0), tmin: series(-10), precip: series(-m0(members)) }
}
const m0 = (m: number[]) => Math.min(...m) // so precipitation members start at 0

describe('model selection', () => {
  it('uses Météo-France only in Europe', () => {
    const fr = selectDeterministicModels(TOULOUSE.lat, TOULOUSE.lon).map((m) => m.id)
    const us = selectDeterministicModels(NEW_YORK.lat, NEW_YORK.lon).map((m) => m.id)
    expect(fr).toContain('meteofrance_seamless')
    expect(us).not.toContain('meteofrance_seamless')
    expect(us).toContain('gfs_seamless')
  })

  it('boosts local high-resolution models at short range only', () => {
    const mf = DETERMINISTIC_MODELS.find((m) => m.id === 'meteofrance_seamless')!
    const ecmwf = DETERMINISTIC_MODELS.find((m) => m.id === 'ecmwf_ifs025')!
    expect(modelWeight(mf, 0, TOULOUSE.lat, TOULOUSE.lon)).toBeGreaterThan(modelWeight(ecmwf, 0, TOULOUSE.lat, TOULOUSE.lon))
    expect(modelWeight(mf, 4, TOULOUSE.lat, TOULOUSE.lon)).toBe(0) // beyond its horizon
  })

  it('never weighs a model beyond its native horizon', () => {
    for (const m of DETERMINISTIC_MODELS) expect(modelWeight(m, m.days, 0, 0)).toBe(0)
  })
})

describe('confidence', () => {
  it('drops with lead time and with ensemble spread', () => {
    expect(confidenceFor(0, 1)).toBe('high')
    expect(confidenceFor(12, 1)).toBe('low')
    expect(confidenceFor(20, 1)).toBe('trend')
    expect(confidenceFor(0, 6)).toBe('good')
  })
})

describe('daily forecast', () => {
  const series = [det('ecmwf_ifs025', 15, 20), det('meteofrance_seamless', 4, 10)]
  const ensembles = [ens('gfs05', 34, [10, 12, 14, 16, 18])]
  const days = buildDailyForecast(series, ensembles, null, TOULOUSE.lat, TOULOUSE.lon)

  it('blends models with lead-dependent weights', () => {
    // Day 0: AROME dominates, so the consensus sits closer to 10 than to 20.
    expect(days[0].tmax!).toBeLessThan(15)
    // Day 5: only ECMWF remains.
    expect(days[5].tmax).toBe(20)
    expect(days[5].models.map((m) => m.model)).toEqual(['ecmwf_ifs025'])
  })

  it('falls back to the ensemble median after the deterministic horizon', () => {
    expect(days[20].source).toBe('ensemble')
    expect(days[20].tmax).toBe(14)
    expect(days[20].ensemble!.tmax.p10).toBeLessThan(days[20].ensemble!.tmax.p90)
  })

  it('computes rain probabilities from members', () => {
    // Precip members are 0, 2, 4, 6, 8 mm: 4 of 5 are >= 1 mm.
    expect(days[20].ensemble!.rainProb).toBeCloseTo(0.8)
  })
})

describe('climatology and weekly outlook', () => {
  // 30 years of a flat 15° climate, with daily noise so terciles are distinct.
  const time = dates(366 * 30 + 8, '1991-01-01').filter((d) => d <= '2020-12-31')
  const climate: ClimateSeries = {
    time,
    tmax: time.map((_, i) => 20 + ((i * 7) % 5) - 2),
    tmin: time.map((_, i) => 10 + ((i * 3) % 5) - 2),
    precip: time.map((_, i) => (i % 3 === 0 ? 3 : 0)),
  }
  const clim = new Climatology(climate)

  it('computes daily normals', () => {
    const n = clim.normal('2026-10-30')!
    expect(n.tmax).toBeCloseTo(20, 0)
    expect(n.tmin).toBeCloseTo(10, 0)
    expect(n.rainDayProb).toBeCloseTo(1 / 3, 1)
  })

  it('flags a clearly warm week as warmer than normal', () => {
    const warm = [ens('gfs05', 34, [28, 29, 30, 31, 32])]
    const weeks = buildWeeklyOutlook(warm, clim)
    expect(weeks.length).toBe(5)
    expect(weeks[0].tempProbs![2]).toBe(1)
    expect(weeks[0].tempAnomaly!).toBeGreaterThan(5)
    // GEFS stops at J+33: the last week is partial but kept.
    expect(weeks[4].days).toBe(5)
  })
})
