import { Link } from 'react-router-dom'
import { useLang } from '../context/useLang.js'
import { clearCookieConsent, getCookieConsent } from '../utils/consent.js'

export function Privacy() {
  const { t } = useLang()
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '2.5rem 1.5rem' }}>
      <div className="eyebrow">RGPD</div>
      <h1 className="display" style={{ fontSize: 'clamp(2.4rem, 5vw, 3.2rem)', margin: '0.3rem 0 1.5rem' }}>
        {t('privacy_title')}
      </h1>

      <div className="ticket" style={{ padding: '2rem', lineHeight: 1.7 }}>
        <Section title={t('privacy_s1_title')}>
          <p>421 Bistro</p>
        </Section>

        <Section title={t('privacy_s2_title')}>
          <ul>
            <li>{t('privacy_s2_item_identity')}</li>
            <li>{t('privacy_s2_item_game')}</li>
            <li>{t('privacy_s2_item_ip')}</li>
            <li>{t('privacy_s2_item_mod')}</li>
          </ul>
        </Section>

        <Section title={t('privacy_s3_title')}>
          <ul>
            <li>{t('privacy_s3_item_account')}</li>
            <li>{t('privacy_s3_item_rankings')}</li>
            <li>{t('privacy_s3_item_transactional')}</li>
            <li>{t('privacy_s3_item_promotional')}</li>
            <li>{t('privacy_s3_item_safety')}</li>
          </ul>
        </Section>

        <Section title={t('privacy_s4_title')}>
          <p>{t('privacy_s4_account')}</p>
          <p style={{ marginTop: '0.5rem' }}>{t('privacy_s4_audit')}</p>
        </Section>

        <Section title={t('privacy_s5_title')}>
          <p>
            {t('privacy_s5_intro')}{' '}
            <Link to="/contact" style={{ color: 'var(--rouge)' }}>{t('privacy_s5_contact_link')}</Link>.
          </p>
        </Section>

        <Section title={t('privacy_s6_title')}>
          <p>{t('privacy_s6_cookies')}</p>
          <p style={{ marginTop: '0.5rem' }}>
            {t('privacy_s6_analytics_pre')}{' '}
            <strong>{getCookieConsent() ?? t('privacy_s6_consent_undefined')}</strong>.{' '}
            <button
              type="button"
              onClick={() => { clearCookieConsent(); window.location.reload() }}
              className="btn-link"
              style={{ fontSize: '0.9rem' }}
            >
              {t('privacy_s6_change_choice')}
            </button>
          </p>
        </Section>

        <Section title={t('privacy_s7_title')}>
          <p>{t('privacy_s7_intro')}</p>
          <ul>
            <li>{t('privacy_s7_item_logs')}</li>
            <li>{t('privacy_s7_item_audit')}</li>
            <li>{t('privacy_s7_item_retention')}</li>
          </ul>
          <p style={{ marginTop: '0.5rem' }}>
            {t('privacy_s7_terms_pointer_pre')}{' '}
            <Link to="/terms" style={{ color: 'var(--rouge)' }}>{t('privacy_s7_terms_pointer_link')}</Link>.
          </p>
        </Section>

        <Section title={t('privacy_s8_title')}>
          <p>
            {t('privacy_s8_intro')}{' '}
            <Link to="/contact" style={{ color: 'var(--rouge)' }}>{t('privacy_s8_contact_link')}</Link>.
          </p>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: '1.5rem' }}>
      <h2 className="display" style={{ fontSize: '1.3rem', marginBottom: '0.5rem' }}>{title}</h2>
      <div className="serif" style={{ color: 'var(--ink-soft)' }}>{children}</div>
    </section>
  )
}
