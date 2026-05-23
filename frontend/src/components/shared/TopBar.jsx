import { useState, useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Avatar } from './Avatar.jsx'
import { useLang } from '../../context/useLang.js'
import { useTheme } from '../../context/useTheme.js'

function LangToggle({ lang, setLang, onSelect }) {
  return (
    <div role="group" aria-label="Language" className="topbar-lang">
      {['fr', 'en'].map(l => (
        <button
          key={l}
          type="button"
          onClick={() => { setLang(l); onSelect?.() }}
          className="sans"
          aria-pressed={lang === l}
          aria-label={l === 'fr' ? 'Français' : 'English'}
          style={{
            padding: '0.4rem 0.65rem', fontSize: '0.75rem', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.1em',
            border: 'none', cursor: lang === l ? 'default' : 'pointer',
            background: lang === l ? 'var(--ink)' : 'transparent',
            color: lang === l ? 'var(--paper)' : 'var(--ink-soft)',
            transition: 'background 0.15s, color 0.15s',
          }}
        >{l}</button>
      ))}
    </div>
  )
}

function ThemeToggle({ theme, setTheme, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => { setTheme(theme === 'light' ? 'dark' : 'light'); onSelect?.() }}
      aria-label={theme === 'light' ? 'Passer en mode sombre' : 'Passer en mode clair'}
      className="topbar-theme-btn"
    >{theme === 'light' ? '🌙' : '☀️'}</button>
  )
}

export function TopBar({ user, onLogout }) {
  const { t, lang, setLang } = useLang()
  const { theme, setTheme } = useTheme()
  const location = useLocation()
  const [burgerOpen, setBurgerOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef(null)

  // Close burger on navigation — legitimate route-change side-effect, not derivable
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setBurgerOpen(false) }, [location.pathname])

  // Close user dropdown on outside click
  useEffect(() => {
    if (!userMenuOpen) return
    const handler = (e) => { if (!userMenuRef.current?.contains(e.target)) setUserMenuOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [userMenuOpen])

  const navLinks = [
    { to: '/', label: t('home') },
    { to: '/rankings', label: t('rankings') },
    { to: '/how-to-play', label: t('how_to_play') },
  ]

  return (
    <header className="topbar">

      {/* ── Logo ─────────────────────────────────────────────────────── */}
      <Link to="/" className="topbar-logo" onClick={() => setBurgerOpen(false)}>
        <div className="topbar-logo-badge">421</div>
        <div>
          <div className="display" style={{ fontSize: '1.5rem', lineHeight: 0.9 }}>Le 421</div>
          <div className="eyebrow" style={{ fontSize: '0.6rem' }}>Bistro · Est. 2026</div>
        </div>
      </Link>

      {/* ── Desktop nav ──────────────────────────────────────────────── */}
      <nav className="topbar-nav" aria-label="Navigation principale">
        {navLinks.map(item => (
          <Link
            key={item.to}
            to={item.to}
            className={`topbar-link sans${location.pathname === item.to ? ' active' : ''}`}
          >{item.label}</Link>
        ))}

        <div className="topbar-rule" aria-hidden="true" />
        <LangToggle lang={lang} setLang={setLang} />
        <ThemeToggle theme={theme} setTheme={setTheme} />
        <div className="topbar-rule" aria-hidden="true" />

        {user ? (
          <div style={{ position: 'relative' }} ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
              aria-haspopup="true"
              aria-expanded={userMenuOpen}
            >
              <Avatar name={user.username} userId={user.id} hasAvatar={user.has_avatar} avatarVersion={user._ver ?? 0} size={2} />
              <span className="serif" style={{ fontStyle: 'italic' }}>{user.username}</span>
            </button>
            {userMenuOpen && (
              <div className="topbar-user-dropdown">
                <Link to="/profile" onClick={() => setUserMenuOpen(false)}
                  style={{ display: 'block', padding: '0.7rem 1rem', textDecoration: 'none', color: 'var(--ink)', fontFamily: 'var(--body)' }}
                >{t('profile')}</Link>
                <button type="button" onClick={() => { setUserMenuOpen(false); onLogout?.() }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.7rem 1rem', fontFamily: 'var(--body)', color: 'var(--rouge)', borderTop: '1px dashed var(--rule)', cursor: 'pointer' }}
                >{t('logout')}</button>
              </div>
            )}
          </div>
        ) : (
          <Link to="/login" className="btn btn-ghost"
            style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem', textDecoration: 'none' }}
          >{t('login')}</Link>
        )}
      </nav>

      {/* ── Burger button (mobile only) ───────────────────────────────── */}
      <button
        type="button"
        className="topbar-burger"
        onClick={() => setBurgerOpen(o => !o)}
        aria-label={burgerOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
        aria-expanded={burgerOpen}
        aria-controls="mobile-menu"
      >
        <span className={`burger-icon${burgerOpen ? ' open' : ''}`} aria-hidden="true">
          <span /><span /><span />
        </span>
      </button>

      {/* ── Mobile drawer ────────────────────────────────────────────── */}
      <div id="mobile-menu" className={`topbar-drawer${burgerOpen ? ' open' : ''}`} aria-hidden={!burgerOpen}>

        <nav aria-label="Navigation mobile">
          {navLinks.map(item => (
            <Link
              key={item.to}
              to={item.to}
              className={`topbar-drawer-link sans${location.pathname === item.to ? ' active' : ''}`}
              onClick={() => setBurgerOpen(false)}
            >{item.label}</Link>
          ))}
          {user && (
            <Link
              to="/profile"
              className={`topbar-drawer-link sans${location.pathname === '/profile' ? ' active' : ''}`}
              onClick={() => setBurgerOpen(false)}
            >{t('profile')}</Link>
          )}
        </nav>

        <div className="topbar-drawer-controls">
          <div className="topbar-drawer-row">
            <span className="eyebrow">Langue</span>
            <LangToggle lang={lang} setLang={setLang} onSelect={() => setBurgerOpen(false)} />
          </div>
          <div className="topbar-drawer-row">
            <span className="eyebrow">{theme === 'light' ? 'Mode sombre' : 'Mode clair'}</span>
            <ThemeToggle theme={theme} setTheme={setTheme} onSelect={() => setBurgerOpen(false)} />
          </div>
        </div>

        <div className="topbar-drawer-footer">
          {user ? (
            <button
              type="button"
              onClick={() => { setBurgerOpen(false); onLogout?.() }}
              className="topbar-drawer-logout sans"
            >{t('logout')}</button>
          ) : (
            <Link
              to="/login"
              className="btn btn-ghost"
              onClick={() => setBurgerOpen(false)}
              style={{ width: '100%', justifyContent: 'center', textDecoration: 'none' }}
            >{t('login')}</Link>
          )}
        </div>
      </div>

    </header>
  )
}
