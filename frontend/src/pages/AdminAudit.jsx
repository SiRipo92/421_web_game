import { useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useLang } from '../context/useLang.js'
import * as adminApi from '../api/admin.js'

const PAGE_SIZE = 50

const EVENT_TYPES = [
  '', 'account_created', 'role_changed', 'account_banned', 'account_unbanned',
  'chat_banned', 'chat_unbanned', 'account_deleted_by_admin',
]

export function AdminAudit({ user, token }) {
  const { t } = useLang()
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const params = {
    event_type: searchParams.get('event_type') ?? '',
    target_user_id: searchParams.get('target_user_id') ?? '',
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
      .auditFeed(token, params)
      .then((d) => { if (!cancelled) setData(d) })
      .catch((e) => { if (!cancelled) setError(e?.detail || 'error') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user, searchParams])

  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin' && user.role !== 'moderator') return <Navigate to="/profile" replace />

  const updateParam = (key, value) => {
    const next = new URLSearchParams(searchParams)
    if (value === '' || value === null || value === undefined) next.delete(key)
    else next.set(key, String(value))
    next.set('page', '1')
    setSearchParams(next)
  }

  const goToPage = (n) => {
    const next = new URLSearchParams(searchParams)
    next.set('page', String(n))
    setSearchParams(next)
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2.5rem 1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: '1.5rem' }}>
        <div>
          <div className="eyebrow">{t('admin_eyebrow')}</div>
          <h1 className="display" style={{ fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', margin: '0.3rem 0 0' }}>
            {t('admin_audit_title')}
          </h1>
        </div>
        <nav style={{ display: 'flex', gap: 16, fontSize: '0.9rem' }}>
          <Link to="/admin" className="btn-link">{t('admin_back_to_summary')}</Link>
          <Link to="/admin/users" className="btn-link">{t('admin_users_link')}</Link>
        </nav>
      </div>

      {/* Filters */}
      <div className="ticket" style={{ padding: '1rem 1.2rem', marginBottom: '1.5rem', display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 220 }}>
          <label className="eyebrow" style={{ display: 'block', fontSize: '0.65rem', marginBottom: 4 }}>{t('admin_filter_event_type')}</label>
          <select value={params.event_type} onChange={(e) => updateParam('event_type', e.target.value)}
            style={{ width: '100%', padding: '0.4rem 0.6rem', fontFamily: 'monospace', fontSize: '0.85rem' }}>
            {EVENT_TYPES.map((et) => (
              <option key={et || 'any'} value={et}>{et || t('admin_audit_any_event')}</option>
            ))}
          </select>
        </div>
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
            {t('admin_results_count', { n: data.total })}
          </p>
          <div className="card" style={{ overflow: 'hidden' }}>
            {data.entries.length === 0 ? (
              <p className="note" style={{ padding: '1.4rem', textAlign: 'center' }}>{t('admin_no_results')}</p>
            ) : data.entries.map((e, i) => (
              <div key={e.id} style={{
                padding: '0.7rem 1rem',
                borderBottom: i < data.entries.length - 1 ? '1px dashed var(--rule)' : 'none',
                display: 'grid',
                gridTemplateColumns: 'auto 1fr',
                gap: 14,
              }}>
                <div className="mono" style={{ fontSize: '0.75rem', color: 'var(--ink-mute)', width: 150 }}>
                  {new Date(e.occurred_at).toLocaleString()}
                </div>
                <div>
                  <div className="serif" style={{ fontWeight: 600 }}>
                    {e.event_type}{' '}
                    {e.user_id && (
                      <Link to={`/admin/users/${e.user_id}`} className="mono"
                        style={{ fontSize: '0.75rem', color: 'var(--rouge)', textDecoration: 'none' }}>
                        → {e.user_id.slice(0, 8)}
                      </Link>
                    )}
                  </div>
                  {e.metadata && Object.keys(e.metadata).length > 0 && (
                    <div className="mono" style={{ fontSize: '0.7rem', color: 'var(--ink-mute)', marginTop: 2 }}>
                      {JSON.stringify(e.metadata)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {data.total > PAGE_SIZE && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
              <button type="button" onClick={() => goToPage(params.page - 1)} disabled={params.page <= 1} className="btn-ghost">
                ← {t('admin_prev_page')}
              </button>
              <span className="mono" style={{ alignSelf: 'center', color: 'var(--ink-mute)' }}>
                {t('admin_page_x_of_y', { x: params.page, y: Math.ceil(data.total / PAGE_SIZE) })}
              </span>
              <button type="button" onClick={() => goToPage(params.page + 1)} disabled={!data.has_next} className="btn-ghost">
                {t('admin_next_page')} →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
