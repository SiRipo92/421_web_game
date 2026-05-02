import { useCallback, useEffect, useState } from 'react'
import * as authApi from '../api/auth.js'

export function useAuth() {
  const [token, setToken] = useState(() => localStorage.getItem('token'))
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(!!localStorage.getItem('token'))

  useEffect(() => {
    if (!token) { setLoading(false); return }
    authApi.me(token)
      .then(u => setUser(u))
      .catch(() => { localStorage.removeItem('token'); setToken(null) })
      .finally(() => setLoading(false))
  }, [token])

  const login = useCallback(async (email, password, rememberMe = false) => {
    const { access_token } = await authApi.login(email, password, rememberMe)
    localStorage.setItem('token', access_token)
    setToken(access_token)
    const u = await authApi.me(access_token)
    setUser(u)
    return u
  }, [])

  const register = useCallback(async (data) => {
    const { access_token } = await authApi.register(data)
    localStorage.setItem('token', access_token)
    setToken(access_token)
    const u = await authApi.me(access_token)
    setUser(u)
    return u
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    setToken(null)
    setUser(null)
  }, [])

  return { token, user, loading, login, register, logout }
}
