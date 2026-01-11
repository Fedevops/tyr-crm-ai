import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { partnerAuthApi } from '@/lib/api'

interface PartnerUser {
  id: number
  email: string
  full_name: string
  is_active: boolean
  is_owner: boolean
  role: string
  partner_id: number
  partner_nome: string | null
}

interface PartnerAuthContextType {
  user: PartnerUser | null
  token: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  isAuthenticated: boolean
}

const PartnerAuthContext = createContext<PartnerAuthContextType | undefined>(undefined)

export function PartnerAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PartnerUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const logout = useCallback(() => {
    setUser(null)
    setToken(null)
    localStorage.removeItem('partner_token')
  }, [])

  useEffect(() => {
    const initializeAuth = async () => {
      const storedToken = localStorage.getItem('partner_token')
      
      if (storedToken) {
        setToken(storedToken)
        try {
          const response = await partnerAuthApi.getMe()
          setUser(response.data)
        } catch (error) {
          localStorage.removeItem('partner_token')
          setToken(null)
          setUser(null)
        }
      }
      setLoading(false)
    }
    
    initializeAuth()
    
    const handleTokenExpired = () => {
      logout()
    }
    
    window.addEventListener('auth:token-expired', handleTokenExpired)
    
    return () => {
      window.removeEventListener('auth:token-expired', handleTokenExpired)
    }
  }, [logout])

  const login = async (email: string, password: string) => {
    const response = await partnerAuthApi.login(email, password)
    const { access_token, user: userData } = response.data
    localStorage.setItem('partner_token', access_token)
    setToken(access_token)
    setUser(userData)
    setLoading(false)
  }

  return (
    <PartnerAuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        logout,
        isAuthenticated: !!user && !!token,
      }}
    >
      {children}
    </PartnerAuthContext.Provider>
  )
}

export function usePartnerAuth() {
  const context = useContext(PartnerAuthContext)
  if (context === undefined) {
    throw new Error('usePartnerAuth must be used within a PartnerAuthProvider')
  }
  return context
}

