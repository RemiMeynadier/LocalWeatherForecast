import type { ClimateSeries } from '../api/openMeteo'
import { mean, quantile } from './stats'

export interface DayNormal {
  tmax: number
  tmin: number
  precip: number // mean daily total, mm
  rainDayProb: number // share of days with >= 1 mm
}

export interface PeriodClimate {
  // Terciles of the yearly mean temperature over the same calendar days.
  tempTerciles: [number, number]
  tempMedian: number
  // Terciles of the yearly precipitation total over the same calendar days.
  precipTerciles: [number, number]
  precipMedian: number
}

const DAY_MS = 86_400_000
const WINDOW = 7 // ± days pooled around the calendar date to smooth normals

const toUtc = (iso: string) => Date.parse(`${iso}T00:00:00Z`)
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export class Climatology {
  private index = new Map<string, number>()
  private data: ClimateSeries
  readonly years: number[]

  constructor(data: ClimateSeries) {
    this.data = data
    data.time.forEach((t, i) => this.index.set(t, i))
    const first = Number(data.time[0]?.slice(0, 4))
    const last = Number(data.time[data.time.length - 1]?.slice(0, 4))
    this.years = []
    for (let y = first; y <= last; y++) this.years.push(y)
  }

  // Same month/day as `iso`, shifted into `year`. Feb 29 maps to Feb 28.
  private anchor(iso: string, year: number): number {
    const md = iso.slice(5) === '02-29' ? '02-28' : iso.slice(5)
    return toUtc(`${year}-${md}`)
  }

  private at(ms: number) {
    const i = this.index.get(toIso(ms))
    if (i === undefined) return null
    return { tmax: this.data.tmax[i], tmin: this.data.tmin[i], precip: this.data.precip[i] }
  }

  normal(iso: string): DayNormal | null {
    const tmax: number[] = []
    const tmin: number[] = []
    const precip: number[] = []
    for (const y of this.years) {
      const a = this.anchor(iso, y)
      for (let k = -WINDOW; k <= WINDOW; k++) {
        const v = this.at(a + k * DAY_MS)
        if (!v) continue
        if (v.tmax != null) tmax.push(v.tmax)
        if (v.tmin != null) tmin.push(v.tmin)
        if (v.precip != null) precip.push(v.precip)
      }
    }
    if (!tmax.length || !tmin.length || !precip.length) return null
    return {
      tmax: mean(tmax)!,
      tmin: mean(tmin)!,
      precip: mean(precip)!,
      rainDayProb: precip.filter((p) => p >= 1).length / precip.length,
    }
  }

  // Climate distribution of a multi-day period starting on `startIso`,
  // one value per year: mean of (tmax+tmin)/2 and precipitation total.
  period(startIso: string, days: number): PeriodClimate | null {
    const temps: number[] = []
    const totals: number[] = []
    for (const y of this.years) {
      const a = this.anchor(startIso, y)
      let tsum = 0
      let psum = 0
      let n = 0
      for (let k = 0; k < days; k++) {
        const v = this.at(a + k * DAY_MS)
        if (!v || v.tmax == null || v.tmin == null || v.precip == null) continue
        tsum += (v.tmax + v.tmin) / 2
        psum += v.precip
        n++
      }
      if (n === days) {
        temps.push(tsum / n)
        totals.push(psum)
      }
    }
    if (temps.length < 10) return null
    return {
      tempTerciles: [quantile(temps, 1 / 3)!, quantile(temps, 2 / 3)!],
      tempMedian: quantile(temps, 0.5)!,
      precipTerciles: [quantile(totals, 1 / 3)!, quantile(totals, 2 / 3)!],
      precipMedian: quantile(totals, 0.5)!,
    }
  }
}
