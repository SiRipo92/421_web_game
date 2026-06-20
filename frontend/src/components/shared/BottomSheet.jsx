import { useEffect } from 'react'

/**
 * Bottom-sheet drawer used by the mobile game layout (G64). Slides up from
 * the bottom edge over the piste; closes on Escape, backdrop tap, or the
 * × button. Reduced-motion users get an instant show/hide instead of the
 * slide animation.
 *
 * Props: open, onClose, title, children.
 */
export function BottomSheet({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-hidden={!open}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 940,
        background: open ? 'rgba(20,15,12,0.45)' : 'rgba(20,15,12,0)',
        pointerEvents: open ? 'auto' : 'none',
        transition: 'background 0.2s ease-out',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        className="bottom-sheet-panel"
        style={{
          width: '100%',
          maxWidth: 720,
          maxHeight: '78vh',
          background: 'var(--paper)',
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          boxShadow: '0 -10px 32px rgba(0,0,0,0.28)',
          display: 'flex',
          flexDirection: 'column',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.25s ease-out',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '0.9rem 1.1rem',
            borderBottom: '1px solid var(--rule)',
            position: 'sticky',
            top: 0,
            background: 'var(--paper)',
            zIndex: 1,
          }}
        >
          {/* Drag handle hint — visual cue this is a sheet, not a modal */}
          <div style={{ position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)', width: 36, height: 4, borderRadius: 2, background: 'var(--rule)' }} aria-hidden="true" />
          <h2 className="display" style={{ fontSize: '1.1rem', margin: 0, marginTop: 4 }}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            style={{
              background: 'transparent',
              border: '1px solid var(--rule)',
              borderRadius: 999,
              width: 36,
              height: 36,
              fontSize: '1.1rem',
              color: 'var(--ink-soft)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >×</button>
        </div>
        <div style={{ overflowY: 'auto', padding: '0.9rem 1.1rem', flex: 1 }}>
          {children}
        </div>
      </div>
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .bottom-sheet-panel { transition: none !important; }
        }
      `}</style>
    </div>
  )
}
