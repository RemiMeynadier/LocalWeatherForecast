import { getLang } from '../i18n'

// Windy Webcams API v3. Needs a (free) key, baked in at build time from the
// WINDY_API_KEY repository secret; without it the app links to Windy's map.
const API = 'https://api.windy.com/webcams/api/v3/webcams'
export const WINDY_KEY: string = import.meta.env.VITE_WINDY_API_KEY ?? ''
const RADIUS_KM = 50

export interface Webcam {
  id: string
  title: string
  km: number
  updated: number | null // unix ms
  image: string | null // expires after ~10 minutes
  daylight: string | null
  player: string | null // embeddable time-lapse of the day
  live: string | null
  page: string
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const r = Math.PI / 180
  const a =
    Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(a))
}

export async function fetchWebcams(lat: number, lon: number): Promise<Webcam[]> {
  const q = new URLSearchParams({
    nearby: `${lat.toFixed(4)},${lon.toFixed(4)},${RADIUS_KM}`,
    limit: '10',
    include: 'images,location,player,urls',
    lang: getLang(),
  })
  const res = await fetch(`${API}?${q}`, { headers: { 'x-windy-api-key': WINDY_KEY } })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.message ?? `Windy HTTP ${res.status}`)
  return (body?.webcams ?? [])
    .filter((w: any) => w.status === 'active')
    .map(
      (w: any): Webcam => ({
        id: String(w.webcamId),
        title: w.title,
        km: distanceKm(lat, lon, w.location.latitude, w.location.longitude),
        updated: w.lastUpdatedOn ? Date.parse(w.lastUpdatedOn) : null,
        image: w.images?.current?.preview ?? null,
        daylight: w.images?.daylight?.preview ?? null,
        player: w.player?.day ?? null,
        live: w.player?.live ?? null,
        page: w.urls?.detail ?? `https://www.windy.com/webcams/${w.webcamId}`,
      }),
    )
    .sort((a: Webcam, b: Webcam) => a.km - b.km)
}

export const windyMapUrl = (lat: number, lon: number) =>
  `https://www.windy.com/-Webcams-webcams?webcams,${lat.toFixed(3)},${lon.toFixed(3)},11`
