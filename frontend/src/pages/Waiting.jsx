import { useEffect, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Avatar } from '../components/shared/Avatar.jsx'
import { ShareButtons } from '../components/shared/ShareButtons.jsx'
import { useGame } from '../hooks/useGame.js'
import { useLang } from '../context/useLang.js'

export function Waiting({ token }) {
  const { t } = useLang()
  const { gameId } = useParams()
  const [params] = useSearchParams()
  const playerId = params.get('pid')
  const navigate = useNavigate()
  const { state, start } = useGame(gameId, playerId, token)
  const hasNavigated = useRef(false)

  useEffect(() => {
    if (hasNavigated.current) return
    if (state.phase === 'initial_roll' || state.phase === 'charge' || state.phase === 'decharge') {
      hasNavigated.current = true
      navigate(`/game/${gameId}?pid=${playerId}`, { replace: true })
    }
  }, [state.phase, gameId, playerId, navigate])

  const isHost = state.room?.host_player_id === playerId
  const isPublic = state.room?.is_public

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <button type="button" onClick={() => navigate('/')} className="btn-link" style={{ marginBottom: 16 }}>
        ← {t('leave')}
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '2.5rem' }} className="waiting-grid">

        {/* Left: code + players */}
        <div>
          <div className="eyebrow">{t('waiting_room_eyebrow')} · {isPublic ? t('public_room') : t('private_room')}</div>
          <h1 className="display" style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', margin: '0.4rem 0 1.5rem' }}>
            {t('waiting_room_title_pre')} <em style={{ color: 'var(--rouge)' }}>{t('waiting_room_title_em')}</em>.
          </h1>

          {!isPublic && gameId && (
            <div className="ticket" style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
                <div>
                  <div className="eyebrow" style={{ marginBottom: 8 }}>{t('game_code')}</div>
                  <div className="code-block" aria-label={`${t('game_code')}: ${gameId}`}>{gameId}</div>
                </div>
                <ShareButtons code={gameId} />
              </div>
              <div className="note" style={{ marginTop: 14, fontSize: '0.9rem' }}>{t('share_code_hint')}</div>
            </div>
          )}

          <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem' }}>
              <div className="display" style={{ fontSize: '1.4rem' }}>{t('players_at_table')}</div>
              <div className="mono" style={{ color: 'var(--ink-mute)' }}>
                {state.players?.length ?? 0} / {state.room?.max_players ?? '?'}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {state.players?.map((p, i) => (
                <div key={p.id} className="fade-up" style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '0.9rem 1rem',
                  borderBottom: i < state.players.length - 1 ? '1px dashed var(--rule)' : 'none',
                  minHeight: 44,
                }}>
                  <Avatar name={p.name} userId={p.user_id} hasAvatar={p.has_avatar ?? false} isSelf={p.id === playerId} />
                  <div style={{ flex: 1 }}>
                    <div className="serif" style={{ fontSize: '1.15rem', fontWeight: 600 }}>
                      {p.name}
                      {p.id === state.room?.host_player_id && (
                        <span className="tag tag-rouge" style={{ marginLeft: 8, fontSize: '0.6rem' }}>★ {t('host_label')}</span>
                      )}
                      {p.id === playerId && (
                        <span className="serif" style={{ fontStyle: 'italic', color: 'var(--ink-mute)', marginLeft: 6, fontSize: '0.9rem' }}>
                          {t('you_label')}
                        </span>
                      )}
                    </div>
                  </div>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: p.connected ? 'var(--felt)' : 'var(--ink-fade)',
                    flexShrink: 0,
                  }} className={p.connected ? '' : 'pulse-soft'} aria-label={p.connected ? t('connected') : t('disconnected')} />
                </div>
              ))}

              {Array(Math.max(0, (state.room?.max_players ?? 0) - (state.players?.length ?? 0))).fill(0).map((_, i) => (
                <div key={`empty-${i}`} style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '0.9rem 1rem', opacity: 0.45,
                }}>
                  <div style={{ width: '2.6rem', height: '2.6rem', borderRadius: '50%', border: '1.5px dashed var(--ink-fade)', flexShrink: 0 }} />
                  <div className="serif" style={{ fontStyle: 'italic', color: 'var(--ink-fade)' }}>{t('empty_seat')}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.5rem', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div className="note">
              {(state.players?.length ?? 0) < 2
                ? t('min_players_msg')
                : isHost ? t('host_ready_msg') : t('waiting_for_host')}
            </div>
            {isHost && state.phase === 'waiting' && (state.players?.length ?? 0) >= 2 && (
              <button type="button" className="btn btn-rouge" onClick={start}>
                ▶ {t('start_game')}
              </button>
            )}
            {isHost && state.phase === 'initial_roll' && (
              <p className="note" style={{ fontStyle: 'italic' }}>{t('game_started_roll')}</p>
            )}
          </div>
        </div>

        {/* Right: room rules */}
        <div className="card" style={{ padding: '1.8rem', height: 'fit-content' }}>
          <div className="eyebrow">{t('room_settings')}</div>
          <div className="display" style={{ fontSize: '1.4rem', margin: '0.5rem 0 1.2rem' }}>{t('room_settings')}</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <SummaryRow icon="👥" label={t('max_players_label')} value={`${state.room?.max_players ?? '?'}`} />
            <SummaryRow icon="🎲" label={t('distribution_label')}
              value={
                state.room?.bank_rule === 'sec' ? t('sec_jusqu_banque')
                  : t('free_play')
              } />
            <SummaryRow icon="⏱" label={t('inactivity_label')}
              value={`${state.room?.afk_seconds ?? 45}s · ${t('bot_takes_over')}`} />
            <SummaryRow icon="👁" label={t('spectators_label')}
              value={state.room?.allow_spectators ? t('allowed') : t('private_label')} />
            <SummaryRow icon="🪙" label={t('bank_label')} value={t('chips_label')} />
          </ul>
          <div className="divider-fleuron"><span>❦</span></div>
          <div className="note" style={{ fontSize: '0.92rem' }}>{t('game_rules_note')}</div>
        </div>

      </div>

      <style>{`
        @media (max-width: 900px) {
          .waiting-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}

function SummaryRow({ icon, label, value }) {
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 10, borderBottom: '1px dashed var(--rule)' }}>
      <div style={{ fontSize: '1.2rem' }} aria-hidden="true">{icon}</div>
      <div style={{ flex: 1 }} className="eyebrow">{label}</div>
      <div className="serif" style={{ fontStyle: 'italic', fontSize: '1.05rem' }}>{value}</div>
    </li>
  )
}
