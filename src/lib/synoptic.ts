// Turns the pressure / 500 hPa / 850 hPa grid into a plain-English synoptic
// briefing: pressure centres, flow, troughs and ridges, and how they evolve.

import type { SynopticGrid } from '../api/openMeteo'

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
  surfaceFlow: { from: string; strength: Strength; kmh: number } | null
  upperFlow: { from: string } | null
  upper: 'trough' | 'ridge' | 'flat'
  upstream: 'trough' | 'ridge' | 'flat'
}

export interface SynopticBriefing {
  steps: SynopticStep[]
  paragraphs: { heading: string; text: string }[]
}

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']
const ADJ = ['northerly', 'north-easterly', 'easterly', 'south-easterly', 'southerly', 'south-westerly', 'westerly', 'north-westerly']

export const compass = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]
const adjective = (fromDeg: number) => ADJ[Math.round((((fromDeg % 360) + 360) % 360) / 45) % 8]

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
    surfaceFlow: { from: strength === 'slack' ? '' : adjective(flowFrom(g.dx, g.dy, lat)), strength, kmh },
    upperFlow: Math.hypot(gz.dx, gz.dy) * 100 < 0.5 ? null : { from: adjective(flowFrom(gz.dx, gz.dy, lat)) },
    upper: kind(lap),
    upstream: kind(lapUp),
  }
}

const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' })
const dayName = (iso: string) => dayFmt.format(new Date(`${iso}Z`))

function describeCentres(step: SynopticStep, lat: number, lon: number): string {
  const parts: string[] = []
  for (const kind of ['H', 'L'] as const) {
    const near = step.centres
      .filter((x) => x.kind === kind)
      .map((x) => ({ ...x, ...bearingAndDistance(lat, lon, x.lat, x.lon) }))
      .sort((a, b) => a.km - b.km)[0]
    if (!near) continue
    const what = kind === 'H' ? 'An anticyclone' : 'A depression'
    const where = near.km < 250 ? 'is centred close by' : `lies about ${Math.round(near.km / 100) * 100} km to the ${compass(near.bearing)}`
    parts.push(`${what} (${Math.round(near.value)} hPa) ${where}.`)
  }
  return parts.join(' ')
}

function regime(mslp: number): string {
  if (mslp >= 1025) return 'firmly anticyclonic'
  if (mslp >= 1018) return 'anticyclonic'
  if (mslp >= 1008) return 'near-neutral'
  if (mslp >= 995) return 'cyclonic'
  return 'deeply cyclonic'
}

function describeNow(s: SynopticStep, lat: number, lon: number): string {
  const flow =
    s.surfaceFlow?.strength === 'slack'
      ? 'Pressure gradients are slack, so surface winds are light and variable.'
      : `The surface flow is ${s.surfaceFlow!.strength === 'severe' ? 'very strong' : s.surfaceFlow!.strength} and ${s.surfaceFlow!.from}.`
  const upper =
    s.upper === 'trough'
      ? 'At 500 hPa an upper trough sits overhead, favouring instability and showers.'
      : s.upper === 'ridge'
        ? 'At 500 hPa an upper ridge sits overhead, favouring subsidence and settled weather.'
        : `At 500 hPa the flow is fairly straight${s.upperFlow ? ` and ${s.upperFlow.from}` : ''}.`
  const upstream =
    s.upstream === 'trough' && s.upper !== 'trough'
      ? ' An upper trough lies upstream to the west.'
      : s.upstream === 'ridge' && s.upper !== 'ridge'
        ? ' An upper ridge lies upstream to the west.'
        : ''
  return (
    `Surface pressure ${Math.round(s.mslp)} hPa: ${regime(s.mslp)} conditions. ${describeCentres(s, lat, lon)} ${flow} ` +
    `${upper}${upstream} The 850 hPa temperature is ${s.t850.toFixed(0)} °C.`
  ).replace(/\s+/g, ' ')
}

// Describes the evolution over consecutive 6-hourly steps. Looking at every
// step (not just the end points) catches a low passing through in between.
function describeChange(window: SynopticStep[]): string {
  const a = window[0]
  const b = window[window.length - 1]
  const hours = (window.length - 1) * 6
  const deepest = window.reduce((m, s) => (s.mslp < m.mslp ? s : m), a)
  const dp = b.mslp - a.mslp
  const dt = b.t850 - a.t850
  const when = dayName(b.time)
  const out: string[] = []
  const dip = Math.min(a.mslp, b.mslp) - deepest.mslp
  if (dip >= 4 && deepest !== a && deepest !== b) {
    out.push(
      `Pressure dips to ${Math.round(deepest.mslp)} hPa around ${dayName(deepest.time)} as a low or frontal system ` +
        `passes, then recovers (${dp >= 0 ? '+' : ''}${dp.toFixed(0)} hPa overall by ${when}).`,
    )
  } else if (dp <= -8) {
    out.push(`Pressure falls sharply (${dp.toFixed(0)} hPa by ${when}): a low or frontal system approaches, bringing wind and rain risk.`)
  } else if (dp <= -3) {
    out.push(`Pressure eases (${dp.toFixed(0)} hPa by ${when}), so conditions turn more unsettled.`)
  } else if (dp >= 8) {
    out.push(`Pressure rises strongly (+${dp.toFixed(0)} hPa by ${when}) as high pressure builds in.`)
  } else if (dp >= 3) {
    out.push(`Pressure rises (+${dp.toFixed(0)} hPa by ${when}), so conditions settle.`)
  } else {
    out.push(`Pressure changes little over the next ${hours} h (${dp >= 0 ? '+' : ''}${dp.toFixed(0)} hPa).`)
  }
  const windiest = window.slice(1).reduce((m, s) => ((s.surfaceFlow?.kmh ?? 0) > (m.surfaceFlow?.kmh ?? 0) ? s : m), window[1] ?? a)
  const strong = windiest.surfaceFlow && ['strong', 'severe'].includes(windiest.surfaceFlow.strength) ? windiest : null
  if (strong) {
    const sf = strong.surfaceFlow!
    out.push(
      `The pressure gradient is tightest around ${dayName(strong.time)}, with a ${sf.strength === 'severe' ? 'very strong' : 'strong'} ${sf.from} flow` +
        (sf.strength === 'severe' ? ': gales are likely, especially on coasts and hills.' : '.'),
    )
  }
  if (dt >= 4) out.push(`A markedly warmer air mass arrives (850 hPa +${dt.toFixed(0)} °C).`)
  else if (dt <= -4) out.push(`A markedly colder air mass follows (850 hPa ${dt.toFixed(0)} °C).`)
  const upper = window.slice(1).find((s) => s.upper !== 'flat' && s.upper !== a.upper)
  if (upper) out.push(`An upper ${upper.upper} moves overhead around ${dayName(upper.time)}.`)
  if (!strong && b.surfaceFlow && b.surfaceFlow.strength !== 'slack' && b.surfaceFlow.from !== a.surfaceFlow?.from) {
    out.push(`The wind turns ${b.surfaceFlow.from} (${b.surfaceFlow.strength}).`)
  }
  return out.join(' ')
}

export function synopticBriefing(grid: SynopticGrid, lat: number, lon: number, step: number): SynopticBriefing {
  const steps = grid.times.map((_, t) => analyseStep(grid, t, step))
  // Steps are 6-hourly: index 0 = now (00 UTC of today), 8 = +48 h, 20 = +120 h.
  const i0 = Math.min(steps.length - 1, Math.floor(new Date().getUTCHours() / 6))
  const i48 = Math.min(steps.length - 1, i0 + 8)
  const i120 = Math.min(steps.length - 1, i0 + 20)
  const now = steps[i0]
  const in120 = steps[i120]
  return {
    steps,
    paragraphs: [
      { heading: 'Now', text: describeNow(now, lat, lon) },
      { heading: 'Next 48 hours', text: describeChange(steps.slice(i0, i48 + 1)) },
      { heading: 'Days 3 to 5', text: `${describeChange(steps.slice(i48, i120 + 1))} ${describeCentres(in120, lat, lon)}`.trim() },
    ],
  }
}
