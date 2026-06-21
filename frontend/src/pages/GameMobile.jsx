import { useEffect, useRef, useState } from 'react'
import { Die } from '../components/shared/Die.jsx'
import { Avatar } from '../components/shared/Avatar.jsx'
import { CommentaryTicker, ScoreToBeatBanner } from '../components/shared/CommentaryTicker.jsx'
import { OpponentLeftWaitingOverlay } from '../components/shared/OpponentLeftWaitingOverlay.jsx'
import { BottomSheet } from '../components/shared/BottomSheet.jsx'
import { HierarchyModal } from '../components/shared/HierarchyModal.jsx'
import { RoomSettingsPanel } from '../components/shared/RoomSettingsPanel.jsx'
import { ConfirmModal } from '../components/shared/ConfirmModal.jsx'
import { PresentationPopover } from '../components/shared/PresentationPopover.jsx'

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
  updateRoomRules,
  lang,
  setLang,
  theme,
  setTheme,
  onPrefChange,
}) {
  const [openDrawer, setOpenDrawer] = useState(null) // 'journal' | 'live' | null
  const [showHierarchy, setShowHierarchy] = useState(false)
  const [showRoomSettings, setShowRoomSettings] = useState(false)
  const [showPresentation, setShowPresentation] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const opponentToast = useOpponentPlayToast(state.current_round_plays, playerId)

  const currentName = state.players?.find(p => p.id === state.current_player_id)?.name || ''

  // G47-style rotation so the viewer's seat anchors at the bottom of the ring.
  const players = state.players || []
  const myIdx = Math.max(0, players.findIndex(p => p.id === playerId))
  const rotated = [...players.slice(myIdx), ...players.slice(0, myIdx)]

  return (
    <div
      className="gameroom-shell gameroom-shell-mobile"
      style={{
        height: '100vh',
        display: 'grid',
        gridTemplateRows: 'auto 1fr auto',
        overflow: 'hidden',
        background: 'var(--paper)',
      }}
    >
      {/* ─── Slim top header ─────────────────────────────────────────────── */}
      <header
        className="gameroom-header gameroom-header-mobile"
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0, 1fr) auto',
          gap: 8,
          alignItems: 'center',
          padding: '0.5rem 0.8rem',
          borderBottom: '1px solid var(--rule)',
          background: 'var(--paper-soft)',
        }}
      >
        <div className="gameroom-header-phase" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            className="gameroom-phase-chip"
            style={{
              padding: '0.2rem 0.6rem',
              background: state.phase === 'charge' ? 'var(--rouge)' : 'var(--felt)',
              color: 'var(--paper)',
              fontFamily: 'var(--display)',
              fontWeight: 700,
              fontSize: '0.72rem',
              fontStyle: 'italic',
              letterSpacing: '0.06em',
              transform: 'rotate(-2deg)',
            }}
          >
            {state.phase === 'charge' ? t('charge') : t('decharge')}
          </span>
          <span className="gameroom-round-number mono" style={{ fontSize: '0.78rem', color: 'var(--ink-soft)' }}>
            T{String(state.round || 0).padStart(2, '0')}
          </span>
        </div>
        <div
          className="gameroom-turn-indicator serif"
          style={{
            fontSize: '0.85rem',
            color: 'var(--ink)',
            textAlign: 'center',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {isMyTurn ? t('your_turn') : `${t('waiting_turn')} · ${currentName}`}
        </div>
        {/* Top-right Quit. Was previously the ⚙ settings button in this
            slot; user feedback moved Quit here (mobile-app convention:
            primary "exit this surface" lives top-right) and pushed
            Settings into the dock (G62 follow-up). */}
        <div className="gameroom-header-actions" style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={() => setShowLeaveConfirm(true)}
            aria-label={t('leave')}
            title={t('leave')}
            className="gameroom-leave-btn"
            style={{ ...mobileIconBtn(), borderColor: 'var(--rouge)', color: 'var(--rouge)' }}
          >🚪</button>
        </div>
      </header>

      {/* ─── Full-bleed piste ────────────────────────────────────────────── */}
      <main
        className="gameroom-main gameroom-piste-area"
        style={{
          minHeight: 0,
          position: 'relative',
          // G64 follow-up: bigger padding so seats (which extend outside the
          // piste perimeter) have visible breathing room above and below
          // before the header / dock edges.
          padding: '1.4rem 0.6rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'visible',
          containerType: 'size',
        }}
      >
        <div
          className="gameroom-piste-stage piste-stage"
          style={{
            position: 'relative',
            // G64 follow-up: shrink to leave ~30 % of the available space
            // as the seat ring (was 18 %). Player names + chip counters
            // were overlapping the dice cluster at the piste bottom; pulling
            // the piste inward gives the bottom seat room to live outside
            // the felt without colliding with the dice.
            width: 'min(440px, 70cqi, 70cqb)',
            aspectRatio: '1/1',
          }}
        >
          <div className="gameroom-piste piste" style={{ position: 'absolute', inset: 0 }} role="region" aria-label="Piste de jeu">
            <ScoreToBeatBanner plays={state.current_round_plays} t={t} />

            {/* Pool — focal centre. User feedback: show chips currently
                in play (the dynamic stat that changes turn-to-turn) rather
                than chips still in the bank — bank is a secondary number.
                In-play = sum of all players' token holdings. */}
            <div
              className="gameroom-pool"
              style={{
                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              }}
            >
              {(() => {
                const inPlay = (state.players || []).reduce((s, p) => s + (p.tokens || 0), 0)
                // User feedback (2026-06-21 mobile playtest): the ChipStack
                // visual covers Score-to-Beat banner + dice cluster at narrow
                // viewports. Drop the visual on mobile and keep just the
                // text label — desktop keeps the visual via Game.jsx.
                return (
                  <span className="gameroom-pool-label eyebrow" style={{
                    fontSize: '0.78rem', color: 'var(--paper-deep)', letterSpacing: '0.12em',
                    background: 'rgba(15, 11, 8, 0.6)', padding: '0.3rem 0.7rem', borderRadius: 4,
                  }}>
                    {t('chips_in_play')} · <span className="mono" style={{ fontSize: '0.95rem', fontWeight: 700 }}>{inPlay}</span>
                  </span>
                )
              })()}
            </div>

            {/* Dice cluster — lifted to bottom: 14 % to clear the bottom
                seat's avatar. Dice sized via `--die-size` (clamp-based,
                scoped to `.gameroom-piste-stage` so it adapts to the felt). */}
            <div
              className="gameroom-dice-cluster"
              style={{
                position: 'absolute', bottom: '14%', left: '50%', transform: 'translateX(-50%)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                maxWidth: '90%',
              }}
            >
              <div className="gameroom-dice-row" style={{ display: 'flex', gap: 10 }}>
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
                <div
                  className="gameroom-combo-label"
                  style={{
                    fontFamily: 'var(--display)', fontSize: '1rem',
                    color: myTurn.combo === '421' ? 'var(--brass-soft)' : 'var(--paper)',
                    textShadow: '0 2px 6px rgba(0,0,0,0.5)',
                  }}
                >
                  {myTurn.combo} · <span className="mono">{myTurn.fiches}f</span>
                </div>
              )}
            </div>
          </div>

          {/* Player ring — viewer at the bottom (G47 rotation).
              G64 follow-up: seats anchor at r=58 so the bottom seat (viewer)
              sits clearly outside the piste circle. With the previous r=50,
              the seat's name pill + token line landed inside the piste at
              the same y as the dice cluster (overlap). r=58 + smaller
              piste-stage = clean separation. */}
          {rotated.map((p, i) => {
            const total = rotated.length
            const angle = 90 + (360 / total) * i
            const rad = (angle * Math.PI) / 180
            const r = 58
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
        {/* G101i: bank/pot indicator pinned to the top of the piste area,
            above the top opponent seat. Mobile-only — desktop has the
            same number in the Game.jsx header. Hidden once the bank is
            empty (that's itself a meaningful in-game signal). */}
        {(state.pool ?? 0) > 0 && (
          <div
            className="gameroom-bank-banner"
            style={{
              position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(15, 11, 8, 0.6)',
              color: '#F4ECD8',
              padding: '0.25rem 0.7rem', borderRadius: 4,
              border: '1px solid rgba(212, 171, 103, 0.4)',
              fontSize: '0.72rem',
              display: 'inline-flex', alignItems: 'baseline', gap: 6,
              zIndex: 5,
            }}
            aria-live="polite"
            aria-label={`${t('pool')} ${state.pool}`}
          >
            <span className="eyebrow" style={{ fontSize: '0.58rem', color: '#E0BA78', letterSpacing: '0.12em' }}>
              {t('pool')}
            </span>
            <span className="mono" style={{ fontWeight: 700 }}>{state.pool}</span>
          </div>
        )}
        {showAfkBar && (
          <div
            className="gameroom-afk-banner"
            style={{
              // Sits below the bank banner (top: 36 vs bank's top: 6) so
              // the two coexist without overlap when both are visible.
              position: 'absolute', top: (state.pool ?? 0) > 0 ? 36 : 6, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(0,0,0,0.45)', color: 'var(--paper)',
              padding: '0.2rem 0.6rem', borderRadius: 4, fontSize: '0.72rem',
              fontFamily: 'var(--mono)',
            }}
            aria-live="polite"
          >
            ⏱ {t('afk_takeover')}
          </div>
        )}

        {/* G64 follow-up: opponent-play toast. Sits below the bottom seat,
            above the dock. Auto-dismisses after 4.2s. Tap opens the
            journal drawer for the full play-by-play. */}
        <MobileOpponentPlayToast
          event={opponentToast}
          t={t}
          onOpenJournal={() => setOpenDrawer('journal')}
        />
      </main>

      {/* ─── Bottom dock — 2 rows ────────────────────────────────────────── */}
      <footer
        className="gameroom-dock gameroom-dock-mobile"
        style={{
          borderTop: '1px solid var(--rule)',
          background: 'var(--paper-soft)',
          padding: '0.6rem 0.8rem',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {/* Row 1: primary CTAs */}
        <div className="gameroom-dock-primary" style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={roll}
            disabled={!canRoll}
            className="btn btn-rouge gameroom-roll-btn"
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
            className="btn btn-primary gameroom-validate-btn"
            style={{
              flex: 1, minHeight: 48, fontSize: '1rem',
              opacity: canDone ? 1 : 0.4,
            }}
            aria-label={t('validate')}
          >✓ {t('validate')}</button>
        </div>
        {/* Row 2: drawer toggles + settings.
            User feedback: Settings (host-only) moved from header to dock,
            replacing the previous bottom-right Quit which moved to the
            header. */}
        <div className="gameroom-dock-secondary" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {/* User feedback (2026-06-21): the L'Ardoise journal drawer is
              desktop-only friendly. On mobile the opponent-play toast +
              live ticker cover the same surface with less drawer-tap
              friction. Journal button removed from the mobile dock. The
              MobileOpponentPlayToast still opens the journal drawer on
              tap for users who want the full history. */}
          <button
            type="button"
            onClick={() => setOpenDrawer('live')}
            style={mobileDockBtn()}
            aria-label={t('ticker_title')}
            className="gameroom-live-btn"
          >📣</button>
          <button
            type="button"
            onClick={() => setShowHierarchy(true)}
            style={mobileDockBtn()}
            aria-label={t('hierarchy_open')}
            className="gameroom-hierarchy-btn"
          >📖</button>
          {/* G64 follow-up: the long « Cliquez sur un dé pour le changer,
              puis relancez. » string was pushing the ⚙ / 🚪 dock buttons
              off-screen under ~450 px because flex items default to
              `min-width: auto` (= content width). Adding `minWidth: 0`
              lets the item shrink so the ellipsis actually kicks in.
              Under 400 px we also hide the hint entirely — the dock
              buttons matter more than the prose. */}
          <div className="gameroom-turn-hint serif" style={{
            flex: 1,
            minWidth: 0,
            fontSize: '0.78rem', color: 'var(--ink-soft)', fontStyle: 'italic',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {isMyTurn
              ? !hasRolled ? t('keep_hint') : `${myTurn?.rolls_left ?? 0} ${t('rolls_left')}.`
              : `${t('waiting_for')}`}
          </div>
          <button
            type="button"
            onClick={() => setShowPresentation(true)}
            aria-label={t('presentation_title')}
            title={t('presentation_title')}
            style={mobileDockBtn()}
            className="gameroom-presentation-btn"
          >🎨</button>
          {isHost && (
            <button
              type="button"
              onClick={() => setShowRoomSettings(true)}
              aria-label={t('room_rules_button')}
              title={t('room_rules_button')}
              style={mobileDockBtn()}
              className="gameroom-settings-btn"
            >⚙</button>
          )}
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

      <PresentationPopover
        open={showPresentation}
        onClose={() => setShowPresentation(false)}
        t={t}
        lang={lang}
        setLang={setLang}
        theme={theme}
        setTheme={setTheme}
        onPrefChange={onPrefChange}
      />
      {showRoomSettings && (
        <RoomSettingsPanel
          room={state.room}
          hostName={state.players?.find(p => p.id === state.room?.host_player_id)?.name}
          isHost={isHost}
          gamePhase={state.phase}
          onUpdateRules={updateRoomRules}
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
      {/* G101h: lone-survivor modal — see Game.jsx for the same wiring.
          Renders only when (1) someone got AFK-evicted, (2) it wasn't us,
          (3) we're now alone in the room. Auto-clears on next joiner. */}
      {state.playerEvicted
        && state.playerEvicted.playerId !== playerId
        && (state.players || []).length <= 1 && (
        <OpponentLeftWaitingOverlay
          t={t}
          opponentName={state.playerEvicted.playerName}
          onLeave={() => { leave(); navigate('/') }}
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
    <div
      className="gameroom-piste-seat-anchor"
      style={{
        position: 'absolute', left: `${x}%`, top: `${y}%`,
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
      }}
    >
      <div
        className={`gameroom-piste-seat piste-seat${active ? ' piste-seat-active' : ''}`}
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
        <div
          className="gameroom-piste-seat-name"
          style={{
            background: active ? 'var(--ink)' : 'var(--paper-soft)',
            color: active ? 'var(--paper)' : 'var(--ink)',
            border: '1px solid var(--rule)',
            padding: '0.15rem 0.5rem',
            borderRadius: 2,
            fontFamily: 'var(--display)', fontWeight: 700,
            fontSize: isSelf ? '0.78rem' : '0.7rem',
            whiteSpace: 'nowrap',
            maxWidth: '90px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            borderBottom: isSelf ? '2px solid var(--brass)' : undefined,
          }}
        >
          {p.name}{isSelf ? ' ★' : ''}
        </div>
        {/* G64 follow-up: token counter font was 0.62rem (~10px) — far too
            small to read on a mobile screen. Bumped to 0.85rem with bolder
            weight and a pill background so it reads as a chip count, not
            a footnote. */}
        <div
          className="gameroom-piste-seat-tokens mono"
          style={{
            fontWeight: 700,
            fontSize: '0.85rem',
            color: 'var(--ink)',
            background: 'var(--paper-deep)',
            border: '1px solid var(--rule)',
            borderRadius: 999,
            padding: '0.1rem 0.55rem',
            lineHeight: 1.1,
          }}
        >
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

/* ─── Mobile opponent-play toast ─────────────────────────────────────────
   Surfaces "Name · combo (Xf) in N throws" as a brief banner whenever
   another player commits a turn. Without this, the only signal of an
   opponent's play on mobile was opening the journal drawer — by then
   the moment had passed.

   Watches `current_round_plays` (the array of completed turns this
   manche). On detecting a new `player_id` other than ours, mounts a
   toast for 4s. Same player_id submitting again (e.g. a tiebreak
   throw) re-triggers via the `_id` timestamp so React re-mounts. */
function useOpponentPlayToast(plays, myPlayerId) {
  const [active, setActive] = useState(null)
  const prevIdsRef = useRef(new Set())

  useEffect(() => {
    if (!plays) return
    if (plays.length === 0) {
      prevIdsRef.current = new Set()
      return
    }
    const currentIds = new Set(plays.map((p) => p.player_id))
    const prev = prevIdsRef.current
    const fresh = plays.filter(
      (p) => p.player_id !== myPlayerId && !prev.has(p.player_id),
    )
    prevIdsRef.current = currentIds
    if (fresh.length === 0) return
    const latest = fresh[fresh.length - 1]
    setActive({ ...latest, _id: Date.now() })
    const tid = setTimeout(() => setActive(null), 4200)
    return () => clearTimeout(tid)
  }, [plays, myPlayerId])

  return active
}

function MobileOpponentPlayToast({ event, t, onOpenJournal }) {
  if (!event) return null
  const throws = event.rolls_used || 1
  return (
    <button
      type="button"
      role="status"
      aria-live="polite"
      onClick={onOpenJournal}
      className="gameroom-mobile-opponent-toast"
      style={{
        position: 'absolute',
        bottom: '0.8rem',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'var(--paper-soft)',
        border: '1px solid var(--brass)',
        color: 'var(--ink)',
        padding: '0.55rem 0.95rem',
        borderRadius: 6,
        fontSize: 'clamp(0.78rem, 3vw, 0.88rem)',
        fontFamily: 'inherit',
        maxWidth: 'min(92%, 380px)',
        textAlign: 'center',
        boxShadow: '0 8px 22px rgba(0,0,0,0.25)',
        animation: 'mobile-opp-toast-in 240ms ease-out',
        zIndex: 12,
        cursor: 'pointer',
      }}
      aria-label={t('score_to_beat_aria', {
        name: event.name, combo: event.combo, fiches: event.fiches,
      })}
    >
      <strong style={{ color: 'var(--rouge)', fontWeight: 700 }}>{event.name}</strong>
      {' · '}
      <span style={{ fontWeight: 600 }}>{event.combo}</span>
      {' '}
      <span className="mono" style={{ fontSize: '0.85em' }}>({event.fiches}f)</span>
      {throws > 1 && (
        <span style={{ color: 'var(--ink-mute)' }}>
          {' · '}{t('score_to_beat_in_throws', { n: throws })}
        </span>
      )}
    </button>
  )
}
