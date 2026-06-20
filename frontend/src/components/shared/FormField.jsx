/**
 * G97: standard field wrapper for the registration + login forms.
 *
 * Pattern: label + child input + optional inline status (spinner / check / X) +
 * red error message under the input when `error` is non-empty.
 *
 * The child input should accept `invalid` and style itself accordingly
 * (red border + subtle rouge halo). For plain <input>s, you can use
 * inline style with the `invalid` prop; for the PasswordInput component
 * the styling is baked in.
 */
export function FormField({ label, htmlFor, required, error, hint, status, children }) {
  const hasError = Boolean(error)
  return (
    <div>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        {required && <span style={{ color: 'var(--rouge)', marginLeft: 4 }} aria-hidden="true">*</span>}
        {status && <span style={{ marginLeft: 8 }}>{status}</span>}
      </label>
      {children}
      {hasError ? (
        <p
          role="alert"
          style={{
            color: 'var(--rouge)',
            fontSize: '0.85rem',
            margin: '0.3rem 0 0',
            fontStyle: 'italic',
          }}
        >
          {error}
        </p>
      ) : hint ? (
        <p
          style={{
            color: 'var(--ink-mute)',
            fontSize: '0.78rem',
            margin: '0.3rem 0 0',
            fontStyle: 'italic',
          }}
        >
          {hint}
        </p>
      ) : null}
    </div>
  )
}
