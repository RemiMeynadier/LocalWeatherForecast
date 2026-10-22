import { describe, expect, it } from 'vitest'
import type { PastRuns, SynopticGrid } from '../api/openMeteo'
import { isPrecipitating, parseMetarCsv, type Observations } from '../api/observations'
import { areaMatches, nwsHazard, type OfficialWarning } from '../api/warnings'
import { computeBacktest, scoreModel } from './backtest'
import { crossCheck, detectExtremes } from './extremes'
import type { DayForecast } from './forecast'
import { analyseStep, findCentres } from './synoptic'

const station = { id: 'TEST', name: 'Test', lat: 0, lon: 0, elevation: 0, distanceKm: 1 }

describe('METAR observations', () => {
  it('recognises precipitation but not vicinity or recent weather', () => {
    expect(isPrecipitating('-RA')).toBe(true)
    expect(isPrecipitating('+SHRA BR')).toBe(true)
    expect(isPrecipitating('TSRA')).toBe(true)
    expect(isPrecipitating('VCSH')).toBe(false)
    expect(isPrecipitating('RERA')).toBe(false)
    expect(isPrecipitating('BR')).toBe(false)
    expect(isPrecipitating(null)).toBe(false)
  })

  it('snaps reports to the hour and averages them', () => {
    const csv = 'station,valid,tmpc,wxcodes\nT,2026-10-20 10:00,10.00,null\nT,2026-10-20 10:30,12.00,-RA\nT,2026-10-20 11:50,null,null\n'
    const obs = parseMetarCsv(csv, station)
    // 10:30 rounds to 11:00, 11:50 to 12:00 (no temperature).
    expect(obs.temp.get('2026-10-20T10:00')).toBe(10)
    expect(obs.temp.get('2026-10-20T11:00')).toBe(12)
    expect(obs.rain.get('2026-10-20T11:00')).toBe(true)
    expect(obs.temp.has('2026-10-20T12:00')).toBe(false)
  })
})

describe('official warnings', () => {
  it('matches areas regardless of accents and case', () => {
    expect(areaMatches(['Finistère', 'Morbihan'], ['France', 'Bretagne', 'Finistere'])).toBe(true)
    expect(areaMatches(['Var'], ['France', 'Haute-Garonne'])).toBe(false)
  })

  it('maps NWS events to hazards', () => {
    expect(nwsHazard('Excessive Heat Warning')).toBe('heat')
    expect(nwsHazard('Flash Flood Watch')).toBe('flood')
    expect(nwsHazard('Wind Advisory')).toBe('wind')
    expect(nwsHazard('Winter Storm Warning')).toBe('snow')
  })
})

function hours(start: string, n: number): string[] {
  const t0 = Date.parse(`${start}:00Z`)
  return Array.from({ length: n }, (_, i) => new Date(t0 + i * 3_600_000).toISOString().slice(0, 13) + ':00')
}

describe('backtest', () => {
  const time = hours('2026-10-14T00', 9 * 24)
  const truth = time.map((_, i) => 10 + 5 * Math.sin((i / 24) * 2 * Math.PI))
  const obs: Observations = {
    station,
    temp: new Map(time.map((t, i) => [t, truth[i]])),
    rain: new Map(time.map((t, i) => [t, i % 24 < 3])),
  }
  const run = (model: string, error: number, rainy: boolean): PastRuns => ({
    model,
    time,
    temp: [[], ...Array.from({ length: 7 }, () => truth.map((v) => v + error))],
    precip: [[], ...Array.from({ length: 7 }, () => time.map((_, i) => (rainy && i % 24 < 3 ? 1 : 0)))],
  })
  const now = new Date('2026-10-22T12:00:00Z')

  it('scores MAE, bias and rain detection', () => {
    const s = scoreModel(run('ecmwf_ifs025', 2, true), obs, '2026-10-15T12:00', '2026-10-22T12:00', 7)
    expect(s.leads[1]!.mae).toBeCloseTo(2)
    expect(s.leads[1]!.bias).toBeCloseTo(2)
    expect(s.leads[1]!.rain.ets).toBeCloseTo(1) // perfect rain timing
  })

  it('gives more weight to the more accurate model, damped and fading with lead', () => {
    const r = computeBacktest([run('ecmwf_ifs025', 0.5, true), run('gfs_seamless', 2, false), run('icon_seamless', 1, true)], obs, now)
    const good = r.tempSkill.ecmwf_ifs025
    const bad = r.tempSkill.gfs_seamless
    expect(good[1]).toBeGreaterThan(1)
    expect(bad[1]).toBeLessThan(1)
    // Damping: a 2x better model does not get the full (2)^2 = 4x.
    expect(good[1]).toBeLessThan(4)
    // Fades back to 1 by D+15.
    expect(good[15]).toBeCloseTo(1)
    // ICON only covers 7 days, so it is scored up to D+6.
    expect(r.scores.find((s) => s.model === 'icon_seamless')!.leads[7]).toBeUndefined()
    // The model that never forecast rain loses precipitation weight.
    expect(r.precipSkill.gfs_seamless[1]).toBeLessThan(1)
  })
})

describe('synoptic analysis', () => {
  // 11 x 17 grid, pressure rising northwards (high to the north): in the
  // northern hemisphere that gives an easterly geostrophic flow.
  const lats = Array.from({ length: 11 }, (_, i) => 30 + i * 3)
  const lons = Array.from({ length: 17 }, (_, i) => -24 + i * 3)
  const field = (f: (r: number, c: number) => number) => [lats.map((_, r) => lons.map((_, c) => f(r, c)))]
  const grid: SynopticGrid = {
    lats,
    lons,
    times: ['2026-10-22T00:00'],
    mslp: field((r) => 1000 + r * 3),
    z500: field((_, c) => 5600 + 20 * (c - 8) ** 2), // trough in the middle column
    t850: field(() => 5),
  }

  it('derives the surface flow direction and upper trough', () => {
    const s = analyseStep(grid, 0, 3)
    expect(s.surfaceFlow?.from).toBe(2) // east
    expect(s.upper).toBe('trough')
  })

  it('finds pressure centres', () => {
    const bowl: SynopticGrid = { ...grid, mslp: field((r, c) => 990 + (r - 5) ** 2 + (c - 8) ** 2) }
    const centres = findCentres(bowl, 0)
    expect(centres).toHaveLength(1)
    expect(centres[0]).toMatchObject({ kind: 'L', lat: 45, lon: 0, value: 990 })
  })
})

function day(date: string, lead: number, over: Partial<DayForecast> = {}): DayForecast {
  return {
    date, lead, tmax: 18, tmin: 9, precip: 0, code: 3, wind: 10, gust: 30, gustMax: 35, snow: 0, stormModels: 0,
    source: 'consensus', models: [], ensemble: null,
    normal: { tmax: 18, tmin: 9, precip: 2, rainDayProb: 0.3, tmaxP975: 24, tminP025: 2, precipP99: 25 },
    confidence: 'high', ...over,
  }
}

describe('extremes', () => {
  it('merges consecutive windy days into one episode and keeps the peak', () => {
    const days = [day('2026-10-22', 0, { gust: 80 }), day('2026-10-23', 1, { gust: 110 }), day('2026-10-24', 2), day('2026-10-25', 3, { gust: 75 })]
    const alerts = detectExtremes(days)
    expect(alerts.map((a) => [a.kind, a.level, a.start, a.end])).toEqual([
      ['xWind', 'warning', '2026-10-22', '2026-10-23'],
      ['xWind', 'watch', '2026-10-25', '2026-10-25'],
    ])
    expect(alerts[0].peak).toBe(110)
  })

  it('flags heavy rain against the local percentile and unusual warmth', () => {
    const alerts = detectExtremes([day('2026-10-22', 0, { precip: 30, tmax: 26 })])
    expect(alerts.map((a) => a.kind).sort()).toEqual(['xRain', 'xWarmth'])
  })

  it('cross-checks official warnings by hazard and date', () => {
    const alerts = detectExtremes([day('2026-10-22', 0, { gust: 95 })])
    const w = (hazard: OfficialWarning['hazard'], onset: string): OfficialWarning => ({
      source: 'MeteoAlarm', sender: 'X', hazard, level: 'orange', event: hazard, headline: '', description: '',
      onset, expires: onset, web: null,
    })
    const res = crossCheck(alerts, [w('wind', '2026-10-22T10:00:00+02:00'), w('wind', '2026-10-30T10:00:00+01:00'), w('fog', '2026-10-22T06:00:00+02:00')])
    expect(res.alerts[0].official).toHaveLength(1)
    expect(res.unmatched).toHaveLength(2)
  })
})
