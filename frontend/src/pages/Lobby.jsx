import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLang } from '../context/useLang.js'
import { listRooms, joinGame } from '../api/game.js'

export function Lobby({ token }) {
  const { t } = useLang()
  const navigate = useNavigate()
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchRooms = useCallback(async () => {
    try {
      const { rooms: r } = await listRooms()
      setRooms(r)
      setError('')
    } catch {
      setError(t('err_generic'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const { rooms: r } = await listRooms()
        if (!cancelled) { setRooms(r); setError('') }
      } catch {
        if (!cancelled) setError(t('err_generic'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    const interval = setInterval(run, 5000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [t])

  const handleJoin = async (gameId) => {
    const name = sessionStorage.getItem('playerName') || t('default_player_name')
    try {
      const res = await joinGame(gameId, name, token)
      if (res.error) { setError(t('err_game_full')); return }
      navigate(`/waiting/${gameId}?pid=${res.player_id}`)
    } catch {
      setError(t('err_generic'))
    }
  }

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '2.5rem 1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.5rem', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="eyebrow">{t('public_tables')}</div>
          <h1 className="display" style={{ fontSize: 'clamp(2.4rem, 5vw, 3.2rem)', margin: '0.3rem 0 0.4rem' }}>
            {t('lobby_title')}.
          </h1>
          <p className="note">{t('lobby_sub')}</p>
        </div>
        <button type="button" onClick={fetchRooms} className="btn btn-ghost" aria-label={t('refresh')}>
          ↺ {t('refresh')}
        </button>
      </div>

      {error && <p style={{ color: 'var(--rouge)', margin: '1rem 0' }}>{error}</p>}

      {loading ? (
        <p className="serif" style={{ fontStyle: 'italic', color: 'var(--ink-mute)', marginTop: '2rem' }}>{t('loading')}</p>
      ) : rooms.length === 0 ? (
        <div className="ticket" style={{ marginTop: '2rem', textAlign: 'center', padding: '3rem' }}>
          <p className="serif" style={{ fontStyle: 'italic', color: 'var(--ink-mute)', fontSize: '1.2rem' }}>
            {t('no_rooms')}
          </p>
          <button type="button" className="btn btn-rouge" style={{ marginTop: '1.5rem' }} onClick={() => navigate('/create')}>
            ❦ {t('create_room')}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }} className="card" role="list">
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr auto auto auto auto', gap: 16,
            padding: '0.8rem 1.4rem', background: 'var(--paper-deep)', borderBottom: '1px solid var(--rule)',
            alignItems: 'center',
          }}>
            <div className="eyebrow">{t('host_col')}</div>
            <div className="eyebrow">{t('players_label')}</div>
            <div className="eyebrow">Banque</div>
            <div className="eyebrow" />
          </div>
          {rooms.map((room, i) => (
            <div
              key={room.game_id}
              role="listitem"
              style={{
                display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 16,
                padding: '1rem 1.4rem', alignItems: 'center',
                borderBottom: i < rooms.length - 1 ? '1px dashed var(--rule)' : 'none',
              }}
            >
              <div>
                <div className="serif" style={{ fontWeight: 600, fontSize: '1.1rem' }}>
                  {room.host_name || '?'}
                </div>
                <div className="mono" style={{ fontSize: '0.75rem', color: 'var(--ink-mute)' }}>
                  #{room.game_id}
                </div>
              </div>
              <div className="mono" style={{ fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                {room.player_count}/{room.max_players} {t('players_label')}
              </div>
              <span className={`tag ${room.bank_rule === 'sec' ? 'tag-rouge' : 'tag-felt'}`}>
                {room.bank_rule === 'sec' ? 'Sec' : t('free_play').split(' ')[0]}
              </span>
              <button
                type="button"
                className="btn btn-primary"
                style={{ padding: '0.5rem 1rem', fontSize: '0.9rem', minHeight: 44 }}
                onClick={() => handleJoin(room.game_id)}
              >
                {t('join')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
