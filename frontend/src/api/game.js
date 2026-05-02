async function req(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw { status: res.status, detail: body.detail || body.error || 'error' }
  return body
}

export const createGame = (params, token) => {
  const qs = new URLSearchParams({ ...params, ...(token ? { token } : {}) })
  return req(`/api/create?${qs}`, { method: 'POST' })
}

export const joinGame = (gameId, name, token) => {
  const qs = new URLSearchParams({ name, ...(token ? { token } : {}) })
  return req(`/api/join/${gameId}?${qs}`)
}

export const listRooms = () => req('/api/rooms')

export const gdprContact = (name, email, request_type) =>
  req('/api/gdpr/contact', { method: 'POST', body: JSON.stringify({ name, email, request_type }) })
