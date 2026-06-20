import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useLang } from '../context/useLang.js'
import * as adminApi from '../api/admin.js'

export function AdminUserDetail({ user, token }) {
  const { t } = useLang()
  const { userId } = useParams()
  const navigate = useNavigate()
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modal, setModal] = useState(null) // 'ban' | 'chat-ban' | 'delete' | 'role' | null
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    if (!token || !user || (user.role !== 'admin' && user.role !== 'moderator')) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    adminApi
      .getUserDetail(token, userId)
      .then((d) => { if (!cancelled) setDetail(d) })
      .catch((e) => { if (!cancelled) setError(e?.detail || 'error') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token, user, userId, refresh])

  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin' && user.role !== 'moderator') return <Navigate to="/profile" replace />

  const reload = () => setRefresh((n) => n + 1)
  const isAdmin = user.role === 'admin'

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '2.5rem 1.5rem' }}>
      <div style={{ marginBottom: 16 }}>
        <Link to="/admin/users" className="btn-link">← {t('admin_back_to_users')}</Link>
      </div>

      {loading ? (
        <p className="serif" style={{ fontStyle: 'italic', color: 'var(--ink-mute)' }}>{t('loading')}</p>
      ) : error ? (
        <div className="ticket" style={{ padding: '1.2rem', borderColor: 'var(--rouge)' }}>
          <p className="serif" style={{ margin: 0, color: 'var(--rouge)' }}>
            {t('admin_error_summary')}: {String(error)}
          </p>
        </div>
      ) : detail && (
        <>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: '1.5rem' }}>
            <div>
              <div className="eyebrow">{t('admin_user_card')}</div>
              <h1 className="display" style={{ fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', margin: '0.3rem 0 0' }}>
                {detail.username}
              </h1>
              <div className="mono" style={{ color: 'var(--ink-mute)', fontSize: '0.85rem', marginTop: 4 }}>
                {detail.email}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn-ghost" onClick={() => setModal('ban')}
                disabled={!!detail.deleted_at}
              >{detail.ban.account_until ? t('admin_action_extend_ban') : t('admin_action_ban')}</button>
              {detail.ban.account_until && (
                <button type="button" className="btn-ghost"
                  onClick={async () => { await adminApi.unbanUser(token, detail.id); reload() }}
                >{t('admin_action_unban')}</button>
              )}
              <button type="button" className="btn-ghost" onClick={() => setModal('chat-ban')}
                disabled={!!detail.deleted_at}
              >{t('admin_action_chat_ban')}</button>
              {isAdmin && (
                <>
                  <button type="button" className="btn-ghost" onClick={() => setModal('role')}
                    disabled={!!detail.deleted_at}
                  >{t('admin_action_change_role')}</button>
                  <button type="button" style={{ color: 'var(--rouge)' }} className="btn-ghost"
                    onClick={() => setModal('delete')}
                    disabled={!!detail.deleted_at}
                  >{t('admin_action_delete')}</button>
                </>
              )}
            </div>
          </div>

          {detail.deleted_at && (
            <div className="ticket" style={{ padding: '1rem 1.2rem', marginBottom: '1.5rem', borderColor: 'var(--ink-mute)' }}>
              <p className="serif" style={{ margin: 0, color: 'var(--ink-mute)' }}>
                ⚠️ {t('admin_user_deleted_at', { at: new Date(detail.deleted_at).toLocaleDateString() })}
              </p>
            </div>
          )}

          {/* Profile + Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem', marginBottom: '1.5rem' }} className="prof-grid">
            <Card title={t('admin_card_profile')}>
              <KV k={t('admin_field_role')} v={detail.role} accent />
              <KV k={t('admin_field_created')} v={new Date(detail.created_at).toLocaleString()} />
              <KV k={t('admin_field_last_seen')} v={detail.last_seen_at ? new Date(detail.last_seen_at).toLocaleString() : '—'} />
              <KV k={t('admin_field_lang')} v={detail.lang_pref} />
              <KV k={t('admin_field_email_opt_in')} v={detail.email_opt_in ? '✓' : '×'} />
              <KV k={t('admin_field_birthdate')} v={detail.birthdate ?? '—'} />
            </Card>
            <Card title={t('admin_card_moderation')}>
              <KV k={t('admin_field_strikes')} v={detail.ban.strike_count} accent={detail.ban.strike_count > 0} />
              <KV k={t('admin_field_account_ban')}
                v={detail.ban.account_until ? new Date(detail.ban.account_until).toLocaleString() : '—'}
                accent={!!detail.ban.account_until}
              />
              <KV k={t('admin_field_ban_reason')} v={detail.ban.account_reason ?? '—'} />
              <KV k={t('admin_field_chat_ban')}
                v={detail.ban.chat_until ? new Date(detail.ban.chat_until).toLocaleString() : '—'}
                accent={!!detail.ban.chat_until}
              />
            </Card>
          </div>

          {/* Stats */}
          {detail.stats && (
            <Card title={t('admin_card_stats')} style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                <Stat k={t('admin_stat_elo')} v={detail.stats.elo} />
                <Stat k={t('admin_stat_parties')} v={detail.stats.games_played} />
                <Stat k={t('admin_stat_survived')} v={detail.stats.parties_survived} />
                <Stat k={t('admin_stat_lost')} v={detail.stats.parties_lost} />
                <Stat k={t('admin_stat_manches')} v={detail.stats.manches_played} />
                <Stat k={t('admin_stat_manches_lost')} v={detail.stats.manches_lost} />
                <Stat k={t('admin_stat_current_streak')} v={detail.stats.current_streak} />
                <Stat k={t('admin_stat_longest_streak')} v={detail.stats.longest_streak} />
              </div>
            </Card>
          )}

          {/* Audit log */}
          <Card title={t('admin_card_audit')}>
            {detail.audit_log.length === 0 ? (
              <p className="note">{t('admin_no_audit')}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {detail.audit_log.map((e) => (
                  <div key={e.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 12, padding: '0.5rem 0', borderBottom: '1px dashed var(--rule)' }}>
                    <div className="mono" style={{ fontSize: '0.75rem', color: 'var(--ink-mute)', width: 130 }}>
                      {new Date(e.occurred_at).toLocaleString()}
                    </div>
                    <div>
                      <div className="serif" style={{ fontSize: '0.9rem' }}>{e.event_type}</div>
                      {e.metadata && Object.keys(e.metadata).length > 0 && (
                        <div className="mono" style={{ fontSize: '0.7rem', color: 'var(--ink-mute)', marginTop: 2 }}>
                          {JSON.stringify(e.metadata)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {modal === 'ban' && <BanModal detail={detail} token={token} onClose={() => setModal(null)} onSuccess={() => { setModal(null); reload() }} t={t} />}
          {modal === 'chat-ban' && <ChatBanModal detail={detail} token={token} onClose={() => setModal(null)} onSuccess={() => { setModal(null); reload() }} t={t} />}
          {modal === 'role' && <RoleModal detail={detail} token={token} onClose={() => setModal(null)} onSuccess={() => { setModal(null); reload() }} t={t} />}
          {modal === 'delete' && <DeleteModal detail={detail} token={token} onClose={() => setModal(null)} onSuccess={() => navigate('/admin/users')} t={t} />}
        </>
      )}
    </div>
  )
}

function Card({ title, children, style }) {
  return (
    <div className="card" style={{ padding: '1.2rem', ...style }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  )
}

function KV({ k, v, accent }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8, padding: '0.3rem 0', borderBottom: '1px dashed var(--rule)' }}>
      <div className="mono" style={{ fontSize: '0.75rem', color: 'var(--ink-mute)' }}>{k}</div>
      <div className="serif" style={{ fontSize: '0.9rem', color: accent ? 'var(--rouge)' : 'var(--ink)' }}>{v}</div>
    </div>
  )
}

function Stat({ k, v }) {
  return (
    <div style={{ background: 'var(--paper-deep)', padding: '0.6rem', borderRadius: 4, textAlign: 'center' }}>
      <div className="eyebrow" style={{ fontSize: '0.55rem' }}>{k}</div>
      <div className="display" style={{ fontSize: '1.3rem', color: 'var(--rouge)' }}>{v}</div>
    </div>
  )
}

function ModalShell({ onClose, title, children }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ maxWidth: 500, width: '100%', padding: '1.5rem', background: 'var(--paper)' }}
      >
        <h2 className="display" style={{ fontSize: '1.4rem', margin: '0 0 1rem' }}>{title}</h2>
        {children}
      </div>
    </div>
  )
}

function BanModal({ detail, token, onClose, onSuccess, t }) {
  const [duration, setDuration] = useState('7d')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState(null)
  const submit = async () => {
    setSubmitting(true)
    setErr(null)
    try {
      await adminApi.banUser(token, detail.id, duration, reason || null)
      onSuccess()
    } catch (e) {
      setErr(e?.detail || 'error')
      setSubmitting(false)
    }
  }
  return (
    <ModalShell onClose={onClose} title={t('admin_modal_ban_title', { username: detail.username })}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label className="eyebrow" style={{ fontSize: '0.7rem' }}>{t('admin_modal_duration')}</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['1d', '7d', '30d', 'permanent'].map((d) => (
            <button key={d} type="button" className={duration === d ? 'btn-primary' : 'btn-ghost'}
              onClick={() => setDuration(d)}>{t(`admin_duration_${d}`)}</button>
          ))}
        </div>
        <label className="eyebrow" style={{ fontSize: '0.7rem' }}>{t('admin_modal_reason')}</label>
        <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder={t('admin_modal_reason_placeholder')}
          style={{ padding: '0.5rem 0.6rem', fontFamily: 'monospace', fontSize: '0.85rem', border: '1px solid var(--rule)', borderRadius: 3 }}
        />
        {err && <p style={{ color: 'var(--rouge)', fontSize: '0.85rem', margin: 0 }}>{String(err)}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-ghost" onClick={onClose}>{t('cancel')}</button>
          <button type="button" className="btn-primary" onClick={submit} disabled={submitting}>
            {submitting ? '…' : t('admin_modal_confirm_ban')}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

function ChatBanModal({ detail, token, onClose, onSuccess, t }) {
  const [duration, setDuration] = useState('24h')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState(null)
  const submit = async () => {
    setSubmitting(true)
    setErr(null)
    try {
      await adminApi.chatBanUser(token, detail.id, duration, reason || null)
      onSuccess()
    } catch (e) {
      setErr(e?.detail || 'error')
      setSubmitting(false)
    }
  }
  return (
    <ModalShell onClose={onClose} title={t('admin_modal_chat_ban_title', { username: detail.username })}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label className="eyebrow" style={{ fontSize: '0.7rem' }}>{t('admin_modal_duration')}</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['1h', '24h', '7d'].map((d) => (
            <button key={d} type="button" className={duration === d ? 'btn-primary' : 'btn-ghost'}
              onClick={() => setDuration(d)}>{t(`admin_duration_${d}`)}</button>
          ))}
        </div>
        <label className="eyebrow" style={{ fontSize: '0.7rem' }}>{t('admin_modal_reason')}</label>
        <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
          style={{ padding: '0.5rem 0.6rem', fontFamily: 'monospace', fontSize: '0.85rem', border: '1px solid var(--rule)', borderRadius: 3 }}
        />
        {err && <p style={{ color: 'var(--rouge)', fontSize: '0.85rem', margin: 0 }}>{String(err)}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-ghost" onClick={onClose}>{t('cancel')}</button>
          <button type="button" className="btn-primary" onClick={submit} disabled={submitting}>
            {submitting ? '…' : t('admin_modal_confirm_chat_ban')}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

function RoleModal({ detail, token, onClose, onSuccess, t }) {
  const [role, setRole] = useState(detail.role)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState(null)
  const submit = async () => {
    setSubmitting(true)
    setErr(null)
    try {
      await adminApi.updateUserRole(token, detail.id, role)
      onSuccess()
    } catch (e) {
      setErr(e?.detail || 'error')
      setSubmitting(false)
    }
  }
  return (
    <ModalShell onClose={onClose} title={t('admin_modal_role_title', { username: detail.username })}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['player', 'moderator', 'admin'].map((r) => (
            <button key={r} type="button" className={role === r ? 'btn-primary' : 'btn-ghost'}
              onClick={() => setRole(r)}>{r}</button>
          ))}
        </div>
        {err && <p style={{ color: 'var(--rouge)', fontSize: '0.85rem', margin: 0 }}>{String(err)}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-ghost" onClick={onClose}>{t('cancel')}</button>
          <button type="button" className="btn-primary" onClick={submit} disabled={submitting || role === detail.role}>
            {submitting ? '…' : t('admin_modal_confirm_role')}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

function DeleteModal({ detail, token, onClose, onSuccess, t }) {
  const [confirmUsername, setConfirmUsername] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState(null)
  const canSubmit = confirmUsername === detail.username
  const submit = async () => {
    setSubmitting(true)
    setErr(null)
    try {
      await adminApi.deleteUser(token, detail.id, confirmUsername, reason)
      onSuccess()
    } catch (e) {
      setErr(e?.detail || 'error')
      setSubmitting(false)
    }
  }
  return (
    <ModalShell onClose={onClose} title={t('admin_modal_delete_title', { username: detail.username })}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p className="serif" style={{ margin: 0, color: 'var(--rouge)', fontWeight: 600 }}>
          ⚠️ {t('admin_modal_delete_warning')}
        </p>
        <label className="eyebrow" style={{ fontSize: '0.7rem' }}>{t('admin_modal_reason')}</label>
        <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder={t('admin_modal_delete_reason_placeholder')}
          style={{ padding: '0.5rem 0.6rem', fontFamily: 'monospace', fontSize: '0.85rem', border: '1px solid var(--rule)', borderRadius: 3 }}
        />
        <p className="serif" style={{ margin: 0 }}>
          {t('admin_modal_delete_confirm_prompt', { username: detail.username })}
        </p>
        <input type="text" value={confirmUsername} onChange={(e) => setConfirmUsername(e.target.value)}
          placeholder={detail.username}
          style={{ padding: '0.5rem 0.6rem', fontFamily: 'monospace', fontSize: '0.85rem', border: '1px solid var(--rule)', borderRadius: 3 }}
        />
        {err && <p style={{ color: 'var(--rouge)', fontSize: '0.85rem', margin: 0 }}>{String(err)}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-ghost" onClick={onClose}>{t('cancel')}</button>
          <button type="button" style={{ background: 'var(--rouge)', color: 'var(--paper)' }} className="btn-primary"
            onClick={submit} disabled={!canSubmit || submitting}>
            {submitting ? '…' : t('admin_modal_confirm_delete')}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
