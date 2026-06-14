import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLang } from '../context/useLang.js'

const Required = () => (
  <span style={{ color: 'var(--rouge)', marginLeft: 4 }} aria-hidden="true">*</span>
)

export function Contact() {
  const { t } = useLang()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('other')
  const [message, setMessage] = useState('')
  // G68: explicit consent for processing the contact data is required
  // before sending. `required` on the checkbox blocks submit at the
  // browser level; the JS check is a belt-and-suspenders for screen
  // readers / form auto-fillers that might bypass the required flag.
  const [acceptConsent, setAcceptConsent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  // G68 follow-up: surface specific messages instead of a generic
  // "An error occurred". Each return path maps to a distinct i18n key
  // so the user knows what to do — re-check inputs, accept the
  // checkbox, wait out the rate limit, or wait for email-service
  // recovery.
  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!name.trim() || !email.trim() || !message.trim()) {
      setError(t('err_contact_missing_fields'))
      return
    }
    if (!acceptConsent) {
      setError(t('err_accept_consent'))
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, subject, message }),
      })
      if (res.ok) { setSent(true); return }
      if (res.status === 429) { setError(t('err_rate_limit')); return }
      if (res.status === 422) { setError(t('err_contact_missing_fields')); return }
      // 502: the backend caught the email-service failure and tagged it.
      // detail can be a string (legacy) or { code, message } (G68 fu).
      let code = ''
      try {
        const body = await res.json()
        const detail = body.detail
        code = typeof detail === 'object' && detail ? detail.code : ''
      } catch { /* non-JSON body — fall through */ }
      if (code === 'email_sender_not_configured') {
        setError(t('err_contact_email_sender_not_configured'))
      } else if (code === 'email_service_unavailable') {
        setError(t('err_contact_email_service_unavailable'))
      } else {
        setError(t('err_generic'))
      }
    } catch {
      setError(t('err_generic'))
    } finally {
      setLoading(false)
    }
  }


  return (
    <div style={{ maxWidth: 680, margin: '4rem auto', padding: '0 1.5rem' }}>
      <div className="eyebrow" style={{ marginBottom: 10 }}>{t('contact_eyebrow')}</div>
      <h1 className="display" style={{ fontSize: 'clamp(2rem, 5vw, 2.8rem)', margin: '0 0 0.75rem', lineHeight: 1 }}>
        {t('contact_title')}
      </h1>
      <p className="serif" style={{ color: 'var(--ink-soft)', marginBottom: '2rem', lineHeight: 1.5 }}>
        {t('contact_desc')}
      </p>

      {sent ? (
        <div className="ticket" style={{ padding: '2rem', textAlign: 'center' }}>
          <div className="display" style={{ fontSize: '1.6rem', marginBottom: '0.5rem' }}>✓</div>
          <p className="serif" style={{ color: 'var(--felt-deep)', fontStyle: 'italic', margin: 0 }}>
            {t('contact_sent')}
          </p>
        </div>
      ) : (
        <div className="ticket" style={{ padding: '2rem' }}>
          <p className="serif" style={{ fontSize: '0.82rem', color: 'var(--ink-mute)', fontStyle: 'italic', margin: '0 0 1.2rem' }}>
            {t('contact_required_legend')}
          </p>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }} className="contact-row">
              <div>
                <label className="field-label" htmlFor="c-name">{t('contact_name')}<Required /></label>
                <input id="c-name" className="input" required value={name}
                  onChange={e => setName(e.target.value)} autoComplete="name" />
              </div>
              <div>
                <label className="field-label" htmlFor="c-email">{t('email')}<Required /></label>
                <input id="c-email" className="input" type="email" required value={email}
                  onChange={e => setEmail(e.target.value)} autoComplete="email" />
              </div>
            </div>
            <div>
              <label className="field-label" htmlFor="c-subject">{t('contact_subject')}</label>
              <select id="c-subject" className="input" value={subject} onChange={e => setSubject(e.target.value)}>
                <option value="other">{t('contact_subject_other')}</option>
                <option value="bug">{t('contact_subject_bug')}</option>
                <option value="export">{t('contact_subject_export')}</option>
                <option value="delete">{t('contact_subject_delete')}</option>
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="c-message">{t('contact_message')}<Required /></label>
              <textarea id="c-message" className="input" required rows={5}
                value={message} onChange={e => setMessage(e.target.value)}
                style={{ resize: 'vertical', fontFamily: 'var(--body)' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <input
                id="c-consent"
                type="checkbox"
                required
                checked={acceptConsent}
                onChange={e => setAcceptConsent(e.target.checked)}
                style={{ marginTop: 3, flexShrink: 0 }}
              />
              <label htmlFor="c-consent" className="serif" style={{ fontSize: '0.9rem', cursor: 'pointer', lineHeight: 1.4 }}>
                {t('contact_consent_pre')}{' '}
                <Link to="/privacy" target="_blank" style={{ color: 'var(--rouge)' }}>
                  {t('contact_consent_privacy_link')}
                </Link>
                {' '}{t('contact_consent_and')}{' '}
                <Link to="/terms" target="_blank" style={{ color: 'var(--rouge)' }}>
                  {t('contact_consent_terms_link')}
                </Link>
                {'. '}
                <span style={{ color: 'var(--rouge)' }}>*</span>
              </label>
            </div>
            {error && <p style={{ color: 'var(--rouge)', fontSize: '0.9rem', margin: 0 }}>{error}</p>}
            <button type="submit" disabled={loading || !acceptConsent} className="btn btn-primary" style={{ justifyContent: 'center', opacity: acceptConsent ? 1 : 0.45 }}>
              {loading ? '…' : t('contact_send')}
            </button>
          </form>
        </div>
      )}

      <style>{`@media (max-width: 560px) { .contact-row { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  )
}
