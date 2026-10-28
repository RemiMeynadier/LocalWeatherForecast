import { useEffect, useState } from 'react'
import { GRID_STEP, type Place } from './api/openMeteo'
import { BacktestPanel } from './components/BacktestPanel'
import { AlertsView, SynopticBriefingView } from './components/Briefing'
import { DailyCards } from './components/DailyCards'
import { PrecipitationChart, TemperatureChart } from './components/ForecastCharts'
import { RainNextHour } from './components/RainNextHour'
import { LocationSearch } from './components/LocationSearch'
import { ModelsPanel } from './components/ModelsPanel'
import { WeeklyOutlook } from './components/WeeklyOutlook'
import { getLang, type Lang, setLang, t, tList } from './i18n'
import { confidence, dayLabel, mm, pct, placeSubtitle, temp, weather } from './lib/format'
import { useForecast } from './lib/useForecast'

const STORAGE_KEY = 'lwf.place'
const DEFAULT_PLACE: Place = { name: 'Paris', admin: 'Île-de-France', country: 'France', lat: 48.8534, lon: 2.3488 }

function initialPlace(): Place {
  const q = new URLSearchParams(location.search)
  const lat = Number(q.get('lat'))
  const lon = Number(q.get('lon'))
  if (q.has('lat') && q.has('lon') && Number.isFinite(lat) && Number.isFinite(lon)) {
    return { name: q.get('name') ?? '—', lat, lon }
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return JSON.parse(saved)
  } catch {
    // Ignore unavailable or corrupt storage.
  }
  return DEFAULT_PLACE
}

export default function App() {
  const [place, setPlace] = useState<Place>(initialPlace)
  const [lang, setLangState] = useState<Lang>(getLang)
  const [hover, setHover] = useState<number | null>(null)
  const f = useForecast(place, lang)
  const { days, weeks } = f

  const toggleLang = () => {
    const next = lang === 'en' ? 'fr' : 'en'
    setLang(next) // module-level, read by formatters during the next render
    setLangState(next)
  }

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])
  useEffect(() => {
    const q = new URLSearchParams({ lat: place.lat.toFixed(4), lon: place.lon.toFixed(4), name: place.name, lang })
    history.replaceState(null, '', `${location.pathname}?${q}`)
    document.title = `${place.name} · LocalWeatherForecast`
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(place))
    } catch {
      // Not critical.
    }
  }, [place, lang])

  const today = days[0]
  const w = weather(today?.code ?? null)
  const alertCount = f.alerts?.alerts.length ?? 0
  const severe = f.alerts?.alerts.some((a) => a.level === 'warning')

  return (
    <div className="page">
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden="true">◐</span>
          <span>LocalWeatherForecast</span>
        </div>
        <LocationSearch onSelect={setPlace} />
        <button type="button" className="lang" onClick={toggleLang} title={t('switchLang')} aria-label={t('switchLang')}>
          <span className={lang === 'fr' ? 'on' : ''}>FR</span>
          <span className={lang === 'en' ? 'on' : ''}>EN</span>
        </button>
      </header>

      <main>
        <section className="hero">
          <div>
            <h1>{place.name}</h1>
            <p className="muted">
              {placeSubtitle(place) || `${place.lat.toFixed(2)}°, ${place.lon.toFixed(2)}°`}
              {place.elevation != null && ` · ${Math.round(place.elevation)} m`}
            </p>
          </div>
          {today && (
            <div className="hero-now">
              <span className="hero-icon" aria-hidden="true">{w.icon}</span>
              <div>
                <div className="hero-temps">
                  <span className="tmax">{temp(today.tmax)}</span>
                  <span className="tmin">{temp(today.tmin)}</span>
                </div>
                <div className="muted">
                  {w.label} · 💧 {mm(today.precip)}
                  {today.wind != null && ` · 💨 ${Math.round(today.wind)} km/h`}
                </div>
              </div>
            </div>
          )}
        </section>

        {f.error && <p className="notice error">{t('error', { msg: f.error })}</p>}
        {f.loading && <p className="notice">{t('loading')}</p>}

        <section>
          <h2>{t('rain1h')}</h2>
          <RainNextHour place={place} />
        </section>

        <section>
          <h2>{t('synoptic')}</h2>
          <SynopticBriefingView
            briefing={f.briefing}
            grid={f.grid}
            gridError={f.gridError}
            lat={place.lat}
            lon={place.lon}
            step={GRID_STEP}
          />
        </section>

        {days.length > 0 && (
          <>
            <section className={alertCount ? (severe ? 'has-warning' : 'has-watch') : ''}>
              <h2>
                {t('extremes')}
                {alertCount > 0 && ` (${alertCount})`}
              </h2>
              <AlertsView
                alerts={f.alerts}
                warnings={f.warnings}
                warningsLoading={f.warningsLoading}
                warningsError={f.warningsError}
              />
            </section>

            <section>
              <h2>{t('next10')}</h2>
              <DailyCards days={days.slice(0, 10)} />
            </section>

            <section>
              <div className="section-head">
                <h2>{t('temps', { n: days.length })}</h2>
                <ul className="legend">
                  <li><i className="key key-max" />{t('lMax')}</li>
                  <li><i className="key key-min" />{t('lMin')}</li>
                  <li><i className="key key-band" />{t('lRange')}</li>
                  <li><i className="key key-normal" />{t('lNormals')}{f.climateLoading && ` ${t('lLoading')}`}</li>
                </ul>
              </div>
              <TemperatureChart days={days} hover={hover} onHover={setHover} />
            </section>

            <section>
              <div className="section-head">
                <h2>{t('precip')}</h2>
                <ul className="legend">
                  <li><i className="key key-rain" />{t('lRain')}</li>
                  <li><i className="key key-prob" />{t('lProb')}</li>
                </ul>
              </div>
              <PrecipitationChart days={days} hover={hover} onHover={setHover} />
            </section>

            <section>
              <h2>{t('weekly')}</h2>
              <p className="muted lede">{t('weeklyLede')}</p>
              <WeeklyOutlook weeks={weeks} hasClimate={f.hasClimate} />
            </section>

            <section>
              <h2>{t('backtest')}</h2>
              <BacktestPanel state={f.backtest} loading={f.backtestLoading} error={f.backtestError} days={days} />
            </section>

            <section>
              <h2>{t('models')}</h2>
              <ModelsPanel days={days} lat={place.lat} lon={place.lon} failed={f.failed} />
            </section>

            <section>
              <details className="data-table">
                <summary>{t('dataTable')}</summary>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">{t('tDay')}</th>
                        <th scope="col">{t('lMax')}</th>
                        <th scope="col">{t('lMin')}</th>
                        <th scope="col">{t('tMaxRange')}</th>
                        <th scope="col">{t('tNormals')}</th>
                        <th scope="col">{t('rain')}</th>
                        <th scope="col">{t('lProb')}</th>
                        <th scope="col">{t('tGusts')}</th>
                        <th scope="col">{t('confidence')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {days.map((d) => (
                        <tr key={d.date}>
                          <th scope="row">{dayLabel(d.date)}</th>
                          <td>{temp(d.tmax, 1)}</td>
                          <td>{temp(d.tmin, 1)}</td>
                          <td>{d.ensemble ? `${temp(d.ensemble.tmax.p10)} – ${temp(d.ensemble.tmax.p90)}` : '—'}</td>
                          <td>{d.normal ? `${temp(d.normal.tmax)} / ${temp(d.normal.tmin)}` : '—'}</td>
                          <td>{mm(d.precip)}</td>
                          <td>{pct(d.ensemble?.rainProb)}</td>
                          <td>{d.gust != null ? `${Math.round(d.gust)} km/h` : '—'}</td>
                          <td>{confidence(d.confidence).label}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </section>

            <section className="method">
              <details>
                <summary>{t('method')}</summary>
                <ul>
                  {tList('methodItems').map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </details>
            </section>
          </>
        )}
      </main>

      <footer className="foot muted small">
        {t('data')}: <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> (CC BY 4.0) ·
        METAR: <a href="https://mesonet.agron.iastate.edu/" target="_blank" rel="noreferrer">IEM</a> ·{' '}
        <a href="https://meteoalarm.org/" target="_blank" rel="noreferrer">MeteoAlarm</a> ·{' '}
        <a href="https://www.weather.gov/" target="_blank" rel="noreferrer">NWS</a> · ERA5 (Copernicus) · BigDataCloud
      </footer>
    </div>
  )
}
