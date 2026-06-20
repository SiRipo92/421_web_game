import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useLang } from '../context/useLang.js'
import * as adminApi from '../api/admin.js'

export function AdminRoomDetail({ user, token }) {
  const { t } = useLang()
  const { gameId } = useParams()
  const navigate = useNavigate()
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modal, setModal] = useState(null) // 'broadcast' | 'kick' | 'dissolve' | null
  const [kickTarget, setKickTarget] = useState(null) // player object
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    if (!token || !user || (user.role !== 'admin' && user.role !== 'moderator')) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    adminApi
      .getRoomDetail(token, gameId)
      .then((d) => { if (!cancelled) setDetail(d) })
      .catch((e) => { if (!cancelled) setError(e?.detail || 'error') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token, user, gameId, refresh])

  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin' && user.role !== 'moderator') return <Navigate to="/profile" replace />

  const reload = () => setRefresh((n) => n + 1)
  const isAdmin = user.role === 'admin'

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2.5rem 1.5rem' }}>
      <div style={{ marginBottom: 16 }}>
        <Link to="/admin/rooms" className="btn-link">← {t('admin_back_to_rooms')}</Link>
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
              <div className="eyebrow">{t('admin_room_card')}</div>
              <h1 className="display mono" style={{ fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', margin: '0.3rem 0 0' }}>
                {detail.game_id}
              </h1>
              <div className="mono" style={{ color: 'var(--ink-mute)', fontSize: '0.85rem', marginTop: 4 }}>
                {t('admin_rooms_col_phase')}: <strong>{t(`admin_rooms_phase_${detail.phase}`) || detail.phase}</strong>
                {' · '}{t('admin_rooms_col_partie')} #{detail.partie_number}
                {' · '}{t('admin_rooms_col_visibility')}: {detail.is_public ? t('admin_rooms_public') : t('admin_rooms_private')}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Link to={`/game/${detail.game_id}?role=spectator`} className="btn-ghost"
                target="_blank" rel="noreferrer">
                {t('admin_room_spectate')} ↗
              </Link>
              <button type="button" className="btn-ghost" onClick={() => setModal('broadcast')}>
                {t('admin_room_broadcast')}
              </button>
              {isAdmin && (
                <button type="button" style={{ color: 'var(--rouge)' }} className="btn-ghost"
                  onClick={() => setModal('dissolve')}>
                  {t('admin_room_dissolve')}
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.2rem' }} className="prof-grid">
            {/* Player roster */}
            <div className="card" style={{ padding: '1.2rem' }}>
              <div className="eyebrow" style={{ marginBottom: 12 }}>{t('admin_room_players')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {detail.players.map((p) => (
                  <div key={p.id} style={{
                    display: 'grid', gridTemplateColumns: 'auto 1fr auto auto auto',
                    gap: 10, alignItems: 'center',
                    padding: '0.5rem 0.7rem',
                    background: p.is_host ? 'rgba(168,48,42,0.05)' : 'var(--paper-deep)',
                    borderRadius: 4,
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: p.connected ? 'var(--felt-deep)' : 'var(--ink-fade)' }} />
                    <div className="serif" style={{ fontWeight: 600 }}>
                      {p.name}
                      {p.is_host && (
                        <span className="eyebrow" style={{ fontSize: '0.55rem', marginLeft: 8, color: 'var(--rouge)' }}>
                          {t('admin_room_is_host')}
                        </span>
                      )}
                    </div>
                    <div className="mono" style={{ fontSize: '0.75rem', color: 'var(--ink-mute)' }}>
                      {p.tokens}🪙
                    </div>
                    <div className="mono" style={{ fontSize: '0.75rem', color: 'var(--ink-mute)' }}>
                      {p.round_points}pts
                    </div>
                    <button type="button" className="btn-link"
                      style={{ fontSize: '0.75rem', color: 'var(--rouge)' }}
                      onClick={() => { setKickTarget(p); setModal('kick') }}>
                      {t('admin_room_kick_btn')}
                    </button>
                  </div>
                ))}
              </div>
              <div className="mono" style={{ fontSize: '0.75rem', color: 'var(--ink-mute)', marginTop: 12 }}>
                {t('admin_room_meta', {
                  bank: detail.bank_rule,
                  rpToLose: detail.round_points_to_lose,
                  afk: detail.afk_seconds,
                  specs: detail.spectator_count,
                  rnd: detail.round_num,
                  pool: detail.pool,
                })}
              </div>
            </div>

            {/* Recent journal */}
            <div className="card" style={{ padding: '1.2rem' }}>
              <div className="eyebrow" style={{ marginBottom: 12 }}>{t('admin_room_journal')}</div>
              {detail.recent_log.length === 0 ? (
                <p className="note">{t('admin_room_journal_empty')}</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 380, overflowY: 'auto' }}>
                  {detail.recent_log.map((e, i) => (
                    <div key={i} className="serif" style={{ fontSize: '0.82rem', color: 'var(--ink-soft)' }}>
                      {e.text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {modal === 'broadcast' && (
            <BroadcastModal detail={detail} token={token}
              onClose={() => setModal(null)}
              onSuccess={() => { setModal(null); reload() }} t={t} />
          )}
          {modal === 'kick' && kickTarget && (
            <KickModal detail={detail} target={kickTarget} token={token}
              onClose={() => { setModal(null); setKickTarget(null) }}
              onSuccess={() => { setModal(null); setKickTarget(null); reload() }} t={t} />
          )}
          {modal === 'dissolve' && (
            <DissolveModal detail={detail} token={token}
              onClose={() => setModal(null)}
              onSuccess={() => navigate('/admin/rooms')} t={t} />
          )}
        </>
      )}
    </div>
  )
}

function ModalShell({ onClose, title, children }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, zIndex: 100,
    }}>
      <div onClick={(e) => e.stopPropagation()} className="card"
        style={{ maxWidth: 540, width: '100%', padding: '1.5rem', background: 'var(--paper)' }}>
        <h2 className="display" style={{ fontSize: '1.4rem', margin: '0 0 1rem' }}>{title}</h2>
        {children}
      </div>
    </div>
  )
}

function BroadcastModal({ detail, token, onClose, onSuccess, t }) {
  const [messageFr, setMessageFr] = useState('')
  const [messageEn, setMessageEn] = useState('')
  const [severity, setSeverity] = useState('info')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState(null)
  const canSubmit = messageFr.trim() !== '' && messageEn.trim() !== ''
  const submit = async () => {
    setSubmitting(true)
    setErr(null)
    try {
      await adminApi.broadcastToRoom(token, detail.game_id, {
        message_fr: messageFr, message_en: messageEn, severity,
      })
      onSuccess()
    } catch (e) {
      setErr(e?.detail || 'error')
      setSubmitting(false)
    }
  }
  return (
    <ModalShell onClose={onClose} title={t('admin_modal_broadcast_title', { code: detail.game_id })}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p className="serif" style={{ margin: 0, color: 'var(--ink-soft)', fontSize: '0.9rem' }}>
          {t('admin_modal_broadcast_blurb')}
        </p>
        <label className="eyebrow" style={{ fontSize: '0.7rem' }}>{t('admin_modal_broadcast_fr')}</label>
        <textarea value={messageFr} onChange={(e) => setMessageFr(e.target.value)} rows={2} maxLength={500}
          style={{ padding: '0.5rem 0.6rem', fontFamily: 'var(--body)', fontSize: '0.9rem', border: '1px solid var(--rule)', borderRadius: 3, resize: 'vertical' }} />
        <label className="eyebrow" style={{ fontSize: '0.7rem' }}>{t('admin_modal_broadcast_en')}</label>
        <textarea value={messageEn} onChange={(e) => setMessageEn(e.target.value)} rows={2} maxLength={500}
          style={{ padding: '0.5rem 0.6rem', fontFamily: 'var(--body)', fontSize: '0.9rem', border: '1px solid var(--rule)', borderRadius: 3, resize: 'vertical' }} />
        <label className="eyebrow" style={{ fontSize: '0.7rem' }}>{t('admin_modal_broadcast_severity')}</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {['info', 'warning', 'critical'].map((s) => (
            <button key={s} type="button"
              className={severity === s ? 'btn-primary' : 'btn-ghost'}
              onClick={() => setSeverity(s)}>
              {t(`admin_modal_broadcast_sev_${s}`)}
            </button>
          ))}
        </div>
        {err && <p style={{ color: 'var(--rouge)', fontSize: '0.85rem', margin: 0 }}>{String(err)}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-ghost" onClick={onClose}>{t('cancel')}</button>
          <button type="button" className="btn-primary" onClick={submit} disabled={!canSubmit || submitting}>
            {submitting ? '…' : t('admin_modal_broadcast_send')}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

function KickModal({ detail, target, token, onClose, onSuccess, t }) {
  const [reason, setReason] = useState('')
  const [chatBanHours, setChatBanHours] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState(null)
  const submit = async () => {
    setSubmitting(true)
    setErr(null)
    try {
      await adminApi.adminKickPlayer(token, detail.game_id, {
        player_id: target.id, reason: reason || 'admin_action', chat_ban_hours: chatBanHours,
      })
      onSuccess()
    } catch (e) {
      setErr(e?.detail || 'error')
      setSubmitting(false)
    }
  }
  return (
    <ModalShell onClose={onClose} title={t('admin_modal_kick_title', { name: target.name })}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p className="serif" style={{ margin: 0, color: 'var(--ink-soft)', fontSize: '0.9rem' }}>
          {t('admin_modal_kick_blurb')}
        </p>
        <label className="eyebrow" style={{ fontSize: '0.7rem' }}>{t('admin_modal_reason')}</label>
        <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder={t('admin_modal_kick_reason_placeholder')}
          style={{ padding: '0.5rem 0.6rem', fontFamily: 'monospace', fontSize: '0.85rem', border: '1px solid var(--rule)', borderRadius: 3 }} />
        <label className="eyebrow" style={{ fontSize: '0.7rem' }}>{t('admin_modal_kick_chat_ban')}</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {[1, 6, 24].map((h) => (
            <button key={h} type="button"
              className={chatBanHours === h ? 'btn-primary' : 'btn-ghost'}
              onClick={() => setChatBanHours(h)}>
              {h === 1 ? '1h' : h === 6 ? '6h' : '24h'}
            </button>
          ))}
        </div>
        {err && <p style={{ color: 'var(--rouge)', fontSize: '0.85rem', margin: 0 }}>{String(err)}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-ghost" onClick={onClose}>{t('cancel')}</button>
          <button type="button" className="btn-primary" style={{ background: 'var(--rouge)', color: 'var(--paper)' }}
            onClick={submit} disabled={submitting}>
            {submitting ? '…' : t('admin_modal_confirm_kick')}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

function DissolveModal({ detail, token, onClose, onSuccess, t }) {
  const [confirmCode, setConfirmCode] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState(null)
  const canSubmit = confirmCode === detail.game_id && reason.trim() !== ''
  const submit = async () => {
    setSubmitting(true)
    setErr(null)
    try {
      await adminApi.dissolveRoom(token, detail.game_id, reason)
      onSuccess()
    } catch (e) {
      setErr(e?.detail || 'error')
      setSubmitting(false)
    }
  }
  return (
    <ModalShell onClose={onClose} title={t('admin_modal_dissolve_title', { code: detail.game_id })}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p className="serif" style={{ margin: 0, color: 'var(--rouge)', fontWeight: 600 }}>
          ⚠ {t('admin_modal_dissolve_warning')}
        </p>
        <label className="eyebrow" style={{ fontSize: '0.7rem' }}>{t('admin_modal_dissolve_reason')}</label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500}
          placeholder={t('admin_modal_dissolve_reason_placeholder')}
          style={{ padding: '0.5rem 0.6rem', fontFamily: 'var(--body)', fontSize: '0.9rem', border: '1px solid var(--rule)', borderRadius: 3, resize: 'vertical' }} />
        <p className="serif" style={{ margin: 0 }}>
          {t('admin_modal_dissolve_confirm_prompt', { code: detail.game_id })}
        </p>
        <input type="text" value={confirmCode} onChange={(e) => setConfirmCode(e.target.value)}
          placeholder={detail.game_id}
          style={{ padding: '0.5rem 0.6rem', fontFamily: 'monospace', fontSize: '0.9rem', border: '1px solid var(--rule)', borderRadius: 3 }} />
        {err && <p style={{ color: 'var(--rouge)', fontSize: '0.85rem', margin: 0 }}>{String(err)}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-ghost" onClick={onClose}>{t('cancel')}</button>
          <button type="button" style={{ background: 'var(--rouge)', color: 'var(--paper)' }} className="btn-primary"
            onClick={submit} disabled={!canSubmit || submitting}>
            {submitting ? '…' : t('admin_modal_confirm_dissolve')}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
