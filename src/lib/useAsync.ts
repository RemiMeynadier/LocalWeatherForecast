import { useEffect, useState } from 'react'

// Runs `fn` whenever `key` changes (null = idle). Results are tagged with
// the key they belong to, so stale responses never show and "loading" is
// derived rather than stored.
export function useAsync<T>(key: string | null, fn: () => Promise<T>) {
  const [state, setState] = useState<{ key: string; value: T | null; error: string | null } | null>(null)

  useEffect(() => {
    if (key == null) return
    let cancelled = false
    fn().then(
      (value) => !cancelled && setState({ key, value, error: null }),
      (e) => !cancelled && setState({ key, value: null, error: e instanceof Error ? e.message : String(e) }),
    )
    return () => {
      cancelled = true
    }
    // `fn` is recreated every render; `key` captures everything it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const current = key != null && state?.key === key ? state : null
  return { value: current?.value ?? null, error: current?.error ?? null, loading: key != null && !current }
}
