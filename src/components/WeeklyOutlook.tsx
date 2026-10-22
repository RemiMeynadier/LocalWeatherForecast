import type { WeekOutlook } from '../lib/forecast'
import { percent, t, type TKey } from '../i18n'
import { mm, shortDate, signed, temp } from '../lib/format'

type Probs = [number, number, number]

const TEMP_LABELS: TKey[] = ['colder', 'near', 'warmer']
const RAIN_LABELS: TKey[] = ['drier', 'near', 'wetter']

// Plain-language verdict from tercile probabilities (33% each = no signal).
function verdict(p: Probs, keys: TKey[]): string {
  const i = p.indexOf(Math.max(...p))
  const v = p[i]
  if (v < 0.4) return t('noSignal')
  const name = i === 1 ? t('nearNormal') : t('thanNormal', { x: t(keys[i]) })
  return `${name} (${t(v >= 0.6 ? 'likely' : 'slightly')})`
}

function TercileBar({ p, keys, kind }: { p: Probs; keys: TKey[]; kind: 'temp' | 'rain' }) {
  const labels = keys.map((k) => t(k))
  return (
    <div className="tercile" role="img" aria-label={labels.map((l, i) => `${l} ${percent(p[i])}`).join(', ')}>
      <div className="tercile-bar">
        {p.map((v, i) =>
          v >= 0.005 ? (
            <span key={i} className={`seg ${kind}-${i}`} style={{ flexGrow: v }} title={`${labels[i]}: ${percent(v)}`} />
          ) : null,
        )}
      </div>
      <div className="tercile-legend">
        {p.map((v, i) => (
          <span key={i}>
            <i className={`key ${kind}-${i}`} />
            {labels[i]} <strong>{percent(v)}</strong>
          </span>
        ))}
      </div>
    </div>
  )
}

export function WeeklyOutlook({ weeks, hasClimate }: { weeks: WeekOutlook[]; hasClimate: boolean }) {
  if (!weeks.length) return <p className="muted">{t('noEnsemble')}</p>
  return (
    <div className="weeks">
      {weeks.map((w, k) => (
        <article key={w.start} className="week">
          <header>
            <h3>{t('week', { n: k + 1 })}</h3>
            <span className="muted">
              {shortDate(w.start)} → {shortDate(w.end)}
              {w.days < 7 ? ` (${t('daysSuffix', { n: w.days })})` : ''}
            </span>
          </header>
          <div className="week-body">
            <section>
              <div className="week-figure">
                <span className="big">{temp(w.tempMean, 1)}</span>
                <span className="muted">{t('meanTemp')}{w.tempAnomaly != null && <> · <strong>{signed(w.tempAnomaly)}</strong> {t('vsNormal')}</>}</span>
              </div>
              {w.tempProbs ? (
                <>
                  <p className="verdict">{verdict(w.tempProbs, TEMP_LABELS)}</p>
                  <TercileBar p={w.tempProbs} keys={TEMP_LABELS} kind="temp" />
                </>
              ) : (
                !hasClimate && <p className="muted small">{t('loadingNormals')}</p>
              )}
            </section>
            <section>
              <div className="week-figure">
                <span className="big">{mm(w.precipTotal)}</span>
                <span className="muted">{t('medianTotal')}</span>
              </div>
              {w.precipProbs && (
                <>
                  <p className="verdict">{verdict(w.precipProbs, RAIN_LABELS)}</p>
                  <TercileBar p={w.precipProbs} keys={RAIN_LABELS} kind="rain" />
                </>
              )}
            </section>
          </div>
          <footer className="muted small">{t('source', { s: w.sources.join(', ') })}</footer>
        </article>
      ))}
    </div>
  )
}
