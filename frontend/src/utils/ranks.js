/**
 * G98: single source of truth for the ELO badge ladder (frontend mirror).
 *
 * IMPORTANT: keep in lockstep with `app/services/ranks.py` BADGES tuple
 * on the backend. They define the same ladder; the only reason this
 * exists separately is that the SPA renders badges on Profile + Rankings
 * + Login marketing without a backend roundtrip for unauthenticated
 * surfaces.
 *
 * Ordered high-to-low so the linear scan stops at the first threshold
 * the score meets.
 *
 * `badge(elo, partiesPlayed)` returns null for unranked users
 * (parties_played === 0). UI renders «—» / «Non classé(e)» for that case.
 */

export const BADGES = [
  { threshold: 1700, name: 'Maître', icon: '👑' },
  { threshold: 1500, name: 'Expert', icon: '🥇' },
  { threshold: 1300, name: 'Confirmé', icon: '🥈' },
  { threshold: 1100, name: 'Amateur', icon: '🥉' },
  { threshold: 0, name: 'Débutant', icon: '🎲' },
]

/**
 * Returns {name, icon} for the given ELO, or null when the user hasn't
 * played any parties yet (the "unranked" case).
 */
export function badge(elo, partiesPlayed = 1) {
  if ((partiesPlayed ?? 0) < 1) return null
  for (const tier of BADGES) {
    if (elo >= tier.threshold) return { name: tier.name, icon: tier.icon }
  }
  return { name: 'Débutant', icon: '🎲' }  // defensive — last threshold is 0
}

/**
 * Convenience: "🥉 Amateur" — single-string variant for places that
 * render the badge inline (e.g. login marketing badge list).
 */
export function badgeLabel(elo, partiesPlayed = 1) {
  const b = badge(elo, partiesPlayed)
  return b ? `${b.icon} ${b.name}` : null
}
