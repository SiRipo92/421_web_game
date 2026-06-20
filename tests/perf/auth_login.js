/**
 * G99 perf: /auth/login under concurrency.
 *
 * Scenario:
 *   1. setup() pre-registers a pool of 20 users.
 *   2. The test body picks a random user from the pool and hits
 *      /auth/login for the duration.
 *   3. Ramp up to 100 VUs over 30s, hold for 60s, ramp down for 10s.
 *
 * SLOs (`thresholds` enforce these — k6 exits non-zero if breached):
 *   - p95 < 500ms
 *   - p99 < 1s
 *   - 0 failed requests
 */
import http from 'k6/http'
import { check, sleep } from 'k6'
import { BASE_URL, makeUser, register } from './helpers.js'

const POOL_SIZE = 20

export const options = {
  stages: [
    { duration: '30s', target: 100 },
    { duration: '60s', target: 100 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate==0'],
  },
}

export function setup() {
  const pool = []
  for (let i = 0; i < POOL_SIZE; i++) {
    const u = makeUser(`login_pool_${i}`)
    register(u)
    pool.push({ email: u.email, password: u.password })
  }
  return { pool }
}

export default function (data) {
  const user = data.pool[Math.floor(Math.random() * data.pool.length)]
  const r = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: user.email, password: user.password }),
    { headers: { 'Content-Type': 'application/json' } },
  )
  check(r, {
    'status 200': (res) => res.status === 200,
    'has token': (res) => Boolean(res.json('access_token')),
  })
  sleep(0.1)
}
