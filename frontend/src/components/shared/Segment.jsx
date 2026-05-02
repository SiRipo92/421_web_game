export function Segment({ value, onChange, options, ariaLabel }) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      style={{
        display: 'inline-flex',
        border: '1px solid var(--ink-soft)',
        borderRadius: 999,
        padding: 3,
        background: 'var(--paper)',
      }}
    >
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => onChange(opt.value)}
          className="sans"
          style={{
            padding: '0.4rem 1rem', borderRadius: 999,
            fontSize: '0.75rem', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.14em',
            background: value === opt.value ? 'var(--ink)' : 'transparent',
            color: value === opt.value ? 'var(--paper)' : 'var(--ink-soft)',
            transition: 'all 0.15s',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
