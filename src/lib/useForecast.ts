import { useEffect, useMemo, useState } from 'react'
import {
  type DeterministicSeries,
  type EnsembleSeries,
  type Place,
  fetchClimate,
  fetchDeterministic,
  fetchEnsemble,
} from '../api/openMeteo'
import { Climatology } from './climate'
import { buildDailyForecast, buildWeeklyOutlook } from './forecast'
import { ENSEMBLE_MODELS, selectDeterministicModels } from './models'

interface Raw {
  det: DeterministicSeries[]
  ens: EnsembleSeries[]
  failed: string[]
}

// Results are tagged with the place they belong to, so "loading" is simply
// "no result for the current place yet" and stale responses are ignored.
interface Tagged<T> {
  key: string
  value: T
}

const placeKey = (p: Place) => `${p.lat},${p.lon}`

export function useForecast(place: Place) {
  const key = placeKey(place)
  const [raw, setRaw] = useState<Tagged<{ data: Raw | null; error: string | null }> | null>(null)
  const [climate, setClimate] = useState<Tagged<Climatology | null> | null>(null)

  useEffect(() => {
    let cancelled = false
    const models = selectDeterministicModels(place.lat, place.lon)
    const ensembleCalls = ENSEMBLE_MODELS.map((m) => fetchEnsemble(place, m))
    Promise.allSettled([fetchDeterministic(place, models), ...ensembleCalls]).then(([det, ...ens]) => {
      if (cancelled) return
      const failed = ENSEMBLE_MODELS.filter((_, i) => ens[i].status === 'rejected').map((m) => m.label)
      const okEns = ens.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
      if (det.status === 'rejected' && !okEns.length) {
        const error = det.reason?.message ?? 'Impossible de récupérer les prévisions.'
        setRaw({ key: placeKey(place), value: { data: null, error } })
        return
      }
      const data = {
        det: det.status === 'fulfilled' ? det.value : [],
        ens: okEns,
        failed: det.status === 'rejected' ? ['Modèles déterministes', ...failed] : failed,
      }
      setRaw({ key: placeKey(place), value: { data, error: null } })
    })
    return () => {
      cancelled = true
    }
  }, [place])

  // Normals are slow the first time; the forecast shows without them meanwhile.
  useEffect(() => {
    let cancelled = false
    fetchClimate(place)
      .then((c) => new Climatology(c))
      .catch(() => null)
      .then((value) => !cancelled && setClimate({ key: placeKey(place), value }))
    return () => {
      cancelled = true
    }
  }, [place])

  const current = raw?.key === key ? raw.value : null
  const clim = climate?.key === key ? climate.value : null
  const data = current?.data ?? null

  const days = useMemo(
    () => (data ? buildDailyForecast(data.det, data.ens, clim, place.lat, place.lon) : []),
    [data, clim, place],
  )
  const weeks = useMemo(() => (data ? buildWeeklyOutlook(data.ens, clim) : []), [data, clim])

  return {
    days,
    weeks,
    loading: current == null,
    climateLoading: climate?.key !== key,
    error: current?.error ?? null,
    failed: data?.failed ?? [],
    hasClimate: !!clim,
  }
}
