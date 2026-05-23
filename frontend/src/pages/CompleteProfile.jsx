import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLang } from '../context/LangContext.jsx'
import * as authApi from '../api/auth.js'

export function CompleteProfile({ user, token, onRefreshUser }) {
  const { t } = useLang()
  const navigate = useNavigate()
  const [username, setUsername] = useState(user?.username || '')
  const [birthdate, setBirthdate] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Already complete — shouldn't normally reach this page
  if (user?.profile_complete) {
    navigate('/', { replace: true })
    return null
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await authApi.completeProfile(token, username, birthdate)
      await onRefreshUser(token)
      navigate('/')
    } catch (err) {
      const msg = (err?.detail || '').toLowerCase()
      if (err?.status === 409) setError(t('err_already_taken'))
      else if (msg.includes('15') || msg.includes('age')) setError(t('err_age_min'))
      else if (msg.includes('username')) setError(t('err_username_invalid'))
      else setError(t('err_generic'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: '4rem auto', padding: '0 1.5rem' }}>
      <div className="eyebrow" style={{ marginBottom: 10 }}>{t('complete_profile_eyebrow')}</div>
      <h1 className="display" style={{ fontSize: 'clamp(2rem, 5vw, 2.8rem)', margin: '0 0 0.75rem', lineHeight: 1 }}>
        {t('complete_profile_title')}
      </h1>
      <p className="serif" style={{ color: 'var(--ink-soft)', marginBottom: '2rem', lineHeight: 1.5 }}>
        {t('complete_profile_desc')}
      </p>

      <div className="ticket" style={{ padding: '2rem' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          <div>
            <label className="field-label" htmlFor="cp-username">{t('username')}</label>
            <input
              id="cp-username"
              className="input"
              required
              minLength={2}
              maxLength={32}
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="votre_pseudo"
              autoComplete="username"
              autoFocus
            />
          </div>
          <div>
            <label className="field-label" htmlFor="cp-birthdate">{t('birthdate')}</label>
            <p className="serif" style={{ fontSize: '0.8rem', color: 'var(--ink-mute)', margin: '2px 0 4px', fontStyle: 'italic' }}>
              {t('age_notice')}
            </p>
            <input
              id="cp-birthdate"
              className="input"
              type="date"
              required
              value={birthdate}
              onChange={e => setBirthdate(e.target.value)}
              max={new Date(Date.now() - 15 * 365.25 * 86400000).toISOString().split('T')[0]}
            />
          </div>
          {error && <p style={{ color: 'var(--rouge)', fontSize: '0.9rem', margin: 0 }}>{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ justifyContent: 'center', marginTop: '0.5rem' }}
          >
            {loading ? '…' : t('complete_profile_submit')}
          </button>
        </form>
      </div>
    </div>
  )
}
