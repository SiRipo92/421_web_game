async function req(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw { status: res.status, detail: body.detail || 'error' }
  return body
}

export const login = (email, password, remember_me = false) =>
  req('/auth/login', { method: 'POST', body: JSON.stringify({ email, password, remember_me }) })

export const register = (data) =>
  req('/auth/register', { method: 'POST', body: JSON.stringify(data) })

export const me = (token) =>
  req('/auth/me', { headers: { Authorization: `Bearer ${token}` } })

export const forgotPassword = (email) =>
  req('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) })

export const resetPassword = (token, new_password) =>
  req('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, new_password }) })
