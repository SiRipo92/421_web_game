import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLang } from '../context/LangContext.jsx'

export function Login({ onLogin, onRegister }) {
  const { t } = useLang()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [tab, setTab] = useState(params.get('tab') === 'register' ? 'register' : 'login')

  return (
    <div style={{
      maxWidth: 1100, margin: '0 auto', padding: '3rem 1.5rem',
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem', alignItems: 'center',
    }} className="auth-grid">

      {/* Left: branding + badge tiers */}
      <div>
        <div className="eyebrow" style={{ marginBottom: 12 }}>{tab === 'register' ? 'Inscription' : 'Connexion'}</div>
        <h1 className="display" style={{ fontSize: 'clamp(2.5rem, 5vw, 3.5rem)', margin: '0 0 1rem', lineHeight: 0.95 }}>
          {tab === 'register'
            ? <><span>Devenez</span><br /><em style={{ color: 'var(--rouge)' }}>habitué</em>.</>
            : <><span>Bonjour,</span><br /><em style={{ color: 'var(--rouge)' }}>cher client</em>.</>}
        </h1>
        <p className="serif" style={{ fontSize: '1.1rem', color: 'var(--ink-soft)', maxWidth: 420, lineHeight: 1.5 }}>
          {tab === 'register'
            ? 'Suivez vos parties, votre Elo, et collectionnez les badges du bistrot. Vos victoires comptent.'
            : 'Reprenez là où vous vous étiez arrêté. Vos parties et votre rang vous attendent.'}
        </p>
        <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: 8, color: 'var(--ink-mute)', fontSize: '0.95rem' }} className="serif">
          <div>🎲 Débutant · 0–800 Elo</div>
          <div>🥉 Amateur · 800–1200</div>
          <div>🥈 Confirmé · 1200–1600</div>
          <div>🥇 Expert · 1600–2000</div>
          <div>👑 Maître · 2000+</div>
        </div>
      </div>

      {/* Right: form */}
      <div className="ticket" style={{ padding: '2.2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div className="display" style={{ fontSize: '1.8rem' }}>
            {tab === 'register' ? t('register') : t('login')}
          </div>
          <div className="divider-fleuron"><span>❦</span></div>
        </div>

        {tab === 'login'
          ? <LoginForm t={t} onLogin={onLogin} onSwitch={() => setTab('register')} onNav={navigate} />
          : <RegisterForm t={t} onRegister={onRegister} onSwitch={() => setTab('login')} onNav={navigate} />}
      </div>

      <style>{`
        @media (max-width: 900px) {
          .auth-grid { grid-template-columns: 1fr !important; gap: 2rem !important; }
        }
      `}</style>
    </div>
  )
}

function LoginForm({ t, onLogin, onSwitch, onNav }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await onLogin(email, password, rememberMe)
      onNav('/')
    } catch (err) {
      setError(t('err_invalid'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
      <div>
        <label className="field-label" htmlFor="login-email">{t('email')}</label>
        <input id="login-email" className="input" type="email" required
          value={email} onChange={e => setEmail(e.target.value)}
          placeholder="marcel@bistrot.fr" autoComplete="email" />
      </div>
      <div>
        <label className="field-label" htmlFor="login-password">{t('password')}</label>
        <input id="login-password" className="input" type="password" required
          value={password} onChange={e => setPassword(e.target.value)}
          placeholder="••••••••" autoComplete="current-password" />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input id="remember-me" type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />
        <label htmlFor="remember-me" className="serif" style={{ fontSize: '0.95rem', cursor: 'pointer' }}>
          {t('remember_me')}
        </label>
      </div>
      {error && <p style={{ color: 'var(--rouge)', fontSize: '0.9rem', margin: 0 }}>{error}</p>}
      <button type="submit" disabled={loading} className="btn btn-primary" style={{ justifyContent: 'center', marginTop: '0.5rem' }}>
        {loading ? '…' : t('login')}
      </button>
      <div style={{ textAlign: 'center' }}>
        <button type="button" className="btn-link" onClick={() => onNav('/forgot-password')} style={{ fontSize: '0.9rem' }}>
          {t('forgot_password')}
        </button>
      </div>
      <div className="hr-orn" style={{ margin: '0.5rem 0' }}>
        <span style={{ fontSize: '0.75rem', fontStyle: 'italic' }}>{t('or')}</span>
      </div>
      <button type="button" onClick={() => onNav('/')} className="btn btn-ghost" style={{ justifyContent: 'center' }}>
        {t('play_guest')}
      </button>
      <p style={{ textAlign: 'center', marginTop: '0.5rem', fontSize: '0.95rem', color: 'var(--ink-mute)' }} className="serif">
        {t('new_to_421')}<button type="button" className="btn-link" onClick={onSwitch}>{t('register')}</button>
      </p>
    </form>
  )
}

function RegisterForm({ t, onRegister, onSwitch, onNav }) {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [birthdate, setBirthdate] = useState('')
  const [emailOptIn, setEmailOptIn] = useState(false)
  const [acceptCgu, setAcceptCgu] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!acceptCgu) { setError(t('err_accept_cgu')); return }
    setLoading(true)
    try {
      await onRegister({ username, email, password, birthdate, email_opt_in: emailOptIn })
      onNav('/')
    } catch (err) {
      const msg = err?.detail || ''
      if (msg.includes('15')) setError(t('err_age_min'))
      else if (msg.includes('taken') || msg.includes('409')) setError(t('err_already_taken'))
      else if (msg.includes('8 char') || msg.includes('password')) setError(t('err_weak_password'))
      else setError(t('err_generic'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
      <div>
        <label className="field-label" htmlFor="reg-username">{t('username')}</label>
        <input id="reg-username" className="input" required minLength={2} maxLength={32}
          value={username} onChange={e => setUsername(e.target.value)}
          placeholder="marcel_dupont" autoComplete="username" />
      </div>
      <div>
        <label className="field-label" htmlFor="reg-email">{t('email')}</label>
        <input id="reg-email" className="input" type="email" required
          value={email} onChange={e => setEmail(e.target.value)}
          placeholder="marcel@bistrot.fr" autoComplete="email" />
      </div>
      <div>
        <label className="field-label" htmlFor="reg-password">{t('password')}</label>
        <input id="reg-password" className="input" type="password" required minLength={8}
          value={password} onChange={e => setPassword(e.target.value)}
          placeholder="••••••••" autoComplete="new-password" />
      </div>
      <div>
        <label className="field-label" htmlFor="reg-birthdate">{t('birthdate')}</label>
        <input id="reg-birthdate" className="input" type="date" required
          value={birthdate} onChange={e => setBirthdate(e.target.value)}
          max={new Date(Date.now() - 15 * 365.25 * 86400000).toISOString().split('T')[0]} />
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <input id="accept-cgu" type="checkbox" required checked={acceptCgu} onChange={e => setAcceptCgu(e.target.checked)}
          style={{ marginTop: 3, flexShrink: 0 }} />
        <label htmlFor="accept-cgu" className="serif" style={{ fontSize: '0.9rem', cursor: 'pointer', lineHeight: 1.4 }}>
          {t('accept_cgu')} <a href="/privacy" style={{ color: 'var(--rouge)' }}>·</a>
        </label>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <input id="accept-emails" type="checkbox" checked={emailOptIn} onChange={e => setEmailOptIn(e.target.checked)}
          style={{ marginTop: 3, flexShrink: 0 }} />
        <label htmlFor="accept-emails" className="serif" style={{ fontSize: '0.9rem', cursor: 'pointer', lineHeight: 1.4 }}>
          {t('accept_emails')}
        </label>
      </div>
      {error && <p style={{ color: 'var(--rouge)', fontSize: '0.9rem', margin: 0 }}>{error}</p>}
      <button type="submit" disabled={loading} className="btn btn-primary" style={{ justifyContent: 'center', marginTop: '0.5rem' }}>
        {loading ? '…' : t('register')}
      </button>
      <div className="hr-orn" style={{ margin: '0.5rem 0' }}>
        <span style={{ fontSize: '0.75rem', fontStyle: 'italic' }}>{t('or')}</span>
      </div>
      <button type="button" onClick={() => onNav('/')} className="btn btn-ghost" style={{ justifyContent: 'center' }}>
        {t('play_guest')}
      </button>
      <p style={{ textAlign: 'center', marginTop: '0.5rem', fontSize: '0.95rem', color: 'var(--ink-mute)' }} className="serif">
        {t('already_account')}<button type="button" className="btn-link" onClick={onSwitch}>{t('login')}</button>
      </p>
    </form>
  )
}
