import { useCallback, useEffect, useReducer, useRef } from 'react'

function reducer(state, action) {
  switch (action.type) {
    case 'STATE':
      return { ...state, ...action.payload, connected: true }
    case 'DISCONNECTED':
      return { ...state, connected: false }
    case 'KICKED':
      return { ...state, kickedReason: action.reason || 'afk' }
    // G95: admin sends a banner to everyone in the room.
    case 'ADMIN_BROADCAST':
      return {
        ...state,
        adminBroadcast: {
          message_fr: action.message_fr,
          message_en: action.message_en,
          severity: action.severity || 'info',
        },
      }
    case 'ADMIN_BROADCAST_DISMISS':
      return { ...state, adminBroadcast: null }
    // G95: admin dissolved the room entirely.
    case 'ROOM_DISSOLVED':
      return { ...state, roomDissolved: { reason: action.reason, by: action.by } }
    default:
      return state
  }
}

const INITIAL = {
  connected: false,
  phase: null,
  round: 0,
  pool: 11,
  players: [],
  waiting_players: [],
  current_player_id: null,
  round_starter_id: null,
  max_throws: 3,
  room: null,
  current_round_plays: [],
  last_round_plays: [],
  log: [],
  kickedReason: null,
  adminBroadcast: null,
  roomDissolved: null,
  afk_started_at: null,
}

export function useGame(gameId, playerId, token) {
  const [state, dispatch] = useReducer(reducer, INITIAL)
  const wsRef = useRef(null)

  useEffect(() => {
    if (!gameId || !playerId) return
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const url = `${proto}//${host}/ws/${gameId}/${playerId}${token ? `?token=${token}` : ''}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'state') dispatch({ type: 'STATE', payload: msg })
      else if (msg.type === 'kicked') dispatch({ type: 'KICKED', reason: msg.reason })
      else if (msg.type === 'admin_broadcast')
        dispatch({
          type: 'ADMIN_BROADCAST',
          message_fr: msg.message_fr,
          message_en: msg.message_en,
          severity: msg.severity,
        })
      else if (msg.type === 'room_dissolved')
        dispatch({ type: 'ROOM_DISSOLVED', reason: msg.reason, by: msg.by })
    }
    ws.onclose = () => dispatch({ type: 'DISCONNECTED' })

    return () => { ws.close(); wsRef.current = null }
  }, [gameId, playerId, token])

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }, [])

  const roll = useCallback(() => send({ action: 'roll' }), [send])
  const keep = useCallback((index) => send({ action: 'keep', index }), [send])
  const done = useCallback(() => send({ action: 'done' }), [send])
  const initialRoll = useCallback(() => send({ action: 'initial_roll' }), [send])
  const tiebreakRoll = useCallback(() => send({ action: 'tiebreak_roll' }), [send])
  const start = useCallback(() => send({ action: 'start' }), [send])
  const leave = useCallback(() => send({ action: 'leave' }), [send])
  const kick = useCallback(
    (targetId, reason = 'afk') => send({ action: 'kick', target_id: targetId, reason }),
    [send],
  )
  // G45: host queues a partial room-rules update. Applies at the next
  // partie boundary on the server; nothing changes live mid-cycle.
  const updateRoomRules = useCallback(
    (rules) => send({ action: 'update_room_rules', rules }),
    [send],
  )

  const dismissAdminBroadcast = useCallback(() => dispatch({ type: 'ADMIN_BROADCAST_DISMISS' }), [])

  return { state, roll, keep, done, initialRoll, tiebreakRoll, start, leave, kick, updateRoomRules, dismissAdminBroadcast }
}
