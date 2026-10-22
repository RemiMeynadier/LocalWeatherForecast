import { contours } from 'd3-contour'
import { geoMercator, geoPath } from 'd3-geo'
import type { FeatureCollection, MultiLineString } from 'geojson'
import { useEffect, useMemo, useRef, useState } from 'react'
import { feature, mesh } from 'topojson-client'
import type { SynopticGrid } from '../api/openMeteo'
import type { SynopticStep } from '../lib/synoptic'

interface Props {
  grid: SynopticGrid
  steps: SynopticStep[]
  lat: number
  lon: number
  step: number // grid spacing, degrees
}

const UPSAMPLE = 4
const ISOBAR_STEP = 4 // hPa
const Z_STEP = 40 // m
const Z_MID = 5640 // m, a typical mid-latitude 500 hPa height

// Bilinear upsampling so contours come out smooth rather than angular.
// Input rows run south -> north; output rows run north -> south (image order).
function upsample(f: number[][], k: number): { values: number[]; nx: number; ny: number } {
  const rows = f.length
  const cols = f[0].length
  const nx = (cols - 1) * k + 1
  const ny = (rows - 1) * k + 1
  const values = new Array<number>(nx * ny)
  for (let y = 0; y < ny; y++) {
    const gy = (ny - 1 - y) / k
    const r0 = Math.min(rows - 2, Math.floor(gy))
    const ty = gy - r0
    for (let x = 0; x < nx; x++) {
      const gx = x / k
      const c0 = Math.min(cols - 2, Math.floor(gx))
      const tx = gx - c0
      const a = f[r0][c0] * (1 - tx) + f[r0][c0 + 1] * tx
      const b = f[r0 + 1][c0] * (1 - tx) + f[r0 + 1][c0 + 1] * tx
      values[y * nx + x] = a * (1 - ty) + b * ty
    }
  }
  return { values, nx, ny }
}

type World = { land: FeatureCollection; borders: MultiLineString; coast: MultiLineString }

// Country outlines are ~200 kB gzipped, so they load only with the map.
let worldPromise: Promise<World> | null = null
function loadWorld(): Promise<World> {
  worldPromise ??= import('world-atlas/countries-50m.json').then((m) => {
    const topo = (m.default ?? m) as any
    return {
      land: feature(topo, topo.objects.land) as unknown as FeatureCollection,
      borders: mesh(topo, topo.objects.countries, (a: unknown, b: unknown) => a !== b) as MultiLineString,
      coast: mesh(topo, topo.objects.land) as MultiLineString,
    }
  })
  return worldPromise
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

const timeFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })

function zFill(t: number): string {
  const d = Math.max(-1, Math.min(1, (t - Z_MID) / 360))
  const pole = d < 0 ? 'var(--cold)' : 'var(--warm)'
  return `color-mix(in srgb, ${pole} ${Math.round(6 + Math.abs(d) * 34)}%, var(--surface))`
}

export function SynopticMap({ grid, steps, lat, lon, step }: Props) {
  const { ref, width } = useWidth()
  const [world, setWorld] = useState<World | null>(null)
  // Grid times start at 00 UTC today, 6-hourly.
  const [nowIndex] = useState(() => Math.min(grid.times.length - 1, Math.floor(new Date().getUTCHours() / 6)))
  const [t, setT] = useState(nowIndex)

  useEffect(() => {
    loadWorld().then(setWorld, () => setWorld(null))
  }, [])

  const lonMin = grid.lons[0]
  const lonMax = grid.lons[grid.lons.length - 1]
  const latMin = grid.lats[0]
  const latMax = grid.lats[grid.lats.length - 1]

  const projection = useMemo(() => {
    const p = geoMercator().rotate([-(lonMin + lonMax) / 2, 0])
    p.fitWidth(width, {
      type: 'MultiPoint',
      coordinates: [
        [lonMin, latMin],
        [lonMax, latMin],
        [lonMin, latMax],
        [lonMax, latMax],
      ],
    })
    return p
  }, [width, lonMin, lonMax, latMin, latMax])

  const [, yTop] = projection([lonMin, latMax])!
  const [, yBottom] = projection([lonMin, latMin])!
  const height = Math.round(yBottom - yTop + Math.max(0, yTop) * 2)
  const path = geoPath(projection)

  const cell = step / UPSAMPLE
  // Grid (image) coordinates -> lon/lat -> screen. d3-contour puts the value
  // of pixel i at i + 0.5.
  const toScreen = (x: number, y: number) => projection([lonMin + (x - 0.5) * cell, latMax - (y - 0.5) * cell])!
  const ringPath = (ring: number[][]) =>
    ring.map(([x, y], i) => {
      const [sx, sy] = toScreen(x, y)
      return `${i ? 'L' : 'M'}${sx.toFixed(1)},${sy.toFixed(1)}`
    }).join('') + 'Z'

  const fields = useMemo(() => {
    const p = upsample(grid.mslp[t], UPSAMPLE)
    const z = upsample(grid.z500[t], UPSAMPLE)
    const pMin = Math.floor(Math.min(...p.values) / ISOBAR_STEP) * ISOBAR_STEP
    const pMax = Math.ceil(Math.max(...p.values) / ISOBAR_STEP) * ISOBAR_STEP
    const zMin = Math.floor(Math.min(...z.values) / Z_STEP) * Z_STEP
    const zMax = Math.ceil(Math.max(...z.values) / Z_STEP) * Z_STEP
    const range = (a: number, b: number, s: number) => Array.from({ length: Math.round((b - a) / s) + 1 }, (_, i) => a + i * s)
    return {
      isobars: contours().size([p.nx, p.ny]).thresholds(range(pMin, pMax, ISOBAR_STEP))(p.values),
      heights: contours().size([z.nx, z.ny]).thresholds(range(zMin, zMax, Z_STEP))(z.values),
    }
  }, [grid, t])

  // Clip to the data domain (also hides d3-contour's closing edges on the border).
  const [cx0, cy0] = projection([lonMin, latMax])!
  const [cx1, cy1] = projection([lonMax, latMin])!
  const here = projection([lon, lat])!
  const s = steps[t]

  return (
    <div className="synoptic-map" ref={ref}>
      <svg width={width} height={height} role="img" aria-label={`Synoptic chart for ${timeFmt.format(new Date(`${grid.times[t]}Z`))} UTC`}>
        <defs>
          <clipPath id="syn-clip">
            <rect x={cx0} y={cy0} width={cx1 - cx0} height={cy1 - cy0} />
          </clipPath>
        </defs>
        <g clipPath="url(#syn-clip)">
          <rect x={cx0} y={cy0} width={cx1 - cx0} height={cy1 - cy0} className="syn-bg" />
          {fields.heights.map((c) => (
            <path key={c.value} d={c.coordinates.map((poly) => poly.map(ringPath).join('')).join('')} style={{ fill: zFill(c.value) }} fillRule="evenodd" />
          ))}
          {world && (
            <>
              <path d={path(world.coast) ?? ''} className="syn-coast" />
              <path d={path(world.borders) ?? ''} className="syn-border" />
            </>
          )}
          {fields.isobars.map((c) => (
            <path
              key={c.value}
              d={c.coordinates.map((poly) => poly.map(ringPath).join('')).join('')}
              className={`syn-isobar${c.value % 20 === 0 ? ' major' : ''}`}
            />
          ))}
          {fields.isobars.map((c) => {
            // Label each isobar once, at the midpoint of its longest ring.
            const rings = c.coordinates.flat()
            const longest = rings.sort((a, b) => b.length - a.length)[0]
            if (!longest || longest.length < 12) return null
            const [x, y] = longest[Math.floor(longest.length / 2)]
            const [sx, sy] = toScreen(x, y)
            if (sx < cx0 + 14 || sx > cx1 - 14 || sy < cy0 + 10 || sy > cy1 - 6) return null
            return (
              <text key={`l${c.value}`} x={sx} y={sy} className="syn-isobar-label" textAnchor="middle" dy="0.35em">
                {c.value}
              </text>
            )
          })}
          {s.centres.map((ce) => {
            const [x, y] = projection([ce.lon, ce.lat])!
            return (
              <g key={`${ce.kind}${ce.row}-${ce.col}`} className={`syn-centre ${ce.kind === 'H' ? 'high' : 'low'}`}>
                <text x={x} y={y} textAnchor="middle" dy="0.35em" className="syn-centre-letter">{ce.kind}</text>
                <text x={x} y={y + 16} textAnchor="middle" className="syn-centre-value">{Math.round(ce.value)}</text>
              </g>
            )
          })}
          <circle cx={here[0]} cy={here[1]} r={5} className="syn-here" />
        </g>
      </svg>
      <div className="syn-controls">
        <label>
          <span>
            <strong>{timeFmt.format(new Date(`${grid.times[t]}Z`))} UTC</strong>
            {t === nowIndex ? ' · now' : ` · +${(t - nowIndex) * 6} h`}
          </span>
          <input
            type="range"
            min={0}
            max={grid.times.length - 1}
            value={t}
            onChange={(e) => setT(Number(e.target.value))}
            aria-label="Forecast time"
          />
        </label>
        <ul className="legend">
          <li><i className="key key-isobar" />Sea-level pressure, every {ISOBAR_STEP} hPa</li>
          <li><i className="key key-z-low" />Low 500 hPa heights (trough, colder air aloft)</li>
          <li><i className="key key-z-high" />High 500 hPa heights (ridge, warmer air aloft)</li>
          <li><i className="key key-here" />Your location</li>
        </ul>
      </div>
    </div>
  )
}
