import { Link } from 'react-router-dom'
import { useLang } from '../../context/useLang.js'

export function Footer() {
  const { t } = useLang()

  return (
    <footer style={{
      borderTop: '1px solid var(--rule)',
      background: 'var(--paper-deep)',
      padding: '2.5rem 2rem',
      marginTop: '4rem',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div className="display" style={{ fontSize: '1.4rem', marginBottom: '0.75rem' }}>421 Bistro</div>
        <p className="serif" style={{ color: 'var(--ink-mute)', lineHeight: 1.6, fontSize: '0.95rem', maxWidth: 480 }}>
          {t('footer_desc')}
        </p>
        <div style={{ marginTop: '1.25rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.85rem', alignItems: 'center' }}>
          <span style={{ color: 'var(--ink-mute)' }}>{t('footer_copyright')}</span>
          <span style={{ color: 'var(--rule)' }}>·</span>
          <Link to="/privacy" style={{ color: 'var(--ink-mute)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
            {t('footer_privacy')}
          </Link>
          <span style={{ color: 'var(--rule)' }}>·</span>
          <Link to="/terms" style={{ color: 'var(--ink-mute)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
            {t('footer_terms')}
          </Link>
          <span style={{ color: 'var(--rule)' }}>·</span>
          <Link to="/contact" style={{ color: 'var(--ink-mute)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
            {t('footer_contact')}
          </Link>
        </div>
      </div>
    </footer>
  )
}
