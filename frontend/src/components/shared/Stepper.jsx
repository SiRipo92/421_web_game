export function Stepper({ value, onChange, min = 2, max = 5, suffix, ariaLabel }) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 0, border: '1px solid var(--ink-soft)', borderRadius: 2 }}
    >
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        aria-label="Diminuer"
        style={{ padding: '0.5rem 0.9rem', fontFamily: 'var(--display)', fontSize: '1.2rem', borderRight: '1px solid var(--rule)' }}
      >−</button>
      <div style={{ padding: '0.5rem 1.2rem', fontFamily: 'var(--mono)', fontWeight: 700, minWidth: 70, textAlign: 'center' }}>
        {value}{suffix && <span style={{ color: 'var(--ink-mute)', marginLeft: 4, fontSize: '0.85em' }}>{suffix}</span>}
      </div>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        aria-label="Augmenter"
        style={{ padding: '0.5rem 0.9rem', fontFamily: 'var(--display)', fontSize: '1.2rem', borderLeft: '1px solid var(--rule)' }}
      >+</button>
    </div>
  )
}
