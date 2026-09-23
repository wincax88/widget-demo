import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, SessionResponse } from '../services/api'

interface SessionContextValue {
  session: SessionResponse | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setSession(await api.session())
      setError(null)
    } catch (cause) {
      setSession({ authenticated: false })
      setError(cause instanceof Error ? cause.message : '无法读取登录状态')
    } finally {
      setLoading(false)
    }
  }, [])
  const logout = useCallback(async () => {
    await api.logout()
    setSession({ authenticated: false })
  }, [])
  useEffect(() => {
    void refresh()
  }, [refresh])
  const value = useMemo(
    () => ({ session, loading, error, refresh, logout }),
    [session, loading, error, refresh, logout],
  )
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const context = useContext(SessionContext)
  if (!context) throw new Error('useSession must be used inside SessionProvider')
  return context
}
