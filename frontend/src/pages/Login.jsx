import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { useLang } from '../context/useLang.js'
import { FormField } from '../components/shared/FormField.jsx'
import { PasswordChecklist } from '../components/shared/PasswordChecklist.jsx'
import { PasswordInput } from '../components/shared/PasswordInput.jsx'
import { isPwdValid } from '../utils/pwdChecks.js'

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
  // G97: per-field error state replaces the single form-level error.
  // generalError remains for "rate-limited" / "invalid credentials" — those
  // aren't field-attributable. Field errors highlight the offending input.
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [generalError, setGeneralError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setEmailError(''); setPasswordError(''); setGeneralError('')
    setLoading(true)
    try {
      await onLogin(email, password, rememberMe)
      onNav('/')
    } catch (err) {
      if (err?.status === 429) setGeneralError(t('err_rate_limit'))
      else {
        // Invalid creds — we can't tell which field is wrong (intentional,
        // for security), so highlight both with a generic prompt under each.
        setEmailError(t('err_invalid_credentials'))
        setPasswordError(t('err_invalid_credentials'))
      }
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSuccess = async (credentialResponse) => {
    setGeneralError('')
    try {
      const result = await onGoogleLogin?.(credentialResponse.credential)
      onNav(result?.is_new ? '/complete-profile' : '/')
    } catch {
      setGeneralError(t('err_sso_google'))
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
      <FormField label={t('email')} htmlFor="login-email" required error={emailError}>
        <input id="login-email" className="input" type="email" required
          value={email} onChange={e => { setEmail(e.target.value); if (emailError) setEmailError('') }}
          placeholder="marcel@bistrot.fr" autoComplete="email"
          aria-invalid={emailError ? 'true' : 'false'}
          style={{ borderColor: emailError ? 'var(--rouge)' : undefined, boxShadow: emailError ? '0 0 0 2px rgba(168,48,42,0.18)' : undefined }} />
      </FormField>
      <FormField label={t('password')} htmlFor="login-password" required error={passwordError}>
        <PasswordInput id="login-password" value={password}
          onChange={e => { setPassword(e.target.value); if (passwordError) setPasswordError('') }}
          autoComplete="current-password" placeholder="••••••••" required invalid={Boolean(passwordError)} t={t} />
      </FormField>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input id="remember-me" type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />
        <label htmlFor="remember-me" className="serif" style={{ fontSize: '0.95rem', cursor: 'pointer' }}>
          {t('remember_me')}
        </label>
      </div>
      {generalError && <p style={{ color: 'var(--rouge)', fontSize: '0.9rem', margin: 0 }}>{generalError}</p>}
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
  const [confirmPassword, setConfirmPassword] = useState('')
  const [birthdate, setBirthdate] = useState('')
  const [emailOptIn, setEmailOptIn] = useState(false)
  const [acceptCgu, setAcceptCgu] = useState(false)

  // G97: per-field error state replaces the single form-level error.
  // Each input gets a red border + an inline message when its error is set.
  const [usernameError, setUsernameError] = useState('')
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [confirmPasswordError, setConfirmPasswordError] = useState('')
  const [birthdateError, setBirthdateError] = useState('')
  const [acceptCguError, setAcceptCguError] = useState('')
  const [generalError, setGeneralError] = useState('')
  const [loading, setLoading] = useState(false)

  // G97: async username availability — debounced, race-condition-safe.
  // usernameStatus: 'idle' | 'checking' | 'available' | 'taken' | 'invalid'
  const [usernameStatus, setUsernameStatus] = useState('idle')
  const usernameCheckIdRef = useRef(0)

  const pwdValid = isPwdValid(password)
  const maxBirthdate = useMemo(() => minBirthdate(), [])

  // Debounce + check on username change.
  useEffect(() => {
    if (!username.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUsernameStatus('idle'); setUsernameError(''); return
    }
    const checkId = ++usernameCheckIdRef.current
    setUsernameStatus('checking')
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/auth/username-available?u=${encodeURIComponent(username.trim())}`)
        if (checkId !== usernameCheckIdRef.current) return  // a newer request superseded us
        const body = await res.json().catch(() => ({}))
        if (res.status === 429) {
          // Rate limited — don't show anything intrusive, the submit will surface it
          setUsernameStatus('idle'); setUsernameError(''); return
        }
        if (body.available) {
          setUsernameStatus('available'); setUsernameError('')
        } else if (body.error_code === 'taken') {
          setUsernameStatus('taken'); setUsernameError(t('err_already_taken'))
        } else if (body.error_code === 'content') {
          setUsernameStatus('invalid'); setUsernameError(t('err_username_inappropriate'))
        } else {
          setUsernameStatus('invalid'); setUsernameError(body.error_message || t('err_username_format'))
        }
      } catch {
        // Network error — treat as idle (don't gate submit on availability)
        if (checkId === usernameCheckIdRef.current) {
          setUsernameStatus('idle'); setUsernameError('')
        }
      }
    }, 500)
    return () => clearTimeout(handle)
  // We intentionally only watch `username` — t is stable per language.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username])

  const validateEmailFormat = (v) => {
    if (v && !EMAIL_RE.test(v)) { setEmailError(t('err_email_format')); return false }
    setEmailError(''); return true
  }

  const validateConfirmPassword = () => {
    if (confirmPassword && confirmPassword !== password) {
      setConfirmPasswordError(t('err_passwords_dont_match')); return false
    }
    setConfirmPasswordError(''); return true
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    // Reset all field errors before re-validating
    setUsernameError(''); setEmailError(''); setPasswordError(''); setConfirmPasswordError('')
    setBirthdateError(''); setAcceptCguError(''); setGeneralError('')
    let firstInvalid = null
    if (usernameStatus === 'taken') { setUsernameError(t('err_already_taken')); firstInvalid = firstInvalid || 'reg-username' }
    if (usernameStatus === 'invalid') { firstInvalid = firstInvalid || 'reg-username' }
    if (!username.trim()) { setUsernameError(t('err_field_required')); firstInvalid = firstInvalid || 'reg-username' }
    if (!validateEmailFormat(email)) { firstInvalid = firstInvalid || 'reg-email' }
    if (!email.trim()) { setEmailError(t('err_field_required')); firstInvalid = firstInvalid || 'reg-email' }
    if (!pwdValid) { setPasswordError(t('err_weak_password')); firstInvalid = firstInvalid || 'reg-password' }
    if (confirmPassword !== password) { setConfirmPasswordError(t('err_passwords_dont_match')); firstInvalid = firstInvalid || 'reg-confirm-password' }
    if (!birthdate) { setBirthdateError(t('err_field_required')); firstInvalid = firstInvalid || 'reg-birthdate' }
    if (!acceptCgu) { setAcceptCguError(t('err_accept_cgu')); firstInvalid = firstInvalid || 'accept-cgu' }
    if (firstInvalid) {
      const el = document.getElementById(firstInvalid)
      if (el && typeof el.focus === 'function') el.focus()
      return
    }
    setLoading(true)
    try {
      await onRegister({ username, email, password, birthdate, email_opt_in: emailOptIn })
      onNav('/')
    } catch (err) {
      const msg = (err?.detail || '').toLowerCase()
      if (err?.status === 429) setGeneralError(t('err_rate_limit'))
      else if (msg.includes('15') || msg.includes('age')) setBirthdateError(t('err_age_min'))
      else if (msg.includes('taken') || err?.status === 409) setUsernameError(t('err_already_taken'))
      else if (msg.includes('disposable')) setEmailError(t('err_disposable_email'))
      else if (msg.includes('domain') || msg.includes('not valid') || msg.includes('deliverable')) setEmailError(t('err_email_domain'))
      else if (msg.includes('inappropriate')) setUsernameError(t('err_username_inappropriate'))
      else if (msg.includes('letters, digits') || msg.includes('consecutive') || msg.includes('start')) setUsernameError(t('err_username_format'))
      else if (msg.includes('email')) setEmailError(t('err_email_format'))
      else if (msg.includes('uppercase')) setPasswordError(t('err_pwd_uppercase'))
      else if (msg.includes('number') || msg.includes('special')) setPasswordError(t('err_pwd_special'))
      else if (msg.includes('72') || msg.includes('bcrypt')) setPasswordError(t('err_pwd_too_long'))
      else if (msg.includes('8 char') || msg.includes('password') || msg.includes('weak')) setPasswordError(t('err_weak_password'))
      else setGeneralError(t('err_generic'))
    } finally {
      setLoading(false)
    }
  }

  // Status indicator next to the username label
  const usernameStatusBadge = (() => {
    if (usernameStatus === 'checking') return <span style={{ color: 'var(--ink-mute)', fontSize: '0.8rem', fontStyle: 'italic' }}>· {t('checking')}…</span>
    if (usernameStatus === 'available') return <span style={{ color: 'var(--felt-deep)', fontSize: '0.9rem' }}>✓</span>
    if (usernameStatus === 'taken' || usernameStatus === 'invalid') return <span style={{ color: 'var(--rouge)', fontSize: '0.9rem' }}>✗</span>
    return null
  })()

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }} noValidate>
      <FormField label={t('username')} htmlFor="reg-username" required error={usernameError} status={usernameStatusBadge}>
        <input id="reg-username" className="input" required maxLength={20}
          value={username} onChange={e => setUsername(e.target.value)}
          placeholder="marcel_dupont" autoComplete="username"
          aria-invalid={usernameError ? 'true' : 'false'}
          style={{ borderColor: usernameError ? 'var(--rouge)' : usernameStatus === 'available' ? 'var(--felt-deep)' : undefined,
                   boxShadow: usernameError ? '0 0 0 2px rgba(168,48,42,0.18)' : undefined }} />
      </FormField>
      <FormField label={t('email')} htmlFor="reg-email" required error={emailError}>
        <input id="reg-email" className="input" type="email" required
          value={email}
          onChange={e => { setEmail(e.target.value); if (emailError) validateEmailFormat(e.target.value) }}
          onBlur={e => validateEmailFormat(e.target.value)}
          placeholder="marcel@bistrot.fr" autoComplete="email"
          aria-invalid={emailError ? 'true' : 'false'}
          style={{ borderColor: emailError ? 'var(--rouge)' : undefined, boxShadow: emailError ? '0 0 0 2px rgba(168,48,42,0.18)' : undefined }} />
      </FormField>
      <FormField label={t('password')} htmlFor="reg-password" required error={passwordError}>
        <PasswordInput id="reg-password" value={password}
          onChange={e => { setPassword(e.target.value); if (passwordError) setPasswordError('') }}
          autoComplete="new-password" placeholder="••••••••" required invalid={Boolean(passwordError)} t={t} />
        <PasswordChecklist password={password} />
      </FormField>
      <FormField label={t('confirm_new_password')} htmlFor="reg-confirm-password" required error={confirmPasswordError}>
        <PasswordInput id="reg-confirm-password" value={confirmPassword}
          onChange={e => { setConfirmPassword(e.target.value); if (confirmPasswordError) setConfirmPasswordError('') }}
          onBlur={validateConfirmPassword}
          autoComplete="new-password" placeholder="••••••••" required invalid={Boolean(confirmPasswordError)} t={t} />
      </FormField>
      <FormField label={t('birthdate')} htmlFor="reg-birthdate" required error={birthdateError} hint={t('age_notice')}>
        <input id="reg-birthdate" className="input" type="date" required
          value={birthdate} onChange={e => { setBirthdate(e.target.value); if (birthdateError) setBirthdateError('') }}
          max={maxBirthdate}
          aria-invalid={birthdateError ? 'true' : 'false'}
          style={{ borderColor: birthdateError ? 'var(--rouge)' : undefined, boxShadow: birthdateError ? '0 0 0 2px rgba(168,48,42,0.18)' : undefined }} />
      </FormField>
      <div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <input id="accept-cgu" type="checkbox" checked={acceptCgu} onChange={e => { setAcceptCgu(e.target.checked); if (acceptCguError) setAcceptCguError('') }}
            style={{ marginTop: 3, flexShrink: 0, accentColor: acceptCguError ? 'var(--rouge)' : undefined }} />
          {/* G68: consent text explicitly mentions both Terms AND Privacy/RGPD. */}
          <label htmlFor="accept-cgu" className="serif" style={{ fontSize: '0.9rem', cursor: 'pointer', lineHeight: 1.4 }}>
            {t('accept_terms_pre')}{' '}
            <Link to="/terms" target="_blank" style={{ color: 'var(--rouge)' }}>{t('accept_terms_link')}</Link>
            {' '}{t('accept_terms_and')}{' '}
            <Link to="/privacy" target="_blank" style={{ color: 'var(--rouge)' }}>{t('accept_privacy_link')}</Link>
            {' '}<span style={{ color: 'var(--rouge)' }}>*</span>
          </label>
        </div>
        {acceptCguError && <p role="alert" style={{ color: 'var(--rouge)', fontSize: '0.85rem', margin: '0.3rem 0 0', fontStyle: 'italic' }}>{acceptCguError}</p>}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <input id="accept-emails" type="checkbox" checked={emailOptIn} onChange={e => setEmailOptIn(e.target.checked)}
          style={{ marginTop: 3, flexShrink: 0 }} />
        <label htmlFor="accept-emails" className="serif" style={{ fontSize: '0.9rem', cursor: 'pointer', lineHeight: 1.4 }}>
          {t('accept_emails')}
        </label>
      </div>
      {generalError && <p style={{ color: 'var(--rouge)', fontSize: '0.9rem', margin: 0 }}>{generalError}</p>}
      <button type="submit" disabled={loading} className="btn btn-primary" style={{ justifyContent: 'center', marginTop: '0.5rem' }}>
        {loading ? '…' : t('register')}
      </button>
      <div className="hr-orn" style={{ margin: '0.5rem 0' }}>
        <span style={{ fontSize: '0.75rem', fontStyle: 'italic' }}>{t('or')}</span>
      </div>
      <SsoButtons t={t} lang={lang} onGoogleSuccess={async (credentialResponse) => {
        setGeneralError('')
        try {
          const result = await onGoogleLogin?.(credentialResponse.credential)
          onNav(result?.is_new ? '/complete-profile' : '/')
        } catch {
          setGeneralError(t('err_sso_google'))
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
