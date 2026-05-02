export function Die({ value, keep, onClick, mini, tumble }) {
  const cls = mini ? 'die-mini' : 'die-paper'
  const pips = Array(value || 1).fill(0)
  return (
    <div
      className={`${cls}${tumble ? ' die-tumble' : ''}`}
      data-val={value || 1}
      data-keep={keep ? 'true' : 'false'}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      aria-pressed={onClick ? !!keep : undefined}
      aria-label={mini ? undefined : `Dé valeur ${value}${keep ? ', conservé' : ''}`}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
    >
      {pips.map((_, i) => <div key={i} className="pip" />)}
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
