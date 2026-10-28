import { type PointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import { fetchMinutely, type MinutelySeries, type Place } from '../api/openMeteo'
import { fetchRadar, type RadarData, RADAR_ZOOM, WINDOW, windowTiles } from '../api/radar'
import { num, percent, t, tList, type TKey } from '../i18n'
import { niceTicks, useWidth } from '../lib/chartUtils'
import { clock } from '../lib/format'
import {
  estimateMotion,
  extrapolate,
  type Motion,
  type NowcastStep,
  type NowcastSummary,
  RAIN_MIN,
  sampleAt,
  summarize,
} from '../lib/nowcast'
import { useAsync, useNow } from '../lib/useAsync'
import { WebcamPanel } from './WebcamPanel'

const REFRESH = 5 * 60_000
const STEP = 300 // seconds between nowcast steps
const HOUR = 3600

interface Nowcast {
  past: NowcastStep[]
  steps: NowcastStep[]
  motion: Motion | null
  summary: NowcastSummary
  latest: number
}

function computeNowcast(radar: RadarData, nowS: number): Nowcast {
  const { frames, px, py } = radar
  const latest = frames[frames.length - 1]
  // Motion over ~20 minutes: long enough to measure, short enough to stay current.
  const prev = frames.findLast((f) => f.time <= latest.time - 1200) ?? frames[0]
  const motion = prev === latest ? null : estimateMotion(prev, latest)
  const start = Math.floor(nowS / STEP) * STEP
  const times = Array.from({ length: HOUR / STEP + 1 }, (_, k) => start + k * STEP)
  const steps = extrapolate(latest, motion, px, py, times)
  const past = frames.map((f) => ({ time: f.time, ...sampleAt(f, px, py, 1.5) }))
  return { past, steps, motion, summary: summarize(steps), latest: latest.time }
}

const INTENSITY: Record<string, TKey> = { light: 'iLight', moderate: 'iModerate', heavy: 'iHeavy' }

function headline(s: NowcastSummary, nowS: number, tz?: string): string {
  const text = sentence(s, nowS, tz)
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function sentence(s: NowcastSummary, nowS: number, tz?: string): string {
  const i = s.peak ? t(INTENSITY[s.peak]) : ''
  switch (s.kind) {
    case 'starts':
      return t('ncStarts', { i, time: clock(s.at!, tz), min: Math.max(5, Math.round((s.at! - nowS) / 60)) })
    case 'stops':
      return t('ncStops', { i, time: clock(s.at!, tz) })
    case 'continues':
      return t('ncContinues', { i })
    case 'maybe':
      return t('ncMaybe')
    default:
      return t('ncDry')
  }
}

function motionText(m: Motion | null, kmPerPx: number): string | null {
  if (!m) return null
  const kmh = Math.hypot(m.dx, m.dy) * kmPerPx * 60
  if (kmh < 5) return t('ncStill')
  // Screen y points south; the bearing the rain comes from is opposite its motion.
  const toward = (Math.atan2(m.dx, -m.dy) * 180) / Math.PI
  const from = Math.round((((toward + 180) % 360) + 360) % 360 / 45) % 8
  return t('ncMotion', { dir: tList('fromDirs')[from], v: Math.round(kmh / 5) * 5 })
}

export function RainNextHour({ place }: { place: Place }) {
  const now = useNow(60_000)
  const key = `${place.lat},${place.lon}|${Math.floor(now / REFRESH)}`
  const radar = useAsync(key, () => fetchRadar(place.lat, place.lon))
  const model = useAsync(key, () => fetchMinutely(place))
  const nowS = Math.floor(now / 1000)
  const nc = useMemo(() => (radar.value?.covered ? computeNowcast(radar.value, nowS) : null), [radar.value, nowS])
  const tz = model.value?.timezone

  const loading = !radar.value && !radar.error
  const motion = nc && radar.value ? motionText(nc.motion, radar.value.kmPerPx) : null

  return (
    <div className="rain1h">
      <div className="rain1h-main">
        {loading && <p className="muted">{t('ncLoading')}</p>}
        {radar.error && <p className="notice error">{t('ncFailed', { msg: radar.error })}</p>}
        {radar.value && !radar.value.covered && <p className="nc-headline">{t('ncUncovered')}</p>}
        {nc && (
          <>
            <p className={`nc-headline${nc.summary.kind === 'dry' ? '' : ' wet'}`}>
              <span aria-hidden="true">{nc.summary.kind === 'dry' ? '🌤️' : nc.summary.kind === 'maybe' ? '🌦️' : '🌧️'}</span>
              {headline(nc.summary, nowS, tz)}
            </p>
            <p className="muted small">
              {motion && `${motion} · `}
              {t('ncRadarAt', { time: clock(nc.latest, tz) })}
            </p>
          </>
        )}
        {(nc || model.value) && <RainChart nc={nc} model={model.value} nowS={nowS} tz={tz} />}
        <WebcamPanel place={place} tick={Math.floor(now / REFRESH)} />
      </div>
      <div className="rain1h-side">{radar.value && <RadarMap radar={radar.value} nc={nc} tz={tz} />}</div>
      <p className="muted small rain1h-source">{t('ncSource')}</p>
    </div>
  )
}

// −60 min … +60 min: radar observed, radar extrapolated, model every 15 min.
const CM = { top: 28, right: 12, bottom: 26, left: 36 }

function RainChart({ nc, model, nowS, tz }: { nc: Nowcast | null; model: MinutelySeries | null; nowS: number; tz?: string }) {
  const { ref, width } = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const height = 170
  const t0 = nowS - HOUR
  const t1 = nowS + HOUR
  const innerW = width - CM.left - CM.right
  const x = (time: number) => CM.left + ((time - t0) / (t1 - t0)) * innerW
  const plotBottom = height - CM.bottom

  const modelSteps = (model?.time ?? [])
    .map((end, i) => ({ start: end - 900, end, rate: (model!.precip[i] ?? 0) * 4 }))
    .filter((s) => s.end > t0 && s.start < t1)
  const bars = [
    ...(nc?.past ?? []).filter((s) => s.time >= t0).map((s) => ({ ...s, kind: 'obs' as const })),
    ...(nc?.steps ?? []).filter((s) => s.time > (nc?.latest ?? 0)).map((s) => ({ ...s, kind: 'nc' as const })),
  ]

  const max = Math.max(1, ...bars.map((b) => b.rate), ...modelSteps.map((s) => s.rate))
  const ticks = niceTicks(0, max, 3)
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + (ticks[1] - ticks[0]))
  const top = ticks[ticks.length - 1]
  const y = (v: number) => plotBottom - (v / top) * (plotBottom - CM.top)
  const barW = Math.max(3, (innerW / 24) * 0.6)

  let modelPath = ''
  for (const s of modelSteps) {
    const xa = x(Math.max(s.start, t0))
    const xb = x(Math.min(s.end, t1))
    modelPath += `${modelPath ? 'L' : 'M'}${xa.toFixed(1)},${y(s.rate).toFixed(1)}H${xb.toFixed(1)}`
  }

  // Round clock times, every 15 or 30 minutes depending on the width.
  const every = innerW < 420 ? 1800 : 900
  const labels: number[] = []
  for (let time = Math.ceil(t0 / every) * every; time <= t1; time += every) {
    if (time - t0 > 300 && t1 - time > 300) labels.push(time)
  }
  const onPointer = (e: PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    setHover(t0 + ((e.clientX - box.left) / box.width) * (t1 - t0))
  }

  // Nearest bar and the model interval under the pointer.
  const hb = hover == null ? null : bars.reduce<(typeof bars)[number] | null>((best, b) => (!best || Math.abs(b.time - hover) < Math.abs(best.time - hover) ? b : best), null)
  const hm = hover == null ? null : modelSteps.find((s) => hover > s.start && hover <= s.end)

  return (
    <div className="chart" ref={ref}>
      <ul className="legend">
        {nc && <li><i className="key key-rain" />{t('lRadarObs')}</li>}
        {nc && <li><i className="key key-nowcast" />{t('lNowcast')}</li>}
        {model && <li><i className="key key-model15" />{t('lModel15')}</li>}
      </ul>
      <svg width={width} height={height} role="img" aria-label={t('ariaRain1h')}>
        <g className="grid">
          {ticks.map((v) => (
            <g key={v}>
              <line x1={CM.left} x2={CM.left + innerW} y1={y(v)} y2={y(v)} />
              <text x={CM.left - 6} y={y(v) + 4} textAnchor="end">{num(v, v < 1 ? 1 : 0)}</text>
            </g>
          ))}
          <text x={CM.left - 6} y={CM.top - 16} textAnchor="end">mm/h</text>
        </g>
        {bars.map((b) => {
          if (b.rate < RAIN_MIN / 2) return null
          const h = Math.max(1, plotBottom - y(b.rate))
          const w = b.kind === 'obs' ? barW : barW * 0.75
          const x0 = x(b.time) - w / 2
          const r = Math.min(3, w / 2, h)
          return (
            <path
              key={`${b.kind}${b.time}`}
              className={`bar ${b.kind === 'nc' ? 'bar-nowcast' : ''}${hb === b ? ' hover' : ''}`}
              style={b.kind === 'nc' ? { fillOpacity: 0.25 + 0.5 * b.chance } : undefined}
              d={`M${x0},${plotBottom}V${plotBottom - h + r}Q${x0},${plotBottom - h} ${x0 + r},${plotBottom - h}H${x0 + w - r}Q${x0 + w},${plotBottom - h} ${x0 + w},${plotBottom - h + r}V${plotBottom}Z`}
            />
          )
        })}
        {modelPath && <path className="line line-model15" d={modelPath} />}
        <line x1={CM.left} x2={CM.left + innerW} y1={plotBottom} y2={plotBottom} className="baseline" />
        <line className="now-line" x1={x(nowS)} x2={x(nowS)} y1={CM.top - 6} y2={plotBottom} />
        <text className="end-label" x={x(nowS)} y={CM.top - 10} textAnchor="middle">{t('now')}</text>
        <g className="axis">
          {labels.map((time) => (
            <text key={time} x={x(time)} y={height - 8} textAnchor="middle">
              {clock(time, tz)}
            </text>
          ))}
        </g>
        {hover != null && <line className="crosshair" x1={x(hover)} x2={x(hover)} y1={CM.top} y2={plotBottom} />}
        <rect
          className="hit"
          x={CM.left}
          y={CM.top}
          width={innerW}
          height={plotBottom - CM.top}
          onPointerMove={onPointer}
          onPointerDown={onPointer}
          onPointerLeave={(e) => e.pointerType !== 'touch' && setHover(null)}
        />
      </svg>
      {hover != null && (hb || hm) && (
        <div className="tooltip" style={x(hover) > width / 2 ? { right: width - x(hover) + 12 } : { left: x(hover) + 12 }}>
          <div className="tooltip-title">{clock(hb && Math.abs(hb.time - hover) < 450 ? hb.time : hover, tz)}</div>
          <table>
            <tbody>
              {hb && Math.abs(hb.time - hover) < 450 && (
                <tr>
                  <td><i className={`key ${hb.kind === 'nc' ? 'key-nowcast' : 'key-rain'}`} />{t(hb.kind === 'nc' ? 'lNowcast' : 'lRadarObs')}</td>
                  <td>{num(hb.rate, 1)} mm/h</td>
                  <td className="muted">{hb.kind === 'nc' ? t('ncChance', { p: percent(hb.chance) }) : ''}</td>
                </tr>
              )}
              {hm && (
                <tr>
                  <td><i className="key key-model15" />{t('lModel15')}</td>
                  <td>{num(hm.rate, 1)} mm/h</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// Radar loop on a light/dark basemap: the last hour, then the extrapolation.
const VIEW = 288 // radar pixels shown (≈250 km at 45°N)
const SCALE = 2 // the basemap is one zoom level finer than the radar

function RadarMap({ radar, nc, tz }: { radar: RadarData; nc: Nowcast | null; tz?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [dark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)
  const [base, setBase] = useState<{ key: string; img: HTMLCanvasElement } | null>(null)
  const [playing, setPlaying] = useState(false)

  const latest = radar.frames[radar.frames.length - 1]
  const frames = useMemo(() => {
    const past = radar.frames.map((f) => ({ time: f.time, lead: 0, image: f.image }))
    const future = nc?.motion !== undefined
      ? Array.from({ length: 6 }, (_, k) => ({ time: latest.time + (k + 1) * 600, lead: (k + 1) * 10, image: latest.image }))
      : []
    return [...past, ...future]
  }, [radar, nc, latest])
  const [index, setIndex] = useState<{ key: number; i: number } | null>(null)
  const i = index?.key === latest.time ? index.i : radar.frames.length - 1

  // Basemap: OpenStreetMap one zoom finer than the radar, on the same grid.
  const off = (WINDOW - VIEW) / 2
  const baseKey = `${radar.x0},${radar.y0}`
  useEffect(() => {
    const c = document.createElement('canvas')
    c.width = c.height = VIEW * SCALE
    const ctx = c.getContext('2d')!
    const tiles = windowTiles((radar.x0 + off) * SCALE, (radar.y0 + off) * SCALE, VIEW * SCALE, RADAR_ZOOM + 1)
    let left = tiles.length
    let cancelled = false
    for (const tile of tiles) {
      const img = new Image()
      img.onload = img.onerror = () => {
        if (img.naturalWidth) ctx.drawImage(img, tile.dx, tile.dy)
        if (--left === 0 && !cancelled) setBase({ key: baseKey, img: c })
      }
      img.src = `https://tile.openstreetmap.org/${RADAR_ZOOM + 1}/${tile.x}/${tile.y}.png`
    }
    return () => {
      cancelled = true
    }
  }, [baseKey, radar.x0, radar.y0, off])

  const baseCanvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = baseCanvas.current?.getContext('2d')
    if (ctx && base?.key === baseKey) ctx.drawImage(base.img, 0, 0)
  }, [base, baseKey])

  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => setIndex((p) => ({ key: latest.time, i: ((p?.key === latest.time ? p.i : radar.frames.length - 1) + 1) % frames.length })), 600)
    return () => clearInterval(id)
  }, [playing, frames.length, latest.time, radar.frames.length])

  const frame = frames[Math.min(i, frames.length - 1)]
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    const size = VIEW * SCALE
    ctx.clearRect(0, 0, size, size)
    // Extrapolated frames: the latest picture, moved along the rain's motion.
    const m = nc?.motion ?? { dx: 0, dy: 0 }
    const shift = frame.lead ? [m.dx * frame.lead * SCALE, m.dy * frame.lead * SCALE] : [0, 0]
    ctx.globalAlpha = frame.lead ? 0.7 : 0.85
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(frame.image, -off * SCALE + shift[0], -off * SCALE + shift[1], WINDOW * SCALE, WINDOW * SCALE)
    ctx.globalAlpha = 1
    // The place.
    const cx = (radar.px - off) * SCALE
    const cy = (radar.py - off) * SCALE
    ctx.beginPath()
    ctx.arc(cx, cy, 7, 0, 2 * Math.PI)
    ctx.fillStyle = dark ? '#f0efec' : '#0b0b0b'
    ctx.strokeStyle = dark ? '#0d0d0d' : '#ffffff'
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.fill()
  }, [frame, nc, radar, dark, off])

  return (
    <figure className="radar-map">
      <div className="radar-stage">
        <canvas ref={baseCanvas} className="radar-base" width={VIEW * SCALE} height={VIEW * SCALE} aria-hidden="true" />
        <canvas ref={canvas} width={VIEW * SCALE} height={VIEW * SCALE} role="img" aria-label={t('ariaRadar')} />
      </div>
      <div className="radar-controls">
        <button type="button" onClick={() => setPlaying((p) => !p)} aria-pressed={playing}>
          {playing ? `❚❚ ${t('pause')}` : `▶ ${t('play')}`}
        </button>
        <label>
          <span>
            <strong>{clock(frame.time, tz)}</strong> · {frame.lead ? t('mapExtrapolated', { n: frame.lead }) : t('mapRadar')}
          </span>
          <input
            type="range"
            min={0}
            max={frames.length - 1}
            value={Math.min(i, frames.length - 1)}
            onChange={(e) => {
              setPlaying(false)
              setIndex({ key: latest.time, i: Number(e.target.value) })
            }}
            aria-label={t('mapTime')}
          />
        </label>
      </div>
      <figcaption className="muted small">
        {t('radarCredit')}{' '}
        <a href="https://www.rainviewer.com/" target="_blank" rel="noreferrer">RainViewer</a> ·{' '}
        © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>
      </figcaption>
    </figure>
  )
}
