/**
 * G101h — survivor's overlay when their opponent has been AFK-evicted and
 * they are now alone in the room. The evicted player gets the
 * `EvictedOverlay` (defined in Game.jsx); their counterpart used to be left
 * staring at an empty piste with only a `log_afk_eviction` line in the
 * journal drawer — readable for developers, not for normal players. This
 * component is the human-readable counterpart for the survivor.
 *
 * Render condition (owned by the caller, not by the component):
 *   state.playerEvicted
 *   && state.playerEvicted.playerId !== playerId
 *   && (state.players || []).length <= 1
 *
 * Auto-clears when a new player joins (roster grows → condition flips off).
 * Used by both `Game.jsx` and `GameMobile.jsx`.
 */
export function OpponentLeftWaitingOverlay({ t, opponentName, onLeave }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="opponent-left-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.82)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: 480,
          padding: '1.8rem',
          textAlign: 'center',
          background: 'var(--paper)',
        }}
      >
        <div
          className="eyebrow"
          style={{ color: 'var(--brass-deep)', marginBottom: 8 }}
        >
          {t('opponent_left_eyebrow')}
        </div>
        <h2
          id="opponent-left-title"
          className="display"
          style={{ fontSize: '1.5rem', margin: '0 0 1rem' }}
        >
          {t('opponent_left_title', { name: opponentName || t('opponent_left_default_name') })}
        </h2>
        <p
          className="serif"
          style={{ margin: '0 0 1.2rem', color: 'var(--ink-soft)', lineHeight: 1.45 }}
        >
          {t('opponent_left_body')}
        </p>
        <div
          aria-live="polite"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: '1.4rem',
            color: 'var(--ink-mute)',
            fontSize: '0.84rem',
            fontFamily: 'var(--mono)',
          }}
        >
          <span className="opp-left-spinner" aria-hidden="true" />
          {t('opponent_left_waiting')}
        </div>
        <div>
          <button type="button" className="btn btn-secondary" onClick={onLeave}>
            {t('opponent_left_leave')}
          </button>
        </div>
      </div>
      <style>{`
        .opp-left-spinner {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          border: 2px solid var(--brass-soft, rgba(180, 144, 88, 0.45));
          border-top-color: var(--brass-deep, #8a6a3a);
          animation: oppLeftSpin 0.9s linear infinite;
          display: inline-block;
        }
        @keyframes oppLeftSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
