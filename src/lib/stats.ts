export interface Sample {
  value: number
  weight: number
}

export function weightedMean(samples: Sample[]): number | null {
  let sum = 0
  let wsum = 0
  for (const s of samples) {
    sum += s.value * s.weight
    wsum += s.weight
  }
  return wsum > 0 ? sum / wsum : null
}

// Weighted quantile with linear interpolation between the cumulative-weight
// midpoints of the sorted samples (q in [0, 1]).
export function weightedQuantile(samples: Sample[], q: number): number | null {
  const s = samples.filter((x) => x.weight > 0).sort((a, b) => a.value - b.value)
  if (s.length === 0) return null
  if (s.length === 1) return s[0].value
  const total = s.reduce((acc, x) => acc + x.weight, 0)
  const mids: number[] = []
  let cum = 0
  for (const x of s) {
    mids.push((cum + x.weight / 2) / total)
    cum += x.weight
  }
  if (q <= mids[0]) return s[0].value
  if (q >= mids[mids.length - 1]) return s[s.length - 1].value
  for (let i = 1; i < s.length; i++) {
    if (q <= mids[i]) {
      const t = (q - mids[i - 1]) / (mids[i] - mids[i - 1])
      return s[i - 1].value + t * (s[i].value - s[i - 1].value)
    }
  }
  return s[s.length - 1].value
}

export function weightedFraction(samples: Sample[], pred: (v: number) => boolean): number | null {
  let hit = 0
  let total = 0
  for (const s of samples) {
    total += s.weight
    if (pred(s.value)) hit += s.weight
  }
  return total > 0 ? hit / total : null
}

export function quantile(values: number[], q: number): number | null {
  return weightedQuantile(values.map((value) => ({ value, weight: 1 })), q)
}

export function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
}
