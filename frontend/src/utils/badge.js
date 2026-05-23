const BADGE_TIERS = [
  { max: 800, badge: '🎲 Débutant' },
  { max: 1200, badge: '🥉 Amateur' },
  { max: 1600, badge: '🥈 Confirmé' },
  { max: 2000, badge: '🥇 Expert' },
  { max: Infinity, badge: '👑 Maître' },
]

export function badge(elo) {
  return BADGE_TIERS.find(t => elo < t.max)?.badge ?? '👑 Maître'
}
