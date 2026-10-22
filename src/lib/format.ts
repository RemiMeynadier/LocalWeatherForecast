import type { Place } from '../api/openMeteo'
import type { Confidence } from './forecast'

// WMO weather interpretation codes (as returned by Open-Meteo).
const WEATHER: Record<number, [string, string]> = {
  0: ['☀️', 'Ciel clair'],
  1: ['🌤️', 'Peu nuageux'],
  2: ['⛅', 'Partiellement nuageux'],
  3: ['☁️', 'Couvert'],
  45: ['🌫️', 'Brouillard'],
  48: ['🌫️', 'Brouillard givrant'],
  51: ['🌦️', 'Bruine légère'],
  53: ['🌦️', 'Bruine'],
  55: ['🌧️', 'Bruine forte'],
  56: ['🌧️', 'Bruine verglaçante'],
  57: ['🌧️', 'Bruine verglaçante forte'],
  61: ['🌦️', 'Pluie faible'],
  63: ['🌧️', 'Pluie'],
  65: ['🌧️', 'Pluie forte'],
  66: ['🌧️', 'Pluie verglaçante'],
  67: ['🌧️', 'Pluie verglaçante forte'],
  71: ['🌨️', 'Neige faible'],
  73: ['🌨️', 'Neige'],
  75: ['❄️', 'Neige forte'],
  77: ['🌨️', 'Grains de neige'],
  80: ['🌦️', 'Averses faibles'],
  81: ['🌧️', 'Averses'],
  82: ['⛈️', 'Averses violentes'],
  85: ['🌨️', 'Averses de neige'],
  86: ['❄️', 'Fortes averses de neige'],
  95: ['⛈️', 'Orage'],
  96: ['⛈️', 'Orage avec grêle'],
  99: ['⛈️', 'Orage violent avec grêle'],
}

export function weather(code: number | null): { icon: string; label: string } {
  const w = code == null ? undefined : WEATHER[code]
  return w ? { icon: w[0], label: w[1] } : { icon: '·', label: '—' }
}

export const CONFIDENCE: Record<Confidence, { label: string; dots: number; hint: string }> = {
  high: { label: 'Élevée', dots: 4, hint: 'Prévision fiable' },
  good: { label: 'Bonne', dots: 3, hint: 'Détails encore susceptibles d’évoluer' },
  medium: { label: 'Moyenne', dots: 2, hint: 'Tendance fiable, détails incertains' },
  low: { label: 'Faible', dots: 1, hint: 'À prendre comme une tendance' },
  trend: { label: 'Tendance', dots: 0, hint: 'Seules les probabilités ont un sens' },
}

export function temp(v: number | null | undefined, digits = 0): string {
  if (v == null) return '—'
  const r = Number(v.toFixed(digits)) || 0 // avoid "-0°"
  return `${r.toFixed(digits).replace('.', ',')}°`
}

export function signed(v: number | null | undefined, digits = 1): string {
  if (v == null) return '—'
  const r = Number(v.toFixed(digits)) || 0
  return `${r > 0 ? '+' : r < 0 ? '−' : '±'}${Math.abs(r).toFixed(digits).replace('.', ',')}°`
}

export const mm = (v: number | null | undefined) =>
  v == null ? '—' : v < 0.1 ? '0 mm' : v < 10 ? `${v.toFixed(1).replace('.', ',')} mm` : `${Math.round(v)} mm`

export const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)} %`)

const dayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const shortFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const weekdayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', timeZone: 'UTC' })

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`)

export const dayLabel = (iso: string) => dayFmt.format(utc(iso))
export const shortDate = (iso: string) => shortFmt.format(utc(iso))

export function relativeDay(iso: string, lead: number): string {
  if (lead === 0) return 'Aujourd’hui'
  if (lead === 1) return 'Demain'
  const w = weekdayFmt.format(utc(iso))
  return w.charAt(0).toUpperCase() + w.slice(1)
}

const compactFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })
export const compactDay = (iso: string, lead: number) => (lead === 0 ? 'Auj.' : compactFmt.format(utc(iso)))

export const placeSubtitle = (p: Place) => [p.admin, p.country].filter(Boolean).join(', ')
