import { useEffect, useState } from 'react'
import { useLang } from '../../context/useLang.js'
import { Stepper } from './Stepper.jsx'

/**
 * Room rules panel. For non-host players it's a read-only summary of the
 * room's current configuration. For the host AND while a game is in
 * progress, the panel also exposes an edit mode (G45) — host edits are
 * queued and apply at the next partie boundary, surfaced via a pending
 * banner and a per-field journal event.
 */
export function RoomSettingsPanel({ room, hostName, isHost, gamePhase, onUpdateRules, onClose }) {
  const { t } = useLang()
  const [editMode, setEditMode] = useState(false)
  const [draft, setDraft] = useState(null)

  // Close on Escape (only when not in edit mode — Escape should cancel
  // the form first if it's open).
  useEffect(() => {
    const handler = (e) => {
      if (e.key !== 'Escape') return
      if (editMode) {
        setEditMode(false)
        setDraft(null)
      } else {
        onClose?.()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose, editMode])

  if (!room) return null

  const pending = room.pending_room_rules || {}
  const hasPending = Object.keys(pending).length > 0
  // The host can edit any time *during* play (CHARGE / DECHARGE / TIEBREAK).
  // In WAITING the rules can still be edited directly on the waiting-room
  // screen, so the edit mode here is gated to active gameplay.
  const canEdit = isHost && ['charge', 'decharge', 'tiebreak'].includes(gamePhase)

  const startEdit = () => {
    // Seed the draft from the *current* live values plus any pending edits
    // already queued (so the host can adjust them further).
    setDraft({
      bank_rule: pending.bank_rule ?? room.bank_rule,
      max_players: pending.max_players ?? room.max_players,
      afk_seconds: pending.afk_seconds ?? room.afk_seconds,
      afk_bot: pending.afk_bot ?? room.afk_bot,
      allow_spectators: pending.allow_spectators ?? room.allow_spectators,
    })
    setEditMode(true)
  }

  const cancelEdit = () => {
    setEditMode(false)
    setDraft(null)
  }

  const saveEdit = () => {
    if (!draft) return
    // Send only the fields the host *actually* changed relative to the
    // live config — the backend drops any that match anyway, but this
    // keeps the wire payload tight.
    const diff = {}
    if (draft.bank_rule !== room.bank_rule) diff.bank_rule = draft.bank_rule
    if (draft.max_players !== room.max_players) diff.max_players = draft.max_players
    if (draft.afk_seconds !== room.afk_seconds) diff.afk_seconds = draft.afk_seconds
    if (draft.afk_bot !== room.afk_bot) diff.afk_bot = draft.afk_bot
    if (draft.allow_spectators !== room.allow_spectators) diff.allow_spectators = draft.allow_spectators
    if (Object.keys(diff).length > 0) onUpdateRules?.(diff)
    setEditMode(false)
    setDraft(null)
  }

  // Render-helper: when a field has a pending edit, append the « → next »
  // marker so the read-only view shows the queued change inline.
  const withPending = (field, currentDisplay, pendingDisplay) => {
    if (!hasPending || pending[field] === undefined) return currentDisplay
    return (
      <>
        <span style={{ textDecoration: 'line-through', opacity: 0.55 }}>{currentDisplay}</span>
        <span style={{ color: 'var(--rouge)', fontWeight: 600, marginLeft: 6 }}>→ {pendingDisplay}</span>
      </>
    )
  }

  const renderReadOnly = () => {
    const rows = [
      { icon: '🌍', label: t('public_room'), value: room.is_public ? t('yes') : t('no') },
      {
        icon: '👥',
        label: t('max_players_label'),
        value: withPending('max_players', `${room.max_players ?? '?'}`, `${pending.max_players}`),
      },
      {
        icon: '🎲',
        label: t('bank_rules'),
        value: withPending(
          'bank_rule',
          room.bank_rule === 'sec' ? t('sec_jusqu_banque') : t('free_play'),
          pending.bank_rule === 'sec' ? t('sec_jusqu_banque') : t('free_play'),
        ),
      },
      {
        icon: '⏱',
        label: t('inactivity_label'),
        value: withPending('afk_seconds', `${room.afk_seconds ?? 45}s`, `${pending.afk_seconds}s`),
      },
      {
        icon: '🤖',
        label: t('afk_takeover'),
        value: withPending(
          'afk_bot',
          room.afk_bot ? t('yes') : t('no'),
          pending.afk_bot ? t('yes') : t('no'),
        ),
      },
      {
        icon: '👁',
        label: t('spectators_label'),
        value: withPending(
          'allow_spectators',
          room.allow_spectators ? t('allowed') : t('private_label'),
          pending.allow_spectators ? t('allowed') : t('private_label'),
        ),
      },
    ]
    return (
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
    )
  }

  const renderEditForm = () => {
    const set = (k) => (v) => setDraft(d => ({ ...d, [k]: v }))
    const ToggleRow = ({ label, value, onChange }) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 10, borderBottom: '1px dashed var(--rule)' }}>
        <span className="eyebrow" style={{ flex: 1 }}>{label}</span>
        <button
          type="button"
          onClick={() => onChange(!value)}
          aria-pressed={value}
          style={{
            padding: '0.3rem 0.7rem',
            border: '1px solid var(--rule)',
            borderRadius: 4,
            background: value ? 'var(--rouge)' : 'var(--paper)',
            color: value ? 'var(--paper)' : 'var(--ink)',
            fontFamily: 'var(--body)',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '0.88rem',
          }}
        >
          {value ? t('yes') : t('no')}
        </button>
      </div>
    )
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 10, borderBottom: '1px dashed var(--rule)' }}>
          <span className="eyebrow" style={{ flex: 1 }}>{t('max_players_label')}</span>
          <Stepper value={draft.max_players} onChange={set('max_players')} min={2} max={5} suffix="" ariaLabel={t('max_players_label')} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 10, borderBottom: '1px dashed var(--rule)' }}>
          <span className="eyebrow" style={{ flex: 1 }}>{t('bank_rules')}</span>
          <div role="radiogroup" style={{ display: 'flex', gap: 6 }}>
            {['sec', 'free'].map(opt => (
              <button
                key={opt}
                type="button"
                role="radio"
                aria-checked={draft.bank_rule === opt}
                onClick={() => set('bank_rule')(opt)}
                style={{
                  padding: '0.3rem 0.7rem',
                  border: `1px solid ${draft.bank_rule === opt ? 'var(--rouge)' : 'var(--rule)'}`,
                  borderRadius: 4,
                  background: draft.bank_rule === opt ? 'rgba(168,48,42,0.08)' : 'var(--paper)',
                  fontFamily: 'var(--body)',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                {opt === 'sec' ? t('sec_jusqu_banque') : t('free_play')}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 10, borderBottom: '1px dashed var(--rule)' }}>
          <span className="eyebrow" style={{ flex: 1 }}>{t('inactivity_label')}</span>
          <Stepper value={draft.afk_seconds} onChange={set('afk_seconds')} min={15} max={120} suffix="s" ariaLabel={t('inactivity_label')} />
        </div>
        <ToggleRow label={t('afk_takeover')} value={draft.afk_bot} onChange={set('afk_bot')} />
        <ToggleRow label={t('spectators_label')} value={draft.allow_spectators} onChange={set('allow_spectators')} />
      </div>
    )
  }

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

        <p className="serif" style={{ color: 'var(--ink-mute)', fontStyle: 'italic', fontSize: '0.85rem', margin: '0 0 1rem' }}>
          {t('room_rules_subtitle')}
        </p>

        {hasPending && !editMode && (
          <div
            style={{
              padding: '0.7rem 0.9rem',
              marginBottom: '1rem',
              background: 'rgba(168,48,42,0.08)',
              border: '1px solid var(--rouge)',
              borderRadius: 4,
              fontFamily: 'var(--body)',
              fontSize: '0.85rem',
              color: 'var(--rouge)',
            }}
            role="status"
          >
            ⏳ {t('room_rules_pending_banner')}
          </div>
        )}

        {hostName && !editMode && (
          <p className="note" style={{ marginBottom: '1rem' }}>
            {t('current_host')}: <strong>{hostName}</strong>
          </p>
        )}

        {editMode ? renderEditForm() : renderReadOnly()}

        {canEdit && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '1.4rem' }}>
            {editMode ? (
              <>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="btn btn-ghost"
                  style={{ padding: '0.5rem 1rem', fontSize: '0.88rem' }}
                >
                  {t('cancel')}
                </button>
                <button
                  type="button"
                  onClick={saveEdit}
                  className="btn btn-rouge"
                  style={{ padding: '0.5rem 1rem', fontSize: '0.88rem' }}
                >
                  {t('room_rules_edit_save')}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={startEdit}
                className="btn btn-ghost"
                style={{ padding: '0.5rem 1rem', fontSize: '0.88rem' }}
              >
                ✎ {t('room_rules_edit_cta')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
