async function req(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw { status: res.status, detail: body.detail || 'error' }
  }
  return body
}

const auth = (token) => ({ Authorization: `Bearer ${token}` })

export const dashboardSummary = (token) =>
  req('/api/admin/dashboard-summary', { headers: auth(token) })

export const updateUserRole = (token, userId, newRole) =>
  req(`/api/admin/users/${userId}/role?new_role=${encodeURIComponent(newRole)}`, {
    method: 'PATCH',
    headers: auth(token),
  })

export const forceRenameUser = (token, userId, newUsername) =>
  req(`/api/admin/users/${userId}/username`, {
    method: 'PATCH',
    headers: auth(token),
    body: JSON.stringify({ new_username: newUsername }),
  })

// G90: paginated user list with filters
export const listUsers = (token, params = {}) => {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '' && v !== false) {
      qs.append(k, v)
    }
  })
  const query = qs.toString()
  return req(`/api/admin/users${query ? `?${query}` : ''}`, { headers: auth(token) })
}

export const getUserDetail = (token, userId) =>
  req(`/api/admin/users/${userId}`, { headers: auth(token) })

export const banUser = (token, userId, duration, reason) =>
  req(`/api/admin/users/${userId}/ban`, {
    method: 'POST',
    headers: auth(token),
    body: JSON.stringify({ duration, reason }),
  })

export const unbanUser = (token, userId) =>
  req(`/api/admin/users/${userId}/ban`, {
    method: 'DELETE',
    headers: auth(token),
  })

export const chatBanUser = (token, userId, duration, reason) =>
  req(`/api/admin/users/${userId}/chat-ban`, {
    method: 'POST',
    headers: auth(token),
    body: JSON.stringify({ duration, reason }),
  })

export const chatUnbanUser = (token, userId) =>
  req(`/api/admin/users/${userId}/chat-ban`, {
    method: 'DELETE',
    headers: auth(token),
  })

export const deleteUser = (token, userId, confirmUsername, reason) =>
  req(`/api/admin/users/${userId}`, {
    method: 'DELETE',
    headers: auth(token),
    body: JSON.stringify({ confirm_username: confirmUsername, reason: reason || null }),
  })

export const auditFeed = (token, params = {}) => {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.append(k, v)
  })
  const query = qs.toString()
  return req(`/api/admin/audit${query ? `?${query}` : ''}`, { headers: auth(token) })
}
