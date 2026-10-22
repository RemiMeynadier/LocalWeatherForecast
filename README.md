# LocalWeatherForecast

Local weather forecasts **up to 5 weeks ahead**. The app blends the best physics-based and AI weather models for
your location, re-weights them according to how well they did over the past week, and checks potential extremes
against official warnings.

👉 **Live: https://remimeynadier.github.io/LocalWeatherForecast/** (English / français: toggle in the header, or `?lang=en` / `?lang=fr` in the URL)

## What it does

| Section | How |
|---|---|
| **Synoptic situation** | ECMWF IFS sea-level pressure, 500 hPa height and 850 hPa temperature on a 3° grid around you. Pressure centres, geostrophic flow, upper troughs/ridges and their 5-day evolution are analysed automatically and summarised in plain English, with a synoptic chart (isobars + 500 hPa shading, time slider). |
| **Extremes & warnings** | Heat, cold, unseasonal frost, heavy rain, gusts, snow and thunderstorms, using absolute thresholds and local 1991–2020 climate percentiles, with ensemble probabilities. Each alert is cross-checked against official warnings: [MeteoAlarm](https://meteoalarm.org) (38 European national services) or the US [NWS](https://www.weather.gov). |
| **D0 → D+15** | Weighted blend of deterministic models. **Physics-based:** ECMWF IFS, ICON, UKMO, GFS, GEM, JMA, plus local high-resolution models when you are in their domain (AROME, ICON-D2, UKV, HRRR, HARMONIE, MET Nordic…). **AI:** ECMWF AIFS and NOAA AIGFS. |
| **Backtest** | Each model's forecasts issued 1–7 days ahead over the last 7 days are compared with the hourly METAR reports of the nearest airport (≤ 60 km). Temperature weights scale with (median MAE / model MAE)²; rain weights scale with rain/no-rain detection skill (ETS over 3-hour blocks). Both are damped for the small sample and fade out beyond D+7. Plots show the weights before and after, the error by lead time, and the observed vs. forecast series. |
| **D+15 → D+35** | Ensembles: ECMWF ENS, ECMWF AIFS ENS (AI), NOAA GEFS, NOAA AIGEFS (AI), ICON-EPS. Median, spread and weekly tercile probabilities (colder/near/warmer, drier/near/wetter) against the ERA5 1991–2020 normals. |

Other details:

- Regional "seamless" products fall back to ECMWF beyond their own range, so each model is cut at its native
  horizon to avoid counting ECMWF twice.
- The last day of each run usually covers only a few hours, which skews its daily values, so it is dropped.
- Each day gets a confidence index based on lead time and ensemble spread.

## Data sources

All sources are free, need no API key, and are called directly from the browser, except MeteoAlarm.

| Data | Source |
|---|---|
| Forecasts, ensembles, past runs, reanalysis, geocoding | [Open-Meteo](https://open-meteo.com) (CC BY 4.0) |
| Observations (METAR) | [Iowa Environmental Mesonet](https://mesonet.agron.iastate.edu/) |
| Official warnings, Europe | [MeteoAlarm](https://meteoalarm.org). It blocks browser requests, so `.github/workflows/alerts.yml` fetches it every 30 minutes and publishes `meteoalarm.json` on the `alerts-data` branch. |
| Official warnings, USA | [api.weather.gov](https://www.weather.gov/documentation/services-web-api) |
| Reverse geocoding (country, admin areas) | [BigDataCloud](https://www.bigdatacloud.com/) client API |
| Map outlines | [world-atlas](https://github.com/topojson/world-atlas) (Natural Earth) |

## Development

```bash
npm install
npm run dev      # http://localhost:5173/LocalWeatherForecast/
npm test         # unit tests (Vitest)
npm run lint
npm run build
node scripts/fetch-meteoalarm.mjs out.json   # refresh warnings manually
```

Every push to `main` is tested and deployed to GitHub Pages (`.github/workflows/deploy.yml`).

## Structure

```
src/
  i18n.ts                 English / French strings, language detection and toggle
  api/openMeteo.ts        forecasts, ensembles, normals, synoptic grid, past runs
  api/observations.ts     reverse geocoding, nearest METAR station, observations
  api/warnings.ts         MeteoAlarm / NWS warnings, hazard mapping, area matching
  lib/models.ts           model catalogue (physics + AI), domains, prior weights
  lib/backtest.ts         scores (MAE, bias, ETS) and weight multipliers
  lib/forecast.ts         blend, ensemble quantiles, confidence, weekly outlooks
  lib/extremes.ts         extreme detection, episodes, official cross-check
  lib/synoptic.ts         pressure centres, flow, troughs/ridges, briefing text
  lib/climate.ts          normals and climate percentiles
  components/             UI: briefing & map, alerts, cards, charts, backtest plots, model table
scripts/fetch-meteoalarm.mjs
```

## Ideas

- Longer backtest window, with scores stored per station.
- Bias correction of the ensembles (elevation, grid size).
- Hourly forecast for the first 48 hours.
- Seasonal outlook (1–6 months).
- More official warning feeds (Canada, Australia, Japan).

## Limitations

- Seven days is a short backtest sample: weights are damped, but one unusual week can still tilt them.
- Most European METARs report whether rain is falling but not how much, so rain is scored as rain or no rain.
- The synoptic analysis uses a 3° grid, so small, intense lows can be underestimated.
- Official warnings are matched by administrative area name, which can miss sub-regional areas in some countries.
