import { useState } from 'react'
import { Die } from '../components/shared/Die.jsx'
import { Avatar } from '../components/shared/Avatar.jsx'
import { ChipStack } from '../components/shared/ChipStack.jsx'
import { CommentaryTicker, ScoreToBeatBanner } from '../components/shared/CommentaryTicker.jsx'
import { BottomSheet } from '../components/shared/BottomSheet.jsx'
import { HierarchyModal } from '../components/shared/HierarchyModal.jsx'
import { RoomSettingsPanel } from '../components/shared/RoomSettingsPanel.jsx'
import { ConfirmModal } from '../components/shared/ConfirmModal.jsx'

/**
 * G64: mobile / tablet gameplay shell (active ≤ 959 px). Rebuilds the room
 * around the small-screen flow:
 *   - slim top header (phase · round · turn indicator · host ⚙)
 *   - full-bleed piste (player ring + dice + pool)
 *   - 2-row bottom dock (primary CTAs + drawer toggles + leave)
 *   - bottom-sheet drawers for Journal / Live feed
 *   - existing HierarchyModal reused via the 📖 dock button
 *
 * Receives the same state + handlers as the desktop layout from `Game.jsx`.
 * Action handlers (roll / keep / done / leave) are wired through `ctx`.
 */
export function GameMobile({
  state,
  t,
  playerId,
  me,
  isHost,
  isMyTurn,
  myTurn,
  hasRolled,
  canRoll,
  canDone,
  showAfkBar,
  roll,
  keep,
  done,
  leave,
  navigate,
  formatLogEntries,
}) {
  const [openDrawer, setOpenDrawer] = useState(null) // 'journal' | 'live' | null
  const [showHierarchy, setShowHierarchy] = useState(false)
  const [showRoomSettings, setShowRoomSettings] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)

  const currentName = state.players?.find(p => p.id === state.current_player_id)?.name || ''

  // G47-style rotation so the viewer's seat anchors at the bottom of the ring.
  const players = state.players || []
  const myIdx = Math.max(0, players.findIndex(p => p.id === playerId))
  const rotated = [...players.slice(myIdx), ...players.slice(0, myIdx)]

  return (
    <div style={{
      height: '100vh',
      display: 'grid',
      gridTemplateRows: 'auto 1fr auto',
      overflow: 'hidden',
      background: 'var(--paper)',
    }}>
      {/* ─── Slim top header ─────────────────────────────────────────────── */}
      <header style={{
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr) auto',
        gap: 8,
        alignItems: 'center',
        padding: '0.5rem 0.8rem',
        borderBottom: '1px solid var(--rule)',
        background: 'var(--paper-soft)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            padding: '0.2rem 0.6rem',
            background: state.phase === 'charge' ? 'var(--rouge)' : 'var(--felt)',
            color: 'var(--paper)',
            fontFamily: 'var(--display)',
            fontWeight: 700,
            fontSize: '0.72rem',
            fontStyle: 'italic',
            letterSpacing: '0.06em',
            transform: 'rotate(-2deg)',
          }}>
            {state.phase === 'charge' ? t('charge') : t('decharge')}
          </span>
          <span className="mono" style={{ fontSize: '0.78rem', color: 'var(--ink-soft)' }}>
            T{String(state.round || 0).padStart(2, '0')}
          </span>
        </div>
        <div className="serif" style={{
          fontSize: '0.85rem',
          color: 'var(--ink)',
          textAlign: 'center',
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {isMyTurn ? t('your_turn') : `${t('waiting_turn')} · ${currentName}`}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {isHost && (
            <button
              type="button"
              onClick={() => setShowRoomSettings(true)}
              aria-label={t('room_rules_button')}
              title={t('room_rules_button')}
              style={mobileIconBtn()}
            >⚙</button>
          )}
        </div>
      </header>

      {/* ─── Full-bleed piste ────────────────────────────────────────────── */}
      <main style={{
        minHeight: 0,
        position: 'relative',
        padding: '0.6rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'visible',
        containerType: 'size',
      }}>
        <div
          className="piste-stage"
          style={{
            position: 'relative',
            width: 'min(560px, 82cqi, 82cqb)',
            aspectRatio: '1/1',
          }}
        >
          <div className="piste" style={{ position: 'absolute', inset: 0 }} role="region" aria-label="Piste de jeu">
            <ScoreToBeatBanner plays={state.current_round_plays} t={t} />

            {/* Pool — focal centre */}
            <div style={{
              position: 'absolute', top: '46%', left: '50%', transform: 'translate(-50%,-50%)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
            }}>
              {(state.pool ?? 0) > 0 && <ChipStack count={state.pool} size="large" />}
              <span className="eyebrow" style={{
                fontSize: '0.78rem', color: 'var(--paper-deep)', letterSpacing: '0.12em',
              }}>
                {t('pool')} · <span className="mono" style={{ fontSize: '0.95rem', fontWeight: 700 }}>{state.pool ?? 0}</span>
              </span>
            </div>

            {/* Dice cluster — anchored at the bottom of the felt. Dice are
                sized via `--die-size` which media-queries down on mobile. */}
            <div style={{
              position: 'absolute', bottom: '6%', left: '50%', transform: 'translateX(-50%)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
              maxWidth: '90%',
            }}>
              <div style={{ display: 'flex', gap: 10 }}>
                {(myTurn?.dice || [0, 0, 0]).map((v, i) => (
                  <Die
                    key={i}
                    value={v || 0}
                    keep={myTurn ? !myTurn.reroll[i] && hasRolled : false}
                    tumble={false}
                    onClick={isMyTurn && hasRolled && !myTurn?.done ? () => keep(i) : undefined}
                  />
                ))}
              </div>
              {myTurn?.combo && (
                <div style={{
                  fontFamily: 'var(--display)', fontSize: '1rem',
                  color: myTurn.combo === '421' ? 'var(--brass-soft)' : 'var(--paper)',
                  textShadow: '0 2px 6px rgba(0,0,0,0.5)',
                }}>
                  {myTurn.combo} · <span className="mono">{myTurn.fiches}f</span>
                </div>
              )}
            </div>
          </div>

          {/* Player ring — viewer at the bottom (G47 rotation). */}
          {rotated.map((p, i) => {
            const total = rotated.length
            const angle = 90 + (360 / total) * i
            const rad = (angle * Math.PI) / 180
            const r = 50
            const x = 50 + r * Math.cos(rad)
            const y = 50 + r * Math.sin(rad)
            return (
              <MobilePisteSeat
                key={p.id}
                p={p}
                active={p.id === state.current_player_id}
                isSelf={p.id === playerId}
                x={x}
                y={y}
              />
            )
          })}
        </div>
        {showAfkBar && (
          <div style={{
            position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.45)', color: 'var(--paper)',
            padding: '0.2rem 0.6rem', borderRadius: 4, fontSize: '0.72rem',
            fontFamily: 'var(--mono)',
          }} aria-live="polite">
            ⏱ {t('afk_takeover')}
          </div>
        )}
      </main>

      {/* ─── Bottom dock — 2 rows ────────────────────────────────────────── */}
      <footer style={{
        borderTop: '1px solid var(--rule)',
        background: 'var(--paper-soft)',
        padding: '0.6rem 0.8rem',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}>
        {/* Row 1: primary CTAs */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={roll}
            disabled={!canRoll}
            className="btn btn-rouge"
            style={{
              flex: 1, minHeight: 48, fontSize: '1rem',
              opacity: canRoll ? 1 : 0.4,
            }}
            aria-label={!hasRolled ? t('roll') : t('reroll')}
          >🎲 {!hasRolled ? t('roll') : t('reroll')}</button>
          <button
            type="button"
            onClick={done}
            disabled={!canDone}
            className="btn btn-primary"
            style={{
              flex: 1, minHeight: 48, fontSize: '1rem',
              opacity: canDone ? 1 : 0.4,
            }}
            aria-label={t('validate')}
          >✓ {t('validate')}</button>
        </div>
        {/* Row 2: drawer toggles + leave */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => setOpenDrawer('journal')}
            style={mobileDockBtn()}
            aria-label={t('log_subtitle')}
          >📰</button>
          <button
            type="button"
            onClick={() => setOpenDrawer('live')}
            style={mobileDockBtn()}
            aria-label={t('ticker_title')}
          >📣</button>
          <button
            type="button"
            onClick={() => setShowHierarchy(true)}
            style={mobileDockBtn()}
            aria-label={t('hierarchy_open')}
          >📖</button>
          <div className="serif" style={{
            flex: 1, fontSize: '0.78rem', color: 'var(--ink-soft)', fontStyle: 'italic',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {isMyTurn
              ? !hasRolled ? t('keep_hint') : `${myTurn?.rolls_left ?? 0} ${t('rolls_left')}.`
              : `${t('waiting_for')}`}
          </div>
          <button
            type="button"
            onClick={() => setShowLeaveConfirm(true)}
            style={{ ...mobileDockBtn(), borderColor: 'var(--rouge)', color: 'var(--rouge)' }}
            aria-label={t('leave')}
          >🚪</button>
        </div>
      </footer>

      {/* ─── Drawers (bottom-sheet) ──────────────────────────────────────── */}
      <BottomSheet
        open={openDrawer === 'journal'}
        onClose={() => setOpenDrawer(null)}
        title={t('log_subtitle')}
      >
        {formatLogEntries(state, t, me?.name).map((text, i) => (
          <div key={i} style={{
            padding: '0.45rem 0',
            borderBottom: '1px dashed var(--rule)',
            fontFamily: 'var(--body)', fontSize: '0.9rem', color: 'var(--ink)',
          }}>{text}</div>
        ))}
      </BottomSheet>

      <BottomSheet
        open={openDrawer === 'live'}
        onClose={() => setOpenDrawer(null)}
        title={t('ticker_title') || 'Live'}
      >
        <CommentaryTicker events={state.log_events} t={t} />
      </BottomSheet>

      {/* ─── Existing modals — shared with desktop ──────────────────────── */}
      <HierarchyModal
        open={showHierarchy}
        onClose={() => setShowHierarchy(false)}
        t={t}
      />
      {showRoomSettings && (
        <RoomSettingsPanel
          room={state.room}
          hostName={state.players?.find(p => p.id === state.room?.host_player_id)?.name}
          onClose={() => setShowRoomSettings(false)}
        />
      )}
      {showLeaveConfirm && (
        <ConfirmModal
          title={t('confirm_leave_title')}
          text={t('confirm_leave_text')}
          confirmLabel={t('confirm_leave_yes')}
          cancelLabel={t('confirm_leave_no')}
          danger
          onConfirm={() => { leave(); navigate('/') }}
          onCancel={() => setShowLeaveConfirm(false)}
        />
      )}
    </div>
  )
}

/* ─── Mobile-flavoured PisteSeat ──────────────────────────────────────────
   Smaller-than-desktop seat that still anchors the viewer at the bottom with
   a brass underline. The active player keeps the G53 pulse via the shared
   `piste-seat-active` class. */
function MobilePisteSeat({ p, active, isSelf, x, y }) {
  return (
    <div style={{
      position: 'absolute', left: `${x}%`, top: `${y}%`,
      transform: 'translate(-50%, -50%)',
      pointerEvents: 'none',
    }}>
      <div
        className={active ? 'piste-seat piste-seat-active' : 'piste-seat'}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
        }}
      >
        <Avatar
          name={p.name}
          userId={p.user_id}
          hasAvatar={p.has_avatar ?? false}
          active={active}
          isSelf={isSelf}
          size={isSelf ? 2.6 : 2.1}
        />
        <div style={{
          background: active ? 'var(--ink)' : 'var(--paper-soft)',
          color: active ? 'var(--paper)' : 'var(--ink)',
          border: '1px solid var(--rule)',
          padding: '0.15rem 0.5rem',
          borderRadius: 2,
          fontFamily: 'var(--display)', fontWeight: 700,
          fontSize: isSelf ? '0.72rem' : '0.65rem',
          whiteSpace: 'nowrap',
          maxWidth: '85px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          borderBottom: isSelf ? '2px solid var(--brass)' : undefined,
        }}>
          {p.name}{isSelf ? ' ★' : ''}
        </div>
        <div style={{
          fontFamily: 'var(--mono)', fontWeight: 700, fontSize: '0.62rem',
          color: 'var(--ink-soft)',
        }}>
          {p.tokens ?? 0} 🪙
        </div>
      </div>
    </div>
  )
}

function mobileIconBtn() {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 36, height: 36, borderRadius: 999,
    background: 'var(--paper)', border: '1px solid var(--rule)',
    color: 'var(--ink-soft)', fontSize: '1rem', cursor: 'pointer',
  }
}

function mobileDockBtn() {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minWidth: 44, height: 44, borderRadius: 6,
    background: 'var(--paper)', border: '1px solid var(--rule)',
    color: 'var(--ink-soft)', fontSize: '1.1rem', cursor: 'pointer',
  }
}
