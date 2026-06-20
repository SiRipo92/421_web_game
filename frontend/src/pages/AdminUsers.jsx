import { useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useLang } from '../context/useLang.js'
import * as adminApi from '../api/admin.js'

const PAGE_SIZE = 20

export function AdminUsers({ user, token }) {
  const { t } = useLang()
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchInput, setSearchInput] = useState(searchParams.get('q') ?? '')

  const params = {
    q: searchParams.get('q') ?? '',
    role: searchParams.get('role') ?? '',
    status: searchParams.get('status') ?? '',
    online: searchParams.get('online') === 'true',
    sort: searchParams.get('sort') ?? 'created_at_desc',
    page: parseInt(searchParams.get('page') ?? '1', 10),
    per_page: PAGE_SIZE,
  }

  useEffect(() => {
    if (!token || !user || (user.role !== 'admin' && user.role !== 'moderator')) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    adminApi
      .listUsers(token, params)
      .then((d) => { if (!cancelled) setData(d) })
      .catch((e) => { if (!cancelled) setError(e?.detail || 'error') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user, searchParams])

  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin' && user.role !== 'moderator') {
    return <Navigate to="/profile" replace />
  }

  const updateParam = (key, value) => {
    const next = new URLSearchParams(searchParams)
    if (value === '' || value === false || value === null || value === undefined) {
      next.delete(key)
    } else {
      next.set(key, String(value))
    }
    next.set('page', '1')  // reset to page 1 on filter change
    setSearchParams(next)
  }

  const goToPage = (n) => {
    const next = new URLSearchParams(searchParams)
    next.set('page', String(n))
    setSearchParams(next)
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2.5rem 1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="eyebrow">{t('admin_eyebrow')}</div>
          <h1 className="display" style={{ fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', margin: '0.3rem 0 0' }}>
            {t('admin_users_title')}
          </h1>
        </div>
        <nav style={{ display: 'flex', gap: 16, fontSize: '0.9rem' }}>
          <Link to="/admin" className="btn-link">{t('admin_back_to_summary')}</Link>
          <Link to="/admin/audit" className="btn-link">{t('admin_audit_link')}</Link>
        </nav>
      </div>

      {/* Filters */}
      <div className="ticket" style={{ padding: '1rem 1.2rem', marginBottom: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, alignItems: 'end' }}>
        <div>
          <label className="eyebrow" style={{ display: 'block', fontSize: '0.65rem', marginBottom: 4 }}>
            {t('admin_filter_search')}
          </label>
          <form onSubmit={(e) => { e.preventDefault(); updateParam('q', searchInput) }}>
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('admin_filter_search_placeholder')}
              style={{ width: '100%', padding: '0.4rem 0.6rem', fontFamily: 'monospace', fontSize: '0.85rem', border: '1px solid var(--rule)', borderRadius: 3 }}
            />
          </form>
        </div>
        <div>
          <label className="eyebrow" style={{ display: 'block', fontSize: '0.65rem', marginBottom: 4 }}>{t('admin_filter_role')}</label>
          <select value={params.role} onChange={(e) => updateParam('role', e.target.value)}
            style={{ width: '100%', padding: '0.4rem 0.6rem', fontFamily: 'monospace', fontSize: '0.85rem' }}>
            <option value="">{t('admin_filter_role_any')}</option>
            <option value="player">{t('admin_filter_role_player')}</option>
            <option value="moderator">{t('admin_filter_role_moderator')}</option>
            <option value="admin">{t('admin_filter_role_admin')}</option>
          </select>
        </div>
        <div>
          <label className="eyebrow" style={{ display: 'block', fontSize: '0.65rem', marginBottom: 4 }}>{t('admin_filter_status')}</label>
          <select value={params.status} onChange={(e) => updateParam('status', e.target.value)}
            style={{ width: '100%', padding: '0.4rem 0.6rem', fontFamily: 'monospace', fontSize: '0.85rem' }}>
            <option value="">{t('admin_filter_status_any')}</option>
            <option value="active">{t('admin_filter_status_active')}</option>
            <option value="banned">{t('admin_filter_status_banned')}</option>
            <option value="chat_banned">{t('admin_filter_status_chat_banned')}</option>
            <option value="deleted">{t('admin_filter_status_deleted')}</option>
          </select>
        </div>
        <div>
          <label className="eyebrow" style={{ display: 'block', fontSize: '0.65rem', marginBottom: 4 }}>{t('admin_filter_online')}</label>
          <button type="button" onClick={() => updateParam('online', !params.online)}
            className={params.online ? 'btn-primary' : 'btn-ghost'}
            style={{ width: '100%', padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}>
            {params.online ? `🟢 ${t('admin_filter_online_yes')}` : `⚪ ${t('admin_filter_online_no')}`}
          </button>
        </div>
        <div>
          <label className="eyebrow" style={{ display: 'block', fontSize: '0.65rem', marginBottom: 4 }}>{t('admin_filter_sort')}</label>
          <select value={params.sort} onChange={(e) => updateParam('sort', e.target.value)}
            style={{ width: '100%', padding: '0.4rem 0.6rem', fontFamily: 'monospace', fontSize: '0.85rem' }}>
            <option value="created_at_desc">{t('admin_sort_newest')}</option>
            <option value="created_at">{t('admin_sort_oldest')}</option>
            <option value="username">{t('admin_sort_username_az')}</option>
            <option value="username_desc">{t('admin_sort_username_za')}</option>
            <option value="elo_desc">{t('admin_sort_elo_high')}</option>
            <option value="last_seen_at_desc">{t('admin_sort_last_seen')}</option>
          </select>
        </div>
      </div>

      {/* Results */}
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
            {t('admin_results_count', { n: data.total })}
          </p>
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1.6fr 2.2fr 100px 130px 70px 110px',
              gap: 14,
              padding: '0.8rem 1.4rem',
              background: 'var(--paper-deep)',
              borderBottom: '1px solid var(--rule)',
            }}>
              <div className="eyebrow">{t('admin_col_user')}</div>
              <div className="eyebrow">{t('admin_col_email')}</div>
              <div className="eyebrow">{t('admin_col_role')}</div>
              <div className="eyebrow">{t('admin_col_status')}</div>
              <div className="eyebrow">{t('admin_col_elo')}</div>
              <div className="eyebrow">{t('admin_col_seen')}</div>
            </div>
            {data.users.length === 0 ? (
              <p className="note" style={{ padding: '1.4rem', textAlign: 'center' }}>{t('admin_no_results')}</p>
            ) : data.users.map((u, i) => (
              <Link
                key={u.id}
                to={`/admin/users/${u.id}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.6fr 2.2fr 100px 130px 70px 110px',
                  gap: 14,
                  padding: '0.85rem 1.4rem',
                  alignItems: 'center',
                  borderBottom: i < data.users.length - 1 ? '1px dashed var(--rule)' : 'none',
                  textDecoration: 'none',
                  color: 'var(--ink)',
                  cursor: 'pointer',
                }}
              >
                <div className="serif" style={{ fontWeight: 600 }}>
                  {u.username}
                </div>
                <div className="mono" style={{ fontSize: '0.8rem', color: 'var(--ink-mute)' }}>
                  {u.email}
                </div>
                <div className="mono" style={{ fontSize: '0.75rem', color: u.role === 'admin' ? 'var(--rouge)' : u.role === 'moderator' ? 'var(--brass)' : 'var(--ink-mute)' }}>
                  {u.role}
                </div>
                <StatusBadge status={u.status} t={t} />
                <div className="mono" style={{ fontWeight: 600, fontSize: '0.85rem' }}>{u.elo}</div>
                <div className="mono" style={{ fontSize: '0.75rem', color: 'var(--ink-mute)' }}>
                  {formatRelative(u.last_seen_at, t)}
                </div>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          {data.total > PAGE_SIZE && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
              <button
                type="button"
                onClick={() => goToPage(params.page - 1)}
                disabled={params.page <= 1}
                className="btn-ghost"
              >← {t('admin_prev_page')}</button>
              <span className="mono" style={{ alignSelf: 'center', color: 'var(--ink-mute)' }}>
                {t('admin_page_x_of_y', { x: params.page, y: Math.ceil(data.total / PAGE_SIZE) })}
              </span>
              <button
                type="button"
                onClick={() => goToPage(params.page + 1)}
                disabled={!data.has_next}
                className="btn-ghost"
              >{t('admin_next_page')} →</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function StatusBadge({ status, t }) {
  const colors = {
    active: { bg: 'rgba(40, 120, 40, 0.15)', fg: 'var(--felt-deep)' },
    banned: { bg: 'rgba(168,48,42,0.15)', fg: 'var(--rouge)' },
    chat_banned: { bg: 'rgba(196,140,40,0.15)', fg: 'var(--brass)' },
    deleted: { bg: 'rgba(110,110,110,0.15)', fg: 'var(--ink-mute)' },
  }
  const c = colors[status] || colors.active
  return (
    <span className="eyebrow" style={{
      fontSize: '0.6rem',
      padding: '0.18rem 0.5rem',
      background: c.bg,
      color: c.fg,
      borderRadius: 2,
      letterSpacing: '0.1em',
    }}>
      {t(`admin_status_${status}`)}
    </span>
  )
}

function formatRelative(iso, t) {
  if (!iso) return '—'
  const then = new Date(iso)
  const now = new Date()
  const diffSec = Math.round((now - then) / 1000)
  if (diffSec < 300) return t('admin_seen_now')
  if (diffSec < 3600) return t('admin_seen_minutes', { n: Math.round(diffSec / 60) })
  if (diffSec < 86400) return t('admin_seen_hours', { n: Math.round(diffSec / 3600) })
  if (diffSec < 86400 * 30) return t('admin_seen_days', { n: Math.round(diffSec / 86400) })
  return then.toLocaleDateString()
}
