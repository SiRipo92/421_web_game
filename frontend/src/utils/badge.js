// G98: thin re-export pointing at the centralized rank module.
// Existing consumers using `badge(elo)` get the inline-label variant
// (e.g. "🥉 Amateur"). New code should import directly from ./ranks.js.
import { badgeLabel } from './ranks.js'

export function badge(elo, partiesPlayed = 1) {
  return badgeLabel(elo, partiesPlayed) ?? ''
}

export { BADGES, badgeLabel } from './ranks.js'
