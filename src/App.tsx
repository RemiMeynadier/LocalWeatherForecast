import { useEffect, useState } from 'react'
import type { Place } from './api/openMeteo'
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
    return { name: q.get('name') ?? 'Lieu', lat, lon }
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
  const { days, weeks, loading, climateLoading, error, failed, hasClimate } = useForecast(place)

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
  const horizon = days.length

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

        {error && <p className="notice error">Erreur : {error}</p>}
        {loading && <p className="notice">Chargement des modèles…</p>}

        {days.length > 0 && (
          <>
            <section>
              <h2>Les 10 prochains jours</h2>
              <DailyCards days={days.slice(0, 10)} />
            </section>

            <section>
              <div className="section-head">
                <h2>Températures sur {horizon} jours</h2>
                <ul className="legend">
                  <li><i className="key key-max" />Max (meilleure estimation)</li>
                  <li><i className="key key-min" />Min</li>
                  <li><i className="key key-band" />Plage probable (80 % / 50 % des scénarios)</li>
                  <li><i className="key key-normal" />Normales 1991-2020{climateLoading && ' (chargement…)'}</li>
                </ul>
              </div>
              <TemperatureChart days={days} hover={hover} onHover={setHover} />
            </section>

            <section>
              <div className="section-head">
                <h2>Précipitations</h2>
                <ul className="legend">
                  <li><i className="key key-rain" />Cumul journalier attendu</li>
                  <li><i className="key key-prob" />Probabilité ≥ 1 mm (plus foncé = plus probable)</li>
                </ul>
              </div>
              <PrecipitationChart days={days} hover={hover} onHover={setHover} />
            </section>

            <section>
              <h2>Tendances semaine par semaine</h2>
              <p className="muted lede">
                Au-delà de 10 jours, on ne peut plus prévoir le temps d’un jour précis, mais les ensembles indiquent
                si une semaine sera plutôt plus chaude, plus froide, plus sèche ou plus humide que la normale. Sans
                signal particulier, chaque catégorie vaut 33 %.
              </p>
              <WeeklyOutlook weeks={weeks} hasClimate={hasClimate} />
            </section>

            <section>
              <h2>Ce que disent les modèles</h2>
              <ModelsPanel days={days} lat={place.lat} lon={place.lon} failed={failed} />
            </section>

            <section>
              <details className="data-table">
                <summary>Voir toutes les données en tableau</summary>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Jour</th>
                        <th scope="col">Max</th>
                        <th scope="col">Min</th>
                        <th scope="col">Plage max (80 %)</th>
                        <th scope="col">Normales</th>
                        <th scope="col">Pluie</th>
                        <th scope="col">Proba. pluie</th>
                        <th scope="col">Confiance</th>
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
                          <td>{CONFIDENCE[d.confidence].label}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </section>

            <section className="method">
              <h2>Méthode</h2>
              <ul>
                <li>
                  <strong>J0 à J+3 :</strong> les modèles haute résolution qui couvrent ton lieu (AROME, ICON-D2,
                  UKV, HRRR, HARMONIE…) reçoivent le plus de poids, car ils voient le relief, les côtes et les orages.
                </li>
                <li>
                  <strong>J+4 à J+15 :</strong> consensus pondéré des modèles globaux, avec ECMWF IFS légèrement
                  favorisé car c’est le plus fiable en moyenne à ces échéances.
                </li>
                <li>
                  <strong>Au-delà :</strong> uniquement les ensembles (des dizaines de scénarios). On affiche leur
                  médiane, leur dispersion et des probabilités par rapport aux normales 1991-2020 (réanalyse ERA5).
                </li>
                <li>
                  La confiance dépend de l’échéance et baisse d’un niveau quand les scénarios divergent fortement
                  (plus de 4° d’écart sur le maximum).
                </li>
                <li>
                  Les poids sont pour l’instant des règles fixes. Prochaine étape : les ajuster selon la fiabilité
                  mesurée de chaque modèle à ton endroit.
                </li>
              </ul>
            </section>
          </>
        )}
      </main>

      <footer className="foot muted small">
        Données : <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo.com</a> (CC BY 4.0),
        modèles ECMWF, DWD, NOAA, Météo-France, Met Office, ECCC, JMA, KNMI, DMI, MET Norway. Normales : ERA5
        (Copernicus).
      </footer>
    </div>
  )
}
