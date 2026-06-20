import { useState } from 'react'

/**
 * G97: password <input> with an eye toggle revealing the value.
 *
 * Icons sourced from basicons.xyz (MIT). EyeOpen uses the filled
 * VMware Clarity eye (also MIT, distinct visual weight from the
 * line-drawn stroke icon). Both render at currentColor so the
 * theme/token system can recolor them.
 *
 * Pass `aria-invalid` and `invalid` for the G97 per-field error pattern.
 * Border is rouge on `invalid`, felt-deep on `matches` (e.g. confirm
 * password matches the primary password), and default otherwise.
 */
function EyeOpenIcon({ size = 18 }) {
  // Open eye — "password is currently hidden, click to reveal it".
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M33.62,17.53c-3.37-6.23-9.28-10-15.82-10S5.34,11.3,2,17.53L1.72,18l.26.48c3.37,6.23,9.28,10,15.82,10s12.46-3.72,15.82-10l.26-.48ZM17.8,26.43C12.17,26.43,7,23.29,4,18c3-5.29,8.17-8.43,13.8-8.43S28.54,12.72,31.59,18C28.54,23.29,23.42,26.43,17.8,26.43Z" />
      <circle cx="18.09" cy="18.03" r="6.86" />
    </svg>
  )
}

function EyeClosedIcon({ size = 18 }) {
  // Crossed-out eye — "password is currently visible, click to hide it".
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M2 2L22 22" />
      <path d="M6.71277 6.7226C3.66479 8.79527 2 12 2 12C2 12 5.63636 19 12 19C14.0503 19 15.8174 18.2734 17.2711 17.2884M11 5.05822C11.3254 5.02013 11.6588 5 12 5C18.3636 5 22 12 22 12C22 12 21.3082 13.3317 20 14.8335" />
      <path d="M14 14.2362C13.4692 14.7112 12.7684 15.0001 12 15.0001C10.3431 15.0001 9 13.657 9 12.0001C9 11.1764 9.33193 10.4303 9.86932 9.88818" />
    </svg>
  )
}

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
          paddingRight: '2.6rem',
          borderColor: invalid ? 'var(--rouge)' : matches ? 'var(--felt-deep)' : undefined,
          boxShadow: invalid ? '0 0 0 2px rgba(168,48,42,0.18)' : undefined,
        }}
      />
      <button
        type="button"
        onClick={() => setRevealed((r) => !r)}
        aria-label={revealed ? t('hide_password') : t('show_password')}
        title={revealed ? t('hide_password') : t('show_password')}
        style={{
          position: 'absolute',
          right: '0.5rem',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0.3rem',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--ink-mute)',
          lineHeight: 0,
        }}
      >
        {revealed ? <EyeClosedIcon /> : <EyeOpenIcon />}
      </button>
    </div>
  )
}
