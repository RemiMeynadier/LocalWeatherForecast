import { describe, expect, it } from 'vitest'
import { quantile, weightedFraction, weightedMean, weightedQuantile } from './stats'

describe('stats', () => {
  it('computes weighted means', () => {
    expect(weightedMean([{ value: 10, weight: 1 }, { value: 20, weight: 3 }])).toBe(17.5)
    expect(weightedMean([])).toBeNull()
  })

  it('computes quantiles that match the median of an odd sample', () => {
    expect(quantile([3, 1, 2], 0.5)).toBe(2)
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5)
    expect(quantile([5], 0.9)).toBe(5)
  })

  it('clamps extreme quantiles to the sample range', () => {
    expect(quantile([1, 2, 3], 0)).toBe(1)
    expect(quantile([1, 2, 3], 1)).toBe(3)
  })

  it('lets heavier samples pull weighted quantiles', () => {
    const s = [{ value: 0, weight: 1 }, { value: 10, weight: 9 }]
    expect(weightedQuantile(s, 0.5)).toBeGreaterThan(5)
  })

  it('computes weighted fractions', () => {
    const s = [{ value: 0, weight: 1 }, { value: 2, weight: 3 }]
    expect(weightedFraction(s, (v) => v >= 1)).toBe(0.75)
  })
})
