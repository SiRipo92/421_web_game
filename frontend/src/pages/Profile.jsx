import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '../components/shared/Avatar.jsx'
import { useLang } from '../context/LangContext.jsx'
import { badge } from './Rankings.jsx'

export function Profile({ user, token }) {
  const { t } = useLang()
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    fetch(`/api/profile`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setStats(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [token])

  if (!user) {
    return (
      <div style={{ maxWidth: 640, margin: '4rem auto', padding: '0 1.5rem', textAlign: 'center' }}>
        <p className="serif" style={{ color: 'var(--ink-mute)', fontStyle: 'italic' }}>
          Connectez-vous pour voir votre profil.
        </p>
        <button type="button" className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={() => navigate('/login')}>
          {t('login')}
        </button>
      </div>
    )
  }

  const elo = stats?.elo ?? 1200
  const winRate = stats?.games_played ? Math.round((stats.wins / stats.games_played) * 100) : 0

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2.5rem 1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 24, alignItems: 'center', marginBottom: '2.5rem' }}
        className="prof-hd">
        <Avatar name={user.username} size={6} />
        <div>
          <div className="eyebrow">{t('player_card')}</div>
          <h1 className="display" style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', margin: '0.3rem 0 0.4rem' }}>{user.username}</h1>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="mono" style={{ color: 'var(--ink-mute)' }}>@{user.username}</span>
          </div>
        </div>
        <div className="ticket" style={{ textAlign: 'center', padding: '1rem 1.4rem', minWidth: 180 }}>
          <div className="eyebrow" style={{ fontSize: '0.6rem' }}>{t('current_elo')}</div>
          <div className="display" style={{ fontSize: '2.6rem', color: 'var(--rouge)', lineHeight: 1 }}>{elo}</div>
          <div className="serif" style={{ fontStyle: 'italic', marginTop: 4 }}>{badge(elo)}</div>
        </div>
      </div>

      {loading ? (
        <p className="serif" style={{ fontStyle: 'italic', color: 'var(--ink-mute)' }}>Chargement…</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: '2rem' }}
            className="stats-grid">
            <StatCard label={t('games_played')} value={stats?.games_played ?? 0} />
            <StatCard label={t('win_rate')} value={`${winRate}%`} accent="var(--rouge)" />
            <StatCard label={t('current_streak')} value={stats?.streak ?? 0} suffix="🔥" />
            <StatCard label={t('longest_streak')} value={stats?.longest_streak ?? 0} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }} className="prof-grid">
            {/* Combo chart */}
            <div className="card" style={{ padding: '1.6rem' }}>
              <div className="eyebrow">Tableau de chasse</div>
              <div className="display" style={{ fontSize: '1.4rem', marginBottom: 14 }}>{t('combo_chart')}</div>
              {stats?.top_combos && Object.entries(stats.top_combos).length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {Object.entries(stats.top_combos).map(([k, v]) => {
                    const max = Math.max(...Object.values(stats.top_combos))
                    return (
                      <div key={k} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10, alignItems: 'center' }}>
                        <div className="serif" style={{ width: 80, fontStyle: k === 'nénette' ? 'italic' : 'normal', color: k === '421' ? 'var(--rouge)' : 'var(--ink)' }}>{k}</div>
                        <div style={{ height: 8, background: 'var(--paper-deep)', borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${max > 0 ? (v / max) * 100 : 0}%`, background: k === '421' ? 'var(--rouge)' : 'var(--brass)' }} />
                        </div>
                        <div className="mono" style={{ fontWeight: 700, width: 32, textAlign: 'right' }}>{v}</div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="note">Aucune partie jouée.</p>
              )}
            </div>

            {/* Recent games */}
            <div className="card" style={{ padding: '1.6rem' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <div>
                  <div className="eyebrow">Dernières parties</div>
                  <div className="display" style={{ fontSize: '1.4rem' }}>{t('recent_games')}</div>
                </div>
              </div>
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column' }}>
                {stats?.recent_games?.length > 0 ? stats.recent_games.map((r, i) => (
                  <div key={i} style={{
                    display: 'grid', gridTemplateColumns: 'auto auto 1fr auto', gap: 12, alignItems: 'center',
                    padding: '0.7rem 0',
                    borderBottom: i < stats.recent_games.length - 1 ? '1px dashed var(--rule)' : 'none',
                  }}>
                    <div className="mono" style={{ fontSize: '0.8rem', color: 'var(--ink-mute)', width: 48 }}>
                      {new Date(r.played_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                    </div>
                    <div className="display" style={{ fontSize: r.rank === 1 ? '1.2rem' : '1rem', color: r.rank === 1 ? 'var(--rouge)' : 'var(--ink)' }}>
                      {r.rank === 1 ? `🏆 ${t('winner_label')}` : `${r.rank}ᵉ ${t('place_suffix').replace('ᵉ ', '')}`}
                    </div>
                    <div />
                    <div className="mono" style={{ color: r.elo_delta > 0 ? 'var(--felt-deep)' : 'var(--rouge)', fontWeight: 700 }}>
                      {r.elo_delta > 0 ? '+' : ''}{r.elo_delta}
                    </div>
                  </div>
                )) : <p className="note">Aucune partie jouée.</p>}
              </div>
            </div>
          </div>
        </>
      )}

      <style>{`
        @media (max-width: 820px) {
          .prof-hd, .prof-grid { grid-template-columns: 1fr !important; }
          .stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div>
  )
}

function StatCard({ label, value, accent, suffix }) {
  return (
    <div className="card" style={{ padding: '1rem 1.2rem' }}>
      <div className="eyebrow" style={{ fontSize: '0.62rem' }}>{label}</div>
      <div className="display" style={{ fontSize: '2rem', color: accent || 'var(--ink)', marginTop: 4 }}>
        {value}{suffix && <span style={{ fontSize: '1rem', marginLeft: 6 }}>{suffix}</span>}
      </div>
    </div>
  )
}
