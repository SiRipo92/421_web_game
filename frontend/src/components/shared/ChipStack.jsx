export function ChipStack({ count, label, size = 'default' }) {
  const visible = Math.min(count, 5)
  // G62 follow-up: `size="large"` is used in the centre of the piste so the
  // pool reads as the focal point at any viewport. We scale via `transform`
  // on the wrapper rather than re-styling each `.chip` so we don't touch the
  // shared chip CSS used by other ChipStack call sites (Home.jsx).
  const scale = size === 'large' ? 1.45 : 1
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        transform: scale !== 1 ? `scale(${scale})` : undefined,
        transformOrigin: 'center',
      }}
    >
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
