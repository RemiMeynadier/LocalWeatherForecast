import { describe, expect, it } from 'vitest'
import { estimateMotion, extrapolate, type RadarField, summarize } from './nowcast'
import { decodeDbz, rainRate } from './radarPalette'

const SIZE = 160

// A few rain cells of different shapes, offset by (ox, oy) pixels.
function field(time: number, ox: number, oy: number): RadarField {
  const rate = new Float32Array(SIZE * SIZE)
  const cells = [
    [60, 70, 14, 4],
    [95, 60, 8, 12],
    [80, 100, 10, 2],
  ]
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      for (const [cx, cy, r, peak] of cells) {
        const d = Math.hypot(x - cx - ox, (y - cy - oy) * 1.4)
        if (d < r) rate[y * SIZE + x] = Math.max(rate[y * SIZE + x], peak * (1 - d / r) + 0.2)
      }
    }
  }
  return { time, size: SIZE, rate }
}

describe('nowcast', () => {
  it('recovers the motion of a rain field', () => {
    const m = estimateMotion(field(0, 0, 0), field(1200, 14, -6))!
    expect(m.dx).toBeCloseTo(14 / 20, 1)
    expect(m.dy).toBeCloseTo(-6 / 20, 1)
  })

  it('returns null without enough rain', () => {
    const empty = { time: 0, size: SIZE, rate: new Float32Array(SIZE * SIZE) }
    expect(estimateMotion(empty, { ...empty, time: 600 })).toBeNull()
  })

  it('brings upstream rain over the place', () => {
    const latest = field(0, 0, 0)
    // The cell at (60, 70) moves east at 1 px/min: a place 30 px east of it gets rain after ~30 min.
    const steps = extrapolate(latest, { dx: 1, dy: 0 }, 90, 70, [0, 900, 1800, 2400])
    expect(steps[0].chance).toBe(0)
    expect(steps[2].rate).toBeGreaterThan(1)
    const s = summarize(steps)
    expect(s.kind).toBe('starts')
    expect(s.at).toBe(1800)
  })

  it('summarizes dry and continuing rain', () => {
    expect(summarize([{ time: 0, rate: 0, chance: 0 }]).kind).toBe('dry')
    expect(summarize([{ time: 0, rate: 3, chance: 1 }, { time: 300, rate: 9, chance: 1 }])).toEqual({
      kind: 'continues',
      peak: 'heavy',
    })
  })
})

describe('radar palette', () => {
  it('decodes Universal Blue colours to dBZ', () => {
    expect(decodeDbz(0x88, 0xdd, 0xee, 0xff)).toBe(15)
    expect(decodeDbz(0xff, 0xe0, 0x00, 0xff)).toBe(36)
    expect(decodeDbz(0, 0, 0, 0)).toBeNull()
  })

  it('converts dBZ to rain rate (Marshall–Palmer)', () => {
    expect(rainRate(null)).toBe(0)
    expect(rainRate(0)).toBe(0)
    expect(rainRate(23)).toBeCloseTo(1, 0)
    expect(rainRate(40)).toBeGreaterThan(10)
  })
})
