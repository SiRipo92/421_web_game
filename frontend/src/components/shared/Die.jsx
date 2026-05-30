export function Die({ value, keep, onClick, mini, tumble }) {
  const cls = mini ? 'die-mini' : 'die-paper'
  const pips = Array(value || 1).fill(0)
  // G5: corner badge for interactive dice — ✓ when locked, ↺ when set to re-roll.
  // Static / mini dice get no badge.
  const showBadge = !!onClick && !mini
  return (
    <div
      className={`${cls}${tumble ? ' die-tumble' : ''}`}
      data-val={value || 1}
      data-keep={keep ? 'true' : 'false'}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      aria-pressed={onClick ? !!keep : undefined}
      aria-label={mini ? undefined : `Dé valeur ${value}${keep ? ', conservé' : ', sera relancé'}`}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
      style={{ position: 'relative' }}
    >
      {pips.map((_, i) => <div key={i} className="pip" />)}
      {showBadge && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: -8,
            right: -8,
            width: 20,
            height: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            fontSize: '0.72rem',
            fontFamily: 'var(--mono)',
            fontWeight: 700,
            background: keep ? 'var(--brass)' : 'var(--rouge)',
            color: 'var(--paper)',
            border: '1.5px solid var(--paper-deep)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
            pointerEvents: 'none',
          }}
        >
          {keep ? '✓' : '↺'}
        </span>
      )}
    </div>
  )
}

export function DiceRow({ values, mini }) {
  return (
    <div style={{ display: 'flex', gap: mini ? 4 : 12 }}>
      {values.map((v, i) => <Die key={i} value={v} mini={mini} />)}
    </div>
  )
}
