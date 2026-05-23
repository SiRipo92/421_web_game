import { useState } from 'react'
import { useLang } from '../context/useLang.js'

export function Contact() {
  const { t } = useLang()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('other')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, subject, message }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        if (res.status === 429) { setError(t('err_rate_limit')); return }
        throw new Error(body.detail || 'error')
      }
      setSent(true)
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
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }} className="contact-row">
              <div>
                <label className="field-label" htmlFor="c-name">{t('contact_name')}</label>
                <input id="c-name" className="input" required value={name}
                  onChange={e => setName(e.target.value)} autoComplete="name" />
              </div>
              <div>
                <label className="field-label" htmlFor="c-email">{t('email')}</label>
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
              <label className="field-label" htmlFor="c-message">{t('contact_message')}</label>
              <textarea id="c-message" className="input" required rows={5}
                value={message} onChange={e => setMessage(e.target.value)}
                style={{ resize: 'vertical', fontFamily: 'var(--body)' }} />
            </div>
            {error && <p style={{ color: 'var(--rouge)', fontSize: '0.9rem', margin: 0 }}>{error}</p>}
            <button type="submit" disabled={loading} className="btn btn-primary" style={{ justifyContent: 'center' }}>
              {loading ? '…' : t('contact_send')}
            </button>
          </form>
        </div>
      )}

      <style>{`@media (max-width: 560px) { .contact-row { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  )
}
