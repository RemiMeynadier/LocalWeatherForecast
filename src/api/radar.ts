import type { RadarField } from '../lib/nowcast'
import { decodeDbz, rainRate } from '../lib/radarPalette'

// RainViewer composite radar (free API): the last 2 hours every 10 minutes,
// as web-mercator tiles up to zoom 7 (≈1.2 km/pixel at the equator).
const MAPS = 'https://api.rainviewer.com/public/weather-maps.json'
const TILES = 'https://tilecache.rainviewer.com'

export const RADAR_ZOOM = 7
export const WINDOW = 384 // pixels around the place: ±165 km at 45°N
const FRAMES = 7 // the last hour

export interface RadarFrame extends RadarField {
  image: HTMLCanvasElement // the radar picture, for the map
}

export interface RadarData {
  frames: RadarFrame[] // oldest first
  // Top-left corner of the window in world pixels at RADAR_ZOOM, and the
  // place's position inside it.
  x0: number
  y0: number
  px: number
  py: number
  kmPerPx: number
  covered: boolean
}

export function worldPixel(lat: number, lon: number, zoom = RADAR_ZOOM): [number, number] {
  const n = 256 * 2 ** zoom
  const s = Math.sin((lat * Math.PI) / 180)
  return [((lon + 180) / 360) * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n]
}

// The tiles a window covers, with where each one goes.
export function windowTiles(x0: number, y0: number, size: number, zoom = RADAR_ZOOM) {
  const n = 2 ** zoom
  const tiles: { x: number; y: number; dx: number; dy: number }[] = []
  for (let ty = Math.floor(y0 / 256); ty <= Math.floor((y0 + size - 1) / 256); ty++) {
    if (ty < 0 || ty >= n) continue
    for (let tx = Math.floor(x0 / 256); tx <= Math.floor((x0 + size - 1) / 256); tx++) {
      tiles.push({ x: ((tx % n) + n) % n, y: ty, dx: tx * 256 - x0, dy: ty * 256 - y0 })
    }
  }
  return tiles
}

async function loadImage(url: string): Promise<ImageBitmap | null> {
  const res = await fetch(url)
  if (!res.ok) return null
  return createImageBitmap(await res.blob())
}

async function drawWindow(urls: (x: number, y: number) => string, x0: number, y0: number): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = WINDOW
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const tiles = windowTiles(x0, y0, WINDOW)
  const images = await Promise.all(tiles.map((t) => loadImage(urls(t.x, t.y))))
  images.forEach((img, i) => img && ctx.drawImage(img, tiles[i].dx, tiles[i].dy))
  return canvas
}

// Rain rates from the picture. Echoes too faint to count (drizzle, clutter)
// are also erased from the picture, so the map shows what the numbers use.
function decode(canvas: HTMLCanvasElement): Float32Array {
  const ctx = canvas.getContext('2d')!
  const image = ctx.getImageData(0, 0, WINDOW, WINDOW)
  const { data } = image
  const rate = new Float32Array(WINDOW * WINDOW)
  for (let i = 0; i < rate.length; i++) {
    const a = data[i * 4 + 3]
    if (!a) continue
    rate[i] = rainRate(decodeDbz(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], a))
    if (!rate[i]) data[i * 4 + 3] = 0
  }
  ctx.putImageData(image, 0, 0)
  return rate
}

export async function fetchRadar(lat: number, lon: number): Promise<RadarData> {
  const res = await fetch(MAPS)
  if (!res.ok) throw new Error(`RainViewer HTTP ${res.status}`)
  const maps = await res.json()
  const past: { time: number; path: string }[] = maps.radar?.past ?? []
  if (!past.length) throw new Error('no radar frames')

  const [wx, wy] = worldPixel(lat, lon)
  const x0 = Math.round(wx) - WINDOW / 2
  const y0 = Math.round(wy) - WINDOW / 2
  const host = maps.host ?? TILES
  // Colour scheme 2 (Universal Blue), no smoothing, no snow colours: the
  // pixels map straight back to dBZ.
  const frames = await Promise.all(
    past.slice(-FRAMES).map(async (f) => {
      const image = await drawWindow((x, y) => `${host}${f.path}/256/${RADAR_ZOOM}/${x}/${y}/2/0_0.png`, x0, y0)
      return { time: f.time, size: WINDOW, rate: decode(image), image }
    }),
  )

  // Coverage tiles are transparent where radars see, black elsewhere.
  const cov = await drawWindow((x, y) => `${TILES}/v2/coverage/0/256/${RADAR_ZOOM}/${x}/${y}/0/0_0.png`, x0, y0)
  const covered = cov.getContext('2d')!.getImageData(WINDOW / 2, WINDOW / 2, 1, 1).data[3] < 128

  const metresPerPx = (40075016.7 * Math.cos((lat * Math.PI) / 180)) / (256 * 2 ** RADAR_ZOOM)
  return { frames, x0, y0, px: wx - x0, py: wy - y0, kmPerPx: metresPerPx / 1000, covered }
}
