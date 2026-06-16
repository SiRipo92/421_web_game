import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useLang } from '../context/useLang.js'
import * as adminApi from '../api/admin.js'

export function AdminDashboard({ user, token }) {
  const { t } = useLang()
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!token || !user || (user.role !== 'admin' && user.role !== 'moderator')) return
    let cancelled = false
    adminApi
      .dashboardSummary(token)
      .then((s) => { if (!cancelled) setSummary(s) })
      .catch((e) => { if (!cancelled) setError(e?.detail || 'error') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token, user])

  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin' && user.role !== 'moderator') {
    return <Navigate to="/profile" replace />
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2.5rem 1.5rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <div className="eyebrow">{t('admin_eyebrow')}</div>
        <h1 className="display" style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', margin: '0.3rem 0 0.4rem' }}>
          {t('admin_title')}
        </h1>
        <p className="serif" style={{ color: 'var(--ink-mute)', fontStyle: 'italic', margin: 0 }}>
          {user.role === 'admin' ? t('admin_subtitle_admin') : t('admin_subtitle_moderator')}
        </p>
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
        <SummaryGrid summary={summary} t={t} />
      )}

      {/* G90: real navigation panels replacing PanelStub placeholders */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem', marginTop: '2rem' }} className="admin-panels">
        <Link to="/admin/users" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="card" style={{ padding: '1.4rem', cursor: 'pointer', transition: 'background 0.15s' }}>
            <div className="eyebrow">{t('admin_panel_users_eyebrow')}</div>
            <h3 className="display" style={{ fontSize: '1.3rem', margin: '0.3rem 0 0.6rem' }}>
              {t('admin_panel_users_title')}
            </h3>
            <p className="serif" style={{ margin: 0, color: 'var(--ink-soft)', fontSize: '0.92rem', lineHeight: 1.45 }}>
              {t('admin_panel_users_body_g90')}
            </p>
            <div className="mono" style={{ marginTop: 12, fontSize: '0.78rem', color: 'var(--rouge)' }}>
              {t('admin_open')} →
            </div>
          </div>
        </Link>
        <Link to="/admin/audit" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="card" style={{ padding: '1.4rem', cursor: 'pointer', transition: 'background 0.15s' }}>
            <div className="eyebrow">{t('admin_panel_audit_eyebrow')}</div>
            <h3 className="display" style={{ fontSize: '1.3rem', margin: '0.3rem 0 0.6rem' }}>
              {t('admin_panel_audit_title')}
            </h3>
            <p className="serif" style={{ margin: 0, color: 'var(--ink-soft)', fontSize: '0.92rem', lineHeight: 1.45 }}>
              {t('admin_panel_audit_body')}
            </p>
            <div className="mono" style={{ marginTop: 12, fontSize: '0.78rem', color: 'var(--rouge)' }}>
              {t('admin_open')} →
            </div>
          </div>
        </Link>
      </div>

      {/* Recent admin actions feed */}
      {summary?.recent_admin_actions && summary.recent_admin_actions.length > 0 && (
        <div className="card" style={{ padding: '1.4rem', marginTop: '1.5rem' }}>
          <div className="eyebrow">{t('admin_recent_actions')}</div>
          <h3 className="display" style={{ fontSize: '1.1rem', margin: '0.3rem 0 0.8rem' }}>
            {t('admin_recent_actions_title')}
          </h3>
          {summary.recent_admin_actions.map((a) => (
            <div key={a.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 12, padding: '0.5rem 0', borderBottom: '1px dashed var(--rule)' }}>
              <div className="mono" style={{ fontSize: '0.75rem', color: 'var(--ink-mute)', width: 130 }}>
                {new Date(a.occurred_at).toLocaleString()}
              </div>
              <div className="serif" style={{ fontSize: '0.9rem' }}>
                {a.event_type}{' '}
                {a.user_id && (
                  <Link to={`/admin/users/${a.user_id}`} className="mono" style={{ fontSize: '0.7rem', color: 'var(--rouge)' }}>
                    → {a.user_id.slice(0, 8)}
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @media (max-width: 900px) {
          .admin-panels { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}

function SummaryGrid({ summary, t }) {
  const cells = [
    { label: t('admin_summary_users'), value: summary?.total_users ?? 0 },
    { label: t('admin_summary_account_bans'), value: summary?.active_account_bans ?? 0, accent: 'var(--rouge)' },
    { label: t('admin_summary_chat_bans'), value: summary?.active_chat_bans ?? 0, accent: 'var(--brass-deep)' },
    { label: t('admin_summary_strikes'), value: summary?.users_with_strikes ?? 0 },
    { label: t('admin_summary_online'), value: summary?.online_count ?? 0, accent: 'var(--felt-deep)' },
    { label: t('admin_summary_appeals'), value: summary?.appeals_awaiting_review ?? 0 },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }} className="admin-summary-grid">
      {cells.map((c) => (
        <div
          key={c.label}
          className="card"
          style={{ padding: '0.9rem 1rem', textAlign: 'center', minWidth: 0 }}
        >
          <div className="eyebrow" style={{ fontSize: '0.58rem' }}>{c.label}</div>
          <div className="display" style={{ fontSize: '1.8rem', color: c.accent || 'var(--ink)', lineHeight: 1.1, marginTop: 4 }}>
            {c.value}
          </div>
        </div>
      ))}
      <style>{`
        @media (max-width: 900px) {
          .admin-summary-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div>
  )
}

