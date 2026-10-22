import type { SynopticGrid } from '../api/openMeteo'
import type { Hazard, OfficialWarning, WarningsResult } from '../api/warnings'
import { getLang, num, t } from '../i18n'
import type { ForecastAlert } from '../lib/extremes'
import { dateTime, dayLabel, pct } from '../lib/format'
import type { SynopticBriefing } from '../lib/synoptic'
import { SynopticMap } from './SynopticMap'

const HAZARD_ICON: Record<Hazard, string> = {
  heat: '🌡️',
  cold: '🥶',
  rain: '🌧️',
  flood: '🌊',
  wind: '💨',
  snow: '❄️',
  thunderstorm: '⛈️',
  fog: '🌫️',
  fire: '🔥',
  coastal: '🌊',
  avalanche: '🏔️',
  other: '⚠️',
}

function OfficialLine({ w }: { w: OfficialWarning }) {
  const event = getLang() === 'fr' && w.eventFr ? w.eventFr : w.event
  return (
    <li>
      <span className={`official ${w.level}`}>
        <i aria-hidden="true" />
        {t(w.level)}
      </span>{' '}
      <strong>{event}</strong>
      <span className="muted">
        {' '}· {w.sender} · {dateTime(w.onset)} → {dateTime(w.expires)}
      </span>
      {w.web && (
        <>
          {' '}·{' '}
          <a href={w.web} target="_blank" rel="noreferrer">
            {t('details')}
          </a>
        </>
      )}
    </li>
  )
}

const range = (a: string, b: string) => (a === b ? dayLabel(a) : `${dayLabel(a)} → ${dayLabel(b)}`)

function daysAhead(iso: string): number {
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(new Date().toISOString().slice(0, 10) + 'T00:00:00Z')) / 86_400_000)
}

function detail(a: ForecastAlert): string {
  const unit = (u: string) => (u ? ` ${u}` : '')
  const peak = a.kind === 'xStorms' ? t('nModels', { n: a.peak }) : `${num(a.peak)}${unit(a.unit)}`
  const v = `${num(a.threshold.value)}${unit(a.threshold.unit)}`
  const thr =
    a.threshold.type === 'local'
      ? t('xLocal', { v })
      : a.threshold.type === 'oneModel'
        ? t('xOneModel', { v })
        : a.threshold.type === 'twoModels'
          ? t('xTwoModels')
          : v
  return t('xDetail', { v: peak, thr }) + (a.probability != null ? t('xProb', { p: pct(a.probability) }) : '')
}

function AlertCard({ a, coverage }: { a: ForecastAlert; coverage: WarningsResult['coverage'] }) {
  return (
    <article className="alert">
      <div className="alert-icon" aria-hidden="true">{HAZARD_ICON[a.hazard]}</div>
      <div className="alert-body">
        <header>
          <strong>{t(a.kind)}</strong>
          <span className={`level ${a.level}`}>{a.level === 'warning' ? `▲ ${t('warning')}` : `● ${t('watch')}`}</span>
          <span className="muted">{range(a.start, a.end)}</span>
        </header>
        <p>{detail(a)}</p>
        {a.official.length > 0 ? (
          <div className="crosscheck ok">
            {t('confirmed')}
            <ul>{a.official.map((w, i) => <OfficialLine key={i} w={w} />)}</ul>
          </div>
        ) : coverage == null ? null : (
          <p className="crosscheck none">{daysAhead(a.start) <= 2 ? t('notConfirmed') : t('tooEarly')}</p>
        )}
      </div>
    </article>
  )
}

interface BriefingProps {
  briefing: SynopticBriefing | null
  grid: SynopticGrid | null
  gridError: string | null
  lat: number
  lon: number
  step: number
}

export function SynopticBriefingView({ briefing, grid, gridError, lat, lon, step }: BriefingProps) {
  if (gridError) return <p className="notice error">{t('synUnavailable', { msg: gridError })}</p>
  if (!briefing || !grid) return <p className="muted">{t('synLoading')}</p>
  return (
    <div className="briefing">
      <div className="briefing-text">
        {briefing.paragraphs.map((p) => (
          <p key={p.heading}>
            <strong>{p.heading}.</strong> {p.text}
          </p>
        ))}
        <p className="muted small">{t('synSource')}</p>
      </div>
      <SynopticMap grid={grid} steps={briefing.steps} lat={lat} lon={lon} step={step} />
    </div>
  )
}

interface AlertsProps {
  alerts: { alerts: ForecastAlert[]; unmatched: OfficialWarning[] } | null
  warnings: WarningsResult | null
  warningsLoading: boolean
  warningsError: string | null
}

export function AlertsView({ alerts, warnings, warningsLoading, warningsError }: AlertsProps) {
  const coverage = warnings?.coverage ?? null
  const none = warnings && warnings.warnings.length === 0 ? t('wNone') : ''
  return (
    <div className="alerts">
      {alerts && alerts.alerts.length === 0 && <p className="all-clear">{t('allClear')}</p>}
      {alerts?.alerts.map((a, i) => <AlertCard key={i} a={a} coverage={coverage} />)}

      {alerts && alerts.unmatched.length > 0 && (
        <div className="crosscheck unmatched">
          <strong>{t('unmatched')}</strong>
          <ul>{alerts.unmatched.map((w, i) => <OfficialLine key={i} w={w} />)}</ul>
          <p className="muted small">{t('followOfficial')}</p>
        </div>
      )}

      <p className="muted small">
        {warningsLoading
          ? t('wChecking')
          : warningsError
            ? t('wFailed', { msg: warningsError })
            : coverage === 'MeteoAlarm'
              ? t('wMeteoAlarm', { t: dateTime(warnings!.generated) }) + none
              : coverage === 'NWS'
                ? t('wNws') + none
                : t('wNoFeed')}
      </p>
    </div>
  )
}
