export function ChipStack({ count, label }) {
  const visible = Math.min(count, 5)
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <div className="chip-stack" aria-label={`${count} jetons`}>
        {Array(visible).fill(0).map((_, i) => (
          <div key={i} className="chip" style={{ transform: `translateY(${-i * 2}px)` }}>
            {i === visible - 1 ? count : ''}
          </div>
        ))}
      </div>
      {label && <span className="eyebrow" style={{ marginLeft: 8 }}>{label}</span>}
    </div>
  )
}
