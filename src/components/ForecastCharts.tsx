import { type PointerEvent, useState } from 'react'
import { niceTicks, useWidth } from '../lib/chartUtils'
import type { DayForecast } from '../lib/forecast'
import { t } from '../i18n'
import { confidence, dayLabel, mm, pct, shortDate, temp } from '../lib/format'

const M = { top: 22, right: 64, bottom: 26, left: 36 }

interface Scale {
  x: (i: number) => number
  step: number
  innerW: number
}

function xScale(width: number, n: number): Scale {
  const innerW = width - M.left - M.right
  const step = innerW / Math.max(1, n)
  return { x: (i) => M.left + (i + 0.5) * step, step, innerW }
}

// Polyline through defined points; breaks the path on gaps.
function linePath(points: (readonly [number, number] | null)[]): string {
  let d = ''
  let pen = false
  for (const p of points) {
    if (!p) {
      pen = false
      continue
    }
    d += `${pen ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`
    pen = true
  }
  return d
}

function bandPath(xs: number[], lo: (number | null)[], hi: (number | null)[]): string {
  // Only the contiguous run where both bounds exist (ensembles have no gaps inside).
  const idx = xs.map((_, i) => i).filter((i) => lo[i] != null && hi[i] != null)
  if (idx.length < 2) return ''
  const top = idx.map((i) => `${xs[i].toFixed(1)},${hi[i]!.toFixed(1)}`)
  const bottom = [...idx].reverse().map((i) => `${xs[i].toFixed(1)},${lo[i]!.toFixed(1)}`)
  return `M${top.join('L')}L${bottom.join('L')}Z`
}

function XAxis({ days, s, y }: { days: DayForecast[]; s: Scale; y: number }) {
  const every = s.step < 14 ? 7 : s.step < 30 ? 3 : 1
  return (
    <g className="axis">
      <line x1={M.left} x2={M.left + s.innerW} y1={y} y2={y} className="baseline" />
      {days.map((d, i) =>
        i % every === 0 ? (
          <text key={d.date} x={s.x(i)} y={y + 16} textAnchor="middle">
            {i === 0 ? t('todayShort') : shortDate(d.date)}
          </text>
        ) : null,
      )}
    </g>
  )
}

// Hairlines where reliability drops: D+10 (detail) and D+15 (end of most models).
function HorizonMarks({ days, s, top, bottom, labels }: { days: DayForecast[]; s: Scale; top: number; bottom: number; labels?: boolean }) {
  return (
    <g className="horizon">
      {[10, 15].map((lead) =>
        lead < days.length ? (
          <g key={lead}>
            <line x1={s.x(lead) - s.step / 2} x2={s.x(lead) - s.step / 2} y1={top} y2={bottom} />
            {labels && (
              <text x={s.x(lead) - s.step / 2 + 4} y={top + 10}>
                {lead === 10 ? t('hTrend') : t('hProb')}
              </text>
            )}
          </g>
        ) : null,
      )}
    </g>
  )
}

function Crosshair({ s, i, top, bottom }: { s: Scale; i: number | null; top: number; bottom: number }) {
  if (i == null) return null
  return <line className="crosshair" x1={s.x(i)} x2={s.x(i)} y1={top} y2={bottom} />
}

function Tooltip({ d, x, width }: { d: DayForecast; x: number; width: number }) {
  const left = x > width / 2
  const e = d.ensemble
  return (
    <div className="tooltip" style={left ? { right: width - x + 12 } : { left: x + 12 }}>
      <div className="tooltip-title">
        {dayLabel(d.date)} <span className="muted">· {t('lead', { n: d.lead })}</span>
      </div>
      <table>
        <tbody>
          <tr>
            <td><i className="key key-max" />{t('lMax')}</td>
            <td>{temp(d.tmax, 1)}</td>
            <td className="muted">{e ? `${temp(e.tmax.p10)} – ${temp(e.tmax.p90)}` : ''}</td>
          </tr>
          <tr>
            <td><i className="key key-min" />{t('lMin')}</td>
            <td>{temp(d.tmin, 1)}</td>
            <td className="muted">{e ? `${temp(e.tmin.p10)} – ${temp(e.tmin.p90)}` : ''}</td>
          </tr>
          {d.normal && (
            <tr>
              <td><i className="key key-normal" />{t('normal')}</td>
              <td>{temp(d.normal.tmax)}</td>
              <td className="muted">/ {temp(d.normal.tmin)}</td>
            </tr>
          )}
          <tr>
            <td><i className="key key-rain" />{t('rain')}</td>
            <td>{mm(d.precip)}</td>
            <td className="muted">{e ? t('rainChance', { p: pct(e.rainProb) }) : ''}</td>
          </tr>
        </tbody>
      </table>
      <div className="muted small">
        {t('confidence')}: {confidence(d.confidence).label} ·{' '}
        {d.source === 'consensus' ? t('nModels', { n: d.models.length }) : t('nScenarios', { n: e?.members ?? 0 })}
      </div>
    </div>
  )
}

interface ChartProps {
  days: DayForecast[]
  hover: number | null
  onHover: (i: number | null) => void
}

// Hover is shared between charts (crosshair everywhere); the tooltip only
// shows on the chart under the pointer.
function usePointer(s: Scale, n: number, onHover: (i: number | null) => void) {
  const [inside, setInside] = useState(false)
  const show = (e: PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const i = Math.floor((e.clientX - box.left) / s.step)
    setInside(true)
    onHover(i >= 0 && i < n ? i : null)
  }
  const handlers = {
    onPointerMove: show,
    // On touch screens a tap shows the day, and it stays after the finger lifts.
    onPointerDown: show,
    onPointerLeave: (e: PointerEvent<SVGRectElement>) => {
      if (e.pointerType === 'touch') return
      setInside(false)
      onHover(null)
    },
  }
  return { inside, handlers }
}

export function TemperatureChart({ days, hover, onHover }: ChartProps) {
  const { ref, width } = useWidth<HTMLDivElement>()
  const height = 300
  const s = xScale(width, days.length)
  const { inside, handlers: pointer } = usePointer(s, days.length, onHover)

  const values = days.flatMap((d) => [
    d.tmax, d.tmin, d.ensemble?.tmax.p90, d.ensemble?.tmin.p10, d.normal?.tmax, d.normal?.tmin,
  ]).filter((v): v is number => v != null)
  const lo = Math.floor(Math.min(...values) - 1)
  const hi = Math.ceil(Math.max(...values) + 1)
  const innerH = height - M.top - M.bottom
  const y = (v: number) => M.top + ((hi - v) / (hi - lo)) * innerH
  const ys = (v: number | null | undefined) => (v == null ? null : y(v))
  const xs = days.map((_, i) => s.x(i))
  const pt = (i: number, v: number | null | undefined) => (v == null ? null : ([xs[i], y(v)] as const))

  const lastIdx = (get: (d: DayForecast) => number | null | undefined) => days.findLastIndex((d) => get(d) != null)
  const endLabel = (get: (d: DayForecast) => number | null | undefined, text: string, cls = '') => {
    const i = lastIdx(get)
    if (i < 0) return null
    return (
      <text x={xs[i] + 8} y={y(get(days[i])!) + 4} className={`end-label ${cls}`}>
        {text}
      </text>
    )
  }

  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={height} role="img" aria-label={t('ariaTemps')}>
        <g className="grid">
          {niceTicks(lo, hi).map((t) => (
            <g key={t}>
              <line x1={M.left} x2={M.left + s.innerW} y1={y(t)} y2={y(t)} />
              <text x={M.left - 6} y={y(t) + 4} textAnchor="end">{t}°</text>
            </g>
          ))}
        </g>
        <HorizonMarks days={days} s={s} top={M.top} bottom={height - M.bottom} labels={width > 520} />

        <path className="band band-max" d={bandPath(xs, days.map((d) => ys(d.ensemble?.tmax.p10)), days.map((d) => ys(d.ensemble?.tmax.p90)))} />
        <path className="band band-max" d={bandPath(xs, days.map((d) => ys(d.ensemble?.tmax.p25)), days.map((d) => ys(d.ensemble?.tmax.p75)))} />
        <path className="band band-min" d={bandPath(xs, days.map((d) => ys(d.ensemble?.tmin.p10)), days.map((d) => ys(d.ensemble?.tmin.p90)))} />
        <path className="band band-min" d={bandPath(xs, days.map((d) => ys(d.ensemble?.tmin.p25)), days.map((d) => ys(d.ensemble?.tmin.p75)))} />

        <path className="line normal" d={linePath(days.map((d, i) => pt(i, d.normal?.tmax)))} />
        <path className="line normal" d={linePath(days.map((d, i) => pt(i, d.normal?.tmin)))} />
        <path className="line line-max" d={linePath(days.map((d, i) => pt(i, d.tmax)))} />
        <path className="line line-min" d={linePath(days.map((d, i) => pt(i, d.tmin)))} />

        {endLabel((d) => d.tmax, 'Max')}
        {endLabel((d) => d.tmin, 'Min')}

        <XAxis days={days} s={s} y={height - M.bottom} />
        <Crosshair s={s} i={hover} top={M.top} bottom={height - M.bottom} />
        {hover != null && (
          <g>
            {days[hover].tmax != null && <circle className="dot dot-max" cx={xs[hover]} cy={y(days[hover].tmax!)} r={4.5} />}
            {days[hover].tmin != null && <circle className="dot dot-min" cx={xs[hover]} cy={y(days[hover].tmin!)} r={4.5} />}
          </g>
        )}
        <rect className="hit" x={M.left} y={M.top} width={s.innerW} height={innerH} {...pointer} />
      </svg>
      {hover != null && inside && <Tooltip d={days[hover]} x={xs[hover]} width={width} />}
    </div>
  )
}

export function PrecipitationChart({ days, hover, onHover }: ChartProps) {
  const { ref, width } = useWidth<HTMLDivElement>()
  const height = 190
  const strip = 14
  const plotBottom = height - M.bottom - strip - 8
  const s = xScale(width, days.length)
  const { inside, handlers: pointer } = usePointer(s, days.length, onHover)

  const max = Math.max(5, ...days.map((d) => d.precip ?? 0))
  const ticks = niceTicks(0, max, 3)
  // Extend the axis one step so the tallest bar always fits.
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + (ticks[1] - ticks[0]))
  const top = ticks[ticks.length - 1]
  const y = (v: number) => plotBottom - (v / top) * (plotBottom - M.top)
  const barW = Math.max(2, Math.min(24, s.step * 0.62))

  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={height} role="img" aria-label={t('ariaPrecip')}>
        <g className="grid">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={M.left + s.innerW} y1={y(t)} y2={y(t)} />
              <text x={M.left - 6} y={y(t) + 4} textAnchor="end">{t}</text>
            </g>
          ))}
          <text x={M.left - 6} y={M.top - 8} textAnchor="end">mm</text>
        </g>
        <HorizonMarks days={days} s={s} top={M.top} bottom={plotBottom + strip + 8} />
        {days.map((d, i) => {
          const v = d.precip ?? 0
          if (v < 0.05) return null
          const h = plotBottom - y(v)
          const x0 = s.x(i) - barW / 2
          const r = Math.min(4, barW / 2, h)
          // Rounded data-end, square at the baseline.
          return (
            <path
              key={d.date}
              className={`bar${hover === i ? ' hover' : ''}`}
              d={`M${x0},${plotBottom}V${plotBottom - h + r}Q${x0},${plotBottom - h} ${x0 + r},${plotBottom - h}H${x0 + barW - r}Q${x0 + barW},${plotBottom - h} ${x0 + barW},${plotBottom - h + r}V${plotBottom}Z`}
            />
          )
        })}
        <line x1={M.left} x2={M.left + s.innerW} y1={plotBottom} y2={plotBottom} className="baseline" />
        {/* Probability strip: one cell per day, darker = more likely to rain. */}
        {days.map((d, i) =>
          d.ensemble ? (
            <rect
              key={d.date}
              className="prob-cell"
              x={s.x(i) - s.step / 2 + 1}
              y={plotBottom + 6}
              width={Math.max(1, s.step - 2)}
              height={strip}
              rx={2}
              style={{ fillOpacity: 0.08 + 0.92 * d.ensemble.rainProb }}
            />
          ) : null,
        )}
        <text className="end-label" x={M.left + s.innerW + 8} y={plotBottom + 6 + strip - 3}>
          {t('chanceShort')}
        </text>
        <XAxis days={days} s={s} y={height - M.bottom} />
        <Crosshair s={s} i={hover} top={M.top} bottom={plotBottom + strip + 8} />
        <rect className="hit" x={M.left} y={M.top} width={s.innerW} height={plotBottom + strip + 8 - M.top} {...pointer} />
      </svg>
      {hover != null && inside && <Tooltip d={days[hover]} x={s.x(hover)} width={width} />}
    </div>
  )
}
