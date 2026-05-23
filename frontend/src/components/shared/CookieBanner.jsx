import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLang } from '../../context/useLang.js'
import { hasCookieDecision, setCookieConsent } from '../../utils/consent.js'

export function CookieBanner() {
  const { t } = useLang()
  // Lazy initializer runs once at mount and reads from localStorage; no effect needed.
  const [visible, setVisible] = useState(() => !hasCookieDecision())

  if (!visible) return null

  const choose = (value) => {
    setCookieConsent(value)
    setVisible(false)
  }

  return (
    <div
      role="dialog"
      aria-labelledby="cookie-banner-title"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        padding: '1rem',
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          maxWidth: 760,
          width: '100%',
          background: 'var(--paper)',
          border: '1px solid var(--rule)',
          borderRadius: 6,
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          padding: '1.2rem 1.4rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem',
          alignItems: 'center',
          pointerEvents: 'auto',
        }}
      >
        <div style={{ flex: '1 1 280px' }}>
          <div id="cookie-banner-title" className="eyebrow" style={{ marginBottom: 4 }}>
            🍪 {t('cookies_banner_title')}
          </div>
          <p className="serif" style={{ fontSize: '0.9rem', color: 'var(--ink-soft)', margin: 0, lineHeight: 1.5 }}>
            {t('cookies_banner_text')}{' '}
            <Link to="/privacy" style={{ color: 'var(--rouge)' }}>
              {t('cookies_banner_link')}
            </Link>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => choose('rejected')}
            className="btn btn-ghost"
            style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
          >
            {t('cookies_reject')}
          </button>
          <button
            type="button"
            onClick={() => choose('accepted')}
            className="btn btn-primary"
            style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
          >
            {t('cookies_accept')}
          </button>
        </div>
      </div>
    </div>
  )
}
