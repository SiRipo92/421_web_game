import { useState } from 'react'
import { DiceRow } from './Die.jsx'
import { useLang } from '../../context/useLang.js'

const COMBO_ROWS = [
  {
    id: '421',
    nameKey: 'combo_421',
    dice: [4, 2, 1],
    score: '8',
    rouge: true,
    descKey: 'combo_421_desc',
    variants: null,
  },
  {
    id: '111',
    nameKey: 'combo_111',
    dice: [1, 1, 1],
    score: '7',
    rouge: false,
    descKey: 'combo_111_desc',
    variants: null,
  },
  {
    id: '11x',
    nameKey: 'combo_11x',
    dice: [1, 1, 6],
    score: '2–6',
    rouge: false,
    descKey: 'combo_11x_desc',
    variants: [
      { dice: [1, 1, 2], score: 2 },
      { dice: [1, 1, 3], score: 3 },
      { dice: [1, 1, 4], score: 4 },
      { dice: [1, 1, 5], score: 5 },
      { dice: [1, 1, 6], score: 6, best: true },
    ],
  },
  {
    id: 'brelan',
    nameKey: 'combo_brelan',
    dice: [3, 3, 3],
    score: '2–6',
    rouge: false,
    descKey: 'combo_brelan_desc',
    variants: [
      { dice: [2, 2, 2], score: 2 },
      { dice: [3, 3, 3], score: 3 },
      { dice: [4, 4, 4], score: 4 },
      { dice: [5, 5, 5], score: 5 },
      { dice: [6, 6, 6], score: 6, best: true },
    ],
  },
  {
    id: 'suite',
    nameKey: 'combo_suite',
    dice: [4, 5, 6],
    score: '2',
    rouge: false,
    descKey: 'combo_suite_desc',
    variants: [
      { dice: [1, 2, 3], score: 2 },
      { dice: [2, 3, 4], score: 2 },
      { dice: [3, 4, 5], score: 2 },
      { dice: [4, 5, 6], score: 2, labelKey: 'combo_lamour', best: true },
    ],
  },
  {
    id: 'basic',
    nameKey: 'combo_basic',
    dice: [6, 6, 5],
    score: '1',
    rouge: false,
    descKey: 'combo_basic_desc',
    variants: [
      { dice: [2, 2, 1], score: 1, labelKey: 'combo_dud', worst: true },
      { dice: [3, 3, 1], score: 1 },
      { dice: [4, 4, 2], score: 1 },
      { dice: [6, 6, 5], score: 1, best: true },
    ],
  },
]

export function ComboTable({ compact }) {
  const { t } = useLang()
  const [open, setOpen] = useState(null)

  return (
    <div style={{ width: '100%' }}>
      {COMBO_ROWS.map((row, i) => {
        const isOpen = open === row.id
        return (
          <div key={row.id} style={{
            borderBottom: i < COMBO_ROWS.length - 1 ? '1px dashed var(--rule)' : 'none',
          }}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : row.id)}
              style={{
                width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                display: 'grid',
                gridTemplateColumns: compact ? '1.2rem 1fr auto auto' : '1.5rem 1fr auto auto',
                gap: compact ? 8 : 12,
                alignItems: 'center',
                padding: compact ? '0.5rem 0' : '0.75rem 0',
                textAlign: 'left',
              }}
              aria-expanded={isOpen}
            >
              <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--ink-fade)' }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="serif" style={{
                fontSize: compact ? '0.9rem' : '1rem',
                color: row.rouge ? 'var(--rouge)' : 'var(--ink)',
                display: 'flex', alignItems: 'center', gap: 5,
              }}>
                <span style={{ fontSize: '0.55rem', color: 'var(--ink-fade)', flexShrink: 0 }}>
                  {isOpen ? '▼' : '▶'}
                </span>
                {t(row.nameKey)}
              </span>
              <DiceRow values={row.dice} mini />
              <span className="display" style={{
                fontSize: compact ? '1rem' : '1.15rem',
                color: row.rouge ? 'var(--rouge)' : row.score === '2–6' ? 'var(--brass-deep)' : 'var(--ink-soft)',
                whiteSpace: 'nowrap',
              }}>
                {row.score}
                <span style={{ fontSize: '0.65rem', color: 'var(--ink-mute)', marginLeft: 2 }}>
                  {t('pieces')}
                </span>
              </span>
            </button>

            {isOpen && (
              <div style={{
                padding: compact ? '0.5rem 0 0.75rem 1.5rem' : '0.5rem 0 1rem 1.7rem',
                borderTop: '1px solid var(--rule)',
              }}>
                {!compact && (
                  <p className="serif" style={{
                    fontSize: '0.88rem', color: 'var(--ink-mute)',
                    margin: '0 0 0.6rem', lineHeight: 1.5,
                  }}>
                    {t(row.descKey)}
                  </p>
                )}
                {row.variants && (
                  <div style={{
                    display: 'flex', flexWrap: 'wrap',
                    gap: compact ? '0.4rem 0.8rem' : '0.5rem 1rem',
                  }}>
                    {row.variants.map((v, vi) => (
                      <div key={vi} style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '0.3rem 0.5rem',
                        borderRadius: 3,
                        background: v.best
                          ? 'rgba(var(--brass-rgb, 160,120,50), 0.08)'
                          : v.worst
                          ? 'rgba(var(--rouge-rgb, 180,40,40), 0.06)'
                          : 'transparent',
                        border: v.best
                          ? '1px solid var(--brass-soft, rgba(160,120,50,0.25))'
                          : v.worst
                          ? '1px solid rgba(var(--rouge-rgb,180,40,40),0.2)'
                          : '1px solid transparent',
                      }}>
                        <DiceRow values={v.dice} mini />
                        {v.labelKey && (
                          <span className="serif" style={{
                            fontSize: '0.78rem',
                            color: v.best ? 'var(--brass-deep)' : v.worst ? 'var(--rouge)' : 'var(--ink-mute)',
                            fontStyle: 'italic',
                          }}>
                            {t(v.labelKey)}
                          </span>
                        )}
                        <span className="mono" style={{
                          fontSize: '0.78rem',
                          color: v.best ? 'var(--brass-deep)' : v.worst ? 'var(--rouge)' : 'var(--ink-soft)',
                        }}>
                          {v.score}{t('pieces')[0]}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
