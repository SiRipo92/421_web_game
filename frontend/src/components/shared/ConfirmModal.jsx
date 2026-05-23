import { useEffect } from 'react'

/**
 * Small styled confirm dialog. Replaces window.confirm in places we want the
 * prompt to match the bistro theme. Closes on Escape, on backdrop click, and
 * on either button click.
 *
 * Props: title, text, confirmLabel, cancelLabel, onConfirm, onCancel, danger.
 */
export function ConfirmModal({
  title,
  text,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  danger = false,
}) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel?.() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel?.() }}
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
          maxWidth: 420,
          width: '100%',
        }}
      >
        <h2 id="confirm-modal-title" className="display" style={{ fontSize: '1.4rem', margin: '0 0 0.6rem' }}>
          {title}
        </h2>
        {text && (
          <p className="serif" style={{ color: 'var(--ink-soft)', lineHeight: 1.5, margin: '0 0 1.4rem' }}>
            {text}
          </p>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onCancel}
            className="btn btn-ghost"
            style={{ padding: '0.55rem 1.1rem', fontSize: '0.92rem' }}
            autoFocus
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`btn ${danger ? 'btn-rouge' : 'btn-primary'}`}
            style={{ padding: '0.55rem 1.1rem', fontSize: '0.92rem' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
