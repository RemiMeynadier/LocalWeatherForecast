import type { Region } from './observations'

export type Hazard =
  | 'heat'
  | 'cold'
  | 'rain'
  | 'flood'
  | 'wind'
  | 'snow'
  | 'thunderstorm'
  | 'fog'
  | 'fire'
  | 'coastal'
  | 'avalanche'
  | 'other'

export type WarningLevel = 'yellow' | 'orange' | 'red'

export interface OfficialWarning {
  source: 'MeteoAlarm' | 'NWS'
  sender: string
  hazard: Hazard
  level: WarningLevel
  event: string
  eventFr?: string // French wording when the issuing service provides one
  headline: string
  description: string
  onset: string | null
  expires: string | null
  web: string | null
}

export interface WarningsResult {
  // Which official service covers this place, if any.
  coverage: 'MeteoAlarm' | 'NWS' | null
  warnings: OfficialWarning[]
  generated: string | null
}

// Published every 30 minutes by .github/workflows/alerts.yml.
const METEOALARM_URL =
  'https://raw.githubusercontent.com/RemiMeynadier/LocalWeatherForecast/alerts-data/meteoalarm.json'

// MeteoAlarm "awareness_type" codes.
const METEOALARM_TYPES: Record<number, Hazard> = {
  1: 'wind',
  2: 'snow',
  3: 'thunderstorm',
  4: 'fog',
  5: 'heat',
  6: 'cold',
  7: 'coastal',
  8: 'fire',
  9: 'avalanche',
  10: 'rain',
  12: 'flood',
  13: 'flood',
}

export const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

// A warning area matches when its name equals one of the place's
// administrative names (department, county, region, city...).
export function areaMatches(areas: string[], adminNames: string[]): boolean {
  const names = new Set(adminNames.map(normalize).filter((n) => n.length > 2))
  return areas.some((a) => names.has(normalize(a)))
}

interface MeteoAlarmEntry {
  level: WarningLevel
  type: number | null
  event: string
  eventFr?: string
  headline: string
  description: string
  sender: string
  web: string | null
  onset: string | null
  expires: string | null
  areas: string[]
}

async function fetchMeteoAlarm(region: Region): Promise<WarningsResult | null> {
  const res = await fetch(METEOALARM_URL, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`MeteoAlarm data unavailable (${res.status})`)
  const data: { generated: string; countries: Record<string, MeteoAlarmEntry[]> } = await res.json()
  const entries = data.countries[region.countryCode]
  if (!entries) return null
  return {
    coverage: 'MeteoAlarm',
    generated: data.generated,
    warnings: entries
      .filter((w) => areaMatches(w.areas, region.adminNames))
      .map((w) => ({
        source: 'MeteoAlarm',
        sender: w.sender,
        hazard: (w.type && METEOALARM_TYPES[w.type]) || 'other',
        level: w.level,
        event: w.event,
        eventFr: w.eventFr,
        headline: w.headline,
        description: w.description,
        onset: w.onset,
        expires: w.expires,
        web: w.web,
      })),
  }
}

export function nwsHazard(event: string): Hazard {
  const e = event.toLowerCase()
  if (/heat/.test(e)) return 'heat'
  if (/freeze|frost|cold|chill/.test(e)) return 'cold'
  if (/flood/.test(e)) return 'flood'
  if (/thunderstorm|tornado/.test(e)) return 'thunderstorm'
  if (/winter|snow|blizzard|ice|sleet/.test(e)) return 'snow'
  if (/wind|gale|hurricane|tropical storm/.test(e)) return 'wind'
  if (/fog/.test(e)) return 'fog'
  if (/fire|red flag/.test(e)) return 'fire'
  if (/surf|coastal|rip current|marine/.test(e)) return 'coastal'
  if (/avalanche/.test(e)) return 'avalanche'
  if (/rain/.test(e)) return 'rain'
  return 'other'
}

function nwsLevel(event: string): WarningLevel {
  if (/emergency/i.test(event)) return 'red'
  if (/warning/i.test(event)) return 'orange'
  return 'yellow' // watch, advisory, statement
}

async function fetchNws(lat: number, lon: number): Promise<WarningsResult> {
  const res = await fetch(`https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`, {
    headers: { Accept: 'application/geo+json' },
  })
  if (!res.ok) throw new Error(`NWS alerts unavailable (${res.status})`)
  const body = await res.json()
  return {
    coverage: 'NWS',
    generated: new Date().toISOString(),
    warnings: (body.features ?? []).map((f: any) => {
      const p = f.properties
      return {
        source: 'NWS',
        sender: p.senderName ?? 'National Weather Service',
        hazard: nwsHazard(p.event ?? ''),
        level: nwsLevel(p.event ?? ''),
        event: p.event,
        headline: p.headline ?? p.event,
        description: (p.description ?? '').slice(0, 600),
        onset: p.onset ?? p.effective ?? null,
        expires: p.ends ?? p.expires ?? null,
        web: 'https://www.weather.gov/',
      }
    }),
  }
}

export async function fetchOfficialWarnings(lat: number, lon: number, region: Region): Promise<WarningsResult> {
  if (region.countryCode === 'US') return fetchNws(lat, lon)
  const ma = await fetchMeteoAlarm(region)
  return ma ?? { coverage: null, warnings: [], generated: null }
}
