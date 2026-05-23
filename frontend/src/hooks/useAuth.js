import { useCallback, useEffect, useRef, useState } from 'react'
import * as authApi from '../api/auth.js'

export function useAuth() {
  const [token, setToken] = useState(() => localStorage.getItem('token'))
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(!!localStorage.getItem('token'))
  const avatarVerRef = useRef(0)

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
    try {
      const u = await authApi.me(access_token)
      setUser(u)
      return u
    } catch {
      return null
    }
  }, [])

  const googleLogin = useCallback(async (credential) => {
    const { access_token, is_new } = await authApi.googleLogin(credential)
    localStorage.setItem('token', access_token)
    setToken(access_token)
    try {
      const u = await authApi.me(access_token)
      setUser(u)
    } catch { /* ignore */ }
    return { is_new }
  }, [])

  const refreshUser = useCallback(async (currentToken) => {
    const t = currentToken || token
    if (!t) return null
    try {
      const u = await authApi.me(t)
      avatarVerRef.current += 1
      setUser({ ...u, _ver: avatarVerRef.current })
      return u
    } catch {
      return null
    }
  }, [token])

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    setToken(null)
    setUser(null)
  }, [])

  return { token, user, loading, login, register, googleLogin, refreshUser, logout }
}
