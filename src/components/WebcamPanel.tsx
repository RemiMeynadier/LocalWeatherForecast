import { useState } from 'react'
import type { Place } from '../api/openMeteo'
import { fetchWebcams, WINDY_KEY, windyMapUrl } from '../api/webcams'
import { num, t } from '../i18n'
import { clock } from '../lib/format'
import { useAsync } from '../lib/useAsync'

// The nearest webcams, to check the sky against the nowcast.
export function WebcamPanel({ place, tick }: { place: Place; tick: number }) {
  const key = WINDY_KEY ? `${place.lat},${place.lon}|${tick}` : null
  const cams = useAsync(key, () => fetchWebcams(place.lat, place.lon))
  const [choice, setChoice] = useState<{ place: string; id: string; mode: 'image' | 'day' | 'live' } | null>(null)
  const placeKey = `${place.lat},${place.lon}`

  const list = cams.value ?? []
  const picked = choice?.place === placeKey ? choice : null
  const cam = list.find((c) => c.id === picked?.id) ?? list[0]
  const mode = cam && picked?.id === cam.id ? picked.mode : 'image'
  const set = (id: string, m: 'image' | 'day' | 'live') => setChoice({ place: placeKey, id, mode: m })

  const mapLink = (
    <a href={windyMapUrl(place.lat, place.lon)} target="_blank" rel="noreferrer">
      {t('camMap', { place: place.name })} ↗
    </a>
  )

  return (
    <figure className="webcam">
      <figcaption className="webcam-head">
        <strong>{t('camTitle')}</strong>
        {list.length > 1 && (
          <select value={cam?.id} onChange={(e) => set(e.target.value, 'image')} aria-label={t('camChoose')}>
            {list.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} ({num(c.km, 0)} km)
              </option>
            ))}
          </select>
        )}
      </figcaption>

      {!WINDY_KEY && <p className="muted small">{mapLink}</p>}
      {cams.loading && !cams.value && <p className="muted small">{t('camLoading')}</p>}
      {cams.error && <p className="muted small">{t('camFailed', { msg: cams.error })} {mapLink}</p>}
      {cams.value && !cam && <p className="muted small">{t('camNone')} {mapLink}</p>}

      {cam && (
        <>
          <div className="webcam-view">
            {mode === 'image' ? (
              cam.image ? (
                <a href={cam.page} target="_blank" rel="noreferrer">
                  <img src={cam.image} alt={cam.title} loading="lazy" />
                </a>
              ) : (
                <p className="muted small">{t('camNoImage')}</p>
              )
            ) : (
              <iframe
                src={mode === 'live' ? cam.live! : cam.player!}
                title={cam.title}
                allow="autoplay; fullscreen"
                allowFullScreen
              />
            )}
          </div>
          <div className="webcam-meta small">
            <span className="muted">
              {cam.updated && t('camUpdated', { time: clock(cam.updated / 1000) })} · {t('camAway', { km: num(cam.km, cam.km < 10 ? 1 : 0) })}
            </span>
            <span className="segmented" role="group">
              <button type="button" aria-pressed={mode === 'image'} onClick={() => set(cam.id, 'image')}>{t('camImage')}</button>
              {cam.live && <button type="button" aria-pressed={mode === 'live'} onClick={() => set(cam.id, 'live')}>{t('camLive')}</button>}
              {cam.player && <button type="button" aria-pressed={mode === 'day'} onClick={() => set(cam.id, 'day')}>{t('camDay')}</button>}
            </span>
          </div>
          <p className="muted small">
            {t('camCredit')} <a href={cam.page} target="_blank" rel="noreferrer">Windy.com</a>
          </p>
        </>
      )}
    </figure>
  )
}
