import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '../components/shared/Avatar.jsx'
import { useLang } from '../context/useLang.js'
import { badge } from '../utils/badge.js'
import { useRef } from 'react'
import * as authApi from '../api/auth.js'

export function Profile({ user, token, onRefreshUser, onLogout }) {
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
  const survivalPct = Math.round((stats?.survival_rate ?? 0) * 100)
  const mancheResiliencePct = Math.round((stats?.manche_resilience ?? 0) * 100)

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2.5rem 1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 24, alignItems: 'center', marginBottom: '2.5rem' }}
        className="prof-hd">
        <Avatar name={user.username} userId={user.id} hasAvatar={user.has_avatar} avatarVersion={user._ver ?? 0} size={6} />
        <div>
          <div className="eyebrow">{t('player_card')}</div>
          <h1 className="display" style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', margin: '0.3rem 0 0.4rem' }}>{user.username}</h1>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="mono" style={{ color: 'var(--ink-mute)' }}>@{user.username}</span>
            {(user.role === 'admin' || user.role === 'moderator') && (
              <>
                <span
                  className="eyebrow"
                  style={{
                    padding: '0.2rem 0.55rem',
                    background: 'var(--rouge)',
                    color: 'var(--paper)',
                    borderRadius: 3,
                    fontSize: '0.6rem',
                    letterSpacing: '0.18em',
                  }}
                  aria-label={t(user.role === 'admin' ? 'role_badge_admin_aria' : 'role_badge_moderator_aria')}
                >
                  {user.role === 'admin' ? t('role_badge_admin') : t('role_badge_moderator')}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ padding: '0.3rem 0.7rem', fontSize: '0.78rem' }}
                  onClick={() => navigate('/admin')}
                >
                  🛡 {t('admin_dashboard_link')}
                </button>
              </>
            )}
          </div>
        </div>
        <div className="ticket" style={{ textAlign: 'center', padding: '1rem 1.4rem', minWidth: 180 }}>
          <div className="eyebrow" style={{ fontSize: '0.6rem' }}>{t('current_elo')}</div>
          <div className="display" style={{ fontSize: '2.6rem', color: 'var(--rouge)', lineHeight: 1 }}>{elo}</div>
          <div className="serif" style={{ fontStyle: 'italic', marginTop: 4 }}>{badge(elo)}</div>
        </div>
      </div>

      {loading ? (
        <p className="serif" style={{ fontStyle: 'italic', color: 'var(--ink-mute)' }}>{t('loading')}</p>
      ) : (
        <>
          {/* G91: parties + survival rate + streak (4 cards) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: '1rem' }}
            className="stats-grid">
            <StatCard label={t('parties_played')} value={stats?.games_played ?? 0} />
            <StatCard label={t('parties_survived')} value={stats?.parties_survived ?? 0} accent="var(--felt-deep)" />
            <StatCard label={t('parties_lost')} value={stats?.parties_lost ?? 0} accent="var(--rouge)" />
            <StatCard label={t('survival_rate')} value={`${survivalPct}%`} accent="var(--rouge)" />
          </div>

          {/* G91: manche resilience + streaks (3 cards) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: '2rem' }}
            className="stats-grid">
            <StatCard label={t('manche_resilience')} value={`${mancheResiliencePct}%`} />
            <StatCard label={t('current_streak')} value={stats?.current_streak ?? 0} suffix="🔥" />
            <StatCard label={t('longest_streak')} value={stats?.longest_streak ?? 0} />
          </div>

          {/* Recent parties */}
          <div className="card" style={{ padding: '1.6rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <div>
                <div className="eyebrow">{t('recent_games_eyebrow')}</div>
                <div className="display" style={{ fontSize: '1.4rem' }}>{t('recent_games')}</div>
              </div>
            </div>
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column' }}>
              {stats?.recent_games?.length > 0 ? stats.recent_games.map((r, i) => {
                const isLoser = r.placement === r.total_players
                return (
                  <div key={i} style={{
                    display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: 12, alignItems: 'center',
                    padding: '0.7rem 0',
                    borderBottom: i < stats.recent_games.length - 1 ? '1px dashed var(--rule)' : 'none',
                  }}>
                    <div className="mono" style={{ fontSize: '0.8rem', color: 'var(--ink-mute)', width: 60 }}>
                      {new Date(r.played_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                    </div>
                    <div className="serif" style={{ color: isLoser ? 'var(--rouge)' : 'var(--ink)' }}>
                      {isLoser ? t('partie_lost_label') : t('partie_survived_label')}
                    </div>
                    <div className="mono" style={{ fontSize: '0.85rem', color: 'var(--ink-mute)' }}>
                      {t('placement_x_of_n', { x: r.placement, n: r.total_players })}
                    </div>
                    <div className="mono" style={{ fontSize: '0.85rem', color: 'var(--ink-mute)' }}>
                      {r.total_rounds} {t('rounds_short')}
                    </div>
                  </div>
                )
              }) : <p className="note">{t('no_parties_yet')}</p>}
            </div>
          </div>

          {/* Edit profile */}
          <EditProfileCard user={user} token={token} onRefreshUser={onRefreshUser} t={t} />

          {/* GDPR */}
          <GdprCard token={token} t={t} onLogout={onLogout} navigate={navigate} />
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

function EditProfileCard({ user, token, onRefreshUser, t }) {
  const { setLang } = useLang()
  const [username, setUsername] = useState(user?.username || '')
  const [langPref, setLangPref] = useState(user?.lang_pref || 'fr')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  // Avatar state
  const [avatarVersion, setAvatarVersion] = useState(0)
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const [hasAvatar, setHasAvatar] = useState(user?.has_avatar ?? false)
  const fileRef = useRef()

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setAvatarError(t('err_avatar_too_large')); return }
    setAvatarError('')
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const handleAvatarUpload = async () => {
    if (!avatarFile) return
    setAvatarUploading(true)
    setAvatarError('')
    try {
      await authApi.uploadAvatar(token, avatarFile)
      setHasAvatar(true)
      setAvatarVersion(v => v + 1)
      setAvatarPreview(null)
      setAvatarFile(null)
      if (fileRef.current) fileRef.current.value = ''
      await onRefreshUser?.(token)
    } catch (err) {
      if (err?.detail?.includes('inappropriate')) setAvatarError(t('err_avatar_inappropriate'))
      else if (err?.status === 415) setAvatarError(t('err_avatar_type'))
      else if (err?.status === 413) setAvatarError(t('err_avatar_too_large'))
      else if (err?.status === 429) setAvatarError(t('err_rate_limit'))
      else setAvatarError(t('err_generic'))
    } finally {
      setAvatarUploading(false)
    }
  }

  const handleAvatarRemove = async () => {
    setAvatarUploading(true)
    setAvatarError('')
    try {
      await authApi.deleteAvatar(token)
      setHasAvatar(false)
      setAvatarVersion(v => v + 1)
      await onRefreshUser?.(token)
    } catch {
      setAvatarError(t('err_generic'))
    } finally {
      setAvatarUploading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSaved(false)
    setSaving(true)
    try {
      await authApi.updateMe(token, { username, lang_pref: langPref })
      // Sync the site language with the saved preference so the UI flips immediately.
      setLang(langPref)
      await onRefreshUser?.(token)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      if (err?.status === 409) setError(t('err_already_taken'))
      else setError(t('err_generic'))
    } finally {
      setSaving(false)
    }
  }

  const avatarSrc = hasAvatar ? `/auth/avatar/${user?.id}?v=${avatarVersion}` : null

  return (
    <div className="card" style={{ padding: '1.6rem', marginTop: '1.5rem' }}>
      <div className="eyebrow" style={{ marginBottom: 12 }}>{t('profile_edit_title')}</div>

      {/* Avatar section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
          background: 'var(--felt-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '2rem', color: 'var(--paper)', fontFamily: 'var(--display)', fontWeight: 700,
        }}>
          {avatarPreview || avatarSrc
            ? <img src={avatarPreview || avatarSrc} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : (user?.username?.[0] || '?').toUpperCase()}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost" style={{ fontSize: '0.85rem' }}
              onClick={() => fileRef.current?.click()} disabled={avatarUploading}>
              {t('avatar_choose')}
            </button>
            {avatarFile && (
              <button type="button" className="btn btn-primary" style={{ fontSize: '0.85rem' }}
                onClick={handleAvatarUpload} disabled={avatarUploading}>
                {avatarUploading ? '…' : t('avatar_upload')}
              </button>
            )}
            {hasAvatar && !avatarFile && (
              <button type="button" className="btn" style={{ fontSize: '0.85rem', color: 'var(--rouge)', background: 'none', border: '1px solid var(--rouge)' }}
                onClick={handleAvatarRemove} disabled={avatarUploading}>
                {t('avatar_remove')}
              </button>
            )}
          </div>
          {avatarError && <p style={{ color: 'var(--rouge)', fontSize: '0.82rem', margin: 0 }}>{avatarError}</p>}
          <p className="serif" style={{ fontSize: '0.78rem', color: 'var(--ink-fade)', margin: 0 }}>
            {t('avatar_hint')}
          </p>
        </div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif"
          style={{ display: 'none' }} onChange={handleFileChange} />
      </div>

      <div style={{ borderTop: '1px solid var(--rule)', paddingTop: '1.25rem' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }} className="edit-row">
            <div>
              <label className="field-label" htmlFor="edit-username">{t('username')}</label>
              <input id="edit-username" className="input" required minLength={2} maxLength={32}
                value={username} onChange={e => setUsername(e.target.value)} />
            </div>
            <div>
              <label className="field-label" htmlFor="edit-lang">{t('profile_lang_label')}</label>
              <select id="edit-lang" className="input" value={langPref} onChange={e => setLangPref(e.target.value)}>
                <option value="fr">{t('profile_lang_fr')}</option>
                <option value="en">{t('profile_lang_en')}</option>
              </select>
            </div>
          </div>
          {error && <p style={{ color: 'var(--rouge)', fontSize: '0.9rem', margin: 0 }}>{error}</p>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button type="submit" disabled={saving} className="btn btn-primary">
              {saving ? '…' : t('profile_save')}
            </button>
            {saved && <span className="serif" style={{ color: 'var(--felt-deep)', fontStyle: 'italic' }}>{t('profile_saved')}</span>}
          </div>
        </form>
      </div>
      <style>{`@media (max-width: 600px) { .edit-row { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  )
}

function GdprCard({ token, t, onLogout, navigate }) {
  const [exporting, setExporting] = useState(false)
  const [deleteInput, setDeleteInput] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const handleExport = async () => {
    setExporting(true)
    try {
      const data = await authApi.exportData(token)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = '421-mes-donnees.json'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // silently fail — user can retry
    } finally {
      setExporting(false)
    }
  }

  const handleDelete = async (e) => {
    e.preventDefault()
    setDeleteError('')
    if (deleteInput !== 'DELETE') { setDeleteError(t('err_delete_confirm')); return }
    setDeleting(true)
    try {
      await authApi.deleteAccount(token)
      onLogout?.()
      navigate('/')
    } catch {
      setDeleteError(t('err_generic'))
      setDeleting(false)
    }
  }

  return (
    <div style={{ marginTop: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }} className="gdpr-grid">
      {/* Export */}
      <div className="card" style={{ padding: '1.6rem' }}>
        <div className="eyebrow" style={{ marginBottom: 4 }}>{t('profile_data_title')}</div>
        <p className="serif" style={{ fontSize: '0.9rem', color: 'var(--ink-soft)', margin: '0.5rem 0 1rem', lineHeight: 1.5 }}>
          {t('profile_data_desc')}
        </p>
        <button type="button" className="btn btn-ghost" disabled={exporting} onClick={handleExport}>
          {exporting ? '…' : t('profile_export_btn')}
        </button>
      </div>

      {/* Delete */}
      <div className="card" style={{ padding: '1.6rem', borderColor: 'var(--rouge)', borderWidth: 1 }}>
        <div className="eyebrow" style={{ marginBottom: 4, color: 'var(--rouge)' }}>{t('profile_delete_title')}</div>
        <p className="serif" style={{ fontSize: '0.9rem', color: 'var(--ink-soft)', margin: '0.5rem 0 1rem', lineHeight: 1.5 }}>
          {t('profile_delete_desc')}
        </p>
        <form onSubmit={handleDelete} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <label className="field-label" htmlFor="delete-confirm" style={{ color: 'var(--rouge)' }}>
              {t('profile_delete_confirm_label')}
            </label>
            <input
              id="delete-confirm"
              className="input"
              value={deleteInput}
              onChange={e => setDeleteInput(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
            />
          </div>
          {deleteError && <p style={{ color: 'var(--rouge)', fontSize: '0.9rem', margin: 0 }}>{deleteError}</p>}
          <button
            type="submit"
            disabled={deleting || deleteInput !== 'DELETE'}
            className="btn"
            style={{
              background: 'var(--rouge)', color: 'var(--paper)',
              opacity: deleteInput !== 'DELETE' ? 0.4 : 1,
              justifyContent: 'center',
            }}
          >
            {deleting ? '…' : t('profile_delete_confirm_btn')}
          </button>
        </form>
      </div>

      <style>{`@media (max-width: 700px) { .gdpr-grid { grid-template-columns: 1fr !important; } }`}</style>
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
