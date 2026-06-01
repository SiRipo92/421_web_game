import { useEffect, useState } from 'react'

/**
 * Subscribe to a CSS media query. Returns `true` while the query matches.
 *
 * Server-rendering safe — returns `false` during the initial render if
 * `window` isn't defined, then re-evaluates on mount. The internal
 * `matchMedia` listener is wired with `addEventListener('change', ...)`
 * (the modern API) — older `addListener` shim left out, since the
 * project's browser-support target already covers `addEventListener`.
 *
 * Used by Game.jsx to swap to the mobile shell below 960 px.
 */
export function useMediaQuery(query) {
  const getMatch = () => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia(query).matches
  }
  const [matches, setMatches] = useState(getMatch)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia(query)
    const onChange = (e) => setMatches(e.matches)
    // Initial state already came from `useState(getMatch)`'s lazy init; the
    // race between render and mount is short enough to not be worth a
    // synchronous re-sync here (the linter forbids in-effect setState).
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}
