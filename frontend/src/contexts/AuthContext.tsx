import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import api from '@/lib/api'

interface User {
  id: number
  email: string
  full_name: string
  role: string
  tenant_id: number
  is_active: boolean
}

interface AuthContextType {
  user: User | null
  token: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, fullName: string, tenantName: string) => Promise<void>
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    const initializeAuth = async () => {
      const storedToken = localStorage.getItem('token')
      console.log('Inicializando auth. Token no localStorage:', storedToken ? storedToken.substring(0, 20) + '...' : 'NÃO ENCONTRADO')
      
      if (storedToken) {
        setToken(storedToken)
        // Só buscar usuário se não tivermos um já definido
        // (evita refetch desnecessário após login)
        if (!user) {
          await fetchUser(storedToken)
        } else {
          setLoading(false)
        }
      } else {
        console.log('Nenhum token encontrado no localStorage')
        setLoading(false)
      }
      setInitialized(true)
    }
    
    initializeAuth()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchUser = async (authToken: string) => {
    try {
      setLoading(true)
      const response = await api.get('/api/auth/me', {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      setUser(response.data)
      // Garantir que o token está definido
      if (!token) {
        setToken(authToken)
      }
    } catch (error: any) {
      // Se for 401, o token é inválido
      if (error.response?.status === 401) {
        console.log('Token inválido, limpando autenticação...')
        localStorage.removeItem('token')
        setToken(null)
        setUser(null)
      } else {
        console.error('Erro ao buscar usuário:', error)
        // Para outros erros, manter o token mas limpar user
        setUser(null)
      }
    } finally {
      setLoading(false)
    }
  }

  const login = async (email: string, password: string) => {
    const response = await api.post('/api/auth/login', { email, password })
    const { access_token, user: userData } = response.data
    console.log('Login bem-sucedido. Salvando token:', access_token.substring(0, 20) + '...')
    localStorage.setItem('token', access_token)
    console.log('Token salvo no localStorage. Verificando:', localStorage.getItem('token') ? 'OK' : 'FALHOU')
    setToken(access_token)
    setUser(userData)
    setLoading(false)
    setInitialized(true)
  }

  const register = async (email: string, password: string, fullName: string, tenantName: string) => {
    const response = await api.post('/api/auth/register', {
      email,
      password,
      full_name: fullName,
      tenant_name: tenantName,
    })
    // After registration, login automatically
    await login(email, password)
  }

  const logout = () => {
    setUser(null)
    setToken(null)
    localStorage.removeItem('token')
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        register,
        logout,
        isAuthenticated: !!user && !!token,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}





