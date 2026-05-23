import { ComboTable } from '../components/shared/ComboTable.jsx'
import { useLang } from '../context/useLang.js'

export function HowToPlay() {
  const { t } = useLang()
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '2.5rem 1.5rem' }}>
      <div className="eyebrow">{t('how_to_play_eyebrow')}</div>
      <h1 className="display" style={{ fontSize: 'clamp(2.4rem, 5vw, 3.2rem)', margin: '0.3rem 0 1.5rem', lineHeight: 0.95 }}>
        {t('how_title')}
      </h1>

      {/* Combo table */}
      <section aria-labelledby="combos-title">
        <h2 id="combos-title" className="display" style={{ fontSize: '2rem', margin: '0 0 1rem' }}>{t('combo_table_title')}</h2>
        <div className="ticket" style={{ marginBottom: '2.5rem', padding: '0 1rem' }}>
          <ComboTable />
        </div>
      </section>

      {/* Rules */}
      <section aria-labelledby="rules-title">
        <h2 id="rules-title" className="display" style={{ fontSize: '2rem', margin: '0 0 1.5rem' }}>{t('rules_title')}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }} className="rules-2col">
          <RuleCard title={t('charge_title')} text={t('charge_text')} icon="📥" accent="var(--rouge)" />
          <RuleCard title={t('decharge_title')} text={t('decharge_text')} icon="📤" accent="var(--felt-deep)" />
        </div>
        <div className="card" style={{ padding: '1.8rem' }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div style={{ fontSize: '2rem' }} aria-hidden="true">🏆</div>
            <div>
              <h3 className="display" style={{ fontSize: '1.4rem', margin: '0 0 0.5rem' }}>{t('set_title')}</h3>
              <p className="serif" style={{ color: 'var(--ink-soft)', lineHeight: 1.6, margin: 0 }}>{t('set_text')}</p>
            </div>
          </div>
        </div>
      </section>

      <style>{`
        @media (max-width: 640px) {
          .rules-2col { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}

function RuleCard({ title, text, icon, accent }) {
  return (
    <div className="card" style={{ padding: '1.8rem' }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ fontSize: '2rem' }} aria-hidden="true">{icon}</div>
        <div>
          <h3 className="display" style={{ fontSize: '1.4rem', margin: '0 0 0.5rem', color: accent }}>{title}</h3>
          <p className="serif" style={{ color: 'var(--ink-soft)', lineHeight: 1.6, margin: 0 }}>{text}</p>
        </div>
      </div>
    </div>
  )
}
