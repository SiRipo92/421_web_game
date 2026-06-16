import { Link, useSearchParams } from 'react-router-dom'
import { useLang } from '../context/useLang.js'

export function Unsubscribed() {
  const { t } = useLang()
  const [params] = useSearchParams()
  const ok = params.get('status') !== 'invalid'

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <div className="eyebrow">{t('unsub_eyebrow')}</div>
      <h1 className="display" style={{ fontSize: 'clamp(2rem, 4vw, 2.6rem)', margin: '0.3rem 0 1.5rem' }}>
        {ok ? t('unsub_title_ok') : t('unsub_title_invalid')}
      </h1>
      <div className="ticket" style={{ padding: '2rem', lineHeight: 1.7 }}>
        <p className="serif" style={{ color: 'var(--ink-soft)', marginTop: 0 }}>
          {ok ? t('unsub_body_ok') : t('unsub_body_invalid')}
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
          <Link to="/" className="btn-primary">{t('unsub_back_home')}</Link>
          {!ok && <Link to="/profile" className="btn-link">{t('unsub_open_profile')}</Link>}
        </div>
      </div>
    </div>
  )
}
