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

      {/* Objective */}
      <section aria-labelledby="objective-title" style={{ marginBottom: '2.5rem' }}>
        <div className="ticket" style={{ padding: '1.8rem' }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div style={{ fontSize: '2rem' }} aria-hidden="true">🎯</div>
            <div>
              <h2 id="objective-title" className="display" style={{ fontSize: '1.6rem', margin: '0 0 0.5rem' }}>
                {t('htp_objective_title')}
              </h2>
              <p className="serif" style={{ color: 'var(--ink-soft)', lineHeight: 1.6, margin: 0 }}>
                {t('htp_objective_text')}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Game flow: initial roll + starter rotation */}
      <section aria-labelledby="phases-title" style={{ marginBottom: '2.5rem' }}>
        <h2 id="phases-title" className="display" style={{ fontSize: '2rem', margin: '0 0 1.5rem' }}>
          {t('htp_phases_title')}
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }} className="rules-2col">
          <RuleCard title={t('htp_initial_title')} text={t('htp_initial_text')} icon="🎲" accent="var(--brass-deep)" />
          <RuleCard title={t('htp_starter_title')} text={t('htp_starter_text')} icon="🔄" accent="var(--brass-deep)" />
        </div>
      </section>

      {/* Combo table */}
      <section aria-labelledby="combos-title" style={{ marginBottom: '2.5rem' }}>
        <h2 id="combos-title" className="display" style={{ fontSize: '2rem', margin: '0 0 1rem' }}>{t('combo_table_title')}</h2>
        <div className="ticket" style={{ padding: '0 1rem' }}>
          <ComboTable />
        </div>
      </section>

      {/* Charge / Décharge */}
      <section aria-labelledby="rules-title" style={{ marginBottom: '2.5rem' }}>
        <h2 id="rules-title" className="display" style={{ fontSize: '2rem', margin: '0 0 1.5rem' }}>{t('rules_title')}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }} className="rules-2col">
          <RuleCard title={t('charge_title')} text={t('charge_text')} icon="📥" accent="var(--rouge)" />
          <RuleCard title={t('decharge_title')} text={t('decharge_text')} icon="📤" accent="var(--felt-deep)" />
        </div>
      </section>

      {/* Bank rules */}
      <section aria-labelledby="bank-rules-title" style={{ marginBottom: '2.5rem' }}>
        <h2 id="bank-rules-title" className="display" style={{ fontSize: '2rem', margin: '0 0 0.5rem' }}>
          {t('htp_bank_rules_title')}
        </h2>
        <p className="serif" style={{ color: 'var(--ink-mute)', margin: '0 0 1rem', fontStyle: 'italic' }}>
          {t('htp_bank_rules_sub')}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }} className="rules-2col">
          <RuleCard title={t('htp_bank_sec_label')} text={t('htp_bank_sec_text')} icon="⚡" accent="var(--rouge)" />
          <RuleCard title={t('htp_bank_free_label')} text={t('htp_bank_free_text')} icon="🎼" accent="var(--felt-deep)" />
        </div>
      </section>

      {/* Ties */}
      <section aria-labelledby="ties-title" style={{ marginBottom: '2.5rem' }}>
        <h2 id="ties-title" className="display" style={{ fontSize: '2rem', margin: '0 0 1rem' }}>
          {t('htp_ties_title')}
        </h2>
        <div className="card" style={{ padding: '1.6rem' }}>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <TieRow icon="=" text={t('htp_ties_all_text')} />
            <TieRow icon="▼" text={t('htp_ties_losers_text')} />
            <TieRow icon="▲" text={t('htp_ties_winners_text')} />
          </ul>
        </div>
      </section>

      {/* AFK bot */}
      <section aria-labelledby="afk-title" style={{ marginBottom: '2.5rem' }}>
        <div className="card" style={{ padding: '1.6rem' }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div style={{ fontSize: '1.8rem' }} aria-hidden="true">🤖</div>
            <div>
              <h2 id="afk-title" className="display" style={{ fontSize: '1.4rem', margin: '0 0 0.5rem' }}>
                {t('htp_afk_title')}
              </h2>
              <p className="serif" style={{ color: 'var(--ink-soft)', lineHeight: 1.6, margin: 0 }}>
                {t('htp_afk_text')}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Winning the game */}
      <section aria-labelledby="set-title">
        <div className="ticket" style={{ padding: '1.8rem' }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div style={{ fontSize: '2rem' }} aria-hidden="true">🏆</div>
            <div>
              <h2 id="set-title" className="display" style={{ fontSize: '1.6rem', margin: '0 0 0.5rem' }}>{t('set_title')}</h2>
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
    <div className="card" style={{ padding: '1.6rem' }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ fontSize: '1.8rem' }} aria-hidden="true">{icon}</div>
        <div>
          <h3 className="display" style={{ fontSize: '1.25rem', margin: '0 0 0.5rem', color: accent }}>{title}</h3>
          <p className="serif" style={{ color: 'var(--ink-soft)', lineHeight: 1.6, margin: 0 }}>{text}</p>
        </div>
      </div>
    </div>
  )
}

function TieRow({ icon, text }) {
  return (
    <li style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <span className="display" style={{
        flexShrink: 0, width: 24, height: 24, display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center',
        color: 'var(--ink-mute)', fontSize: '0.95rem',
      }} aria-hidden="true">{icon}</span>
      <span className="serif" style={{ color: 'var(--ink-soft)', lineHeight: 1.5, margin: 0 }}>{text}</span>
    </li>
  )
}
