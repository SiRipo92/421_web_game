import { useEffect } from 'react'
import { ComboTable } from './ComboTable.jsx'

/**
 * Lightbox showing the combo hierarchy + scoring synopsis. Replaces the
 * always-visible hierarchy panel that used to live in the right aside —
 * frees that real estate for players who already know the game, while
 * keeping a one-click reference for players who don't.
 *
 * Closes on Escape, on backdrop click, or on the explicit close button.
 *
 * Props: open (boolean), onClose, t (the i18n helper from useLang).
 */
export function HierarchyModal({ open, onClose, t }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="hierarchy-modal-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 950,
        background: 'rgba(20,15,12,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        className="ticket"
        style={{
          background: 'var(--paper)',
          border: '1px solid var(--rule)',
          borderRadius: 6,
          boxShadow: '0 18px 48px rgba(0,0,0,0.32)',
          padding: '1.8rem',
          maxWidth: 560,
          width: '100%',
          maxHeight: '85vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: '0.8rem' }}>
          <div>
            <div className="eyebrow" style={{ fontSize: '0.7rem' }}>
              {t('combo_hier')}
            </div>
            <h2 id="hierarchy-modal-title" className="display" style={{ fontSize: '1.5rem', margin: '0.2rem 0 0' }}>
              {t('hierarchy_modal_title')}
            </h2>
            <p className="serif" style={{ fontSize: '0.88rem', color: 'var(--ink-soft)', margin: '0.4rem 0 0', lineHeight: 1.5 }}>
              {t('hierarchy_modal_sub')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            title={t('close')}
            style={{
              background: 'transparent',
              border: '1px solid var(--rule)',
              borderRadius: 999,
              width: 32,
              height: 32,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.05rem',
              color: 'var(--ink-soft)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >×</button>
        </div>
        <ComboTable />
      </div>
    </div>
  )
}
