import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Avatar } from './Avatar.jsx'
import { useLang } from '../../context/LangContext.jsx'
import { useTheme } from '../../context/ThemeContext.jsx'

export function TopBar({ user, onLogout }) {
  const { t, lang, setLang } = useLang()
  const { theme, setTheme } = useTheme()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  const navItems = [
    { path: '/', key: 'home' },
    { path: '/lobby', key: 'rankings', labelKey: 'rankings' },
    { path: '/rankings', key: 'rankings' },
    { path: '/how-to-play', key: 'how_to_play' },
  ]

  const themeOptions = [
    { value: 'cafe', label: 'Café' },
    { value: 'vin', label: 'Vin' },
    { value: 'absinthe', label: 'Absinthe' },
  ]

  return (
    <header style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '1.2rem 2rem',
      borderBottom: '1px solid var(--rule)',
      background: 'var(--paper-soft)',
      position: 'sticky', top: 0, zIndex: 30,
      flexWrap: 'wrap', gap: '0.5rem',
    }}>
      <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }}>
        <div style={{
          width: 38, height: 38, borderRadius: 6,
          background: 'var(--ink)', color: 'var(--paper)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--display)', fontWeight: 900, fontSize: '1.3rem', letterSpacing: '-0.04em',
        }}>421</div>
        <div style={{ textAlign: 'left' }}>
          <div className="display" style={{ fontSize: '1.5rem', lineHeight: 0.9 }}>Le 421</div>
          <div className="eyebrow" style={{ fontSize: '0.6rem' }}>Bistro · Est. 2026</div>
        </div>
      </Link>

      <nav style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }} aria-label="Navigation principale">
        {[
          { to: '/', label: t('home') },
          { to: '/lobby', label: t('rankings') },
          { to: '/rankings', label: t('rankings') },
          { to: '/how-to-play', label: t('how_to_play') },
        ].filter((_, i) => i !== 1).map(item => (
          <Link
            key={item.to}
            to={item.to}
            className="sans"
            style={{
              padding: '0.4rem 0.9rem',
              fontSize: '0.78rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
              textDecoration: 'none',
              color: location.pathname === item.to ? 'var(--rouge)' : 'var(--ink-soft)',
              borderBottom: location.pathname === item.to ? '2px solid var(--rouge)' : '2px solid transparent',
            }}
          >{item.label}</Link>
        ))}

        {/* Lang toggle */}
        <button
          type="button"
          onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}
          className="sans"
          aria-label={`Langue: ${lang === 'fr' ? 'Français' : 'English'}`}
          style={{
            padding: '0.4rem 0.7rem', fontSize: '0.75rem', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.1em',
            border: '1px solid var(--rule)', borderRadius: 2,
            background: 'transparent', color: 'var(--ink-soft)',
          }}
        >{lang === 'fr' ? 'EN' : 'FR'}</button>

        {/* Theme cycle */}
        <button
          type="button"
          onClick={() => {
            const idx = themeOptions.findIndex(o => o.value === theme)
            setTheme(themeOptions[(idx + 1) % themeOptions.length].value)
          }}
          aria-label={`Thème: ${theme}`}
          style={{
            padding: '0.4rem 0.7rem', fontSize: '0.75rem', fontWeight: 700,
            border: '1px solid var(--rule)', borderRadius: 2,
            background: 'transparent', color: 'var(--ink-soft)',
          }}
        >🎨</button>

        <div style={{ width: 1, height: 24, background: 'var(--rule)', margin: '0 4px' }} aria-hidden="true" />

        {user ? (
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer' }}
              aria-haspopup="true"
              aria-expanded={menuOpen}
            >
              <Avatar name={user.username} size={2} />
              <span className="serif" style={{ fontStyle: 'italic' }}>{user.username}</span>
            </button>
            {menuOpen && (
              <div style={{
                position: 'absolute', right: 0, top: '110%',
                background: 'var(--paper-soft)', border: '1px solid var(--rule)',
                borderRadius: 3, boxShadow: '0 6px 20px rgba(28,22,18,0.18)',
                minWidth: 160, zIndex: 50,
              }}>
                <Link to="/profile" onClick={() => setMenuOpen(false)}
                  style={{ display: 'block', padding: '0.7rem 1rem', textDecoration: 'none', color: 'var(--ink)', fontFamily: 'var(--body)' }}
                >{t('profile')}</Link>
                <button type="button" onClick={() => { setMenuOpen(false); onLogout?.() }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.7rem 1rem', fontFamily: 'var(--body)', color: 'var(--rouge)', borderTop: '1px dashed var(--rule)', background: 'none', border: 'none', borderTop: '1px dashed var(--rule)', cursor: 'pointer' }}
                >{t('logout')}</button>
              </div>
            )}
          </div>
        ) : (
          <Link to="/login" className="btn btn-ghost" style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem', textDecoration: 'none' }}>
            {t('login')}
          </Link>
        )}
      </nav>
    </header>
  )
}
