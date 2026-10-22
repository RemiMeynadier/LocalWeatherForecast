import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { type Place, searchPlaces } from '../api/openMeteo'
import { placeSubtitle } from '../lib/format'

interface Props {
  onSelect: (p: Place) => void
}

export function LocationSearch({ onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<Place[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [geoError, setGeoError] = useState<string | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const results = query.trim().length >= 2 ? found : []

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) return
    let cancelled = false
    const t = setTimeout(() => {
      searchPlaces(q)
        .then((r) => {
          if (cancelled) return
          setFound(r)
          setActive(0)
          setOpen(true)
        })
        .catch(() => !cancelled && setFound([]))
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query])

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const choose = (p: Place) => {
    onSelect(p)
    setQuery('')
    setFound([])
    setOpen(false)
  }

  const locate = () => {
    setGeoError(null)
    if (!navigator.geolocation) {
      setGeoError('Géolocalisation indisponible sur ce navigateur.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => choose({ name: 'Ma position', lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => setGeoError('Position refusée ou introuvable.'),
      { timeout: 10_000 },
    )
  }

  const onKey = (e: KeyboardEvent) => {
    if (!open || !results.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => (a + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (a - 1 + results.length) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(results[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="search" ref={boxRef}>
      <div className="search-row">
        <input
          type="search"
          placeholder="Rechercher une ville…"
          aria-label="Rechercher une ville"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={onKey}
          role="combobox"
          aria-expanded={open}
          aria-controls="search-results"
          aria-autocomplete="list"
        />
        <button type="button" className="ghost" onClick={locate} title="Utiliser ma position">
          📍 <span className="hide-sm">Ma position</span>
        </button>
      </div>
      {geoError && <p className="hint error">{geoError}</p>}
      {open && results.length > 0 && (
        <ul className="search-results" id="search-results" role="listbox">
          {results.map((p, i) => (
            <li
              key={`${p.lat},${p.lon}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : ''}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                choose(p)
              }}
            >
              <strong>{p.name}</strong>
              <span>{placeSubtitle(p)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
