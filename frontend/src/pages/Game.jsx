import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Die } from '../components/shared/Die.jsx'
import { Avatar } from '../components/shared/Avatar.jsx'
import { ChipStack } from '../components/shared/ChipStack.jsx'
import { ComboTable } from '../components/shared/ComboTable.jsx'
import { RoomSettingsPanel } from '../components/shared/RoomSettingsPanel.jsx'
import { ConfirmModal } from '../components/shared/ConfirmModal.jsx'
import { CommentaryTicker, ScoreToBeatBanner } from '../components/shared/CommentaryTicker.jsx'
import { useGame } from '../hooks/useGame.js'
import { useLang } from '../context/useLang.js'

export function Game({ token }) {
  const { t } = useLang()
  const { gameId } = useParams()
  const [params] = useSearchParams()
  const playerId = params.get('pid')
  const navigate = useNavigate()
  const { state, roll, keep, done, initialRoll, tiebreakRoll, leave, kick } = useGame(gameId, playerId, token)
  const logRef = useRef(null)

  const [logOpen, setLogOpen] = useState(true)
  const [showRoomSettings, setShowRoomSettings] = useState(false)
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

  return (
    <div style={{
      minHeight: '100vh',
      display: 'grid',
      gridTemplateColumns: '260px 1fr 320px',
      gap: 0,
    }} className="gameroom-grid">

      <aside
        className="side-ticker"
        style={{
          borderRight: '1px solid var(--rule)',
          background: 'var(--paper-soft)',
          maxHeight: '100vh',
          overflow: 'hidden',
        }}
      >
        <CommentaryTicker events={state.log_events} t={t} />
      </aside>

      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Top panel */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 24,
          padding: '1.2rem 1.5rem',
          borderBottom: '1px solid var(--rule)',
          background: 'var(--paper-soft)',
          alignItems: 'center',
        }} className="top-panel">
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

          <div style={{ display: 'flex', gap: 10, overflow: 'auto', justifyContent: 'center' }}>
            {state.players?.map(p => (
              <PlayerStrip
                key={p.id}
                p={p}
                active={p.id === state.current_player_id}
                isSelf={p.id === playerId}
                t={t}
                canKick={isHost && p.id !== playerId}
                onKick={() => setKickTarget({ id: p.id, name: p.name })}
              />
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <CounterChip label={t('pool')} value={state.pool ?? 0} accent="var(--rouge)" />
            {isHost && (
              <button
                type="button"
                onClick={() => setShowRoomSettings(true)}
                aria-label={t('room_rules_button')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '0.4rem 0.75rem',
                  fontSize: '0.82rem',
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
              >⚙ {t('room_rules_button')}</button>
            )}
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
            pool dead-center as the focal point, score-to-beat banner pinned at top. */}
        <div style={{
          flex: 1, padding: '1.2rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
        }}>
          {matchEnd && (
            <MatchEndBanner
              t={t}
              name={matchEnd.name}
              count={matchEnd.count}
              onClose={() => setMatchEnd(null)}
            />
          )}
          <div
            className="piste-stage"
            style={{ position: 'relative', width: 'min(820px, 85vh, 100%)', aspectRatio: '1/1' }}
          >
            <div className="piste" style={{ position: 'absolute', inset: 0 }} role="region" aria-label="Piste de jeu">
              <div style={{
                position: 'absolute', top: '5%', left: '50%', transform: 'translateX(-50%)',
                fontFamily: 'var(--display)', fontStyle: 'italic',
                color: 'var(--paper-deep)', fontSize: '1rem', letterSpacing: '0.16em', whiteSpace: 'nowrap',
              }} aria-hidden="true">❦  L A   P I S T E  ❦</div>

              <ScoreToBeatBanner plays={state.current_round_plays} t={t} />

              {/* Pool chips — focal point dead-center */}
              <div style={{
                position: 'absolute', top: '46%', left: '50%', transform: 'translate(-50%,-50%)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              }}>
                {(state.pool ?? 0) > 0 && <ChipStack count={state.pool} />}
                <span className="eyebrow" style={{ fontSize: '0.6rem', color: 'var(--paper-deep)' }}>
                  {t('pool')} · <span className="mono">{state.pool ?? 0}</span>
                </span>
              </div>

              {/* Dice cluster — anchored at the bottom of the felt */}
              <div style={{
                position: 'absolute', bottom: '6%', left: '50%', transform: 'translateX(-50%)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                maxWidth: '90%',
              }}>
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

            {/* G47: rotate seats so the local viewer always sits at the
                bottom of the piste (the 90° / south slot). Other players
                fill the remaining positions preserving turn order. This
                gives each screen a personal vantage-point perspective —
                "my dice are at the bottom, opponents above" — instead of
                everyone seeing the same fixed seating where the rotation
                winner sits south regardless of who they are. */}
            {(() => {
              const players = state.players || []
              const myIdx = Math.max(0, players.findIndex(p => p.id === playerId))
              const rotated = [...players.slice(myIdx), ...players.slice(0, myIdx)]
              return rotated.map((p, i) => {
                const total = rotated.length
                const angle = 90 + (360 / total) * i
                const rad = (angle * Math.PI) / 180
                const r = 50
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

        {/* Action bar */}
        <div style={{
          padding: '1.2rem 1.5rem',
          borderTop: '1px solid var(--rule)',
          background: 'var(--paper-soft)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 16, flexWrap: 'wrap',
        }} role="region" aria-label="Contrôles">
          <div>
            <div className="eyebrow" style={{ fontSize: '0.78rem' }}>
              {isMyTurn ? t('your_turn') : `${t('waiting_turn')} — ${state.players?.find(p => p.id === state.current_player_id)?.name || ''}`}
            </div>
            <div className="serif" style={{ fontStyle: 'italic', color: 'var(--ink-soft)', marginTop: 6, fontSize: '1.05rem' }}>
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
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
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
            {isMyTurn && (
              <>
                <button
                  type="button"
                  onClick={roll}
                  disabled={!canRoll}
                  className="btn btn-rouge"
                  style={{ opacity: canRoll ? 1 : 0.4, minHeight: 44 }}
                  aria-label={!hasRolled ? t('roll') : t('reroll')}
                >
                  🎲 {!hasRolled ? t('roll') : t('reroll')}
                </button>
                <button
                  type="button"
                  onClick={done}
                  disabled={!canDone}
                  className="btn btn-primary"
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
        <div style={{ padding: '1rem 1.4rem', borderTop: '1px solid var(--rule)' }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>{t('combo_hier')}</div>
          <ComboTable compact />
        </div>
      </aside>

      <style>{`
        /* Mid-width: hide the ticker rail, keep log + piste */
        @media (max-width: 1180px) {
          .gameroom-grid { grid-template-columns: 1fr 320px !important; }
          .side-ticker { display: none !important; }
        }
        @media (max-width: 980px) {
          .gameroom-grid { grid-template-columns: 1fr !important; }
          .side-log { max-height: 300px !important; border-left: none !important; border-top: 1px solid var(--rule); }
          .side-ticker { display: none !important; }
          .top-panel { grid-template-columns: 1fr !important; gap: 12px !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .die-tumble, .pulse-soft, .glow-421 { animation: none !important; }
        }
      `}</style>

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

function PlayerStrip({ p, active, isSelf, t, canKick, onKick }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '0.4rem 0.8rem', borderRadius: 3,
      background: active ? 'var(--rouge)' : 'var(--paper-deep)',
      color: active ? 'var(--paper)' : 'var(--ink)',
      border: '1px solid var(--rule)', minWidth: 0, whiteSpace: 'nowrap',
    }}>
      <Avatar name={p.name} userId={p.user_id} hasAvatar={p.has_avatar ?? false} size={1.6} />
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1, minWidth: 0 }}>
        <span className="serif" style={{ fontWeight: 600, fontSize: '0.85rem' }}>{p.name}{isSelf ? ' ★' : ''}</span>
        <span className="mono" style={{ fontSize: '0.65rem', opacity: 0.7 }}>{p.tokens ?? 0} fiches</span>
      </div>
      <ScorePips matchLosses={p.match_losses ?? 0} roundPoints={p.round_points ?? 0} active={active} />
      {p.turn?.done && p.turn.dice && (
        <div style={{ display: 'flex', gap: 2, marginLeft: 4 }}>
          {p.turn.dice.map((v, i) => <Die key={i} value={v} mini />)}
        </div>
      )}
      {canKick && (
        <button
          type="button"
          onClick={onKick}
          aria-label={t ? `${t('kick_button')} ${p.name}` : 'Kick'}
          title={t ? t('kick_button') : 'Kick'}
          style={{
            marginLeft: 4,
            padding: '2px 6px',
            background: 'transparent',
            border: '1px solid var(--rule)',
            borderRadius: 999,
            color: active ? 'var(--paper)' : 'var(--ink-mute)',
            cursor: 'pointer',
            fontSize: '0.72rem',
            lineHeight: 1,
            opacity: 0.7,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '1'
            e.currentTarget.style.color = 'var(--rouge)'
            e.currentTarget.style.borderColor = 'var(--rouge)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '0.7'
            e.currentTarget.style.color = active ? 'var(--paper)' : 'var(--ink-mute)'
            e.currentTarget.style.borderColor = 'var(--rule)'
          }}
        >✕</button>
      )}
    </div>
  )
}

function ScorePips({ matchLosses, roundPoints, active }) {
  // Compact loss markers shown next to the player name. We always render both
  // counters (even at 0) so the player can see their position at a glance —
  // 💀 = manche perdue ce round, 🏷 = points de partie cumulés.
  if (!matchLosses && !roundPoints) return null
  return (
    <div
      style={{
        display: 'inline-flex',
        gap: 4,
        marginLeft: 4,
        fontSize: '0.7rem',
        fontFamily: 'var(--mono)',
        color: active ? 'var(--paper)' : 'var(--ink-soft)',
      }}
      aria-label={`Manches perdues: ${matchLosses} · Points de partie: ${roundPoints}`}
    >
      {matchLosses > 0 && (
        <span style={{
          padding: '1px 5px', borderRadius: 8, background: active ? 'rgba(255,255,255,0.18)' : 'var(--paper)',
          border: '1px solid var(--rule)', fontWeight: 700, color: 'var(--rouge)',
        }} title="Manches perdues ce round">💀 {matchLosses}</span>
      )}
      {roundPoints > 0 && (
        <span style={{
          padding: '1px 5px', borderRadius: 8, background: active ? 'rgba(255,255,255,0.18)' : 'var(--paper)',
          border: '1px solid var(--rule)', fontWeight: 700, color: 'var(--brass-deep)',
        }} title="Points de partie">🏷 {roundPoints}</span>
      )}
    </div>
  )
}

function PisteSeat({ p, active, isSelf, x, y, t }) {
  // G47: the local viewer's own seat is rendered larger so the player can
  // spot themselves at a glance — pairs with the G47 rotation that anchors
  // the viewer at the bottom slot.
  const avatarSize = isSelf ? 4.0 : 3.2
  const nameSize = isSelf ? '1.05rem' : '0.9rem'
  const namePadding = isSelf ? '0.4rem 0.85rem' : '0.3rem 0.7rem'
  const chipSize = isSelf ? '0.9rem' : '0.78rem'
  return (
    <div style={{
      position: 'absolute', left: `${x}%`, top: `${y}%`,
      transform: 'translate(-50%, -50%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      pointerEvents: 'none',
    }}>
      <Avatar name={p.name} userId={p.user_id} hasAvatar={p.has_avatar ?? false} active={active} isSelf={isSelf} size={avatarSize} />
      <div style={{
        background: active ? 'var(--ink)' : 'var(--paper-soft)',
        color: active ? 'var(--paper)' : 'var(--ink)',
        border: '1px solid var(--rule)',
        padding: namePadding, borderRadius: 2,
        fontFamily: 'var(--display)', fontWeight: 700, fontSize: nameSize,
        whiteSpace: 'nowrap',
        display: 'flex', alignItems: 'center', gap: 6,
        boxShadow: active ? '0 4px 0 rgba(0,0,0,0.3)' : '0 2px 0 rgba(0,0,0,0.1)',
        // G47: subtle brass underline on the viewer's seat to reinforce
        // "this is you" alongside the rotation + sizing.
        borderBottom: isSelf ? '3px solid var(--brass)' : undefined,
      }}>
        <span>{p.name}{isSelf ? ' ★' : ''}</span>
        <ScorePips matchLosses={p.match_losses ?? 0} roundPoints={p.round_points ?? 0} active={active} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{
          fontFamily: 'var(--mono)', fontWeight: 700, fontSize: chipSize,
          background: 'var(--paper-deep)', border: '1px solid var(--rule)',
          padding: '2px 8px', borderRadius: 999, color: 'var(--ink-soft)',
        }}>{p.tokens ?? 0} 🪙</div>
        {p.turn?.done && p.turn.dice && (
          <div style={{ display: 'flex', gap: 2 }}>
            {p.turn.dice.map((v, i) => <Die key={i} value={v} mini />)}
          </div>
        )}
      </div>
      {isSelf && t && (
        <div className="eyebrow" style={{
          fontSize: '0.6rem', color: 'var(--brass-deep)',
          letterSpacing: '0.12em', marginTop: 2,
        }}>
          ↓ {t('you_label_caret')}
        </div>
      )}
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

