// G67: the centre value is now an `<input type="number">` so users can type
// directly instead of having to tap the +/- buttons repeatedly. The buttons
// stay for tap-friendly mobile use. Keyboard ↑/↓ arrows inside the input
// step by 1 (browser default for type=number, respects min/max). The input
// clamps to `[min, max]` on blur — during typing it stays free so the user
// can backspace through an out-of-range intermediate value (e.g., 1 → 15)
// without the cursor jumping.
export function Stepper({ value, onChange, min = 2, max = 5, suffix, ariaLabel }) {
  const handleInput = (e) => {
    const raw = e.target.value
    if (raw === '') return
    const n = parseInt(raw, 10)
    if (Number.isFinite(n)) onChange(n)
  }
  const handleBlur = (e) => {
    const n = parseInt(e.target.value, 10)
    if (!Number.isFinite(n)) onChange(min)
    else if (n < min) onChange(min)
    else if (n > max) onChange(max)
  }
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      style={{ display: 'inline-flex', alignItems: 'stretch', gap: 0, border: '1px solid var(--ink-soft)', borderRadius: 2 }}
    >
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        aria-label="Diminuer"
        style={{ padding: '0.5rem 0.9rem', fontFamily: 'var(--display)', fontSize: '1.2rem', borderRight: '1px solid var(--rule)' }}
      >−</button>
      <div style={{ padding: '0.4rem 0.6rem', display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 70, justifyContent: 'center' }}>
        <input
          type="number"
          inputMode="numeric"
          value={value}
          min={min}
          max={max}
          step={1}
          onChange={handleInput}
          onBlur={handleBlur}
          aria-label={ariaLabel}
          style={{
            width: suffix ? 44 : 56,
            padding: 0,
            border: 'none',
            background: 'transparent',
            fontFamily: 'var(--mono)',
            fontWeight: 700,
            fontSize: '1rem',
            textAlign: 'center',
            outline: 'none',
            color: 'inherit',
            // Hide the native spinner — the +/- buttons on the sides
            // already provide the increment affordance, and the native
            // spinners crowd the small input width.
            MozAppearance: 'textfield',
          }}
        />
        {suffix && (
          <span style={{ color: 'var(--ink-mute)', fontSize: '0.85em' }}>{suffix}</span>
        )}
      </div>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        aria-label="Augmenter"
        style={{ padding: '0.5rem 0.9rem', fontFamily: 'var(--display)', fontSize: '1.2rem', borderLeft: '1px solid var(--rule)' }}
      >+</button>
      <style>{`
        /* Suppress the WebKit native spinner inside the Stepper input — its
           position depends on the field's intrinsic width and crowds the
           layout. The flanking +/- buttons + keyboard arrow keys cover the
           increment paths. */
        [role="group"] input[type="number"]::-webkit-outer-spin-button,
        [role="group"] input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
      `}</style>
    </div>
  )
}
