import { useState } from 'react'

/**
 * G97: password <input> with an eye toggle revealing the value.
 *
 * Used in Login + Register + Reset Password. Maintains the same input
 * focus/selection across the toggle (browsers re-focus the element on
 * type change so we cooperate with that).
 *
 * Pass `aria-invalid` and `error` for the G97 per-field error pattern —
 * we don't render the message ourselves (that's the form's job, under
 * the input) but we color the border red when `aria-invalid="true"`.
 */
export function PasswordInput({ id, value, onChange, onBlur, autoComplete = 'current-password', placeholder, required, invalid, matches, t }) {
  const [revealed, setRevealed] = useState(false)
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <input
        id={id}
        type={revealed ? 'text' : 'password'}
        className="input"
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        aria-invalid={invalid ? 'true' : 'false'}
        style={{
          width: '100%',
          paddingRight: '4.2rem',
          borderColor: invalid ? 'var(--rouge)' : matches ? 'var(--felt-deep)' : undefined,
          boxShadow: invalid ? '0 0 0 2px rgba(168,48,42,0.18)' : undefined,
        }}
      />
      <button
        type="button"
        onClick={() => setRevealed((r) => !r)}
        className="btn-link"
        aria-label={revealed ? t('hide_password') : t('show_password')}
        title={revealed ? t('hide_password') : t('show_password')}
        style={{
          position: 'absolute',
          right: '0.6rem',
          padding: '0.2rem 0.4rem',
          fontSize: '0.7rem',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--ink-mute)',
          fontFamily: 'var(--body)',
          fontWeight: 600,
        }}
      >
        {revealed ? t('password_hide_short') : t('password_show_short')}
      </button>
    </div>
  )
}
