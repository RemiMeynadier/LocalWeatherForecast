import { useMemo } from 'react'
import {
  type DeterministicSeries,
  type EnsembleSeries,
  type Place,
  fetchClimate,
  fetchDeterministic,
  fetchEnsemble,
  fetchPastRuns,
  fetchSynopticGrid,
  GRID_STEP,
} from '../api/openMeteo'
import { type Region, type Station, fetchObservations, findNearestStation, reverseGeocode } from '../api/observations'
import { fetchOfficialWarnings } from '../api/warnings'
import { type BacktestResult, computeBacktest } from './backtest'
import { Climatology } from './climate'
import { crossCheck, detectExtremes } from './extremes'
import { buildDailyForecast, buildWeeklyOutlook } from './forecast'
import { ENSEMBLE_MODELS, selectDeterministicModels } from './models'
import { synopticBriefing } from './synoptic'
import { useAsync } from './useAsync'

interface Raw {
  det: DeterministicSeries[]
  ens: EnsembleSeries[]
  failed: string[]
}

async function loadForecasts(place: Place): Promise<Raw> {
  const models = selectDeterministicModels(place.lat, place.lon)
  const [det, ...ens] = await Promise.allSettled([
    fetchDeterministic(place, models),
    ...ENSEMBLE_MODELS.map((m) => fetchEnsemble(place, m)),
  ])
  const failed = ENSEMBLE_MODELS.filter((_, i) => ens[i].status === 'rejected').map((m) => m.label)
  const okEns = ens.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
  if (det.status === 'rejected' && !okEns.length) throw det.reason
  return {
    det: det.status === 'fulfilled' ? det.value : [],
    ens: okEns,
    failed: det.status === 'rejected' ? ['Deterministic models', ...failed] : failed,
  }
}

export type BacktestState =
  | { status: 'ok'; station: Station; result: BacktestResult }
  | { status: 'no-station' }

async function loadBacktest(place: Place, region: Region): Promise<BacktestState> {
  const station = await findNearestStation(place.lat, place.lon, region)
  if (!station) return { status: 'no-station' }
  const models = selectDeterministicModels(place.lat, place.lon).map((m) => m.id)
  const [obs, runs] = await Promise.all([
    fetchObservations(station),
    fetchPastRuns(station.lat, station.lon, station.elevation, models),
  ])
  return { status: 'ok', station, result: computeBacktest(runs, obs) }
}

export function useForecast(place: Place) {
  const key = `${place.lat},${place.lon}`

  const raw = useAsync(key, () => loadForecasts(place))
  const climate = useAsync(key, () => fetchClimate(place).then((c) => new Climatology(c)))
  const grid = useAsync(key, () => fetchSynopticGrid(place))
  const region = useAsync(key, () => reverseGeocode(place.lat, place.lon))
  const regionKey = region.value ? key : null
  const backtest = useAsync(regionKey, () => loadBacktest(place, region.value!))
  const warnings = useAsync(regionKey, () => fetchOfficialWarnings(place.lat, place.lon, region.value!))

  const bt = backtest.value?.status === 'ok' ? backtest.value.result : null
  const skill = useMemo(() => (bt ? { temp: bt.tempSkill, precip: bt.precipSkill } : null), [bt])

  const days = useMemo(
    () => (raw.value ? buildDailyForecast(raw.value.det, raw.value.ens, climate.value, place.lat, place.lon, skill) : []),
    [raw.value, climate.value, place, skill],
  )
  const weeks = useMemo(() => (raw.value ? buildWeeklyOutlook(raw.value.ens, climate.value) : []), [raw.value, climate.value])
  const briefing = useMemo(
    () => (grid.value ? synopticBriefing(grid.value, place.lat, place.lon, GRID_STEP) : null),
    [grid.value, place.lat, place.lon],
  )
  const alerts = useMemo(
    () => (days.length ? crossCheck(detectExtremes(days), warnings.value?.warnings ?? []) : null),
    [days, warnings.value],
  )

  return {
    days,
    weeks,
    loading: raw.loading,
    error: raw.error,
    failed: raw.value?.failed ?? [],
    climateLoading: climate.loading,
    hasClimate: !!climate.value,
    grid: grid.value,
    briefing,
    gridError: grid.error,
    backtest: backtest.value,
    backtestLoading: region.loading || backtest.loading,
    backtestError: backtest.error ?? region.error,
    warnings: warnings.value,
    warningsLoading: region.loading || warnings.loading,
    warningsError: warnings.error ?? region.error,
    alerts,
  }
}
