import { useState } from 'react'

// G67: numeric input with +/- buttons + free keyboard typing.
//
// Pattern: while the input is *focused*, we display a local string state
// that the user can edit freely (clear, backspace, type intermediate
// out-of-range values). When the input is *not focused*, we display the
// parent's canonical numeric `value` — so external updates (e.g., +/-
// buttons) propagate cleanly without fighting our local state.
//
// The parent's value only updates when the typed input parses to a finite
// integer. On blur we clamp `[min, max]` and propagate the clamped value.
// Submission validation lives on the parent (e.g., `CreateRoom.jsx`
// disables its submit button while the prop value is out of range).
export function Stepper({ value, onChange, min = 2, max = 5, suffix, ariaLabel }) {
  const [isFocused, setIsFocused] = useState(false)
  const [inputStr, setInputStr] = useState(String(value))

  const handleFocus = () => {
    setIsFocused(true)
    setInputStr(String(value))
  }

  const handleInput = (e) => {
    const raw = e.target.value
    setInputStr(raw) // reflect typing
    if (raw === '' || raw === '-') return // intermediate state — don't propagate yet
    const n = parseInt(raw, 10)
    if (Number.isFinite(n)) onChange(n)
  }

  const handleBlur = () => {
    setIsFocused(false)
    const n = parseInt(inputStr, 10)
    let next
    if (!Number.isFinite(n)) next = min
    else if (n < min) next = min
    else if (n > max) next = max
    else next = n
    if (next !== value) onChange(next)
  }

  // Visual red-flag only while focused — when not focused, `value` is always
  // valid (blur clamped it on the way out).
  const parsedNow = parseInt(inputStr, 10)
  const isOutOfRange = isFocused && (
    !Number.isFinite(parsedNow) || parsedNow < min || parsedNow > max
  )

  const displayValue = isFocused ? inputStr : String(value)

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      style={{
        display: 'inline-flex', alignItems: 'stretch', gap: 0,
        border: `1px solid ${isOutOfRange ? 'var(--rouge)' : 'var(--ink-soft)'}`,
        borderRadius: 2,
        transition: 'border-color 0.15s',
      }}
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
          value={displayValue}
          min={min}
          max={max}
          step={1}
          onChange={handleInput}
          onFocus={handleFocus}
          onBlur={handleBlur}
          aria-label={ariaLabel}
          aria-invalid={isOutOfRange}
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
            color: isOutOfRange ? 'var(--rouge)' : 'inherit',
            // Hide the native spinner — the +/- buttons + keyboard arrows
            // cover the increment paths, and the native spinners crowd
            // the small input width.
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
        [role="group"] input[type="number"]::-webkit-outer-spin-button,
        [role="group"] input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
      `}</style>
    </div>
  )
}
