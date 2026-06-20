import { useEffect, useRef, useState } from 'react'
import { BADGES, badge } from '../../utils/ranks.js'

/**
 * G98: hover/tap tooltip listing the full badge ladder + the user's
 * current position. Used wherever an ELO score is rendered (Profile,
 * Rankings header) so users discover what the rank means.
 *
 * - Desktop: hover triggers the popover; mouse-leave closes
 * - Mobile: tap toggles; tap-outside closes
 * - The trigger element receives the children as its visual; the
 *   tooltip is positioned absolutely below (with a top arrow)
 *
 * Pass `elo` + `partiesPlayed` so the tooltip can highlight the
 * current badge OR show the unranked hint when applicable.
 */
export function RankTooltip({ elo, partiesPlayed, t, children }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)
  const current = badge(elo, partiesPlayed)

  // Close on outside tap/click
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (!containerRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <span
      ref={containerRef}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'help' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={() => setOpen((o) => !o)}
    >
      {children}
      {open && (
        <div
          role="tooltip"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: 'calc(100% + 10px)',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 50,
            minWidth: 260,
            background: 'var(--paper)',
            border: '1px solid var(--ink-fade)',
            borderRadius: 6,
            boxShadow: '0 6px 22px rgba(28, 22, 18, 0.18)',
            padding: '0.9rem 1.1rem',
            textAlign: 'left',
            cursor: 'default',
          }}
        >
          {/* arrow */}
          <div style={{
            position: 'absolute', top: -7, left: '50%', marginLeft: -7,
            width: 12, height: 12, background: 'var(--paper)',
            borderLeft: '1px solid var(--ink-fade)', borderTop: '1px solid var(--ink-fade)',
            transform: 'rotate(45deg)',
          }} />
          <div className="eyebrow" style={{ fontSize: '0.6rem', marginBottom: 6 }}>
            {t('rank_tooltip_title')}
          </div>
          <p className="serif" style={{ margin: '0 0 10px', fontSize: '0.82rem', color: 'var(--ink-mute)', lineHeight: 1.4 }}>
            {t('rank_tooltip_subtitle')}
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {/* Render high-to-low (matches BADGES order) so Maître at top */}
            {BADGES.map((tier, i) => {
              const isCurrent = current && current.name === tier.name
              const next = BADGES[i - 1]
              const range = next
                ? `${tier.threshold}-${next.threshold - 1}`
                : `${tier.threshold}+`
              return (
                <li key={tier.name} style={{
                  display: 'flex', alignItems: 'baseline', gap: 8,
                  padding: '0.25rem 0.4rem',
                  background: isCurrent ? 'rgba(168,48,42,0.10)' : 'transparent',
                  borderRadius: 3,
                  fontWeight: isCurrent ? 600 : 400,
                  color: isCurrent ? 'var(--rouge)' : 'var(--ink)',
                  fontSize: '0.85rem',
                }}>
                  <span aria-hidden="true">{tier.icon}</span>
                  <span style={{ flex: 1 }}>{tier.name}</span>
                  <span className="mono" style={{ fontSize: '0.7rem', color: isCurrent ? 'var(--rouge)' : 'var(--ink-mute)' }}>
                    {range}
                  </span>
                </li>
              )
            })}
          </ul>
          {!current && (
            <p className="serif" style={{ margin: '10px 0 0', fontSize: '0.78rem', fontStyle: 'italic', color: 'var(--ink-mute)' }}>
              {t('rank_tooltip_unranked_hint')}
            </p>
          )}
        </div>
      )}
    </span>
  )
}
