import { useState } from 'react'

export function Avatar({ name, userId, hasAvatar, avatarVersion, active, isSelf, size = 2.6 }) {
  const [imgFailed, setImgFailed] = useState(false)
  const initial = (name || '?').trim()[0]?.toUpperCase() ?? '?'
  const showImg = userId && hasAvatar && !imgFailed

  return (
    <div
      className={`avatar${active ? ' is-active' : ''}${isSelf ? ' is-self' : ''}`}
      style={{ width: `${size}rem`, height: `${size}rem`, fontSize: `${size * 0.42}rem`, overflow: 'hidden', padding: 0 }}
      aria-label={name}
    >
      {showImg ? (
        <img
          src={`/auth/avatar/${userId}?v=${avatarVersion ?? 0}`}
          alt={name}
          onError={() => setImgFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : initial}
    </div>
  )
}
