// Surface observations (METAR) from the Iowa Environmental Mesonet archive,
// which mirrors airport reports worldwide and allows browser requests.

const IEM = 'https://mesonet.agron.iastate.edu'

export interface Region {
  countryCode: string // ISO 3166-1 alpha-2, upper case
  subdivisionCode: string // e.g. "US-NY", "FR-OCC"
  // Administrative names from country down to locality, used to match
  // official warning areas ("Haute-Garonne", "Kent", ...).
  adminNames: string[]
}

export interface Station {
  id: string // ICAO (or FAA id in the US)
  name: string
  lat: number
  lon: number
  elevation: number
  distanceKm: number
}

export interface Observations {
  station: Station
  // Hourly, UTC, keyed "YYYY-MM-DDTHH:00"
  temp: Map<string, number>
  rain: Map<string, boolean>
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180
  const a =
    Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(a))
}

export async function reverseGeocode(lat: number, lon: number): Promise<Region> {
  const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Reverse geocoding failed (${res.status})`)
  const d = await res.json()
  const admin: { name: string }[] = d.localityInfo?.administrative ?? []
  return {
    countryCode: (d.countryCode ?? '').toUpperCase(),
    subdivisionCode: d.principalSubdivisionCode ?? '',
    adminNames: [...admin.map((a) => a.name), d.principalSubdivision, d.city, d.locality].filter(Boolean),
  }
}

// IEM groups ASOS/METAR sites by network: per state in the US, per
// province in Canada, per country elsewhere.
function networkFor(region: Region): string | null {
  const cc = region.countryCode
  if (!cc) return null
  const sub = region.subdivisionCode.split('-')[1]
  if (cc === 'US') return sub ? `${sub}_ASOS` : null
  if (cc === 'CA') return sub ? `CA_${sub}_ASOS` : null
  return `${cc}__ASOS`
}

const MAX_DISTANCE_KM = 60

export async function findNearestStation(lat: number, lon: number, region: Region): Promise<Station | null> {
  const network = networkFor(region)
  if (!network) return null
  const res = await fetch(`${IEM}/geojson/network/${network}.geojson`)
  if (!res.ok) return null
  const gj = await res.json()
  let best: Station | null = null
  for (const f of gj.features ?? []) {
    const p = f.properties ?? {}
    if (p.online === false || p.archive_end) continue
    const [slon, slat] = f.geometry?.coordinates ?? []
    if (slat == null || slon == null) continue
    const distanceKm = haversineKm(lat, lon, slat, slon)
    if (distanceKm > MAX_DISTANCE_KM || (best && distanceKm >= best.distanceKm)) continue
    best = { id: p.sid ?? f.id, name: p.sname ?? f.id, lat: slat, lon: slon, elevation: p.elevation ?? 0, distanceKm }
  }
  return best
}

// Present weather codes that mean precipitation is falling at the station.
// Vicinity (VC) and recent (RE) groups are ignored.
const PRECIP = /(DZ|RA|SN|SG|PL|GR|GS|UP)/
export function isPrecipitating(wxcodes: string | null | undefined): boolean {
  if (!wxcodes) return false
  return wxcodes
    .split(/\s+/)
    .some((g) => !g.startsWith('VC') && !g.startsWith('RE') && PRECIP.test(g))
}

const pad = (n: number) => String(n).padStart(2, '0')

export async function fetchObservations(station: Station, days = 8): Promise<Observations> {
  // The end bound is exclusive, so ask up to tomorrow.
  const end = new Date(Date.now() + 86_400_000)
  const start = new Date(end.getTime() - (days + 1) * 86_400_000)
  const q = new URLSearchParams({
    station: station.id,
    tz: 'Etc/UTC',
    format: 'onlycomma',
    latlon: 'no',
    missing: 'null',
    trace: 'null',
    report_type: '3',
    year1: String(start.getUTCFullYear()),
    month1: String(start.getUTCMonth() + 1),
    day1: String(start.getUTCDate()),
    year2: String(end.getUTCFullYear()),
    month2: String(end.getUTCMonth() + 1),
    day2: String(end.getUTCDate()),
  })
  q.append('data', 'tmpc')
  q.append('data', 'wxcodes')
  const res = await fetch(`${IEM}/cgi-bin/request/asos.py?${q}`)
  if (!res.ok) throw new Error(`Observations unavailable (${res.status})`)
  return parseMetarCsv(await res.text(), station)
}

// Reports are snapped to the nearest hour; several in one hour are averaged.
export function parseMetarCsv(csv: string, station: Station): Observations {
  const lines = csv.trim().split('\n')
  const header = lines.shift()?.split(',') ?? []
  const iValid = header.indexOf('valid')
  const iT = header.indexOf('tmpc')
  const iWx = header.indexOf('wxcodes')
  const sums = new Map<string, { t: number; n: number; rain: boolean }>()
  for (const line of lines) {
    const cols = line.split(',')
    const valid = cols[iValid]
    if (!valid) continue
    const ms = Date.parse(`${valid.replace(' ', 'T')}:00Z`)
    if (Number.isNaN(ms)) continue
    const hour = new Date(Math.round(ms / 3_600_000) * 3_600_000)
    const key = `${hour.getUTCFullYear()}-${pad(hour.getUTCMonth() + 1)}-${pad(hour.getUTCDate())}T${pad(hour.getUTCHours())}:00`
    const t = Number(cols[iT])
    const entry = sums.get(key) ?? { t: 0, n: 0, rain: false }
    if (cols[iT] !== 'null' && Number.isFinite(t)) {
      entry.t += t
      entry.n++
    }
    const wx = cols[iWx]
    entry.rain ||= isPrecipitating(wx === 'null' ? null : wx)
    sums.set(key, entry)
  }
  const temp = new Map<string, number>()
  const rain = new Map<string, boolean>()
  for (const [k, v] of sums) {
    if (v.n) temp.set(k, v.t / v.n)
    rain.set(k, v.rain)
  }
  return { station, temp, rain }
}
