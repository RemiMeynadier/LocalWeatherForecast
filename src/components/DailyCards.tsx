import type { DayForecast } from '../lib/forecast'
import { CONFIDENCE, dayLabel, mm, pct, relativeDay, temp, weather } from '../lib/format'

export function ConfidenceDots({ level }: { level: DayForecast['confidence'] }) {
  const c = CONFIDENCE[level]
  return (
    <span className="confidence" title={`Confidence: ${c.label}. ${c.hint}`}>
      <span className="dots" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <i key={i} className={i < c.dots ? 'on' : ''} />
        ))}
      </span>
      <span className="confidence-label">{c.label}</span>
    </span>
  )
}

export function DailyCards({ days }: { days: DayForecast[] }) {
  return (
    <ol className="cards">
      {days.map((d) => {
        const w = weather(d.code)
        const lo = d.ensemble?.tmax.p10
        const hi = d.ensemble?.tmax.p90
        return (
          <li key={d.date} className="card">
            <div className="card-head">
              <strong>{relativeDay(d.date, d.lead)}</strong>
              <span className="muted">{dayLabel(d.date)}</span>
            </div>
            <div className="card-icon" title={w.label}>
              <span aria-hidden="true">{w.icon}</span>
              <span className="sr-only">{w.label}</span>
            </div>
            <div className="card-temps">
              <span className="tmax">{temp(d.tmax)}</span>
              <span className="tmin">{temp(d.tmin)}</span>
            </div>
            {lo != null && hi != null && d.lead > 2 && (
              <div className="muted small" title="80% of ensemble scenarios give a maximum in this range">
                max {temp(lo)} to {temp(hi)}
              </div>
            )}
            <div className="card-rain">
              <span>💧 {mm(d.precip)}</span>
              {d.ensemble && <span className="muted">{pct(d.ensemble.rainProb)}</span>}
            </div>
            <ConfidenceDots level={d.confidence} />
          </li>
        )
      })}
    </ol>
  )
}
