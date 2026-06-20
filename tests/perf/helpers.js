// Shared utilities for k6 perf scenarios.
import http from 'k6/http'
import { check } from 'k6'

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:8421'

// k6 doesn't have crypto.randomUUID() out of the box; use timestamp + VU id.
export function uniqueSuffix() {
  return `${Date.now().toString(36)}_${__VU}_${__ITER}`
}

export function makeUser(prefix = 'perf') {
  const suffix = uniqueSuffix()
  return {
    username: `${prefix}_${suffix}`.slice(0, 20),
    email: `${prefix}_${suffix}@gmail.com`,
    password: 'PerfTest1!',
    birthdate: '1990-06-15',
  }
}

export function register(user) {
  const r = http.post(`${BASE_URL}/auth/register`, JSON.stringify(user), {
    headers: { 'Content-Type': 'application/json' },
  })
  check(r, { 'register 201': (res) => res.status === 201 })
  return r.json('access_token')
}

export function login(email, password) {
  const r = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email, password }),
    { headers: { 'Content-Type': 'application/json' } },
  )
  check(r, { 'login 200': (res) => res.status === 200 })
  return r.json('access_token')
}
