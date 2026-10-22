import { useEffect, useState } from 'react'
import { GRID_STEP, type Place } from './api/openMeteo'
import { BacktestPanel } from './components/BacktestPanel'
import { AlertsView, SynopticBriefingView } from './components/Briefing'
import { DailyCards } from './components/DailyCards'
import { PrecipitationChart, TemperatureChart } from './components/ForecastCharts'
import { LocationSearch } from './components/LocationSearch'
import { ModelsPanel } from './components/ModelsPanel'
import { WeeklyOutlook } from './components/WeeklyOutlook'
import { CONFIDENCE, dayLabel, mm, pct, placeSubtitle, temp, weather } from './lib/format'
import { useForecast } from './lib/useForecast'

const STORAGE_KEY = 'lwf.place'
const DEFAULT_PLACE: Place = { name: 'Paris', admin: 'Île-de-France', country: 'France', lat: 48.8534, lon: 2.3488 }

function initialPlace(): Place {
  const q = new URLSearchParams(location.search)
  const lat = Number(q.get('lat'))
  const lon = Number(q.get('lon'))
  if (q.has('lat') && q.has('lon') && Number.isFinite(lat) && Number.isFinite(lon)) {
    return { name: q.get('name') ?? 'Location', lat, lon }
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
  const [hover, setHover] = useState<number | null>(null)
  const f = useForecast(place)
  const { days, weeks } = f

  useEffect(() => {
    const q = new URLSearchParams({ lat: place.lat.toFixed(4), lon: place.lon.toFixed(4), name: place.name })
    history.replaceState(null, '', `${location.pathname}?${q}`)
    document.title = `${place.name} · LocalWeatherForecast`
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(place))
    } catch {
      // Not critical.
    }
  }, [place])

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

        {f.error && <p className="notice error">Error: {f.error}</p>}
        {f.loading && <p className="notice">Loading models…</p>}

        <section>
          <h2>Synoptic situation</h2>
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
              <h2>Extremes &amp; warnings{alertCount > 0 && ` (${alertCount})`}</h2>
              <AlertsView
                alerts={f.alerts}
                warnings={f.warnings}
                warningsLoading={f.warningsLoading}
                warningsError={f.warningsError}
              />
            </section>

            <section>
              <h2>Next 10 days</h2>
              <DailyCards days={days.slice(0, 10)} />
            </section>

            <section>
              <div className="section-head">
                <h2>Temperatures over {days.length} days</h2>
                <ul className="legend">
                  <li><i className="key key-max" />Max (best estimate)</li>
                  <li><i className="key key-min" />Min</li>
                  <li><i className="key key-band" />Likely range (80% / 50% of scenarios)</li>
                  <li><i className="key key-normal" />1991–2020 normals{f.climateLoading && ' (loading…)'}</li>
                </ul>
              </div>
              <TemperatureChart days={days} hover={hover} onHover={setHover} />
            </section>

            <section>
              <div className="section-head">
                <h2>Precipitation</h2>
                <ul className="legend">
                  <li><i className="key key-rain" />Expected daily total</li>
                  <li><i className="key key-prob" />Chance of ≥ 1 mm (darker = more likely)</li>
                </ul>
              </div>
              <PrecipitationChart days={days} hover={hover} onHover={setHover} />
            </section>

            <section>
              <h2>Week-by-week outlook</h2>
              <p className="muted lede">
                Beyond 10 days, the weather of a given day can no longer be forecast, but ensembles still show whether a
                week will be warmer, colder, drier or wetter than normal. With no signal, each category is at 33%.
              </p>
              <WeeklyOutlook weeks={weeks} hasClimate={f.hasClimate} />
            </section>

            <section>
              <h2>Backtest &amp; model weighting</h2>
              <BacktestPanel state={f.backtest} loading={f.backtestLoading} error={f.backtestError} days={days} />
            </section>

            <section>
              <h2>What the models say</h2>
              <ModelsPanel
                days={days}
                lat={place.lat}
                lon={place.lon}
                failed={f.failed}
                backtested={f.backtest?.status === 'ok'}
              />
            </section>

            <section>
              <details className="data-table">
                <summary>Show all data as a table</summary>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Day</th>
                        <th scope="col">Max</th>
                        <th scope="col">Min</th>
                        <th scope="col">Max range (80%)</th>
                        <th scope="col">Normals</th>
                        <th scope="col">Rain</th>
                        <th scope="col">Chance of rain</th>
                        <th scope="col">Gusts</th>
                        <th scope="col">Confidence</th>
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
                          <td>{CONFIDENCE[d.confidence].label}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </section>

            <section className="method">
              <h2>Method</h2>
              <ul>
                <li>
                  <strong>D0 to D+3:</strong> high-resolution models covering your location (AROME, ICON-D2, UKV, HRRR,
                  HARMONIE…) get the most weight, as they resolve relief, coastlines and thunderstorms.
                </li>
                <li>
                  <strong>D+4 to D+15:</strong> weighted blend of global models, physics-based (ECMWF IFS, ICON, UKMO,
                  GFS, GEM, JMA) and AI (ECMWF AIFS, NOAA AIGFS).
                </li>
                <li>
                  <strong>Backtest:</strong> each model’s forecasts from the last 7 days are scored against the nearest
                  airport’s hourly observations, and the weights are adjusted accordingly (see above).
                </li>
                <li>
                  <strong>Beyond D+15:</strong> ensembles only (ECMWF ENS, AIFS ENS, GEFS, AIGEFS, ICON-EPS). The page
                  shows their median, spread and probabilities against the 1991–2020 normals (ERA5 reanalysis).
                </li>
                <li>
                  <strong>Extremes:</strong> forecasts are compared with local climate percentiles and absolute
                  thresholds, then cross-checked with official warnings (MeteoAlarm in Europe, NWS in the US).
                </li>
                <li>
                  AI models tend to smooth extremes. Gusts and thunderstorm flags therefore come from physics-based
                  models only (AI models don’t provide them).
                </li>
              </ul>
            </section>
          </>
        )}
      </main>

      <footer className="foot muted small">
        Data: <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo.com</a> (CC BY 4.0) from
        ECMWF, DWD, NOAA, Météo-France, Met Office, ECCC, JMA, KNMI, DMI, MET Norway · Normals: ERA5 (Copernicus) ·
        Observations: METAR via{' '}
        <a href="https://mesonet.agron.iastate.edu/" target="_blank" rel="noreferrer">Iowa Environmental Mesonet</a> ·
        Warnings: <a href="https://meteoalarm.org/" target="_blank" rel="noreferrer">MeteoAlarm</a>,{' '}
        <a href="https://www.weather.gov/" target="_blank" rel="noreferrer">NWS</a> · Reverse geocoding: BigDataCloud.
      </footer>
    </div>
  )
}
