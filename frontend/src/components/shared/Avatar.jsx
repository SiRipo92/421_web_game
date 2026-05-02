export function Avatar({ name, active, isSelf, size = 2.6 }) {
  const initial = (name || '?').trim()[0]?.toUpperCase() ?? '?'
  return (
    <div
      className={`avatar${active ? ' is-active' : ''}${isSelf ? ' is-self' : ''}`}
      style={{ width: `${size}rem`, height: `${size}rem`, fontSize: `${size * 0.42}rem` }}
      aria-label={name}
    >
      {initial}
    </div>
  )
}
