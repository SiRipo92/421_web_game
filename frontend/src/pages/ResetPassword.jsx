import { useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useLang } from '../context/LangContext.jsx'
import { resetPassword } from '../api/auth.js'

export function ResetPassword() {
  const { t } = useLang()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (password !== confirm) { setError('Les mots de passe ne correspondent pas.'); return }
    if (password.length < 8) { setError(t('err_weak_password')); return }
    setLoading(true)
    try {
      await resetPassword(token, password)
      setDone(true)
      setTimeout(() => navigate('/login'), 2000)
    } catch {
      setError(t('err_reset_invalid'))
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div style={{ maxWidth: 480, margin: '4rem auto', padding: '0 1.5rem', textAlign: 'center' }}>
        <p className="serif" style={{ color: 'var(--rouge)' }}>{t('err_reset_invalid')}</p>
        <Link to="/login" className="btn-link">{t('back_to_login')}</Link>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 480, margin: '4rem auto', padding: '0 1.5rem' }}>
      <Link to="/login" className="btn-link" style={{ marginBottom: 24, display: 'inline-block' }}>
        ← {t('back_to_login')}
      </Link>
      <div className="eyebrow" style={{ marginBottom: 12 }}>Nouveau mot de passe</div>
      <h1 className="display" style={{ fontSize: '2.8rem', margin: '0 0 0.5rem', lineHeight: 0.95 }}>
        Choisissez<br /><em style={{ color: 'var(--rouge)' }}>votre mot de passe</em>.
      </h1>

      <div className="ticket" style={{ marginTop: '2rem', padding: '2rem' }}>
        {done ? (
          <p className="serif" style={{ color: 'var(--felt-deep)', fontStyle: 'italic' }}>
            Mot de passe mis à jour ! Redirection…
          </p>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <div>
              <label className="field-label" htmlFor="new-password">{t('new_password')}</label>
              <input id="new-password" className="input" type="password" required minLength={8}
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" autoComplete="new-password" />
            </div>
            <div>
              <label className="field-label" htmlFor="confirm-password">{t('confirm_password')}</label>
              <input id="confirm-password" className="input" type="password" required minLength={8}
                value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="••••••••" autoComplete="new-password" />
            </div>
            {error && <p style={{ color: 'var(--rouge)', fontSize: '0.9rem', margin: 0 }}>{error}</p>}
            <button type="submit" disabled={loading} className="btn btn-primary" style={{ justifyContent: 'center' }}>
              {loading ? '…' : t('reset_password')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
