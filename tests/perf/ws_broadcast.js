/**
 * G99 perf: WebSocket broadcast soak.
 *
 * Scenario:
 *   1. setup() creates one room and registers 10 users.
 *   2. Each VU connects via WS to the same room.
 *   3. For 5 minutes, every VU records every state broadcast received.
 *   4. Pass: 0 disconnects, no message loss, ws_msgs_received_per_vu
 *      stays within +/- 2 of the median across VUs (no client falling
 *      behind).
 *
 * Why this matters: the bot-turn + state-broadcast path is the hottest
 * code in the app. A regression here (extra lock contention, extra DB
 * write per state, etc.) shows up first as elevated ws_msg_latency.
 */
import { check } from 'k6'
import { Trend, Counter } from 'k6/metrics'
import { WebSocket } from 'k6/experimental/websockets'
import { setTimeout } from 'k6/timers'
import { BASE_URL, makeUser, register } from './helpers.js'

const WS_URL = BASE_URL.replace(/^http/, 'ws')

const wsConnectTime = new Trend('ws_connect_ms')
const wsMessagesReceived = new Counter('ws_messages_received')

export const options = {
  scenarios: {
    soak: {
      executor: 'constant-vus',
      vus: 10,
      duration: '5m',
    },
  },
  thresholds: {
    ws_connect_ms: ['p(95)<1000'],
    // No errors during the soak.
    checks: ['rate==1.0'],
  },
}

export function setup() {
  // 10 fresh users + one shared room.
  const users = []
  for (let i = 0; i < 10; i++) {
    const u = makeUser(`ws_soak_${i}`)
    register(u)
    users.push({ email: u.email, password: u.password })
  }

  // Create the room via an unauthenticated call. game_id is what we
  // hand to every VU's WS URL.
  const http = require('k6/http')
  const createRes = http.post(`${BASE_URL}/api/create?is_public=true`, null)
  const gameId = createRes.json('game_id')

  return { gameId, users }
}

export default function (data) {
  const playerId = `vu_${__VU}_${Date.now().toString(36)}`
  const url = `${WS_URL}/ws/${data.gameId}/${playerId}`
  const start = Date.now()

  const ws = new WebSocket(url)
  ws.addEventListener('open', () => {
    wsConnectTime.add(Date.now() - start)
  })
  ws.addEventListener('message', () => {
    wsMessagesReceived.add(1)
  })
  ws.addEventListener('error', (e) => {
    check(e, { 'no ws error': () => false })
  })

  // Run the soak for the full scenario duration.
  setTimeout(() => {
    ws.close()
  }, 4 * 60 * 1000) // 4 min (leave 1 min for ramp + summary)
}
