import { useLang } from '../context/useLang.js'

export function TermsAndConditions() {
  const { t } = useLang()
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '2.5rem 1.5rem' }}>
      <div className="eyebrow">{t('terms_eyebrow')}</div>
      <h1 className="display" style={{ fontSize: 'clamp(2.4rem, 5vw, 3.2rem)', margin: '0.3rem 0 1.5rem' }}>
        {t('terms_title')}
      </h1>

      <div className="ticket" style={{ padding: '2rem', lineHeight: 1.7 }}>
        <Section title={t('terms_intro_title')}>
          <p>{t('terms_intro_body')}</p>
        </Section>
        <Section title={t('terms_community_title')}>
          <p>{t('terms_community_body')}</p>
        </Section>
        <Section title={t('terms_fairplay_title')}>
          <p>{t('terms_fairplay_body')}</p>
        </Section>
        <Section title={t('terms_account_title')}>
          <p>{t('terms_account_body')}</p>
        </Section>
        <Section title={t('terms_enforcement_title')}>
          <p>{t('terms_enforcement_body')}</p>
        </Section>
        <Section title={t('terms_changes_title')}>
          <p>{t('terms_changes_body')}</p>
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
