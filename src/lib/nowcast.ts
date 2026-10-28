// Rain in the next hour by radar extrapolation: estimate how the rain field
// moved between two radar images, then slide the latest image along that
// motion. This is the classic "Lagrangian persistence" nowcast: very good for
// 30–60 minutes, blind to rain that forms or dies on the way.

// Rain rate (mm/h) on a square pixel grid, at one time (unix seconds).
export interface RadarField {
  time: number
  size: number
  rate: Float32Array
}

// Pixels per minute (x to the east, y to the south).
export interface Motion {
  dx: number
  dy: number
}

export const RAIN_MIN = 0.1 // mm/h
const COARSE = 4

function coarsen(f: RadarField): { n: number; v: Float32Array; rainy: number } {
  const n = Math.floor(f.size / COARSE)
  const v = new Float32Array(n * n)
  let rainy = 0
  for (let cy = 0; cy < n; cy++) {
    for (let cx = 0; cx < n; cx++) {
      let s = 0
      for (let y = 0; y < COARSE; y++) {
        const row = (cy * COARSE + y) * f.size + cx * COARSE
        for (let x = 0; x < COARSE; x++) s += f.rate[row + x]
      }
      // Log scale, so that the shape of the rain area matters more than its peaks.
      const m = Math.log1p(s / (COARSE * COARSE))
      v[cy * n + cx] = m
      if (m > 0.05) rainy++
    }
  }
  return { n, v, rainy }
}

// Mean squared difference between `b` and `a` shifted by (sx, sy), over
// cells where either has rain. `step` subsamples the comparison.
function cost(a: Float32Array, b: Float32Array, n: number, sx: number, sy: number, margin: number, step = 1) {
  let sum = 0
  let count = 0
  for (let y = margin; y < n - margin; y += step) {
    for (let x = margin; x < n - margin; x += step) {
      const va = a[(y - sy) * n + (x - sx)]
      const vb = b[y * n + x]
      if (va === 0 && vb === 0) continue
      sum += (va - vb) ** 2
      count++
    }
  }
  // A tiny pull towards small shifts breaks ties in uniform rain.
  return count ? sum / count + 1e-4 * (sx * sx + sy * sy) : Infinity
}

// Motion of the rain field from `a` to `b` (same grid, `a` earlier), or null
// when there is too little rain around to tell.
export function estimateMotion(a: RadarField, b: RadarField, maxPxPerMin = 2.6): Motion | null {
  const minutes = (b.time - a.time) / 60
  if (minutes <= 0) return null
  const ca = coarsen(a)
  const cb = coarsen(b)
  if (cb.rainy < 12 || ca.rainy < 12) return null

  const S = Math.ceil((maxPxPerMin * minutes) / COARSE)
  let best = { c: Infinity, sx: 0, sy: 0 }
  for (let sy = -S; sy <= S; sy++) {
    for (let sx = -S; sx <= S; sx++) {
      const c = cost(ca.v, cb.v, ca.n, sx, sy, S)
      if (c < best.c) best = { c, sx, sy }
    }
  }

  // Refine to the pixel on the full-resolution fields.
  const la = a.rate.map(Math.log1p)
  const lb = b.rate.map(Math.log1p)
  const margin = (S + 1) * COARSE
  let fine = { c: Infinity, sx: best.sx * COARSE, sy: best.sy * COARSE }
  for (let dy = -COARSE; dy <= COARSE; dy++) {
    for (let dx = -COARSE; dx <= COARSE; dx++) {
      const sx = best.sx * COARSE + dx
      const sy = best.sy * COARSE + dy
      const c = cost(la, lb, a.size, sx, sy, margin, 2)
      if (c < fine.c) fine = { c, sx, sy }
    }
  }
  return { dx: fine.sx / minutes, dy: fine.sy / minutes }
}

// Mean rain rate and rainy fraction in a square of radius r around (x, y).
export function sampleAt(f: RadarField, x: number, y: number, r: number): { rate: number; chance: number } {
  const x0 = Math.max(0, Math.round(x - r))
  const x1 = Math.min(f.size - 1, Math.round(x + r))
  const y0 = Math.max(0, Math.round(y - r))
  const y1 = Math.min(f.size - 1, Math.round(y + r))
  let sum = 0
  let wet = 0
  let n = 0
  for (let yy = y0; yy <= y1; yy++) {
    for (let xx = x0; xx <= x1; xx++) {
      const v = f.rate[yy * f.size + xx]
      sum += v
      if (v >= RAIN_MIN) wet++
      n++
    }
  }
  return n ? { rate: sum / n, chance: wet / n } : { rate: 0, chance: 0 }
}

export interface NowcastStep {
  time: number // unix seconds
  rate: number // mm/h
  chance: number // 0–1, share of the neighbourhood with rain
}

// Rain at pixel (x, y) at each time, by sliding `latest` along `motion`.
// The neighbourhood widens with lead time, as position errors grow.
export function extrapolate(latest: RadarField, motion: Motion | null, x: number, y: number, times: number[]): NowcastStep[] {
  const m = motion ?? { dx: 0, dy: 0 }
  return times.map((time) => {
    const lead = Math.max(0, (time - latest.time) / 60)
    const r = 1.5 + lead / 12
    const { rate, chance } = sampleAt(latest, x - m.dx * lead, y - m.dy * lead, r)
    return { time, rate, chance }
  })
}

export type Intensity = 'light' | 'moderate' | 'heavy'

export function intensity(rate: number): Intensity {
  return rate < 2.5 ? 'light' : rate < 7.6 ? 'moderate' : 'heavy'
}

export interface NowcastSummary {
  kind: 'dry' | 'maybe' | 'starts' | 'stops' | 'continues'
  at?: number
  peak?: Intensity
}

const isWet = (s: NowcastStep) => s.chance >= 0.4 && s.rate >= RAIN_MIN

export function summarize(steps: NowcastStep[]): NowcastSummary {
  if (!steps.length) return { kind: 'dry' }
  const wet = steps.filter(isWet)
  const peak = wet.length ? intensity(Math.max(...wet.map((s) => s.rate))) : undefined
  if (isWet(steps[0])) {
    const end = steps.find((s) => !isWet(s))
    return end ? { kind: 'stops', at: end.time, peak } : { kind: 'continues', peak }
  }
  const start = steps.find(isWet)
  if (start) return { kind: 'starts', at: start.time, peak }
  return Math.max(...steps.map((s) => s.chance)) >= 0.15 ? { kind: 'maybe' } : { kind: 'dry' }
}
