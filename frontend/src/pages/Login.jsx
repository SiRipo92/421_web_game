import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { useLang } from '../context/useLang.js'

export function Login({ onLogin, onRegister, onGoogleLogin }) {
  const { t, lang } = useLang()
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
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          {tab === 'register' ? t('login_eyebrow_register') : t('login_eyebrow_login')}
        </div>
        <h1 className="display" style={{ fontSize: 'clamp(2.5rem, 5vw, 3.5rem)', margin: '0 0 1rem', lineHeight: 0.95 }}>
          {tab === 'register'
            ? <>{t('login_h1_register_pre')}<br /><em style={{ color: 'var(--rouge)' }}>{t('login_h1_register_em')}</em>.</>
            : <>{t('login_h1_login_pre')}<br /><em style={{ color: 'var(--rouge)' }}>{t('login_h1_login_em')}</em>.</>}
        </h1>
        <p className="serif" style={{ fontSize: '1.1rem', color: 'var(--ink-soft)', maxWidth: 420, lineHeight: 1.5 }}>
          {tab === 'register' ? t('login_desc_register') : t('login_desc_login')}
        </p>
        <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: 8, color: 'var(--ink-mute)', fontSize: '0.95rem' }} className="serif">
          <div>{t('badge_beginner')}</div>
          <div>{t('badge_amateur')}</div>
          <div>{t('badge_confirmed')}</div>
          <div>{t('badge_expert')}</div>
          <div>{t('badge_master')}</div>
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
          ? <LoginForm t={t} lang={lang} onLogin={onLogin} onGoogleLogin={onGoogleLogin} onSwitch={() => setTab('register')} onNav={navigate} />
          : <RegisterForm t={t} lang={lang} onRegister={onRegister} onGoogleLogin={onGoogleLogin} onSwitch={() => setTab('login')} onNav={navigate} />}
      </div>

      <style>{`
        @media (max-width: 900px) {
          .auth-grid { grid-template-columns: 1fr !important; gap: 2rem !important; }
        }
      `}</style>
    </div>
  )
}

function LoginForm({ t, lang, onLogin, onGoogleLogin, onSwitch, onNav }) {
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
      if (err?.status === 429) setError(t('err_rate_limit'))
      else setError(t('err_invalid'))
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSuccess = async (credentialResponse) => {
    setError('')
    try {
      const result = await onGoogleLogin?.(credentialResponse.credential)
      onNav(result?.is_new ? '/complete-profile' : '/')
    } catch {
      setError(t('err_sso_google'))
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
      <SsoButtons t={t} lang={lang} onGoogleSuccess={handleGoogleSuccess} mode="signin_with" />
      <button type="button" onClick={() => onNav('/')} className="btn btn-ghost" style={{ justifyContent: 'center' }}>
        {t('play_guest')}
      </button>
      <p style={{ textAlign: 'center', marginTop: '0.5rem', fontSize: '0.95rem', color: 'var(--ink-mute)' }} className="serif">
        {t('new_to_421')}<button type="button" className="btn-link" onClick={onSwitch}>{t('register')}</button>
      </p>
    </form>
  )
}

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

const MIN_AGE_YEARS = 15
const minBirthdate = () => new Date(Date.now() - MIN_AGE_YEARS * 365.25 * 86400000).toISOString().split('T')[0]

function pwdChecks(pwd) {
  return {
    length: pwd.length >= 8,
    upper: /[A-Z]/.test(pwd),
    special: /[\d\W]/.test(pwd),
    maxlen: new TextEncoder().encode(pwd).length <= 72,
  }
}

function SsoButtons({ t, lang, onGoogleSuccess, mode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <GoogleLogin
        onSuccess={onGoogleSuccess}
        onError={() => {}}
        useOneTap={false}
        shape="rectangular"
        theme="outline"
        text={mode}
        locale={lang}
      />
      <button type="button" disabled style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: '0.5rem 1rem', border: '1px solid var(--rule)', borderRadius: 4,
        background: 'var(--paper-soft)', color: 'var(--ink-fade)', cursor: 'not-allowed',
        fontSize: '0.9rem', fontFamily: 'var(--body)',
      }}>
        {t('sso_apple')}
      </button>
      <p className="serif" style={{ fontSize: '0.75rem', color: 'var(--ink-fade)', textAlign: 'center', margin: 0 }}>
        {t('sso_consent_pre')}{' '}
        <Link to="/terms" style={{ color: 'var(--ink-mute)' }}>{t('accept_terms_link')}</Link>
      </p>
    </div>
  )
}

function RegisterForm({ t, lang, onRegister, onGoogleLogin, onSwitch, onNav }) {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [birthdate, setBirthdate] = useState('')
  const [emailOptIn, setEmailOptIn] = useState(false)
  const [acceptCgu, setAcceptCgu] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [pwdTouched, setPwdTouched] = useState(false)
  const [emailError, setEmailError] = useState('')

  const checks = pwdChecks(password)
  const pwdValid = checks.length && checks.upper && checks.special && checks.maxlen
  const maxBirthdate = useMemo(() => minBirthdate(), [])

  const validateEmailFormat = (v) => {
    if (v && !EMAIL_RE.test(v)) { setEmailError(t('err_email_format')); return false }
    setEmailError(''); return true
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!validateEmailFormat(email)) return
    if (!acceptCgu) { setError(t('err_accept_cgu')); return }
    if (!pwdValid) { setError(t('err_weak_password')); return }
    setLoading(true)
    try {
      await onRegister({ username, email, password, birthdate, email_opt_in: emailOptIn })
      onNav('/')
    } catch (err) {
      const msg = (err?.detail || '').toLowerCase()
      if (err?.status === 429) setError(t('err_rate_limit'))
      else if (msg.includes('15') || msg.includes('age')) setError(t('err_age_min'))
      else if (msg.includes('taken') || err?.status === 409) setError(t('err_already_taken'))
      else if (msg.includes('disposable')) setError(t('err_disposable_email'))
      else if (msg.includes('domain') || msg.includes('not valid') || msg.includes('deliverable')) setError(t('err_email_domain'))
      else if (msg.includes('email')) setError(t('err_email_format'))
      else if (msg.includes('uppercase')) setError(t('err_pwd_uppercase'))
      else if (msg.includes('number') || msg.includes('special')) setError(t('err_pwd_special'))
      else if (msg.includes('72') || msg.includes('bcrypt')) setError(t('err_pwd_too_long'))
      else if (msg.includes('8 char') || msg.includes('password') || msg.includes('weak')) setError(t('err_weak_password'))
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
          value={email}
          onChange={e => { setEmail(e.target.value); if (emailError) validateEmailFormat(e.target.value) }}
          onBlur={e => validateEmailFormat(e.target.value)}
          placeholder="marcel@bistrot.fr" autoComplete="email" />
        {emailError && <p style={{ color: 'var(--rouge)', fontSize: '0.8rem', margin: '4px 0 0' }}>{emailError}</p>}
      </div>
      <div>
        <label className="field-label" htmlFor="reg-password">{t('password')}</label>
        <input id="reg-password" className="input" type="password" required
          value={password}
          onChange={e => { setPassword(e.target.value); setPwdTouched(true) }}
          onBlur={() => setPwdTouched(true)}
          placeholder="••••••••" autoComplete="new-password" />
        {pwdTouched && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
            {[
              { key: 'length', label: t('pwd_req_length') },
              { key: 'upper',  label: t('pwd_req_upper') },
              { key: 'special', label: t('pwd_req_special') },
              { key: 'maxlen', label: t('pwd_req_maxlen') },
            ].map(r => (
              <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}>
                <span style={{ color: checks[r.key] ? 'var(--felt-deep)' : 'var(--ink-fade)', fontWeight: 700, lineHeight: 1 }}>
                  {checks[r.key] ? '✓' : '○'}
                </span>
                <span style={{ color: checks[r.key] ? 'var(--ink-soft)' : 'var(--ink-fade)' }} className="serif">
                  {r.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <label className="field-label" htmlFor="reg-birthdate">{t('birthdate')}</label>
        <p className="serif" style={{ fontSize: '0.8rem', color: 'var(--ink-mute)', margin: '2px 0 4px', fontStyle: 'italic' }}>
          {t('age_notice')}
        </p>
        <input id="reg-birthdate" className="input" type="date" required
          value={birthdate} onChange={e => setBirthdate(e.target.value)}
          max={maxBirthdate} />
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <input id="accept-cgu" type="checkbox" required checked={acceptCgu} onChange={e => setAcceptCgu(e.target.checked)}
          style={{ marginTop: 3, flexShrink: 0 }} />
        <label htmlFor="accept-cgu" className="serif" style={{ fontSize: '0.9rem', cursor: 'pointer', lineHeight: 1.4 }}>
          {t('accept_terms_pre')}{' '}
          <Link to="/terms" target="_blank" style={{ color: 'var(--rouge)' }}>{t('accept_terms_link')}</Link>
          {' '}<span style={{ color: 'var(--rouge)' }}>*</span>
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
      <SsoButtons t={t} lang={lang} onGoogleSuccess={async (credentialResponse) => {
        setError('')
        try {
          const result = await onGoogleLogin?.(credentialResponse.credential)
          onNav(result?.is_new ? '/complete-profile' : '/')
        } catch {
          setError(t('err_sso_google'))
        }
      }} mode="signup_with" />
      <button type="button" onClick={() => onNav('/')} className="btn btn-ghost" style={{ justifyContent: 'center' }}>
        {t('play_guest')}
      </button>
      <p style={{ textAlign: 'center', marginTop: '0.5rem', fontSize: '0.95rem', color: 'var(--ink-mute)' }} className="serif">
        {t('already_account')}<button type="button" className="btn-link" onClick={onSwitch}>{t('login')}</button>
      </p>
    </form>
  )
}
