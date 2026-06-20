import { useEffect, useRef } from 'react'

/**
 * G46: in-game presentation popover. Surfaces language (FR/EN), theme
 * (light/dark), and a sound toggle placeholder (G31) in one compact
 * panel — accessible inside the game room where the TopBar is hidden.
 *
 * Per-player choices persist via the underlying `useLang` / `useTheme`
 * contexts (already wired to localStorage). Logged-in users sync their
 * choices to the account via the `onPrefChange` callback supplied by
 * the parent.
 *
 * Closes on Escape, backdrop tap, or the explicit close button.
 *
 * Props:
 *   open       — boolean
 *   onClose    — () => void
 *   t          — i18n helper
 *   lang       — current 'fr' | 'en'
 *   setLang    — (string) => void
 *   theme      — current 'light' | 'dark'
 *   setTheme   — (string) => void
 *   onPrefChange — optional ({lang_pref?, theme_pref?}) => void;
 *                   called when the user flips a preference so a
 *                   logged-in parent can mirror to /auth/me.
 */
export function PresentationPopover({
  open,
  onClose,
  t,
  lang,
  setLang,
  theme,
  setTheme,
  onPrefChange,
}) {
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    // Focus the panel for keyboard users.
    setTimeout(() => panelRef.current?.focus(), 0)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const pickLang = (next) => {
    if (next === lang) return
    setLang(next)
    onPrefChange?.({ lang_pref: next })
  }
  const pickTheme = (next) => {
    if (next === theme) return
    setTheme(next)
    onPrefChange?.({ theme_pref: next })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="presentation-popover-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 940,
        background: 'rgba(20,15,12,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="ticket"
        style={{
          background: 'var(--paper)',
          border: '1px solid var(--rule)',
          borderRadius: 6,
          boxShadow: '0 18px 48px rgba(0,0,0,0.32)',
          padding: '1.6rem',
          maxWidth: 380,
          width: '100%',
          outline: 'none',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
          <div>
            <div className="eyebrow" style={{ fontSize: '0.6rem' }}>
              {t('presentation_eyebrow')}
            </div>
            <h2
              id="presentation-popover-title"
              className="display"
              style={{ fontSize: '1.3rem', margin: '0.15rem 0 0' }}
            >
              {t('presentation_title')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            title={t('close')}
            style={{
              background: 'transparent',
              border: '1px solid var(--rule)',
              borderRadius: 999,
              width: 30,
              height: 30,
              fontSize: '1rem',
              cursor: 'pointer',
              color: 'var(--ink-soft)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >×</button>
        </div>

        <SettingRow label={t('presentation_lang_label')}>
          <Segment
            value={lang}
            options={[
              { value: 'fr', label: 'FR' },
              { value: 'en', label: 'EN' },
            ]}
            onChange={pickLang}
            ariaLabel={t('presentation_lang_label')}
          />
        </SettingRow>

        <SettingRow label={t('presentation_theme_label')}>
          <Segment
            value={theme}
            options={[
              { value: 'light', label: `☀️ ${t('presentation_theme_light')}` },
              { value: 'dark', label: `🌙 ${t('presentation_theme_dark')}` },
            ]}
            onChange={pickTheme}
            ariaLabel={t('presentation_theme_label')}
          />
        </SettingRow>

        <SettingRow label={t('presentation_sound_label')}>
          {/* G31 placeholder — sound toggle slot. Disabled until the
              dice-shake audio work lands. */}
          <span
            className="serif"
            style={{ fontStyle: 'italic', color: 'var(--ink-mute)', fontSize: '0.85rem' }}
          >
            {t('presentation_sound_coming_soon')}
          </span>
        </SettingRow>
      </div>
    </div>
  )
}

function SettingRow({ label, children }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      padding: '0.75rem 0',
      borderTop: '1px dashed var(--rule)',
    }}>
      <span className="eyebrow" style={{ fontSize: '0.62rem' }}>{label}</span>
      {children}
    </div>
  )
}

function Segment({ value, options, onChange, ariaLabel }) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      style={{ display: 'inline-flex', border: '1px solid var(--rule)', borderRadius: 2 }}
    >
      {options.map((opt, i) => {
        const selected = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            style={{
              padding: '0.35rem 0.7rem',
              fontFamily: 'var(--body)',
              fontWeight: 600,
              fontSize: '0.82rem',
              background: selected ? 'var(--ink)' : 'transparent',
              color: selected ? 'var(--paper)' : 'var(--ink-soft)',
              borderLeft: i > 0 ? '1px solid var(--rule)' : 'none',
              cursor: selected ? 'default' : 'pointer',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
