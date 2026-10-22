import type { Place } from '../api/openMeteo'
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

export function weather(code: number | null): { icon: string; label: string } {
  const w = code == null ? undefined : WEATHER[code]
  return w ? { icon: w[0], label: w[1] } : { icon: '·', label: '—' }
}

export const CONFIDENCE: Record<Confidence, { label: string; dots: number; hint: string }> = {
  high: { label: 'High', dots: 4, hint: 'Reliable forecast' },
  good: { label: 'Good', dots: 3, hint: 'Details may still change' },
  medium: { label: 'Medium', dots: 2, hint: 'Trend reliable, details uncertain' },
  low: { label: 'Low', dots: 1, hint: 'Treat as a trend' },
  trend: { label: 'Trend', dots: 0, hint: 'Only probabilities are meaningful' },
}

export function temp(v: number | null | undefined, digits = 0): string {
  if (v == null) return '—'
  const r = Number(v.toFixed(digits)) || 0 // avoid "-0°"
  return `${r.toFixed(digits)}°`
}

export function signed(v: number | null | undefined, digits = 1): string {
  if (v == null) return '—'
  const r = Number(v.toFixed(digits)) || 0
  return `${r > 0 ? '+' : r < 0 ? '−' : '±'}${Math.abs(r).toFixed(digits)}°`
}

export const mm = (v: number | null | undefined) =>
  v == null ? '—' : v < 0.1 ? '0 mm' : v < 10 ? `${v.toFixed(1)} mm` : `${Math.round(v)} mm`

export const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`)

const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const shortFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const weekdayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' })

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`)

export const dayLabel = (iso: string) => dayFmt.format(utc(iso))
export const shortDate = (iso: string) => shortFmt.format(utc(iso))

export function relativeDay(iso: string, lead: number): string {
  if (lead === 0) return 'Today'
  if (lead === 1) return 'Tomorrow'
  return weekdayFmt.format(utc(iso))
}

const compactFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })
export const compactDay = (iso: string, lead: number) => (lead === 0 ? 'Today' : compactFmt.format(utc(iso)))

export const placeSubtitle = (p: Place) => [p.admin, p.country].filter(Boolean).join(', ')

const timeFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
export const dateTime = (iso: string | null) => (iso ? timeFmt.format(new Date(iso)) : '—')
