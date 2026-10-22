// Turns the pressure / 500 hPa / 850 hPa grid into a short synoptic
// briefing: pressure centres, flow, troughs and ridges, and how they evolve.

import type { SynopticGrid } from '../api/openMeteo'
import { t as tr, tList } from '../i18n'
import { weekday } from './format'

export interface PressureCentre {
  kind: 'H' | 'L'
  row: number
  col: number
  lat: number
  lon: number
  value: number
}

export type Strength = 'slack' | 'light' | 'moderate' | 'strong' | 'severe'

export interface SynopticStep {
  time: string
  centres: PressureCentre[]
  mslp: number
  z500: number
  t850: number
  // `from` = compass sector the wind blows from (0 = N, 1 = NE, ... 7 = NW)
  surfaceFlow: { from: number; strength: Strength; kmh: number } | null
  upperFlow: { from: number } | null
  upper: 'trough' | 'ridge' | 'flat'
  upstream: 'trough' | 'ridge' | 'flat'
}

export interface SynopticBriefing {
  steps: SynopticStep[]
  paragraphs: { heading: string; text: string }[]
}

export const sector = (deg: number) => Math.round((((deg % 360) + 360) % 360) / 45) % 8

function bearingAndDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const r = Math.PI / 180
  const dLon = (lon2 - lon1) * r
  const y = Math.sin(dLon) * Math.cos(lat2 * r)
  const x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos(dLon)
  const bearing = (Math.atan2(y, x) / r + 360) % 360
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2
  return { bearing, km: 2 * 6371 * Math.asin(Math.sqrt(a)) }
}

// Local extrema over a 5x5 neighbourhood (ignoring the grid border, where a
// centre could lie outside the domain).
export function findCentres(grid: SynopticGrid, t: number): PressureCentre[] {
  const f = grid.mslp[t]
  const out: PressureCentre[] = []
  const rows = f.length
  const cols = f[0].length
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      const v = f[r][c]
      let isMax = true
      let isMin = true
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          if (!dr && !dc) continue
          const w = f[r + dr]?.[c + dc]
          if (w == null) continue
          if (w >= v) isMax = false
          if (w <= v) isMin = false
        }
      }
      if (isMax && v >= 1015) out.push({ kind: 'H', row: r, col: c, lat: grid.lats[r], lon: grid.lons[c], value: v })
      if (isMin && v <= 1010) out.push({ kind: 'L', row: r, col: c, lat: grid.lats[r], lon: grid.lons[c], value: v })
    }
  }
  return out
}

// Gradient (per km) at a grid node by central differences.
function gradient(f: number[][], r: number, c: number, lat: number, step: number) {
  const kmLat = 111.2 * step
  const kmLon = 111.2 * step * Math.cos((lat * Math.PI) / 180)
  const dx = (f[r][c + 1] - f[r][c - 1]) / (2 * kmLon)
  const dy = (f[r + 1][c] - f[r - 1][c]) / (2 * kmLat)
  return { dx, dy }
}

// Direction the geostrophic wind blows FROM: it runs along isobars with low
// pressure on the left in the northern hemisphere (right in the southern).
function flowFrom(dx: number, dy: number, lat: number): number {
  const s = lat >= 0 ? 1 : -1
  const u = -s * dy
  const v = s * dx
  const toward = (Math.atan2(u, v) * 180) / Math.PI // bearing the wind blows toward
  return (toward + 180 + 360) % 360
}

// Discrete Laplacian (m): positive = trough (height minimum), negative = ridge.
function curvature(f: number[][], r: number, c: number): number {
  return f[r][c + 1] + f[r][c - 1] + f[r + 1][c] + f[r - 1][c] - 4 * f[r][c]
}

const CURV = 20 // m over a 3° stencil

export function analyseStep(grid: SynopticGrid, t: number, step: number): SynopticStep {
  const r = Math.floor(grid.lats.length / 2)
  const c = Math.floor(grid.lons.length / 2)
  const lat = grid.lats[r]
  const p = grid.mslp[t]
  const z = grid.z500[t]
  const g = gradient(p, r, c, lat, step)
  // Geostrophic wind speed |∇p| / (ρ f); the surface wind is roughly 60-70% of it.
  const f = Math.max(2e-5, 2 * 7.292e-5 * Math.abs(Math.sin((lat * Math.PI) / 180)))
  const kmh = ((Math.hypot(g.dx, g.dy) * 100 / 1000) / (1.25 * f)) * 3.6
  const strength: Strength = kmh < 15 ? 'slack' : kmh < 35 ? 'light' : kmh < 65 ? 'moderate' : kmh < 100 ? 'strong' : 'severe'
  const gz = gradient(z, r, c, lat, step)
  const lap = curvature(z, r, c)
  // Upstream = 2 columns (6°) to the west, where weather usually comes from in mid-latitudes.
  const lapUp = c >= 3 ? curvature(z, r, c - 2) : 0
  const kind = (v: number) => (v > CURV ? 'trough' : v < -CURV ? 'ridge' : 'flat')
  return {
    time: grid.times[t],
    centres: findCentres(grid, t),
    mslp: p[r][c],
    z500: z[r][c],
    t850: grid.t850[t][r][c],
    surfaceFlow: { from: sector(flowFrom(g.dx, g.dy, lat)), strength, kmh },
    upperFlow: Math.hypot(gz.dx, gz.dy) * 100 < 0.5 ? null : { from: sector(flowFrom(gz.dx, gz.dy, lat)) },
    upper: kind(lap),
    upstream: kind(lapUp),
  }
}

const dayName = (iso: string) => weekday(iso)
const signedInt = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v))}`

const STRENGTH = { slack: 'sLight', light: 'sLight', moderate: 'sModerate', strong: 'sStrong', severe: 'sSevere' } as const

function flowText(f: SynopticStep['surfaceFlow']): string {
  if (!f || f.strength === 'slack') return tr('flowSlack')
  return tr('flow', { strength: tr(STRENGTH[f.strength]), from: tList('fromDirs')[f.from] })
}

function describeCentres(step: SynopticStep, lat: number, lon: number): string {
  let out = ''
  for (const kind of ['H', 'L'] as const) {
    const near = step.centres
      .filter((x) => x.kind === kind)
      .map((x) => ({ ...x, ...bearingAndDistance(lat, lon, x.lat, x.lon) }))
      .sort((a, b) => a.km - b.km)[0]
    if (!near) continue
    const v = Math.round(near.value)
    if (near.km < 250) out += tr(kind === 'H' ? 'cHighNear' : 'cLowNear', { v })
    else {
      const km = Math.round(near.km / 100) * 100
      out += tr(kind === 'H' ? 'cHighFar' : 'cLowFar', { v, km, dir: tList('dirs')[sector(near.bearing)] })
    }
  }
  return out
}

function regime(mslp: number): string {
  if (mslp >= 1025) return tr('rFirmHigh')
  if (mslp >= 1018) return tr('rHigh')
  if (mslp >= 1008) return tr('rNeutral')
  if (mslp >= 995) return tr('rLow')
  return tr('rDeepLow')
}

function describeNow(s: SynopticStep, lat: number, lon: number): string {
  const upper =
    tr(s.upper === 'trough' ? 'uTrough' : s.upper === 'ridge' ? 'uRidge' : 'uFlat') +
    (s.upstream === 'trough' && s.upper !== 'trough' ? tr('uTroughUp') : s.upstream === 'ridge' && s.upper !== 'ridge' ? tr('uRidgeUp') : '')
  return tr('sNow', {
    p: Math.round(s.mslp),
    regime: regime(s.mslp),
    centres: describeCentres(s, lat, lon),
    flow: flowText(s.surfaceFlow),
    upper,
    t: Math.round(s.t850),
  })
}

// Describes the evolution over consecutive 6-hourly steps. Looking at every
// step (not just the end points) catches a low passing through in between.
function describeChange(window: SynopticStep[]): string {
  const a = window[0]
  const b = window[window.length - 1]
  const deepest = window.reduce((m, s) => (s.mslp < m.mslp ? s : m), a)
  const dp = b.mslp - a.mslp
  const dt = b.t850 - a.t850
  const end = dayName(b.time)
  const out: string[] = []
  const dip = Math.min(a.mslp, b.mslp) - deepest.mslp
  if (dip >= 4 && deepest !== a && deepest !== b) {
    out.push(tr('chDip', { p: Math.round(deepest.mslp), day: dayName(deepest.time), dp: signedInt(dp), end }))
  } else if (dp <= -8) out.push(tr('chFallSharp', { dp: signedInt(dp), end }))
  else if (dp <= -3) out.push(tr('chFall', { dp: signedInt(dp), end }))
  else if (dp >= 8) out.push(tr('chRiseStrong', { dp: Math.round(dp), end }))
  else if (dp >= 3) out.push(tr('chRise', { dp: Math.round(dp), end }))
  else out.push(tr('chSteady', { dp: signedInt(dp) }))

  const windiest = window.slice(1).reduce((m, s) => ((s.surfaceFlow?.kmh ?? 0) > (m.surfaceFlow?.kmh ?? 0) ? s : m), window[1] ?? a)
  const strong = windiest.surfaceFlow && ['strong', 'severe'].includes(windiest.surfaceFlow.strength) ? windiest : null
  if (strong) {
    out.push(tr('chWind', { day: dayName(strong.time), flow: flowText(strong.surfaceFlow) }) + (strong.surfaceFlow!.strength === 'severe' ? tr('chGales') : ''))
  }
  if (dt >= 4) out.push(tr('chWarmer', { dt: Math.round(dt) }))
  else if (dt <= -4) out.push(tr('chColder', { dt: signedInt(dt) }))
  const upper = window.slice(1).find((s) => s.upper !== 'flat' && s.upper !== a.upper)
  if (upper) out.push(tr(upper.upper === 'trough' ? 'chUpperTrough' : 'chUpperRidge', { day: dayName(upper.time) }))
  if (!strong && b.surfaceFlow && b.surfaceFlow.strength !== 'slack' && b.surfaceFlow.from !== a.surfaceFlow?.from) {
    out.push(tr('chTurn', { from: tList('fromDirs')[b.surfaceFlow.from] }))
  }
  return out.join(' ')
}

export function synopticBriefing(grid: SynopticGrid, lat: number, lon: number, step: number): SynopticBriefing {
  const steps = grid.times.map((_, i) => analyseStep(grid, i, step))
  // Steps are 6-hourly: index 0 = 00 UTC today, +8 = +48 h, +20 = +120 h.
  const i0 = Math.min(steps.length - 1, Math.floor(new Date().getUTCHours() / 6))
  const i48 = Math.min(steps.length - 1, i0 + 8)
  const i120 = Math.min(steps.length - 1, i0 + 20)
  return {
    steps,
    paragraphs: [
      { heading: tr('synNow'), text: describeNow(steps[i0], lat, lon) },
      { heading: tr('syn48'), text: describeChange(steps.slice(i0, i48 + 1)) },
      { heading: tr('syn35'), text: describeChange(steps.slice(i48, i120 + 1)) },
    ],
  }
}
