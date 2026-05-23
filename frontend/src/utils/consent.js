// Cookie / non-essential storage consent. Read by future analytics integrations
// to decide whether to load tracking scripts (roadmap item 10).
//
// Values stored in localStorage:
//   cookie_consent: "accepted" | "rejected"
//   cookie_consent_at: ISO timestamp of the user's decision
//
// "Essential" storage (auth token, theme, lang) is exempt — it's required for
// the app to function and doesn't count as tracking under CNIL guidance.

const KEY = 'cookie_consent'
const TS_KEY = 'cookie_consent_at'

export function getCookieConsent() {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function hasCookieDecision() {
  const v = getCookieConsent()
  return v === 'accepted' || v === 'rejected'
}

export function hasAnalyticsConsent() {
  return getCookieConsent() === 'accepted'
}

export function setCookieConsent(value) {
  if (value !== 'accepted' && value !== 'rejected') return
  try {
    localStorage.setItem(KEY, value)
    localStorage.setItem(TS_KEY, new Date().toISOString())
  } catch {
    // localStorage disabled — silently ignore; banner won't reappear this session
  }
}

export function clearCookieConsent() {
  try {
    localStorage.removeItem(KEY)
    localStorage.removeItem(TS_KEY)
  } catch {
    // nothing to do
  }
}
