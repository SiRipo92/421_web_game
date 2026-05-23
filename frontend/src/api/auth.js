async function req(path, opts = {}) {
  // Order matters: spread opts FIRST, then build the final headers object so the
  // Authorization: Bearer ... passed by callers doesn't overwrite Content-Type
  // (which would cause FastAPI to 422 PATCH /auth/me & POST /auth/complete-profile
  // because the body isn't parsed as JSON without the Content-Type header).
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 429) throw { status: 429, detail: 'rate_limit' }
    const detail = Array.isArray(body.detail)
      ? body.detail.map(e => e.msg || String(e)).join('; ')
      : body.detail || 'error'
    throw { status: res.status, detail }
  }
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

export const googleLogin = (credential) =>
  req('/auth/google', { method: 'POST', body: JSON.stringify({ credential }) })

export const completeProfile = (token, username, birthdate) =>
  req('/auth/complete-profile', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ username, birthdate }),
  })

export const updateMe = (token, data) =>
  req('/auth/me', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  })

export const deleteAccount = (token) =>
  req('/auth/me', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })

export const exportData = (token) =>
  req('/auth/export', { headers: { Authorization: `Bearer ${token}` } })

export const uploadAvatar = async (token, file) => {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/auth/avatar', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 429) throw { status: 429, detail: 'rate_limit' }
    throw { status: res.status, detail: body.detail || 'error' }
  }
  return body
}

export const deleteAvatar = (token) =>
  req('/auth/avatar', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
