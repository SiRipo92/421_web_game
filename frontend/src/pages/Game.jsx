import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Die } from '../components/shared/Die.jsx'
import { Avatar } from '../components/shared/Avatar.jsx'
import { ChipStack } from '../components/shared/ChipStack.jsx'
import { RoomSettingsPanel } from '../components/shared/RoomSettingsPanel.jsx'
import { PresentationPopover } from '../components/shared/PresentationPopover.jsx'
import { ConfirmModal } from '../components/shared/ConfirmModal.jsx'
import { HierarchyModal } from '../components/shared/HierarchyModal.jsx'
import { CommentaryTicker, ScoreToBeatBanner } from '../components/shared/CommentaryTicker.jsx'
import { useGame } from '../hooks/useGame.js'
import { useMediaQuery } from '../hooks/useMediaQuery.js'
import { useLang } from '../context/useLang.js'
import { useTheme } from '../context/useTheme.js'
import { useAuth } from '../hooks/useAuth.js'
import { updateMe } from '../api/auth.js'
import { GameMobile } from './GameMobile.jsx'

export function Game({ token }) {
  const { t, lang, setLang } = useLang()
  const { theme, setTheme } = useTheme()
  const auth = useAuth()
  const { gameId } = useParams()
  const [params] = useSearchParams()
  const playerId = params.get('pid')
  const navigate = useNavigate()
  const { state, roll, keep, done, initialRoll, tiebreakRoll, leave, kick, updateRoomRules, dismissAdminBroadcast } = useGame(gameId, playerId, token)
  const logRef = useRef(null)
  // G64: switch to the mobile-shell layout at ≤ 959 px viewports.
  const isMobile = useMediaQuery('(max-width: 959px)')

  const [logOpen, setLogOpen] = useState(true)
  const [tickerOpen, setTickerOpen] = useState(true)
  const [showHierarchy, setShowHierarchy] = useState(false)
  const [showRoomSettings, setShowRoomSettings] = useState(false)
  const [showPresentation, setShowPresentation] = useState(false)
  // G46: on first entry, adopt the room's presentation defaults UNLESS the
  // user has a per-player override saved in localStorage. The override is
  // anything the user set explicitly outside this room. Tracked via a ref
  // so we only adopt once per room — flipping the popover after shouldn't
  // re-apply room defaults.
  const adoptedRoomDefaultsRef = useRef(false)
  useEffect(() => {
    if (adoptedRoomDefaultsRef.current) return
    const room = state.room
    if (!room) return
    const userLang = localStorage.getItem('lang')
    const userTheme = localStorage.getItem('theme')
    if (!userLang && room.default_lang && room.default_lang !== lang) {
      setLang(room.default_lang)
    }
    if (!userTheme && room.default_theme && room.default_theme !== theme) {
      setTheme(room.default_theme)
    }
    adoptedRoomDefaultsRef.current = true
    // We want this to fire on the *first* render with a room payload; deps
    // intentionally minimal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.room?.default_lang, state.room?.default_theme])

  // G46: when a logged-in user flips lang/theme in the popover, mirror the
  // change to /auth/me so the next session opens in their chosen preset.
  // Failures are silent — the local change still applies; the account
  // just won't have the new value until the next successful sync.
  const handlePrefChange = ({ lang_pref, theme_pref }) => {
    if (!auth.token) return
    updateMe(auth.token, { ...(lang_pref ? { lang_pref } : {}), ...(theme_pref ? { theme_pref } : {}) })
      .catch(() => {})
  }
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [kickTarget, setKickTarget] = useState(null) // {id, name} the host is about to kick
  const [matchEnd, setMatchEnd] = useState(null) // {name, count} for the G13 banner
  const lastMatchEndFpRef = useRef(null)
  const [selfPlay, setSelfPlay] = useState(null) // G23: self-play toast {dice, combo, fiches, isBot, next}
  const selfTurnsSeenRef = useRef(0)

  const me = state.players?.find(p => p.id === playerId)
  const isHost = state.room?.host_player_id === playerId
  const isMyTurn = state.current_player_id === playerId
  const isStarter = state.round_starter_id === playerId
  const myTurn = me?.turn
  const rollsUsed = myTurn ? 3 - myTurn.rolls_left : 0
  const canRoll = isMyTurn && myTurn && !myTurn.done && myTurn.rolls_left > 0
  const canDone = isMyTurn && myTurn && !myTurn.done && rollsUsed > 0
  const hasRolled = rollsUsed > 0
  const showAfkBar = isMyTurn && state.room?.afk_bot && state.room?.afk_seconds > 0

  useEffect(() => {
    // formatLogEntries reverses events so newest renders at top — keep the
    // viewport pinned there as new entries arrive so the most recent plays
    // are always in view. Scrolling to scrollHeight (the old behavior) hid
    // them under the older entries.
    if (logRef.current) logRef.current.scrollTop = 0
  }, [state.log])

  // G13: pop a transient banner whenever a new manché event lands. We diff against
  // the previous "name:count" fingerprint so the same event doesn't re-trigger on
  // every state broadcast.
  useEffect(() => {
    const events = state.log_events || []
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i]
      if (e?.key === 'log_match_lost') {
        const fp = `${e.name}:${e.count}`
        if (fp !== lastMatchEndFpRef.current) {
          lastMatchEndFpRef.current = fp
          setMatchEnd({ name: e.name, count: e.count })
        }
        return
      }
    }
  }, [state.log_events])

  useEffect(() => {
    if (!matchEnd) return
    const id = setTimeout(() => setMatchEnd(null), 4500)
    return () => clearTimeout(id)
  }, [matchEnd])

  // G23: pop a small bottom-right toast when MY turn ends (manual or auto-validate
  // or AFK-bot takeover). We count how many log_turn-style events have my name on
  // them; when the count goes up, fire a new toast. Dedup via ref-counter.
  useEffect(() => {
    if (!me?.name) return
    const events = state.log_events || []
    const mine = events.filter(
      (e) => (e?.key === 'log_turn' || e?.key === 'log_afk_turn') && e?.name === me.name,
    )
    if (mine.length > selfTurnsSeenRef.current) {
      selfTurnsSeenRef.current = mine.length
      const latest = mine[mine.length - 1]
      const nextPlayer = state.players?.find((p) => p.id === state.current_player_id)
      setSelfPlay({
        dice: latest.dice,
        combo: latest.combo,
        fiches: latest.fiches,
        isBot: latest.key === 'log_afk_turn',
        nextName: nextPlayer && nextPlayer.id !== playerId ? nextPlayer.name : null,
      })
    }
  }, [state.log_events, me?.name, state.players, state.current_player_id, playerId])

  useEffect(() => {
    if (!selfPlay) return
    const id = setTimeout(() => setSelfPlay(null), 5000)
    return () => clearTimeout(id)
  }, [selfPlay])

  if (state.phase === 'finished') {
    return <FinishedScreen state={state} playerId={playerId} t={t} navigate={navigate} />
  }

  if (state.phase === 'initial_roll' || state.phase === 'waiting') {
    return <InitialRollScreen state={state} playerId={playerId} t={t} onRoll={initialRoll} />
  }

  if (state.phase === 'tiebreak') {
    return <TiebreakScreen state={state} playerId={playerId} t={t} onRoll={tiebreakRoll} />
  }

  // G64: mobile / tablet (≤ 959 px) gets a purpose-built shell — slim
  // header, full-bleed piste, 2-row dock with drawer toggles instead of the
  // desktop 3-column rail layout. Initial-roll / tiebreak / finished phases
  // above fall through to their existing simpler full-screen renders.
  if (isMobile) {
    return (
      <GameMobile
        state={state}
        t={t}
        playerId={playerId}
        me={me}
        isHost={isHost}
        isMyTurn={isMyTurn}
        myTurn={myTurn}
        hasRolled={hasRolled}
        canRoll={canRoll}
        canDone={canDone}
        showAfkBar={showAfkBar}
        roll={roll}
        keep={keep}
        done={done}
        leave={leave}
        navigate={navigate}
        formatLogEntries={formatLogEntries}
        updateRoomRules={updateRoomRules}
        lang={lang}
        setLang={setLang}
        theme={theme}
        setTheme={setTheme}
        onPrefChange={handlePrefChange}
      />
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'grid',
      gridTemplateColumns: '260px 1fr 320px',
      gap: 0,
    }} className="gameroom-grid">

      {/* G64 follow-up: left rail now stacks a PlayerRail (always shown
          while the rail itself is visible) above the existing
          CommentaryTicker. With the top-bar PlayerStrips removed (they
          squished badly at 3+ players), the rail is now the persistent
          who's-at-the-table surface — avatars, names, tokens, manché
          pips, and the host's kick affordance, all in one column. */}
      <aside
        className="gameroom-left-rail side-ticker"
        style={{
          borderRight: '1px solid var(--rule)',
          background: 'var(--paper-soft)',
          maxHeight: '100vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <PlayerRail
          players={state.players}
          currentPlayerId={state.current_player_id}
          playerId={playerId}
          t={t}
          isHost={isHost}
          onKick={(id, name) => setKickTarget({ id, name })}
        />
        {/* G64 follow-up: ticker now has a header + collapse button so the
            user can hide it (it's secondary to the PlayerRail in this rail
            now). When closed it shrinks to just the header strip — the
            PlayerRail above gets the freed vertical space. */}
        <div
          className="gameroom-left-rail-ticker"
          style={{
            borderTop: '1px solid var(--rule)',
            flex: tickerOpen ? 1 : '0 0 auto',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <button
            type="button"
            onClick={() => setTickerOpen(o => !o)}
            aria-expanded={tickerOpen}
            aria-label={tickerOpen ? t('ticker_collapse_aria') : t('ticker_expand_aria')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '0.6rem 1rem',
              background: 'transparent',
              border: 'none',
              borderBottom: tickerOpen ? '1px solid var(--rule)' : 'none',
              color: 'var(--ink-soft)',
              fontFamily: 'var(--body)',
              fontSize: '0.7rem',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <span>{t('ticker_eyebrow')}</span>
            <span aria-hidden="true">{tickerOpen ? '▲' : '▼'}</span>
          </button>
          {tickerOpen && (
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <CommentaryTicker events={state.log_events} t={t} />
            </div>
          )}
        </div>
      </aside>

      {/* G62: middle column locks to the viewport height via a 3-row grid
          (top-bar · piste · action-bar). `overflow: hidden` prevents the
          page from gaining a scrollbar when the piste's intrinsic size
          would otherwise push the action bar below the fold. */}
      <div
        className="gameroom-center gameroom-center-desktop"
        style={{
          display: 'grid',
          gridTemplateRows: 'auto 1fr auto',
          height: '100vh',
          minWidth: 0,
          overflow: 'hidden',
        }}
      >

        {/* Top panel — G64 follow-up: simplified to a 2-column flex
            (justify-between) now that the player strips moved to the
            left rail. Left: phase chip + round. Right: bank · settings
            · quit. No middle column. */}
        <div
          className="gameroom-header gameroom-header-desktop top-panel"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            padding: '1rem 1.5rem',
            borderBottom: '1px solid var(--rule)',
            background: 'var(--paper-soft)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              padding: '0.4rem 1rem',
              background: state.phase === 'charge' ? 'var(--rouge)' : 'var(--felt)',
              color: 'var(--paper)',
              fontFamily: 'var(--display)', fontWeight: 700, letterSpacing: '0.06em',
              fontSize: '0.95rem', fontStyle: 'italic', transform: 'rotate(-2deg)',
            }} aria-label={`Phase: ${state.phase === 'charge' ? t('charge') : t('decharge')}`}>
              {state.phase === 'charge' ? t('charge') : t('decharge')}
            </div>
            <div>
              <div className="eyebrow" style={{ fontSize: '0.62rem' }}>{t('round')}</div>
              <div className="display" style={{ fontSize: '1.6rem', lineHeight: 1 }}>
                {String(state.round || 0).padStart(2, '0')}
              </div>
            </div>
          </div>

          {/* G64 follow-up: middle column removed — PlayerStrips moved
              into the new vertical PlayerRail in the left aside, which
              scales gracefully to any player count without squishing. */}

          <div
            className="gameroom-header-actions"
            style={{
              display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
              // G62 follow-up: pin the bank · settings · quit cluster flush
              // against the right edge of the top bar. Without this, when
              // `flex-wrap` triggered a second row (at very narrow widths),
              // wrapped items packed left and Quit ended up visually
              // centre-of-the-column rather than top-right corner.
              justifyContent: 'flex-end',
            }}
          >
            <CounterChip label={t('pool')} value={state.pool ?? 0} accent="var(--rouge)" />
            {isHost && (
              <button
                type="button"
                onClick={() => setShowRoomSettings(true)}
                aria-label={t('room_rules_button')}
                title={t('room_rules_button')}
                style={{
                  // G62: icon-only at all widths. The text label pushed
                  // the top-bar's right column wide enough to crowd the
                  // PlayerStrips. Screen readers + tooltip keep the
                  // affordance discoverable; the ⚙ icon carries the load.
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 36,
                  height: 36,
                  fontSize: '1.05rem',
                  fontFamily: 'var(--body)',
                  color: 'var(--ink-soft)',
                  background: 'var(--paper)',
                  border: '1px solid var(--rule)',
                  borderRadius: 999,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--paper-deep)'
                  e.currentTarget.style.color = 'var(--ink)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--paper)'
                  e.currentTarget.style.color = 'var(--ink-soft)'
                }}
              >⚙</button>
            )}
            <button
              type="button"
              onClick={() => setShowPresentation(true)}
              aria-label={t('presentation_title')}
              title={t('presentation_title')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                height: 36,
                fontSize: '1.05rem',
                fontFamily: 'var(--body)',
                color: 'var(--ink-soft)',
                background: 'var(--paper)',
                border: '1px solid var(--rule)',
                borderRadius: 999,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'background 0.15s, color 0.15s, border-color 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--paper-deep)'
                e.currentTarget.style.color = 'var(--ink)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--paper)'
                e.currentTarget.style.color = 'var(--ink-soft)'
              }}
            >🎨</button>
            <button
              type="button"
              onClick={() => setShowLeaveConfirm(true)}
              aria-label={t('leave')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '0.4rem 0.85rem',
                fontSize: '0.82rem',
                fontFamily: 'var(--body)',
                fontWeight: 600,
                color: 'var(--rouge)',
                background: 'var(--paper)',
                border: '1px solid var(--rouge)',
                borderRadius: 999,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--rouge)'
                e.currentTarget.style.color = 'var(--paper)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--paper)'
                e.currentTarget.style.color = 'var(--rouge)'
              }}
            >🚪 {t('leave')}</button>
          </div>
        </div>

        {/* Piste area — G14: piste grows to fill the column, dice anchored to bottom,
            pool dead-center as the focal point, score-to-beat banner pinned at top.
            G62: the parent grid row carries the height; `minHeight: 0` lets this
            container shrink instead of pushing the action bar off-screen.
            G62 follow-up: `containerType: size` registers this as a container
            so the piste-stage can size from BOTH axes — `min(cqi, cqb)` returns
            the smaller of width/height, keeping the inner square truly square
            (and the `.piste` circle truly circular) regardless of which axis
            is the binding constraint. */}
        <div
          className="gameroom-main gameroom-piste-area"
          style={{
            minHeight: 0, padding: '1.2rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative',
            // G62 follow-up: previously had `overflow: hidden` which clipped
            // the player seats that hang above and below the piste perimeter.
            // The parent middle column carries its own `overflow: hidden`, so
            // page scroll is still prevented — content can extend into the
            // padding without spilling further.
            overflow: 'visible',
            containerType: 'size',
          }}
        >
          {matchEnd && (
            <MatchEndBanner
              t={t}
              name={matchEnd.name}
              count={matchEnd.count}
              onClose={() => setMatchEnd(null)}
            />
          )}
          <div
            className="gameroom-piste-stage piste-stage"
            style={{
              position: 'relative',
              // G62 follow-up: reserve ~22 % of the available space (11 %
              // on each side) for the player seats hanging off the piste
              // perimeter. Without this the seats clipped at the rail edges;
              // with it the circle reads as a focal point and the seats
              // have visible breathing room above/below/around it.
              width: 'min(700px, 78cqi, 78cqb)',
              aspectRatio: '1/1',
            }}
          >
            <div className="gameroom-piste piste" style={{ position: 'absolute', inset: 0 }} role="region" aria-label="Piste de jeu">
              {/* G47 follow-up: the « ❦ LA PISTE ❦ » decorative label used
                  to sit at top: 5 % of the piste. With G47 rotation putting
                  an opponent at the top of the ring, the label was directly
                  underneath their avatar/name pill — overlap. Removed; the
                  piste's brass rim + felt gradient already carry the visual
                  identity without it. */}

              <ScoreToBeatBanner plays={state.current_round_plays} t={t} />

              {/* Pool chips — focal point dead-center.
                  G62 follow-up: chip stack uses `size="large"` (1.45× scale)
                  and the label bumps to 0.88rem so the pool count reads as
                  the centre of attention now that the piste itself is a bit
                  smaller. */}
              <div
                className="gameroom-pool"
                style={{
                  position: 'absolute', top: '46%', left: '50%', transform: 'translate(-50%,-50%)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
                }}
              >
                {(state.pool ?? 0) > 0 && <ChipStack count={state.pool} size="large" />}
                <span
                  className="gameroom-pool-label eyebrow"
                  style={{
                    fontSize: '0.88rem',
                    color: 'var(--paper-deep)',
                    letterSpacing: '0.14em',
                  }}
                >
                  {t('pool')} · <span className="mono" style={{ fontSize: '1rem', fontWeight: 700 }}>{state.pool ?? 0}</span>
                </span>
              </div>

              {/* Dice cluster — anchored at the bottom of the felt.
                  G64 follow-up: lifted from `bottom: 6%` → `14%`. With
                  G62's bigger piste (700px / 78cqi/cqb) the dice were
                  sitting too close to the local viewer's avatar at the
                  ring bottom. Moving up creates clearance and balances
                  the visual weight against the pool at top: 46%. */}
              <div
                className="gameroom-dice-cluster"
                style={{
                  position: 'absolute', bottom: '14%', left: '50%', transform: 'translateX(-50%)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                  maxWidth: '90%',
                }}
              >
                {/* G5: badge legend — always visible while the player can choose
                    which dice to lock, so the on-die ✓/↺ icons read at a glance. */}
                {isMyTurn && hasRolled && !myTurn?.done && (myTurn?.rolls_left ?? 0) > 0 && (
                  <KeepLegend t={t} />
                )}
                <div style={{ display: 'flex', gap: 14 }}>
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
                    fontFamily: 'var(--display)', fontSize: '1.4rem',
                    color: myTurn.combo === '421' ? 'var(--brass-soft)' : 'var(--paper)',
                    fontStyle: myTurn.combo === 'nénette' ? 'italic' : 'normal',
                    textShadow: '0 2px 8px rgba(0,0,0,0.5)',
                  }} className={myTurn.combo === '421' ? 'glow-421' : ''}>
                    {myTurn.combo} · <span className="mono">{myTurn.fiches}f</span>
                  </div>
                )}
              </div>
            </div>

            {/* Players around piste.
                G64 follow-up: rotate so the local player anchors at the
                bottom slot (G47 logic), and push the seat anchor outside
                the piste edge (r=58 instead of 50). With r=50 the viewer's
                seat content sat *inside* the piste, overlapping the now-
                lifted dice cluster (bottom: 14 %). r=58 + smaller seat
                heights = clean separation. */}
            {(() => {
              const players = state.players || []
              const myIdx = Math.max(0, players.findIndex(p => p.id === playerId))
              const rotated = [...players.slice(myIdx), ...players.slice(0, myIdx)]
              return rotated.map((p, i) => {
                const total = rotated.length
                const angle = 90 + (360 / total) * i
                const rad = (angle * Math.PI) / 180
                const r = 58
                const x = 50 + r * Math.cos(rad)
                const y = 50 + r * Math.sin(rad)
                return (
                  <PisteSeat key={p.id} p={p}
                    active={p.id === state.current_player_id}
                    isSelf={p.id === playerId}
                    x={x} y={y}
                    t={t}
                  />
                )
              })
            })()}
          </div>
        </div>

        {/* Action bar — G64 follow-up: 3-column grid (info · secondary
            · primary) so the play buttons (Roll, Validate) always anchor
            flush against the right edge, even when secondary controls
            (RhythmIndicator, RollDots) wrap on narrow widths. Previous
            `flex-wrap + justify-content: space-between` left the wrapped
            row left-aligned, putting the play buttons in the middle of
            the bar instead of the corner. */}
        <div
          className="gameroom-dock gameroom-dock-desktop"
          role="region"
          aria-label="Contrôles"
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid var(--rule)',
            background: 'var(--paper-soft)',
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto auto',
            gap: 16,
            alignItems: 'center',
          }}
        >
          <div className="gameroom-dock-info" style={{ minWidth: 0 }}>
            <div className="eyebrow" style={{ fontSize: '0.78rem' }}>
              {isMyTurn ? t('your_turn') : `${t('waiting_turn')} — ${state.players?.find(p => p.id === state.current_player_id)?.name || ''}`}
            </div>
            <div className="serif" style={{ fontStyle: 'italic', color: 'var(--ink-soft)', marginTop: 6, fontSize: '1rem' }}>
              {isMyTurn
                ? !hasRolled ? t('keep_hint') : `${myTurn?.rolls_left ?? 0} ${t('rolls_left')}.`
                : <span>{t('waiting_for')} <span className="mono pulse-soft">…</span></span>}
            </div>
            {showAfkBar && (
              <AfkBar
                total={state.room.afk_seconds}
                startedAtMs={state.afk_started_at}
              />
            )}
          </div>
          <div className="gameroom-dock-secondary" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <RhythmIndicator
              t={t}
              isMyTurn={isMyTurn}
              isStarter={isStarter}
              hasRolled={hasRolled}
              rollsUsed={rollsUsed}
              maxThrows={state.max_throws ?? 3}
              bankRule={state.room?.bank_rule}
              phase={state.phase}
            />
            {/* G4: hide throw counter when the rhythm is locked at 1 (no choice
                to display). Keep showing for the starter before they've set the
                rhythm so they can see how many throws they have available. */}
            {(state.max_throws > 1 || (isStarter && !hasRolled)) && (
              <RollDots rollsLeft={myTurn?.rolls_left ?? 3} />
            )}
          </div>
          <div className="gameroom-dock-primary" style={{ display: 'flex', gap: 10, alignItems: 'center', justifySelf: 'end' }}>
            {isMyTurn && (
              <>
                <button
                  type="button"
                  onClick={roll}
                  disabled={!canRoll}
                  className="btn btn-rouge gameroom-roll-btn"
                  style={{ opacity: canRoll ? 1 : 0.4, minHeight: 44 }}
                  aria-label={!hasRolled ? t('roll') : t('reroll')}
                >
                  🎲 {!hasRolled ? t('roll') : t('reroll')}
                </button>
                <button
                  type="button"
                  onClick={done}
                  disabled={!canDone}
                  className="btn btn-primary gameroom-validate-btn"
                  style={{ opacity: canDone ? 1 : 0.4, minHeight: 44 }}
                  aria-label={t('validate')}
                >
                  ✓ {t('validate')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Log panel */}
      <aside style={{
        borderLeft: '1px solid var(--rule)',
        background: 'var(--paper-soft)',
        display: 'flex', flexDirection: 'column',
        maxHeight: '100vh',
      }} className="side-log" aria-label={t('log')}>
        <div style={{ padding: '1.2rem 1.4rem', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div>
            <div className="eyebrow">{t('log')}</div>
            <div className="display" style={{ fontSize: '1.4rem', marginTop: 4 }}>{t('log_subtitle')}</div>
            <div className="note" style={{ fontSize: '0.85rem' }}>{t('log_sub')}</div>
          </div>
          <button
            type="button"
            onClick={() => setLogOpen(o => !o)}
            aria-expanded={logOpen}
            aria-label={logOpen ? 'Réduire le journal' : 'Afficher le journal'}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-mute)', fontSize: '1rem', padding: '0.2rem', marginTop: 2 }}
          >{logOpen ? '▲' : '▼'}</button>
        </div>
        {logOpen && (
          <div ref={logRef} style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.4rem' }}>
            {formatLogEntries(state, t, me?.name).map((text, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '1fr',
                padding: '0.45rem 0', borderBottom: '1px dashed var(--rule)',
              }}>
                <span className="serif" style={{ fontSize: '0.9rem', color: 'var(--ink)' }}>{text}</span>
              </div>
            ))}
          </div>
        )}
        {/* G62 follow-up: the combo hierarchy table used to live here as a
            permanent footer of the right aside, eating real estate every
            game even for players who already know the rules. Now it's a
            button that pops a lightbox with the full hierarchy on demand —
            free space for the journal, one click away when needed. */}
        <div style={{ padding: '0.9rem 1.4rem', borderTop: '1px solid var(--rule)' }}>
          <button
            type="button"
            onClick={() => setShowHierarchy(true)}
            aria-label={t('hierarchy_open')}
            style={{
              width: '100%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              padding: '0.55rem 0.9rem',
              fontSize: '0.85rem',
              fontFamily: 'var(--body)',
              color: 'var(--ink-soft)',
              background: 'var(--paper)',
              border: '1px solid var(--rule)',
              borderRadius: 4,
              cursor: 'pointer',
              transition: 'background 0.15s, color 0.15s, border-color 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--paper-deep)'
              e.currentTarget.style.color = 'var(--ink)'
              e.currentTarget.style.borderColor = 'var(--brass)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--paper)'
              e.currentTarget.style.color = 'var(--ink-soft)'
              e.currentTarget.style.borderColor = 'var(--rule)'
            }}
          >
            <span>📖 {t('hierarchy_open')}</span>
            <span style={{ color: 'var(--ink-mute)', fontSize: '0.9rem' }}>›</span>
          </button>
        </div>
      </aside>

      <style>{`
        /* Mid-width: at ≤ 1180 px the left rail keeps the PlayerRail
           (so the table roster stays visible — there's no top-bar
           strip to fall back on after G64) but the CommentaryTicker
           below it hides to claim vertical room. */
        @media (max-width: 1180px) {
          .gameroom-grid { grid-template-columns: 220px 1fr 320px !important; }
          .gameroom-left-rail-ticker { display: none !important; }
        }
        /* G62: at narrow widths, the per-strip mini dice would overlap the
           player name. Hide them — the active player's dice are visible
           in the piste anyway, and inactive players' last-throw dice can
           be read from the right-side journal. */
        @media (max-width: 1280px) {
          .player-strip-dice { display: none !important; }
        }
        @media (max-width: 980px) {
          .gameroom-grid { grid-template-columns: 1fr !important; }
          .side-log { max-height: 300px !important; border-left: none !important; border-top: 1px solid var(--rule); }
          .gameroom-left-rail { display: none !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .die-tumble, .pulse-soft, .glow-421 { animation: none !important; }
        }
      `}</style>

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
        onPrefChange={handlePrefChange}
      />

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

      {selfPlay && (
        <SelfPlayToast
          t={t}
          dice={selfPlay.dice}
          combo={selfPlay.combo}
          fiches={selfPlay.fiches}
          isBot={selfPlay.isBot}
          nextName={selfPlay.nextName}
          onClose={() => setSelfPlay(null)}
        />
      )}

      {kickTarget && (
        <ConfirmModal
          title={t('kick_confirm_title')}
          text={t('kick_confirm_text', { name: kickTarget.name })}
          confirmLabel={t('kick_confirm_yes')}
          cancelLabel={t('kick_confirm_no')}
          danger
          onConfirm={() => {
            kick(kickTarget.id, 'afk')
            setKickTarget(null)
          }}
          onCancel={() => setKickTarget(null)}
        />
      )}

      {state.kickedReason && (
        <KickedOverlay
          t={t}
          reason={state.kickedReason}
          onClose={() => navigate('/')}
        />
      )}

      {/* G95: admin broadcast banner — non-dismissible by user (closes only
          when admin sends a fresh one or via the dismiss button after the
          admin tells you to). Severity controls the color. */}
      {state.adminBroadcast && (
        <AdminBroadcastBanner banner={state.adminBroadcast} lang={lang} onDismiss={dismissAdminBroadcast} t={t} />
      )}

      {/* G95: room dissolved by admin — full takeover screen with the
          reason, redirects home on click. */}
      {state.roomDissolved && (
        <RoomDissolvedOverlay t={t} reason={state.roomDissolved.reason} onClose={() => navigate('/')} />
      )}
    </div>
  )
}

function AdminBroadcastBanner({ banner, lang, onDismiss, t }) {
  const message = lang === 'en' ? banner.message_en : banner.message_fr
  const colors = {
    info: { bg: 'rgba(196, 140, 40, 0.12)', border: 'var(--brass)', text: 'var(--ink)' },
    warning: { bg: 'rgba(196, 140, 40, 0.22)', border: 'var(--brass-deep)', text: 'var(--ink)' },
    critical: { bg: 'rgba(168, 48, 42, 0.18)', border: 'var(--rouge)', text: 'var(--ink)' },
  }
  const c = colors[banner.severity] || colors.info
  return (
    <div role="status" style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 90,
      background: c.bg, borderBottom: `2px solid ${c.border}`,
      padding: '0.7rem 1.2rem', display: 'flex', alignItems: 'center', gap: 12,
      backdropFilter: 'blur(4px)',
    }}>
      <span aria-hidden="true" style={{ color: c.border, fontWeight: 700 }}>
        {banner.severity === 'critical' ? '⚠' : banner.severity === 'warning' ? '!' : 'ⓘ'}
      </span>
      <strong className="serif" style={{ color: c.border, fontSize: '0.8rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        {t('admin_broadcast_label')}
      </strong>
      <p className="serif" style={{ margin: 0, flex: 1, color: c.text }}>{message}</p>
      <button type="button" className="btn-link" onClick={onDismiss}
        aria-label={t('admin_broadcast_dismiss')}
        style={{ fontSize: '1.2rem', padding: '0 0.5rem', color: c.border }}>
        ×
      </button>
    </div>
  )
}

function RoomDissolvedOverlay({ t, reason, onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div className="card" style={{ maxWidth: 500, padding: '2rem', textAlign: 'center', background: 'var(--paper)' }}>
        <div className="eyebrow" style={{ color: 'var(--rouge)', marginBottom: 8 }}>
          {t('room_dissolved_eyebrow')}
        </div>
        <h2 className="display" style={{ fontSize: '1.6rem', margin: '0 0 1rem' }}>
          {t('room_dissolved_title')}
        </h2>
        <p className="serif" style={{ margin: '0 0 1rem', color: 'var(--ink-soft)' }}>
          {t('room_dissolved_intro')}
        </p>
        <div className="ticket" style={{ padding: '0.9rem 1.1rem', marginBottom: '1.5rem', textAlign: 'left' }}>
          <div className="eyebrow" style={{ fontSize: '0.6rem' }}>{t('admin_modal_reason')}</div>
          <p className="serif" style={{ margin: '0.3rem 0 0' }}>{reason}</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={onClose}>
          {t('room_dissolved_back_home')}
        </button>
      </div>
    </div>
  )
}

function InitialRollScreen({ state, playerId, t, onRoll }) {
  const myRoll = state.players?.find(p => p.id === playerId)
  const hasRolled = myRoll && state.players?.find(p => p.id === playerId)?.initial_roll != null

  return (
    <div style={{ maxWidth: 640, margin: '4rem auto', padding: '0 1.5rem', textAlign: 'center' }}>
      <div className="eyebrow" style={{ marginBottom: 16 }}>{t('initial_roll_label')}</div>
      <h1 className="display" style={{ fontSize: 'clamp(2.4rem, 5vw, 3rem)', margin: '0 0 1rem' }}>
        {t('initial_roll_hint')}
      </h1>
      <div className="ticket" style={{ marginTop: '2rem', padding: '2rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: '1.5rem' }}>
          {state.players?.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar name={p.name} userId={p.user_id} hasAvatar={p.has_avatar ?? false} isSelf={p.id === playerId} size={2.2} />
                <span className="serif">{p.name}</span>
              </div>
              <div className="mono" style={{ fontWeight: 700, fontSize: '1.4rem' }}>
                {p.initial_roll != null ? p.initial_roll : <span className="pulse-soft" style={{ color: 'var(--ink-mute)' }}>…</span>}
              </div>
            </div>
          ))}
        </div>
        {!hasRolled ? (
          <button type="button" onClick={onRoll} className="btn btn-rouge" style={{ width: '100%', justifyContent: 'center', minHeight: 48 }}>
            🎲 {t('initial_roll')}
          </button>
        ) : (
          <p className="note">{t('waiting_others')}</p>
        )}
      </div>
    </div>
  )
}

function TiebreakScreen({ state, playerId, t, onRoll }) {
  const tb = state.tiebreak || {}
  const tied = tb.tied_pids || []
  const throws = tb.throws || {}
  const nextPid = tb.next_pid
  const isMyTurn = nextPid === playerId
  const isTied = tied.includes(playerId)
  const playerById = (pid) => state.players?.find(p => p.id === pid)

  return (
    <div style={{ maxWidth: 640, margin: '4rem auto', padding: '0 1.5rem', textAlign: 'center' }}>
      <div className="eyebrow" style={{ marginBottom: 16 }}>{t('tiebreak_label')}</div>
      <h1 className="display" style={{ fontSize: 'clamp(2.4rem, 5vw, 3rem)', margin: '0 0 1rem' }}>
        {t('tiebreak_title')}
      </h1>
      <p className="serif" style={{ color: 'var(--ink-mute)', fontStyle: 'italic', margin: '0 0 1rem' }}>
        {t('tiebreak_subtitle')}
      </p>
      <div className="ticket" style={{ marginTop: '1.5rem', padding: '2rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: '1.5rem' }}>
          {tied.map(pid => {
            const p = playerById(pid)
            if (!p) return null
            const th = throws[pid]
            const waiting = !th
            const isUp = pid === nextPid
            return (
              <div key={pid} style={{
                display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'space-between',
                padding: '0.6rem 0.8rem',
                background: isUp ? 'rgba(var(--rouge-rgb, 180,40,40), 0.06)' : 'transparent',
                borderRadius: 4,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar name={p.name} userId={p.user_id} hasAvatar={p.has_avatar ?? false}
                          isSelf={pid === playerId} size={2.2} />
                  <span className="serif">
                    {p.name}
                    {pid === playerId && (
                      <em style={{ fontSize: '0.85rem', color: 'var(--ink-mute)', marginLeft: 6 }}>
                        {t('you_label')}
                      </em>
                    )}
                  </span>
                </div>
                <div className="mono" style={{ fontWeight: 700, fontSize: '1rem' }}>
                  {th ? `${sortDesc(th.dice).join('-')} → ${th.combo} (${th.fiches}f)`
                      : isUp ? <span className="pulse-soft" style={{ color: 'var(--rouge)' }}>{t('tiebreak_their_turn')}</span>
                      : waiting ? <span style={{ color: 'var(--ink-fade)' }}>…</span>
                      : ''}
                </div>
              </div>
            )
          })}
        </div>
        {isTied && isMyTurn && (
          <button type="button" onClick={onRoll} className="btn btn-rouge"
                  style={{ width: '100%', justifyContent: 'center', minHeight: 48 }}>
            🎲 {t('tiebreak_roll_btn')}
          </button>
        )}
        {isTied && !isMyTurn && (
          <p className="note">{t('tiebreak_waiting_other')}</p>
        )}
        {!isTied && (
          <p className="note">{t('tiebreak_spectate')}</p>
        )}
      </div>
    </div>
  )
}

function sortDesc(arr) {
  return [...(arr || [])].sort((a, b) => b - a)
}

function FinishedScreen({ state, playerId, t, navigate }) {
  const sorted = [...(state.players || [])].sort((a, b) => (a.tokens ?? 0) - (b.tokens ?? 0))
  const winner = sorted[0]

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <div className="stamp" style={{ fontSize: '0.9rem', marginBottom: 24 }}>{t('finished')}</div>
        <h1 className="display" style={{ fontSize: 'clamp(3rem, 7vw, 4.5rem)', margin: '0 0 0.5rem' }}>
          <em style={{ color: 'var(--rouge)' }}>{winner?.name}</em><br />
          remporte la table.
        </h1>
        <p className="serif" style={{ fontStyle: 'italic', color: 'var(--ink-soft)', fontSize: '1.2rem' }}>
          Une dernière tournée pour le vainqueur — c'est la maison qui régale. ❦
        </p>
      </div>

      <div className="ticket" style={{ marginBottom: '2rem' }}>
        <div className="eyebrow" style={{ textAlign: 'center', marginBottom: 12 }}>{t('final_score')}</div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {sorted.map((p, i) => (
            <div key={p.id} style={{
              display: 'grid', gridTemplateColumns: 'auto auto 1fr auto auto', gap: 16, alignItems: 'center',
              padding: '1rem 0',
              borderBottom: i < sorted.length - 1 ? '1px dashed var(--rule)' : 'none',
            }}>
              <div className="display" style={{ fontSize: i === 0 ? '2.5rem' : '1.6rem', color: i === 0 ? 'var(--rouge)' : 'var(--ink-fade)', width: 48, textAlign: 'center' }}>
                {i === 0 ? '🏆' : `${i + 1}ᵉ`}
              </div>
              <Avatar name={p.name} userId={p.user_id} hasAvatar={p.has_avatar ?? false} size={2.4} isSelf={p.id === playerId} />
              <div>
                <div className="display" style={{ fontSize: '1.4rem' }}>
                  {p.name} {p.id === playerId && <em style={{ fontSize: '0.85rem', color: 'var(--ink-mute)' }}>{t('you_label')}</em>}
                </div>
              </div>
              <div className="serif" style={{ fontStyle: 'italic', color: 'var(--ink-mute)', fontSize: '0.95rem' }}>
                {p.round_points ?? 0} {t('round_points')}
              </div>
              <div className="display" style={{ fontSize: '1.4rem' }}>
                {p.tokens ?? 0}<span className="serif" style={{ fontSize: '0.7rem', fontStyle: 'italic', color: 'var(--ink-mute)', marginLeft: 4 }}>f</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-ghost" onClick={() => navigate('/')}>{t('back_home')}</button>
        <button type="button" className="btn btn-ghost" onClick={() => navigate('/rankings')}>📜 {t('rankings')}</button>
      </div>
    </div>
  )
}

function CounterChip({ label, value, accent }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div className="chip" style={{ width: '2.4rem', height: '2.4rem', fontSize: '0.9rem' }}>{value}</div>
      <div>
        <div className="eyebrow" style={{ fontSize: '0.62rem', color: accent }}>{label}</div>
        <div className="display" style={{ fontSize: '1.4rem', lineHeight: 1 }}>
          {value} <span className="serif" style={{ fontSize: '0.7rem', fontStyle: 'italic', color: 'var(--ink-mute)' }}>fiches</span>
        </div>
      </div>
    </div>
  )
}

/**
 * G64 follow-up: vertical list of all players in the room, shown in the left
 * rail above the CommentaryTicker. Replaces the squished top-bar PlayerStrip
 * row — strips were fine at 2 players but overlapped badly at 3+. The rail
 * version stacks one strip per row and grows comfortably to 5 players.
 *
 * Reuses the existing `PlayerStrip` component so name/avatar/tokens/score-pip
 * rendering stays consistent with how strips looked horizontally.
 */
function PlayerRail({ players, currentPlayerId, playerId, t, isHost, onKick }) {
  if (!players?.length) return null
  return (
    <div
      className="gameroom-player-rail"
      style={{
        padding: '1rem 0.85rem',
        borderBottom: '1px solid var(--rule)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div className="eyebrow" style={{ fontSize: '0.62rem', marginBottom: 4 }}>
        {t('players_at_table')}
      </div>
      {players.map(p => (
        <PlayerStrip
          key={p.id}
          p={p}
          active={p.id === currentPlayerId}
          isSelf={p.id === playerId}
          t={t}
          canKick={isHost && p.id !== playerId}
          onKick={() => onKick(p.id, p.name)}
        />
      ))}
    </div>
  )
}

function PlayerStrip({ p, active, isSelf, t, canKick, onKick }) {
  // G64 follow-up: card-shaped vertical layout for the left rail. The old
  // horizontal layout (Avatar · Name/Tokens · Pips · Kick all in one row)
  // didn't fit the narrow 220 px rail column at 3+ players. Now structured
  // as two stacked rows:
  //   Row 1: Avatar + (Name + token line) + Kick (absolute top-right)
  //   Row 2: Score pips (skull, round-points)
  // Each card is ~70 px tall — fits everything cleanly without overlap.
  return (
    <div
      className="gameroom-player-card"
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '0.55rem 0.7rem',
        borderRadius: 4,
        background: active ? 'var(--rouge)' : 'var(--paper-deep)',
        color: active ? 'var(--paper)' : 'var(--ink)',
        border: '1px solid var(--rule)',
      }}
    >
      {canKick && (
        <button
          type="button"
          onClick={onKick}
          aria-label={t ? `${t('kick_button')} ${p.name}` : 'Kick'}
          title={t ? t('kick_button') : 'Kick'}
          className="gameroom-player-card-kick"
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            width: 22,
            height: 22,
            padding: 0,
            background: 'transparent',
            border: '1px solid var(--rule)',
            borderRadius: 999,
            color: active ? 'var(--paper)' : 'var(--ink-mute)',
            cursor: 'pointer',
            fontSize: '0.7rem',
            lineHeight: 1,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: 0.75,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '1'
            e.currentTarget.style.color = 'var(--rouge)'
            e.currentTarget.style.borderColor = 'var(--rouge)'
            e.currentTarget.style.background = 'var(--paper)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '0.75'
            e.currentTarget.style.color = active ? 'var(--paper)' : 'var(--ink-mute)'
            e.currentTarget.style.borderColor = 'var(--rule)'
            e.currentTarget.style.background = 'transparent'
          }}
        >✕</button>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <Avatar name={p.name} userId={p.user_id} hasAvatar={p.has_avatar ?? false} active={active} isSelf={isSelf} size={2} />
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15, minWidth: 0, flex: 1, paddingRight: canKick ? 22 : 0 }}>
          <span className="serif" style={{
            fontWeight: 600,
            fontSize: '0.88rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {p.name}{isSelf ? ' ★' : ''}
          </span>
          {/* G64 follow-up: stats line shows all three counters at once:
              tokens · parties lost · manches lost this partie. Both
              loss counters always render (alwaysShow), so you can
              compare players at a glance ("0 / 1" vs "2 / 0") — the
              user tracks this on their phone as "Sierra : 0, 1m". Zero
              counters dim so non-zero values jump. Dropped the "fiches"
              suffix here — the 🪙 glyph is unambiguous in this row
              and gives room for both pips. */}
          <span className="mono" style={{
            fontSize: '0.72rem', marginTop: 2,
            display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          }}>
            <span title={t ? t('chips_label') : ''}>
              🪙 <span style={{ fontWeight: 700 }}>{p.tokens ?? 0}</span>
            </span>
            <ScorePips
              matchLosses={p.match_losses ?? 0}
              roundPoints={p.round_points ?? 0}
              active={active}
              t={t}
              alwaysShow
            />
          </span>
        </div>
      </div>
    </div>
  )
}

function ScorePips({ matchLosses, roundPoints, active, t, alwaysShow = false }) {
  // G64 follow-up: two counters per player, both always numbered so you
  // can compare players at a glance ("who's losing most / who's still
  // clean?"). With `alwaysShow=true` (used in the rail card), both pips
  // render even at 0; without it (used inline next to the piste-ring
  // name pill where space is tight) only non-zero counts render.
  //   🩹 = manche perdue cette partie (wounded — single match lost in
  //         the current partie, caps at 1 before triggering a partie
  //         loss).
  //   💀 = parties perdues (dead — cumulative full-game losses across
  //         the session).
  // Plain emoji + count, no chip styling, tooltips spell out the
  // meaning in proper French/English on hover. Zero counts dim to
  // opacity 0.45 so non-zero values jump visually.
  const showManche = alwaysShow || matchLosses > 0
  const showPartie = alwaysShow || roundPoints > 0
  if (!showManche && !showPartie) return null
  const mancheTitle = t ? t('manche_loss_tooltip') : 'Manche perdue cette partie'
  const partieTitle = t ? t('partie_loss_tooltip') : 'Parties perdues'
  return (
    <span
      style={{
        display: 'inline-flex',
        gap: 8,
        alignItems: 'center',
        fontSize: '0.72rem',
        fontFamily: 'var(--mono)',
        fontWeight: 700,
        color: active ? 'var(--paper)' : 'var(--ink-soft)',
        userSelect: 'none',
        cursor: 'default',
      }}
      aria-label={`${partieTitle}: ${roundPoints} · ${mancheTitle}: ${matchLosses}`}
    >
      {showPartie && (
        <span
          title={partieTitle}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 2,
            opacity: roundPoints > 0 ? 1 : 0.45,
          }}
        >
          💀 <span>{roundPoints ?? 0}</span>
        </span>
      )}
      {showManche && (
        <span
          title={mancheTitle}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 2,
            opacity: matchLosses > 0 ? 1 : 0.45,
          }}
        >
          🩹 <span>{matchLosses ?? 0}</span>
        </span>
      )}
    </span>
  )
}

function PisteSeat({ p, active, isSelf, x, y, t }) {
  return (
    <div style={{
      position: 'absolute', left: `${x}%`, top: `${y}%`,
      transform: 'translate(-50%, -50%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      pointerEvents: 'none',
    }}>
      <Avatar name={p.name} userId={p.user_id} hasAvatar={p.has_avatar ?? false} active={active} isSelf={isSelf} size={3.2} />
      <div style={{
        background: active ? 'var(--ink)' : 'var(--paper-soft)',
        color: active ? 'var(--paper)' : 'var(--ink)',
        border: '1px solid var(--rule)',
        padding: '0.3rem 0.7rem', borderRadius: 2,
        fontFamily: 'var(--display)', fontWeight: 700, fontSize: '0.9rem',
        whiteSpace: 'nowrap',
        display: 'flex', alignItems: 'center', gap: 6,
        boxShadow: active ? '0 4px 0 rgba(0,0,0,0.3)' : '0 2px 0 rgba(0,0,0,0.1)',
      }}>
        <span>{p.name}{isSelf ? ' ★' : ''}</span>
        <ScorePips matchLosses={p.match_losses ?? 0} roundPoints={p.round_points ?? 0} active={active} t={t} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{
          fontFamily: 'var(--mono)', fontWeight: 700, fontSize: '0.78rem',
          background: 'var(--paper-deep)', border: '1px solid var(--rule)',
          padding: '2px 8px', borderRadius: 999, color: 'var(--ink-soft)',
        }}>{p.tokens ?? 0} 🪙</div>
        {p.turn?.done && p.turn.dice && (
          <div style={{ display: 'flex', gap: 2 }}>
            {p.turn.dice.map((v, i) => <Die key={i} value={v} mini />)}
          </div>
        )}
      </div>
    </div>
  )
}

function KeepLegend({ t }) {
  // G5: two-chip legend showing what the ✓ and ↺ corner badges mean. Sits just
  // above the dice cluster so the player sees what each state will do BEFORE
  // they click. Kept compact — single line, fits inside the felt at 90% maxWidth.
  return (
    <div
      role="note"
      aria-label={t('dice_keep_hint')}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0.35rem 0.7rem',
        background: 'rgba(0,0,0,0.55)',
        border: '1px solid rgba(212,171,103,0.3)',
        borderRadius: 4,
        fontSize: '0.78rem',
        color: 'var(--paper-deep)',
        whiteSpace: 'nowrap',
      }}
    >
      <Chip bg="var(--brass)" label="✓" />
      <span>{t('dice_legend_keep')}</span>
      <span style={{ opacity: 0.45 }}>·</span>
      <Chip bg="var(--rouge)" label="↺" />
      <span>{t('dice_legend_reroll')}</span>
    </div>
  )
}

function Chip({ bg, label }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 18,
        height: 18,
        borderRadius: '50%',
        background: bg,
        color: 'var(--paper)',
        fontFamily: 'var(--mono)',
        fontSize: '0.7rem',
        fontWeight: 700,
        border: '1.5px solid var(--paper-deep)',
      }}
    >
      {label}
    </span>
  )
}

function AfkBar({ total, startedAtMs }) {
  // G1: derive remaining time from the server-stamped `afk_started_at`. Every
  // backend action (roll/keep/done) re-stamps it, so the bar visually resets
  // the moment the server resets the timer. The 1 s tick is purely for the
  // smooth countdown animation between server state broadcasts.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  if (!startedAtMs) return null
  const elapsed = Math.floor((now - startedAtMs) / 1000)
  const remaining = Math.max(0, total - elapsed)
  if (remaining <= 0) return null
  return (
    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        height: 3, flex: 1, maxWidth: 120, borderRadius: 2,
        background: 'var(--rule)', overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${(remaining / total) * 100}%`,
          background: remaining <= 10 ? 'var(--rouge)' : 'var(--brass)',
          transition: 'width 1s linear, background 0.3s',
        }} />
      </div>
      <span className="mono" style={{ fontSize: '0.75rem', color: remaining <= 10 ? 'var(--rouge)' : 'var(--ink-mute)' }}>
        {remaining}s
      </span>
    </div>
  )
}

function KickedOverlay({ t, reason, onClose }) {
  const reasonText = t(`kick_reason_${reason}`) || t('kick_reason_default')
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 970,
        background: 'rgba(20,15,12,0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        className="ticket"
        style={{
          background: 'var(--paper)',
          border: '3px double var(--rouge)',
          borderRadius: 6,
          boxShadow: '0 18px 48px rgba(0,0,0,0.45)',
          padding: '1.8rem 2.2rem',
          maxWidth: 460,
          textAlign: 'center',
        }}
      >
        <div className="eyebrow" style={{ color: 'var(--rouge)', marginBottom: 10 }}>
          🚪 {t('kicked_eyebrow')}
        </div>
        <h2 className="display" style={{ fontSize: '1.6rem', margin: '0 0 0.75rem' }}>
          {t('kicked_title')}
        </h2>
        <p className="serif" style={{ color: 'var(--ink-soft)', margin: '0 0 1.2rem', lineHeight: 1.5 }}>
          {t('kicked_intro')} <em>{reasonText}</em>.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="btn btn-primary"
          style={{ padding: '0.6rem 1.4rem', fontSize: '0.95rem' }}
        >
          {t('kicked_back_home')}
        </button>
      </div>
    </div>
  )
}

function SelfPlayToast({ t, dice, combo, fiches, isBot, nextName, onClose }) {
  const diceDisplay = Array.isArray(dice) ? `[${dice.join('-')}]` : ''
  const playLine = t(isBot ? 'self_play_bot_played' : 'self_play_you_played', {
    dice: diceDisplay,
    combo,
    fiches,
  })
  const nextLine = nextName ? t('self_play_next_up', { name: nextName }) : t('self_play_cycle_resolves')
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={t('close')}
      style={{
        position: 'fixed',
        right: '1.2rem',
        bottom: '1.2rem',
        zIndex: 60,
        maxWidth: 360,
        padding: '0.85rem 1.1rem',
        background: 'var(--paper)',
        border: '1px solid var(--brass-deep)',
        borderLeft: '4px solid var(--brass)',
        borderRadius: 4,
        textAlign: 'left',
        cursor: 'pointer',
        boxShadow: '0 10px 28px rgba(0,0,0,0.32)',
        animation: 'slideUp 0.28s ease-out',
        fontFamily: 'var(--body)',
        color: 'var(--ink)',
      }}
    >
      <div className="eyebrow" style={{ color: 'var(--brass-deep)', marginBottom: 4, fontSize: '0.62rem' }}>
        {isBot ? t('self_play_bot_eyebrow') : t('self_play_you_eyebrow')}
      </div>
      <div className="serif" style={{ fontSize: '0.95rem', margin: 0 }}>
        {playLine}
      </div>
      <div className="serif" style={{ fontStyle: 'italic', color: 'var(--ink-mute)', fontSize: '0.85rem', marginTop: 4 }}>
        {nextLine}
      </div>
      <style>{`@keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
    </button>
  )
}

function MatchEndBanner({ t, name, count, onClose }) {
  // count >= 2 means this is the SECOND manche of the round → that player
  // takes a round-point and a new round starts. Use heavier copy + a stronger
  // visual treatment so it's distinct from a "just lost a manche" banner.
  const isRoundLoss = count >= 2
  return (
    <button
      type="button"
      onClick={onClose}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: isRoundLoss ? 'rgba(20,15,12,0.7)' : 'rgba(20,15,12,0.55)',
        border: 'none',
        cursor: 'pointer',
        animation: 'fadeIn 0.25s ease-out',
      }}
      aria-label={t('close')}
    >
      <div
        className="ticket"
        style={{
          background: 'var(--paper)',
          border: `${isRoundLoss ? '3px double' : '2px solid'} var(--rouge)`,
          padding: '1.6rem 2.4rem',
          textAlign: 'center',
          maxWidth: 480,
          boxShadow: '0 18px 48px rgba(0,0,0,0.45)',
        }}
      >
        <div className="eyebrow" style={{ color: 'var(--rouge)', marginBottom: 8 }}>
          {isRoundLoss ? t('round_end_eyebrow') : t('match_end_eyebrow')}
        </div>
        <h2 className="display" style={{ fontSize: '1.8rem', margin: '0 0 0.5rem' }}>
          <em style={{ color: 'var(--rouge)' }}>{name}</em>{' '}
          {isRoundLoss ? t('round_end_verdict') : t('match_end_is_manche')}
        </h2>
        <p className="serif" style={{ color: 'var(--ink-soft)', margin: '0 0 0.3rem' }}>
          {isRoundLoss ? t('round_end_detail') : t('match_end_count', { count, total: 2 })}
        </p>
        <p className="serif" style={{ fontSize: '0.8rem', color: 'var(--ink-fade)', fontStyle: 'italic', margin: 0 }}>
          {t('match_end_dismiss_hint')}
        </p>
      </div>
      <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
    </button>
  )
}

function RhythmIndicator({ t, isMyTurn, isStarter, hasRolled, rollsUsed, maxThrows, bankRule, phase }) {
  // Surfaces three things in one compact pill:
  //   1. Bank rule (Sec / Libre) — eyebrow line, always visible
  //   2. Whether the rhythm is still "open" (starter pre-roll in libre rooms)
  //   3. Your progress (M/N) when it's your turn, or the locked cap when spectating
  //
  // G54: the « sec » rule only constrains throws during CHARGE (bank
  // distribution). Once the bank empties → DECHARGE, every player has the
  // normal 3-throw allowance, so the eyebrow flips to LIBRE and the cap
  // tracks `maxThrows` (the backend already enforces this — see
  // `app/game/ws.py:272`). The `isSec` config persists across phases for
  // future matches, but it's not in effect mid-DECHARGE.
  const isSecActive = bankRule === 'sec' && phase === 'charge'
  const cap = maxThrows
  const ruleLabel = isSecActive ? t('rhythm_bank_sec') : t('rhythm_bank_libre')
  const starterStillFree = isStarter && isMyTurn && !hasRolled && !isSecActive

  let status
  if (starterStillFree) {
    status = t('rhythm_free')
  } else if (isMyTurn) {
    status = t('rhythm_you_progress', { used: rollsUsed, cap })
  } else {
    status = t('rhythm_cap_max', { cap })
  }

  return (
    <div
      aria-label={`${t('rhythm_label')} · ${ruleLabel}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        padding: '0.35rem 0.85rem',
        background: 'var(--paper-deep)',
        border: '1px solid var(--rule)',
        borderRadius: 999,
        minWidth: 120,
      }}
    >
      <span className="eyebrow" style={{ fontSize: '0.6rem', color: 'var(--ink-mute)' }}>
        {t('rhythm_label')} · {ruleLabel}
      </span>
      <span className="mono" style={{ fontSize: '0.85rem', fontWeight: 700 }}>
        {status}
      </span>
    </div>
  )
}

function RollDots({ rollsLeft }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '0.3rem 0.8rem', background: 'var(--paper-deep)',
      border: '1px solid var(--rule)', borderRadius: 999,
    }} aria-label={`${rollsLeft} lancers restants`}>
      {[2, 1, 0].map(n => (
        <span key={n} style={{
          width: 10, height: 10, borderRadius: '50%',
          background: rollsLeft >= n + 1 ? 'var(--brass)' : 'var(--paper)',
          border: '1px solid var(--ink-soft)',
          display: 'inline-block',
          opacity: rollsLeft >= n + 1 ? 1 : 0.4,
        }} />
      ))}
      <span className="mono" style={{ fontSize: '0.7rem', color: 'var(--ink-mute)', marginLeft: 4 }}>
        {rollsLeft}/3
      </span>
    </div>
  )
}

function formatLogEntries(state, t, myName) {
  const events = state.log_events
  const raw = state.log || []
  if (events?.length) {
    return [...events].reverse().map((ev, i) =>
      renderLogEvent(ev, t, myName) || raw[raw.length - 1 - i] || '',
    )
  }
  return [...raw].reverse()
}

// G6: swap to a second-person variant whenever the viewer is the subject of the
// event. Helper tries the most specific `you_*` key first; falls back to the
// neutral third-person key when no personalized variant exists.
function renderLogEvent(ev, t, myName) {
  if (!ev?.key) return null
  const { key, ...params } = ev
  if (params.dice && Array.isArray(params.dice)) params.dice = `[${params.dice.join('-')}]`

  const tryYou = (suffix) => {
    const youKey = `you_${suffix}`
    const out = t(youKey, params)
    return out && out !== youKey ? out : null
  }

  // Decharge has two distinct viewer perspectives.
  if (key === 'log_decharge_gives' && myName) {
    if (params.winner === myName) {
      const out = tryYou('decharge_gives_winner')
      if (out) return out
    } else if (params.loser === myName) {
      const out = tryYou('decharge_gives_loser')
      if (out) return out
    }
  }

  // Starter-tagged events (round start, new set): viewer is the donneur.
  if ((key === 'log_round_start' || key === 'log_new_set') && params.starter === myName) {
    const out = tryYou(key.slice(4))
    if (out) return out
  }

  // Generic name-tagged events.
  if (params.name && params.name === myName) {
    const out = tryYou(key.slice(4))
    if (out) return out
  }

  return t(key, params)
}

