import type { DayForecast } from '../lib/forecast'
import { percent, t } from '../i18n'
import { compactDay, temp } from '../lib/format'
import { DETERMINISTIC_MODELS, ENSEMBLE_MODELS, hasLocalHighRes, selectDeterministicModels } from '../lib/models'

interface Props {
  days: DayForecast[]
  lat: number
  lon: number
  failed: string[]
}

export function AiBadge() {
  return (
    <span className="badge ai" title={t('aiTip')}>
      AI
    </span>
  )
}

// Side-by-side max/min per model for the next week, so disagreement is visible.
export function ModelsPanel({ days, lat, lon, failed }: Props) {
  const models = selectDeterministicModels(lat, lon)
  const week = days.slice(0, 8)
  const totalWeight = (d: DayForecast) => d.models.reduce((a, m) => a + m.weight, 0)

  return (
    <>
      <div className="table-wrap">
        <table className="models">
          <thead>
            <tr>
              <th scope="col">{t('model')}</th>
              {week.map((d) => (
                <th key={d.date} scope="col">{compactDay(d.date, d.lead)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {models.map((m) => {
              const local = hasLocalHighRes(m, lat, lon)
              return (
                <tr key={m.id}>
                  <th scope="row">
                    <span className="model-name">
                      {m.label} {m.ai && <AiBadge />}
                    </span>
                    <span className="muted small">
                      {m.provider}
                      {local && <> · <span className="badge">{m.highRes!.name} {t('local')}</span></>}
                    </span>
                  </th>
                  {week.map((d) => {
                    const v = d.models.find((x) => x.model === m.id)
                    const share = v ? v.weight / totalWeight(d) : 0
                    return (
                      <td key={d.date} title={v ? t('weightTip', { p: percent(share) }) : t('outOfRange')}>
                        {v ? (
                          <>
                            <span className="tmax">{temp(v.tmax)}</span> <span className="tmin">{temp(v.tmin)}</span>
                            <span className="weight" style={{ width: `${Math.round(share * 100)}%` }} />
                          </>
                        ) : (
                          <span className="muted">·</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
            <tr className="consensus">
              <th scope="row">{t('blend')}</th>
              {week.map((d) => (
                <td key={d.date}>
                  <span className="tmax">{temp(d.tmax)}</span> <span className="tmin">{temp(d.tmin)}</span>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="muted small">
        {t('modelsNote', { e: ENSEMBLE_MODELS.map((m) => `${m.label}${m.ai ? ' (AI)' : ''}`).join(', ') })}
        {failed.length > 0 && <> {t('unavailable', { x: failed.join(', ') })}</>}{' '}
        {t('notUsed', { x: DETERMINISTIC_MODELS.filter((m) => !models.includes(m)).map((m) => m.label).join(', ') || '—' })}
      </p>
    </>
  )
}
