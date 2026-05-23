import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem', marginTop: '2.5rem' }} className="admin-panels">
        <PanelStub
          eyebrow={t('admin_panel_inbox_eyebrow')}
          title={t('admin_panel_inbox_title')}
          body={t('admin_panel_inbox_body')}
          roadmap="G39"
        />
        <PanelStub
          eyebrow={t('admin_panel_users_eyebrow')}
          title={t('admin_panel_users_title')}
          body={t('admin_panel_users_body')}
          roadmap="G40"
        />
        <PanelStub
          eyebrow={t('admin_panel_rooms_eyebrow')}
          title={t('admin_panel_rooms_title')}
          body={t('admin_panel_rooms_body')}
          roadmap="G41"
        />
      </div>

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
    { label: t('admin_summary_inbox'), value: summary?.pending_inbox_items ?? 0, accent: 'var(--rouge)' },
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

function PanelStub({ eyebrow, title, body, roadmap }) {
  return (
    <div className="card" style={{ padding: '1.4rem' }}>
      <div className="eyebrow">{eyebrow}</div>
      <h3 className="display" style={{ fontSize: '1.3rem', margin: '0.3rem 0 0.6rem' }}>{title}</h3>
      <p className="serif" style={{ margin: 0, color: 'var(--ink-soft)', fontSize: '0.92rem', lineHeight: 1.45 }}>
        {body}
      </p>
      <div className="mono" style={{ marginTop: 14, fontSize: '0.7rem', color: 'var(--ink-fade)', letterSpacing: '0.1em' }}>
        ROADMAP · {roadmap}
      </div>
    </div>
  )
}
