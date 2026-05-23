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

export const dashboardSummary = (token) =>
  req('/api/admin/dashboard-summary', { headers: { Authorization: `Bearer ${token}` } })

export const updateUserRole = (token, userId, newRole) =>
  req(`/api/admin/users/${userId}/role?new_role=${encodeURIComponent(newRole)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  })
