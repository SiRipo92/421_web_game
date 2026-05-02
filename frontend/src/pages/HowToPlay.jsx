import { DiceRow } from '../components/shared/Die.jsx'
import { useLang } from '../context/LangContext.jsx'

const COMBOS = [
  { nameKey: 'combo_421', dice: [4, 2, 1], pts: 8, rouge: true },
  { nameKey: 'combo_111', dice: [1, 1, 1], pts: 7 },
  { nameKey: 'combo_11x', dice: [1, 1, 6], pts: 'x' },
  { nameKey: 'combo_brelan', dice: [5, 5, 5], pts: 3 },
  { nameKey: 'combo_suite', dice: [3, 2, 1], pts: 2 },
  { nameKey: 'combo_nenette', dice: [2, 2, 1], pts: 2, italic: true },
  { nameKey: 'combo_other', dice: [6, 4, 3], pts: 1 },
]

export function HowToPlay() {
  const { t } = useLang()
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '2.5rem 1.5rem' }}>
      <div className="eyebrow">Le guide du joueur</div>
      <h1 className="display" style={{ fontSize: 'clamp(2.4rem, 5vw, 3.2rem)', margin: '0.3rem 0 1.5rem', lineHeight: 0.95 }}>
        {t('how_title')}
      </h1>

      {/* Combo table */}
      <section aria-labelledby="combos-title">
        <h2 id="combos-title" className="display" style={{ fontSize: '2rem', margin: '0 0 1rem' }}>{t('combo_table_title')}</h2>
        <div className="ticket" style={{ marginBottom: '2.5rem' }}>
          {COMBOS.map((row, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: 16,
              alignItems: 'center', padding: '0.8rem 0',
              borderBottom: i < COMBOS.length - 1 ? '1px dashed var(--rule)' : 'none',
            }}>
              <div className="mono" style={{ fontSize: '0.8rem', color: 'var(--ink-fade)', width: 24 }}>
                {String(i + 1).padStart(2, '0')}
              </div>
              <div className="serif" style={{ fontSize: '1.1rem', fontStyle: row.italic ? 'italic' : 'normal', color: row.rouge ? 'var(--rouge)' : 'var(--ink)' }}>
                {t(row.nameKey)}
              </div>
              <DiceRow values={row.dice} mini />
              <div className="display" style={{ fontSize: '1.3rem', color: row.rouge ? 'var(--rouge)' : 'var(--ink-soft)' }}>
                {row.pts}<span style={{ fontSize: '0.7rem', color: 'var(--ink-mute)', marginLeft: 2 }}>{t('pieces')}</span>
              </div>
            </div>
          ))}
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
