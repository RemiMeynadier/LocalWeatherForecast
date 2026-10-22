// Downloads the MeteoAlarm (EUMETNET) warning feeds of every member country
// and writes a compact JSON of the active yellow/orange/red warnings.
// MeteoAlarm does not allow browser (CORS) requests, so a scheduled GitHub
// Action runs this and publishes the result for the web app.
//
// Usage: node scripts/fetch-meteoalarm.mjs <output.json>

import { writeFileSync } from 'node:fs'

const COUNTRIES = {
  AT: 'austria', BE: 'belgium', BA: 'bosnia-herzegovina', BG: 'bulgaria', HR: 'croatia', CY: 'cyprus',
  CZ: 'czechia', DK: 'denmark', EE: 'estonia', FI: 'finland', FR: 'france', DE: 'germany', GR: 'greece',
  HU: 'hungary', IS: 'iceland', IE: 'ireland', IL: 'israel', IT: 'italy', LV: 'latvia', LT: 'lithuania',
  LU: 'luxembourg', MT: 'malta', MD: 'moldova', ME: 'montenegro', NL: 'netherlands', MK: 'republic-of-north-macedonia',
  NO: 'norway', PL: 'poland', PT: 'portugal', RO: 'romania', RS: 'serbia', SK: 'slovakia', SI: 'slovenia',
  ES: 'spain', SE: 'sweden', CH: 'switzerland', UA: 'ukraine', GB: 'united-kingdom',
}

const LEVELS = { 2: 'yellow', 3: 'orange', 4: 'red' }

function param(info, name) {
  return info.parameter?.find((p) => p.valueName === name)?.value ?? ''
}

function compact(alert, now) {
  if (alert.msgType === 'Cancel') return null
  const info = alert.info?.find((i) => i.language?.startsWith('en')) ?? alert.info?.[0]
  if (!info) return null
  const level = Number.parseInt(param(info, 'awareness_level'), 10)
  if (!LEVELS[level]) return null
  if (info.expires && Date.parse(info.expires) < now) return null
  return {
    level: LEVELS[level],
    type: Number.parseInt(param(info, 'awareness_type'), 10) || null,
    event: info.event,
    headline: info.headline,
    description: (info.description ?? '').slice(0, 600),
    sender: info.senderName,
    web: info.web,
    onset: info.onset ?? info.effective,
    expires: info.expires,
    areas: (info.area ?? []).map((a) => a.areaDesc),
  }
}

const now = Date.now()
const out = { generated: new Date(now).toISOString(), countries: {} }
for (const [code, slug] of Object.entries(COUNTRIES)) {
  try {
    const res = await fetch(`https://feeds.meteoalarm.org/api/v1/warnings/feeds-${slug}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = await res.json()
    const seen = new Set()
    out.countries[code] = (body.warnings ?? [])
      .map((w) => compact(w.alert, now))
      .filter(Boolean)
      .filter((w) => {
        const key = `${w.event}|${w.onset}|${w.expires}|${w.areas.join(',')}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    console.log(`${code}: ${out.countries[code].length} active warnings`)
  } catch (e) {
    console.warn(`${code}: failed (${e.message})`)
  }
}
writeFileSync(process.argv[2] ?? 'meteoalarm.json', JSON.stringify(out))
