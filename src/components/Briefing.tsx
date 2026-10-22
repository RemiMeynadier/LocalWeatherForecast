import type { SynopticGrid } from '../api/openMeteo'
import type { Hazard, OfficialWarning, WarningsResult } from '../api/warnings'
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

const LEVEL_LABEL = { yellow: 'Yellow', orange: 'Orange', red: 'Red' } as const

function OfficialBadge({ w }: { w: OfficialWarning }) {
  return (
    <span className={`official ${w.level}`}>
      <i aria-hidden="true" />
      {LEVEL_LABEL[w.level]}
    </span>
  )
}

function OfficialLine({ w }: { w: OfficialWarning }) {
  return (
    <li>
      <OfficialBadge w={w} /> <strong>{w.event}</strong>
      <span className="muted">
        {' '}· {w.sender} · {dateTime(w.onset)} → {dateTime(w.expires)}
      </span>
      {w.web && (
        <>
          {' '}·{' '}
          <a href={w.web} target="_blank" rel="noreferrer">
            details
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

function AlertCard({ a, coverage }: { a: ForecastAlert; coverage: WarningsResult['coverage'] }) {
  const ahead = daysAhead(a.start)
  return (
    <article className={`alert ${a.level}`}>
      <div className="alert-icon" aria-hidden="true">{HAZARD_ICON[a.hazard]}</div>
      <div className="alert-body">
        <header>
          <strong>{a.title}</strong>
          <span className={`level ${a.level}`}>{a.level === 'warning' ? '▲ Warning' : '● Watch'}</span>
          <span className="muted">{range(a.start, a.end)}</span>
        </header>
        <p>
          {a.detail}
          {a.probability != null && <> {pct(a.probability)} of ensemble scenarios exceed the threshold on the worst day.</>}
        </p>
        {a.official.length > 0 ? (
          <div className="crosscheck ok">
            ✓ Confirmed by an official warning:
            <ul>{a.official.map((w, i) => <OfficialLine key={i} w={w} />)}</ul>
          </div>
        ) : coverage == null ? null : ahead <= 2 ? (
          <p className="crosscheck none">
            ✗ No matching official warning from {coverage === 'NWS' ? 'the National Weather Service' : 'the national service (MeteoAlarm)'}.
            Treat this as a lower-confidence signal.
          </p>
        ) : (
          <p className="crosscheck later">
            Official warnings are usually issued 1–2 days ahead; none yet for this period.
          </p>
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
  if (gridError) return <p className="notice error">Synoptic data unavailable: {gridError}</p>
  if (!briefing || !grid) return <p className="muted">Analysing the synoptic situation…</p>
  return (
    <div className="briefing">
      <div className="briefing-text">
        {briefing.paragraphs.map((p) => (
          <p key={p.heading}>
            <strong>{p.heading}.</strong> {p.text}
          </p>
        ))}
        <p className="muted small">
          Automatic analysis of the ECMWF IFS sea-level pressure, 500 hPa and 850 hPa fields on a {step}° grid around you.
        </p>
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
  return (
    <div className="alerts">
      {alerts && alerts.alerts.length === 0 && (
        <p className="all-clear">✓ No extreme or unusual weather flagged by the models over the next 15 days.</p>
      )}
      {alerts?.alerts.map((a, i) => <AlertCard key={i} a={a} coverage={coverage} />)}

      {alerts && alerts.unmatched.length > 0 && (
        <div className="crosscheck unmatched">
          <strong>Official warnings in force that the model blend does not flag:</strong>
          <ul>{alerts.unmatched.map((w, i) => <OfficialLine key={i} w={w} />)}</ul>
          <p className="muted small">
            Forecasters may see local risks (flooding, coastal surges, convection) that daily model values smooth out.
            Follow the official warning.
          </p>
        </div>
      )}

      <p className="muted small">
        {warningsLoading
          ? 'Checking official warnings…'
          : warningsError
            ? `Official warnings could not be checked (${warningsError}).`
            : coverage === 'MeteoAlarm'
              ? `Official warnings: MeteoAlarm (national weather services of Europe), updated ${dateTime(warnings!.generated)}. ${warnings!.warnings.length === 0 ? 'None in force for your area.' : ''}`
              : coverage === 'NWS'
                ? `Official warnings: US National Weather Service (live). ${warnings!.warnings.length === 0 ? 'None in force for your area.' : ''}`
                : 'No official warning feed is integrated for this country yet: the alerts above come from the models only.'}
      </p>
    </div>
  )
}
