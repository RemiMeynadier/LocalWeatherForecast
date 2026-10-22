import type { WeekOutlook } from '../lib/forecast'
import { mm, shortDate, signed, temp } from '../lib/format'

type Probs = [number, number, number]

const TEMP_LABELS = ['Colder', 'Near normal', 'Warmer'] as const
const RAIN_LABELS = ['Drier', 'Near normal', 'Wetter'] as const

// Plain-language verdict from tercile probabilities (33% each = no signal).
function verdict(p: Probs, labels: readonly [string, string, string]): string {
  const i = p.indexOf(Math.max(...p))
  const v = p[i]
  if (v < 0.4) return 'No clear signal'
  const name = i === 1 ? 'Near normal' : `${labels[i]} than normal`
  if (v >= 0.6) return `${name} (likely)`
  return `${name} (slightly favoured)`
}

function TercileBar({ p, labels, kind }: { p: Probs; labels: readonly [string, string, string]; kind: 'temp' | 'rain' }) {
  return (
    <div className="tercile" role="img" aria-label={labels.map((l, i) => `${l} ${Math.round(p[i] * 100)}%`).join(', ')}>
      <div className="tercile-bar">
        {p.map((v, i) =>
          v >= 0.005 ? (
            <span key={i} className={`seg ${kind}-${i}`} style={{ flexGrow: v }} title={`${labels[i]}: ${Math.round(v * 100)}%`} />
          ) : null,
        )}
      </div>
      <div className="tercile-legend">
        {p.map((v, i) => (
          <span key={i}>
            <i className={`key ${kind}-${i}`} />
            {labels[i]} <strong>{Math.round(v * 100)}%</strong>
          </span>
        ))}
      </div>
    </div>
  )
}

export function WeeklyOutlook({ weeks, hasClimate }: { weeks: WeekOutlook[]; hasClimate: boolean }) {
  if (!weeks.length) return <p className="muted">No ensemble data available.</p>
  return (
    <div className="weeks">
      {weeks.map((w, k) => (
        <article key={w.start} className="week">
          <header>
            <h3>Week {k + 1}</h3>
            <span className="muted">
              {shortDate(w.start)} → {shortDate(w.end)}
              {w.days < 7 ? ` (${w.days} d)` : ''}
            </span>
          </header>
          <div className="week-body">
            <section>
              <div className="week-figure">
                <span className="big">{temp(w.tempMean, 1)}</span>
                <span className="muted">mean temp.{w.tempAnomaly != null && <> · <strong>{signed(w.tempAnomaly)}</strong> vs normal</>}</span>
              </div>
              {w.tempProbs ? (
                <>
                  <p className="verdict">{verdict(w.tempProbs, TEMP_LABELS)}</p>
                  <TercileBar p={w.tempProbs} labels={TEMP_LABELS} kind="temp" />
                </>
              ) : (
                !hasClimate && <p className="muted small">Loading normals…</p>
              )}
            </section>
            <section>
              <div className="week-figure">
                <span className="big">{mm(w.precipTotal)}</span>
                <span className="muted">median total</span>
              </div>
              {w.precipProbs && (
                <>
                  <p className="verdict">{verdict(w.precipProbs, RAIN_LABELS)}</p>
                  <TercileBar p={w.precipProbs} labels={RAIN_LABELS} kind="rain" />
                </>
              )}
            </section>
          </div>
          <footer className="muted small">Source: {w.sources.join(', ')}</footer>
        </article>
      ))}
    </div>
  )
}
