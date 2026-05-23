import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLang } from '../context/useLang.js'
import { forgotPassword } from '../api/auth.js'

export function ForgotPassword() {
  const { t } = useLang()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await forgotPassword(email)
    } catch {
      // Anti-enumeration: always show success
    } finally {
      setSent(true)
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: '4rem auto', padding: '0 1.5rem' }}>
      <Link to="/login" className="btn-link" style={{ marginBottom: 24, display: 'inline-block' }}>
        ← {t('back_to_login')}
      </Link>
      <div className="eyebrow" style={{ marginBottom: 12 }}>Mot de passe oublié</div>
      <h1 className="display" style={{ fontSize: '2.8rem', margin: '0 0 0.5rem', lineHeight: 0.95 }}>
        Pas de panique,<br /><em style={{ color: 'var(--rouge)' }}>cher client</em>.
      </h1>

      <div className="ticket" style={{ marginTop: '2rem', padding: '2rem' }}>
        {sent ? (
          <p className="serif" style={{ color: 'var(--felt-deep)', fontStyle: 'italic', lineHeight: 1.6 }}>
            {t('reset_sent')}
          </p>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <div>
              <label className="field-label" htmlFor="forgot-email">{t('email')}</label>
              <input
                id="forgot-email"
                className="input"
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="marcel@bistrot.fr"
                autoComplete="email"
              />
            </div>
            <button type="submit" disabled={loading} className="btn btn-primary" style={{ justifyContent: 'center' }}>
              {loading ? '…' : t('send_reset_link')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
