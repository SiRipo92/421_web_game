import { useEffect, useState } from 'react'
import { Avatar } from '../components/shared/Avatar.jsx'
import { useLang } from '../context/LangContext.jsx'

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

export function Rankings({ user }) {
  const { t } = useLang()
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/rankings')
      .then(r => r.json())
      .then(d => setPlayers(d.rankings ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const top3 = players.slice(0, 3)

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '2.5rem 1.5rem' }}>
      <div className="eyebrow">Tableau d'honneur</div>
      <h1 className="display" style={{ fontSize: 'clamp(2.4rem, 5vw, 3.2rem)', margin: '0.3rem 0 0.5rem' }}>
        Le <em style={{ color: 'var(--rouge)' }}>palmarès</em> de la maison.
      </h1>
      <p className="note" style={{ marginBottom: '2rem' }}>{t('rankings_sub')}</p>

      {/* Podium */}
      {top3.length >= 3 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr', gap: 14, alignItems: 'end', marginBottom: '2rem' }}
          className="podium">
          {[top3[1], top3[0], top3[2]].map((p) => {
            const isFirst = p?.rank === 1
            return (
              <div key={p?.user_id} className="card card-stamp"
                style={{
                  padding: '1.4rem', textAlign: 'center',
                  background: isFirst ? 'var(--ink)' : 'var(--paper-soft)',
                  color: isFirst ? 'var(--paper)' : 'var(--ink)',
                  transform: `translateY(${isFirst ? 0 : 12}px)`,
                }}>
                <div className="display" style={{ fontSize: isFirst ? '3rem' : '2rem', color: isFirst ? 'var(--brass-soft)' : 'var(--ink-fade)' }}>
                  {p?.rank === 1 ? '🏆' : p?.rank}
                </div>
                <Avatar name={p?.username} size={3} />
                <div className="display" style={{ fontSize: isFirst ? '1.3rem' : '1.1rem', marginTop: 8 }}>{p?.username}</div>
                <div className="mono" style={{ fontSize: '0.85rem', opacity: 0.7 }}>{p?.elo} Elo</div>
                <div className="serif" style={{ fontStyle: 'italic', marginTop: 4, fontSize: '0.85rem' }}>{badge(p?.elo ?? 0)}</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Full table */}
      {loading ? (
        <p className="serif" style={{ fontStyle: 'italic', color: 'var(--ink-mute)' }}>Chargement…</p>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '60px 1fr auto auto auto', gap: 14,
            padding: '0.8rem 1.4rem', background: 'var(--paper-deep)', borderBottom: '1px solid var(--rule)',
          }}>
            <div className="eyebrow">{t('rank_col')}</div>
            <div className="eyebrow">{t('player_col')}</div>
            <div className="eyebrow">Elo</div>
            <div className="eyebrow">{t('games_col')}</div>
            <div className="eyebrow">{t('wins_col')}</div>
          </div>
          {players.map((p, i) => {
            const isSelf = user && p.user_id === user.id
            return (
              <div key={p.user_id} style={{
                display: 'grid', gridTemplateColumns: '60px 1fr auto auto auto', gap: 14,
                padding: '0.85rem 1.4rem', alignItems: 'center',
                borderBottom: i < players.length - 1 ? '1px dashed var(--rule)' : 'none',
                background: isSelf ? 'rgba(168,48,42,0.08)' : 'transparent',
              }}>
                <div className="display" style={{ fontSize: '1.3rem', color: p.rank <= 3 ? 'var(--rouge)' : 'var(--ink-fade)' }}>
                  {p.rank}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Avatar name={p.username} size={2.2} />
                  <div>
                    <div className="serif" style={{ fontWeight: 600, fontSize: '1.05rem' }}>
                      {p.username}
                      {isSelf && <span className="tag tag-rouge" style={{ fontSize: '0.55rem', marginLeft: 4 }}>{t('you_badge')}</span>}
                    </div>
                    <div className="mono" style={{ fontSize: '0.7rem', color: 'var(--ink-mute)' }}>{badge(p.elo)}</div>
                  </div>
                </div>
                <div className="mono" style={{ fontWeight: 700, fontSize: '1.05rem' }}>{p.elo}</div>
                <div className="mono" style={{ color: 'var(--ink-mute)', textAlign: 'right' }}>{p.games_played}</div>
                <div className="mono" style={{ color: 'var(--felt-deep)', fontWeight: 600, textAlign: 'right' }}>{p.wins}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
