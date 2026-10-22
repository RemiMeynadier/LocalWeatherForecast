import { type PointerEvent, useEffect, useRef, useState } from 'react'
import { BACKTEST_LEADS } from '../api/openMeteo'
import type { BacktestResult } from '../lib/backtest'
import type { DayForecast } from '../lib/forecast'
import { DETERMINISTIC_MODELS } from '../lib/models'
import type { BacktestState } from '../lib/useForecast'
import { AiBadge } from './ModelsPanel'

const label = (id: string) => DETERMINISTIC_MODELS.find((m) => m.id === id)?.label ?? id
const isAi = (id: string) => !!DETERMINISTIC_MODELS.find((m) => m.id === id)?.ai

// Sequential blue ramp (light = small error, dark = large error).
const RAMP = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b']
function rampColor(mae: number) {
  const t = Math.max(0, Math.min(1, (mae - 0.5) / 3))
  const i = Math.round(t * (RAMP.length - 1))
  return { bg: RAMP[i], ink: i >= 7 ? '#ffffff' : '#0b0b0b' }
}

function WeightBars({ days }: { days: DayForecast[] }) {
  const leads = [1, 3, 5, 7].filter((l) => days[l]?.models.length)
  const [lead, setLead] = useState(leads[0] ?? 1)
  const d = days[lead]
  if (!d) return null
  const totalPrior = d.models.reduce((a, m) => a + m.priorWeight, 0)
  const total = d.models.reduce((a, m) => a + m.weight, 0)
  const rows = d.models
    .map((m) => ({ model: m.model, prior: m.priorWeight / totalPrior, after: m.weight / total }))
    .sort((a, b) => b.after - a.after)
  const max = Math.max(...rows.flatMap((r) => [r.prior, r.after]))
  return (
    <figure className="bt-figure">
      <figcaption>
        <strong>Model weights in the temperature blend</strong>
        <div className="segmented" role="group" aria-label="Lead time">
          {leads.map((l) => (
            <button key={l} type="button" aria-pressed={l === lead} onClick={() => setLead(l)}>
              D+{l}
            </button>
          ))}
        </div>
      </figcaption>
      <ul className="legend">
        <li><i className="key key-prior" />Before backtest (fixed rules)</li>
        <li><i className="key key-after" />After backtest</li>
      </ul>
      <div className="wbars">
        {rows.map((r) => {
          const change = r.after / r.prior - 1
          return (
            <div key={r.model} className="wbar-row" title={`${label(r.model)}: ${(r.prior * 100).toFixed(1)}% → ${(r.after * 100).toFixed(1)}%`}>
              <span className="wbar-label">
                {label(r.model)} {isAi(r.model) && <AiBadge />}
              </span>
              <span className="wbar-track">
                <span className="wbar prior" style={{ width: `${(r.prior / max) * 100}%` }} />
                <span className="wbar after" style={{ width: `${(r.after / max) * 100}%` }} />
              </span>
              <span className="wbar-value">
                {(r.after * 100).toFixed(0)}%
                <span className={`delta ${change > 0.02 ? 'up' : change < -0.02 ? 'down' : ''}`}>
                  {change > 0.02 ? '▲' : change < -0.02 ? '▼' : '='} {Math.abs(change * 100).toFixed(0)}%
                </span>
              </span>
            </div>
          )
        })}
      </div>
    </figure>
  )
}

function ErrorHeatmap({ result }: { result: BacktestResult }) {
  const leads = Array.from({ length: BACKTEST_LEADS }, (_, i) => i + 1)
  const rows = [...result.scores].sort((a, b) => (a.leads[1]?.mae ?? 99) - (b.leads[1]?.mae ?? 99))
  return (
    <figure className="bt-figure">
      <figcaption>
        <strong>Temperature error by lead time</strong>
        <span className="muted small">
          Mean absolute error (°C) of hourly temperature vs. observations, by how many days before the run was issued.
          Darker = larger error.
        </span>
      </figcaption>
      <div className="table-wrap">
        <table className="heatmap">
          <thead>
            <tr>
              <th scope="col">Model</th>
              {leads.map((l) => <th key={l} scope="col">D+{l}</th>)}
              <th scope="col" title="Mean forecast minus observed, D+1">Bias D+1</th>
              <th scope="col" title="Equitable threat score for rain/no rain in 3-hour blocks (1 = perfect, 0 = no skill)">Rain skill D+1</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.model}>
                <th scope="row">
                  {label(s.model)} {isAi(s.model) && <AiBadge />}
                </th>
                {leads.map((l) => {
                  const sc = s.leads[l]
                  if (!sc) return <td key={l} className="muted na">·</td>
                  const c = rampColor(sc.mae)
                  return (
                    <td key={l} className="cell" style={{ background: c.bg, color: c.ink }} title={`${label(s.model)}, D+${l}: MAE ${sc.mae.toFixed(2)} °C, bias ${sc.bias >= 0 ? '+' : ''}${sc.bias.toFixed(2)} °C (${sc.n} hours)`}>
                      {sc.mae.toFixed(1)}
                    </td>
                  )
                })}
                <td>{s.leads[1] ? `${s.leads[1].bias >= 0 ? '+' : '−'}${Math.abs(s.leads[1].bias).toFixed(1)}°` : '—'}</td>
                <td>{s.leads[1]?.rain.ets != null ? s.leads[1].rain.ets.toFixed(2) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, e.contentRect.width)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return { ref, width }
}

const hourFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })

function ObsChart({ result }: { result: BacktestResult }) {
  const { ref, width } = useWidth()
  const [hover, setHover] = useState<number | null>(null)
  const ranked = [...result.scores].filter((s) => s.leads[1]).sort((a, b) => a.leads[1]!.mae - b.leads[1]!.mae)
  if (ranked.length < 2) return null
  const best = ranked[0].model
  const worst = ranked[ranked.length - 1].model
  const pts = result.series
  const M = { top: 12, right: 12, bottom: 24, left: 34 }
  const height = 220
  const vals = pts.flatMap((p) => [p.obs, p.byModel[best], p.byModel[worst]]).filter((v): v is number => v != null)
  const lo = Math.floor(Math.min(...vals) - 1)
  const hi = Math.ceil(Math.max(...vals) + 1)
  const x = (i: number) => M.left + (i / Math.max(1, pts.length - 1)) * (width - M.left - M.right)
  const y = (v: number) => M.top + ((hi - v) / (hi - lo)) * (height - M.top - M.bottom)
  const line = (get: (i: number) => number | null) => {
    let d = ''
    let pen = false
    pts.forEach((_, i) => {
      const v = get(i)
      if (v == null) {
        pen = false
        return
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
      pen = true
    })
    return d
  }
  const ticks: number[] = []
  const stepT = hi - lo > 12 ? 5 : 2
  for (let v = Math.ceil(lo / stepT) * stepT; v <= hi; v += stepT) ticks.push(v)
  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const i = Math.round(((e.clientX - box.left) / box.width) * (pts.length - 1))
    setHover(i >= 0 && i < pts.length ? i : null)
  }
  const hp = hover != null ? pts[hover] : null
  return (
    <figure className="bt-figure">
      <figcaption>
        <strong>Observed vs. forecast the day before</strong>
        <span className="muted small">Hourly temperature at the station; forecasts issued 1 day earlier by the best and worst model of the week.</span>
      </figcaption>
      <ul className="legend">
        <li><i className="key key-obs" />Observed</li>
        <li><i className="key key-best" />Best: {label(best)} (MAE {ranked[0].leads[1]!.mae.toFixed(1)} °C)</li>
        <li><i className="key key-worst" />Worst: {label(worst)} (MAE {ranked[ranked.length - 1].leads[1]!.mae.toFixed(1)} °C)</li>
      </ul>
      <div className="chart" ref={ref}>
        <svg width={width} height={height} role="img" aria-label="Observed temperature compared with the best and worst model forecasts">
          <g className="grid">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} />
                <text x={M.left - 6} y={y(t) + 4} textAnchor="end">{t}°</text>
              </g>
            ))}
          </g>
          <g className="axis">
            <line x1={M.left} x2={width - M.right} y1={height - M.bottom} y2={height - M.bottom} className="baseline" />
            {pts.map((p, i) =>
              p.time.endsWith('T12:00') ? (
                <text key={p.time} x={x(i)} y={height - 6} textAnchor="middle">{dayFmt.format(new Date(`${p.time}Z`))}</text>
              ) : null,
            )}
          </g>
          <path className="line line-worst" d={line((i) => pts[i].byModel[worst])} />
          <path className="line line-best" d={line((i) => pts[i].byModel[best])} />
          <path className="line line-obs" d={line((i) => pts[i].obs)} />
          {hover != null && <line className="crosshair" x1={x(hover)} x2={x(hover)} y1={M.top} y2={height - M.bottom} />}
          <rect className="hit" x={M.left} y={M.top} width={width - M.left - M.right} height={height - M.top - M.bottom} onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
        </svg>
        {hp && hover != null && (
          <div className="tooltip" style={x(hover) > width / 2 ? { right: width - x(hover) + 12 } : { left: x(hover) + 12 }}>
            <div className="tooltip-title">{hourFmt.format(new Date(`${hp.time}Z`))} UTC</div>
            <table>
              <tbody>
                <tr><td><i className="key key-obs" />Observed</td><td>{hp.obs != null ? `${hp.obs.toFixed(1)}°` : '—'}</td></tr>
                <tr><td><i className="key key-best" />{label(best)}</td><td>{hp.byModel[best] != null ? `${hp.byModel[best]!.toFixed(1)}°` : '—'}</td></tr>
                <tr><td><i className="key key-worst" />{label(worst)}</td><td>{hp.byModel[worst] != null ? `${hp.byModel[worst]!.toFixed(1)}°` : '—'}</td></tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </figure>
  )
}

interface Props {
  state: BacktestState | null
  loading: boolean
  error: string | null
  days: DayForecast[]
}

export function BacktestPanel({ state, loading, error, days }: Props) {
  if (loading) return <p className="muted">Fetching last week’s observations and forecasts…</p>
  if (error) return <p className="notice error">Backtest unavailable: {error}. Fixed weights are used.</p>
  if (!state) return null
  if (state.status === 'no-station') {
    return <p className="muted">No observing station (METAR) within 60 km, so no backtest: fixed weights are used.</p>
  }
  const { station, result } = state
  return (
    <>
      <p className="lede">
        Each model’s forecasts issued 1 to 7 days ahead over the last 7 days were compared with the hourly reports of{' '}
        <strong>
          {station.name} ({station.id})
        </strong>
        , {station.distanceKm.toFixed(0)} km away at {Math.round(station.elevation)} m. Models with smaller errors get more
        weight: (median error / model error)², damped because one week is a small sample, and fading out beyond D+7.
        The rain blend is weighted by rain/no-rain detection skill when enough rain was observed ({result.rainBlocks} rainy
        3-hour periods this week{result.rainBlocks < 4 ? ', too few: rain weights unchanged' : ''}).
      </p>
      <div className="bt-grid">
        <WeightBars days={days} />
        <ObsChart result={result} />
      </div>
      <ErrorHeatmap result={result} />
    </>
  )
}
