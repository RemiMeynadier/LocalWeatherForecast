import type { Place } from '../api/openMeteo'
import { getLang, locale, num, percent, t } from '../i18n'
import type { Confidence } from './forecast'

// WMO weather interpretation codes (as returned by Open-Meteo).
const WEATHER: Record<number, [string, string]> = {
  0: ['☀️', 'Clear sky'],
  1: ['🌤️', 'Mainly clear'],
  2: ['⛅', 'Partly cloudy'],
  3: ['☁️', 'Overcast'],
  45: ['🌫️', 'Fog'],
  48: ['🌫️', 'Freezing fog'],
  51: ['🌦️', 'Light drizzle'],
  53: ['🌦️', 'Drizzle'],
  55: ['🌧️', 'Heavy drizzle'],
  56: ['🌧️', 'Freezing drizzle'],
  57: ['🌧️', 'Heavy freezing drizzle'],
  61: ['🌦️', 'Light rain'],
  63: ['🌧️', 'Rain'],
  65: ['🌧️', 'Heavy rain'],
  66: ['🌧️', 'Freezing rain'],
  67: ['🌧️', 'Heavy freezing rain'],
  71: ['🌨️', 'Light snow'],
  73: ['🌨️', 'Snow'],
  75: ['❄️', 'Heavy snow'],
  77: ['🌨️', 'Snow grains'],
  80: ['🌦️', 'Light showers'],
  81: ['🌧️', 'Showers'],
  82: ['⛈️', 'Violent showers'],
  85: ['🌨️', 'Snow showers'],
  86: ['❄️', 'Heavy snow showers'],
  95: ['⛈️', 'Thunderstorm'],
  96: ['⛈️', 'Thunderstorm with hail'],
  99: ['⛈️', 'Severe thunderstorm with hail'],
}

const WEATHER_FR: Record<number, string> = {
  0: 'Ciel clair', 1: 'Peu nuageux', 2: 'Partiellement nuageux', 3: 'Couvert', 45: 'Brouillard',
  48: 'Brouillard givrant', 51: 'Bruine légère', 53: 'Bruine', 55: 'Bruine forte', 56: 'Bruine verglaçante',
  57: 'Bruine verglaçante forte', 61: 'Pluie faible', 63: 'Pluie', 65: 'Pluie forte', 66: 'Pluie verglaçante',
  67: 'Pluie verglaçante forte', 71: 'Neige faible', 73: 'Neige', 75: 'Neige forte', 77: 'Grains de neige',
  80: 'Averses faibles', 81: 'Averses', 82: 'Averses violentes', 85: 'Averses de neige',
  86: 'Fortes averses de neige', 95: 'Orage', 96: 'Orage avec grêle', 99: 'Orage violent avec grêle',
}

export function weather(code: number | null): { icon: string; label: string } {
  const w = code == null ? undefined : WEATHER[code]
  if (!w) return { icon: '·', label: '—' }
  return { icon: w[0], label: getLang() === 'fr' ? (WEATHER_FR[code!] ?? w[1]) : w[1] }
}

const CONF_KEYS = { high: 'cHigh', good: 'cGood', medium: 'cMedium', low: 'cLow', trend: 'cTrend' } as const
const CONF_DOTS = { high: 4, good: 3, medium: 2, low: 1, trend: 0 }

export const confidence = (c: Confidence) => ({ label: t(CONF_KEYS[c]), dots: CONF_DOTS[c] })

export function temp(v: number | null | undefined, digits = 0): string {
  return v == null ? '—' : `${num(v, digits)}°`
}

export function signed(v: number | null | undefined, digits = 1): string {
  if (v == null) return '—'
  const r = Number(v.toFixed(digits)) || 0
  return `${r > 0 ? '+' : r < 0 ? '−' : '±'}${num(Math.abs(r), digits)}°`
}

export const mm = (v: number | null | undefined) =>
  v == null ? '—' : v < 0.1 ? '0 mm' : v < 10 ? `${num(v, 1)} mm` : `${Math.round(v)} mm`

export const pct = (v: number | null | undefined) => (v == null ? '—' : percent(v))

// Intl formatters are cached per locale.
const cache = new Map<string, Intl.DateTimeFormat>()
function fmt(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale()}|${JSON.stringify(opts)}`
  let f = cache.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat(locale(), opts)
    cache.set(key, f)
  }
  return f
}

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export const dayLabel = (iso: string) => fmt({ weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(utc(iso))
export const shortDate = (iso: string) => fmt({ day: 'numeric', month: 'short', timeZone: 'UTC' }).format(utc(iso))
export const weekday = (iso: string) => fmt({ weekday: 'long', timeZone: 'UTC' }).format(new Date(iso.length > 10 ? `${iso}Z` : `${iso}T00:00:00Z`))

export function relativeDay(iso: string, lead: number): string {
  if (lead === 0) return t('today')
  if (lead === 1) return t('tomorrow')
  return cap(weekday(iso))
}

export const compactDay = (iso: string, lead: number) =>
  lead === 0 ? t('todayShort') : fmt({ weekday: 'short', day: 'numeric', timeZone: 'UTC' }).format(utc(iso))

export const placeSubtitle = (p: Place) => [p.admin, p.country].filter(Boolean).join(', ')

export const dateTime = (iso: string | null) =>
  iso ? fmt({ weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '—'

export const utcTime = (iso: string) =>
  fmt({ weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(`${iso}Z`))

// Clock time ("14:35") of a unix time, in the place's time zone when known.
export const clock = (unix: number, timeZone?: string) =>
  fmt({ hour: '2-digit', minute: '2-digit', timeZone }).format(new Date(unix * 1000))
