import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLang } from '../../context/LangContext.jsx'
import { gdprContact } from '../../api/game.js'

export function Footer() {
  const { t } = useLang()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [type, setType] = useState('export')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await gdprContact(name, email, type)
      setSent(true)
    } catch {
      setError(t('err_generic'))
    }
  }

  return (
    <footer style={{
      borderTop: '1px solid var(--rule)',
      background: 'var(--paper-deep)',
      padding: '2.5rem 2rem',
      marginTop: '4rem',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem', marginBottom: '2rem' }}
          className="footer-grid">

          <div>
            <div className="display" style={{ fontSize: '1.4rem', marginBottom: '1rem' }}>421 Bistro</div>
            <p className="serif" style={{ color: 'var(--ink-mute)', lineHeight: 1.6, fontSize: '0.95rem' }}>
              Le jeu de dés des bistrots français. Trois dés, onze fiches, et l'art de la nénette.
            </p>
            <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--ink-mute)' }}>{t('footer_copyright')}</span>
              <span style={{ color: 'var(--rule)' }}>·</span>
              <Link to="/privacy" style={{ color: 'var(--ink-mute)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                {t('footer_privacy')}
              </Link>
            </div>
          </div>

          <div id="gdpr-contact">
            <div className="eyebrow" style={{ marginBottom: '0.8rem' }}>{t('gdpr_contact_title')}</div>
            {sent ? (
              <p className="serif" style={{ color: 'var(--felt-deep)', fontStyle: 'italic' }}>{t('gdpr_sent')}</p>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <div>
                  <label className="field-label" htmlFor="gdpr-name">{t('gdpr_name_label')}</label>
                  <input id="gdpr-name" className="input" value={name} onChange={e => setName(e.target.value)}
                    required style={{ fontSize: '0.95rem' }} />
                </div>
                <div>
                  <label className="field-label" htmlFor="gdpr-email">{t('gdpr_email_label')}</label>
                  <input id="gdpr-email" className="input" type="email" value={email} onChange={e => setEmail(e.target.value)}
                    required style={{ fontSize: '0.95rem' }} />
                </div>
                <div>
                  <label className="field-label" htmlFor="gdpr-type">{t('gdpr_type_label')}</label>
                  <select id="gdpr-type" className="input" value={type} onChange={e => setType(e.target.value)}
                    style={{ fontSize: '0.95rem', cursor: 'pointer' }}>
                    <option value="export">{t('gdpr_export')}</option>
                    <option value="delete">{t('gdpr_delete')}</option>
                  </select>
                </div>
                {error && <p style={{ color: 'var(--rouge)', fontSize: '0.9rem' }}>{error}</p>}
                <button type="submit" className="btn btn-ghost" style={{ alignSelf: 'flex-start', fontSize: '0.9rem' }}>
                  {t('gdpr_send')}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .footer-grid { grid-template-columns: 1fr !important; gap: 2rem !important; }
        }
      `}</style>
    </footer>
  )
}
