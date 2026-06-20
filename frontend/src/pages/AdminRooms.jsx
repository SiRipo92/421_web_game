import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useLang } from '../context/useLang.js'
import * as adminApi from '../api/admin.js'

export function AdminRooms({ user, token }) {
  const { t } = useLang()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    if (!token || !user || (user.role !== 'admin' && user.role !== 'moderator')) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    adminApi
      .listRooms(token)
      .then((d) => { if (!cancelled) setData(d) })
      .catch((e) => { if (!cancelled) setError(e?.detail || 'error') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token, user, refresh])

  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin' && user.role !== 'moderator') {
    return <Navigate to="/profile" replace />
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2.5rem 1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="eyebrow">{t('admin_eyebrow')}</div>
          <h1 className="display" style={{ fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', margin: '0.3rem 0 0' }}>
            {t('admin_rooms_title')}
          </h1>
        </div>
        <nav style={{ display: 'flex', gap: 16, fontSize: '0.9rem' }}>
          <Link to="/admin" className="btn-link">{t('admin_back_to_summary')}</Link>
          <Link to="/admin/users" className="btn-link">{t('admin_users_link')}</Link>
          <button type="button" className="btn-link" onClick={() => setRefresh((n) => n + 1)}>
            ↻ {t('admin_rooms_refresh')}
          </button>
        </nav>
      </div>

      {loading ? (
        <p className="serif" style={{ fontStyle: 'italic', color: 'var(--ink-mute)' }}>{t('loading')}</p>
      ) : error ? (
        <div className="ticket" style={{ padding: '1.2rem', borderColor: 'var(--rouge)' }}>
          <p className="serif" style={{ margin: 0, color: 'var(--rouge)' }}>
            {t('admin_error_summary')}: {String(error)}
          </p>
        </div>
      ) : (
        <>
          <p className="serif" style={{ color: 'var(--ink-mute)', fontStyle: 'italic', marginBottom: 12 }}>
            {t('admin_rooms_count', { n: data.total })}
          </p>
          {data.rooms.length === 0 ? (
            <p className="note" style={{ padding: '1.4rem', textAlign: 'center' }}>{t('admin_rooms_empty')}</p>
          ) : (
            <div className="card" style={{ overflow: 'hidden' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '120px 1.4fr 110px 90px 80px 100px',
                gap: 14, padding: '0.8rem 1.4rem',
                background: 'var(--paper-deep)', borderBottom: '1px solid var(--rule)',
              }}>
                <div className="eyebrow">{t('admin_rooms_col_code')}</div>
                <div className="eyebrow">{t('admin_rooms_col_host')}</div>
                <div className="eyebrow">{t('admin_rooms_col_phase')}</div>
                <div className="eyebrow">{t('admin_rooms_col_players')}</div>
                <div className="eyebrow">{t('admin_rooms_col_partie')}</div>
                <div className="eyebrow">{t('admin_rooms_col_visibility')}</div>
              </div>
              {data.rooms.map((r, i) => (
                <Link key={r.game_id} to={`/admin/rooms/${r.game_id}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '120px 1.4fr 110px 90px 80px 100px',
                    gap: 14, padding: '0.85rem 1.4rem', alignItems: 'center',
                    borderBottom: i < data.rooms.length - 1 ? '1px dashed var(--rule)' : 'none',
                    textDecoration: 'none', color: 'var(--ink)', cursor: 'pointer',
                  }}>
                  <div className="mono" style={{ fontWeight: 600 }}>{r.game_id}</div>
                  <div className="serif">{r.host_name || '—'}</div>
                  <PhaseBadge phase={r.phase} t={t} />
                  <div className="mono" style={{ fontSize: '0.9rem' }}>
                    {r.player_count}/{r.max_players}
                    {r.spectator_count > 0 && (
                      <span style={{ color: 'var(--ink-mute)', marginLeft: 4, fontSize: '0.75rem' }}>+{r.spectator_count}👁</span>
                    )}
                  </div>
                  <div className="mono" style={{ fontSize: '0.85rem' }}>#{r.partie_number}</div>
                  <div className="eyebrow" style={{ fontSize: '0.6rem', color: r.is_public ? 'var(--felt-deep)' : 'var(--ink-mute)' }}>
                    {r.is_public ? t('admin_rooms_public') : t('admin_rooms_private')}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function PhaseBadge({ phase, t }) {
  const colors = {
    waiting: { bg: 'rgba(110,110,110,0.15)', fg: 'var(--ink-mute)' },
    initial_roll: { bg: 'rgba(196,140,40,0.15)', fg: 'var(--brass)' },
    charge: { bg: 'rgba(40,120,40,0.15)', fg: 'var(--felt-deep)' },
    decharge: { bg: 'rgba(196,140,40,0.15)', fg: 'var(--brass)' },
    tiebreak: { bg: 'rgba(168,48,42,0.15)', fg: 'var(--rouge)' },
    finished: { bg: 'rgba(110,110,110,0.15)', fg: 'var(--ink-mute)' },
  }
  const c = colors[phase] || colors.waiting
  return (
    <span className="eyebrow" style={{
      fontSize: '0.6rem', padding: '0.18rem 0.5rem',
      background: c.bg, color: c.fg, borderRadius: 2, letterSpacing: '0.1em',
    }}>
      {t(`admin_rooms_phase_${phase}`) || phase}
    </span>
  )
}
