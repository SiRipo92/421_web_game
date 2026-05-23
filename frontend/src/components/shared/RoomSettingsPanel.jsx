import { useEffect } from 'react'
import { useLang } from '../../context/useLang.js'

/**
 * Read-only summary of the room rules. The host can open this from inside the
 * game to remind themselves (and to share/screenshot) of the configuration
 * they chose at create time. Settings are intentionally not editable —
 * changing them mid-game would invalidate scoring.
 */
export function RoomSettingsPanel({ room, hostName, onClose }) {
  const { t } = useLang()

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  if (!room) return null

  const rows = [
    { icon: '🌍', label: t('public_room'), value: room.is_public ? t('yes') : t('no') },
    { icon: '👥', label: t('max_players_label'), value: `${room.max_players ?? '?'}` },
    {
      icon: '🎲',
      label: t('bank_rules'),
      value: room.bank_rule === 'sec' ? t('sec_jusqu_banque') : t('free_play'),
    },
    {
      icon: '⏱',
      label: t('inactivity_label'),
      value: `${room.afk_seconds ?? 45}s${room.afk_bot ? ' · ' + t('bot_takes_over') : ''}`,
    },
    {
      icon: '👁',
      label: t('spectators_label'),
      value: room.allow_spectators ? t('allowed') : t('private_label'),
    },
  ]

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="room-settings-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 900,
        background: 'rgba(20,15,12,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        style={{
          background: 'var(--paper)',
          border: '1px solid var(--rule)',
          borderRadius: 6,
          boxShadow: '0 18px 48px rgba(0,0,0,0.32)',
          padding: '1.8rem',
          maxWidth: 460,
          width: '100%',
          maxHeight: '85vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 4 }}>{t('room_settings')}</div>
            <h2 id="room-settings-title" className="display" style={{ fontSize: '1.6rem', margin: 0 }}>
              {t('room_rules_title')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.4rem',
              color: 'var(--ink-mute)',
              lineHeight: 1,
              padding: 4,
            }}
          >×</button>
        </div>

        <p className="serif" style={{ color: 'var(--ink-mute)', fontStyle: 'italic', fontSize: '0.85rem', margin: '0 0 1.2rem' }}>
          {t('room_rules_subtitle')}
        </p>

        {hostName && (
          <p className="note" style={{ marginBottom: '1rem' }}>
            {t('current_host')}: <strong>{hostName}</strong>
          </p>
        )}

        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map((row, i) => (
            <li
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                paddingBottom: 10,
                borderBottom: i < rows.length - 1 ? '1px dashed var(--rule)' : 'none',
              }}
            >
              <span style={{ fontSize: '1.1rem' }} aria-hidden="true">{row.icon}</span>
              <span className="eyebrow" style={{ flex: 1 }}>{row.label}</span>
              <span className="serif" style={{ fontStyle: 'italic', fontSize: '0.95rem' }}>{row.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
