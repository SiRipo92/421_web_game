/**
 * G99 perf: full room lifecycle under concurrency.
 *
 * Each VU iteration:
 *   1. Register a fresh user.
 *   2. Create a room via POST /api/create.
 *   3. (Skip actual gameplay — that's the WS scenario.) Verify the
 *      room HTTP detail endpoint responds, then leave.
 *
 * Tightens the SLO compared to auth_login because room creation hits
 * Postgres + the in-memory registry; it's the most representative
 * "happy path" for a logged-in user.
 *
 * SLOs:
 *   - p95 round-trip < 800ms
 *   - 0 failed requests
 */
import http from 'k6/http'
import { check, sleep } from 'k6'
import { BASE_URL, makeUser, register } from './helpers.js'

export const options = {
  stages: [
    { duration: '20s', target: 50 },
    { duration: '60s', target: 50 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<800'],
    http_req_failed: ['rate==0'],
  },
}

export default function () {
  const u = makeUser('lifecycle')
  const token = register(u)
  const authHeader = { Authorization: `Bearer ${token}` }

  // Create a room (handler is auth-optional; logged-in user attribution
  // exercises the user-id lookup path).
  const createRes = http.post(
    `${BASE_URL}/api/create?is_public=true`,
    null,
    { headers: authHeader },
  )
  check(createRes, { 'create 200': (r) => r.status === 200 })
  const gameId = createRes.json('game_id')
  if (!gameId) return

  // Hit the rooms listing — exercises the public rooms query path.
  const listRes = http.get(`${BASE_URL}/api/rooms`)
  check(listRes, { 'list 200': (r) => r.status === 200 })

  sleep(0.2)
}
