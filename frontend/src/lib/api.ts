import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  // Ensure custom headers are accessible
  withCredentials: true,
})

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
    console.log('Token adicionado à requisição:', config.url, 'Token:', token.substring(0, 20) + '...')
  } else {
    // Se não há token e não é uma requisição de auth, pode ser um problema
    const isAuthEndpoint = config.url?.includes('/api/auth/')
    if (!isAuthEndpoint) {
      console.warn('⚠️ Requisição sem token:', config.url)
    }
  }
  return config
})

// Handle 401 errors (unauthorized)
// NOTA: Não redirecionamos automaticamente aqui para evitar conflitos com ProtectedRoute
// O ProtectedRoute cuida do redirecionamento baseado no estado de autenticação
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const url = error.config?.url || ''
      const isAuthEndpoint = url.includes('/api/auth/')
      
      // Para endpoints de autenticação, apenas rejeitar o erro
      if (isAuthEndpoint) {
        return Promise.reject(error)
      }
      
      // Para outros endpoints com 401, verificar se realmente há um token
      // antes de limpar (pode ser que o token não foi enviado)
      const token = localStorage.getItem('token')
      console.log('Erro 401 em', url, 'Token no localStorage:', token ? 'EXISTE' : 'NÃO EXISTE')
      
      if (token) {
        // Token existe mas foi rejeitado - pode estar expirado ou inválido
        console.log('Token existe mas foi rejeitado. Pode estar expirado ou inválido.')
        console.log('Detalhes do erro:', error.response?.data)
        
        // Não limpar automaticamente - deixar o componente decidir
        // Mas logar para debug
      } else {
        console.log('Token não existe no localStorage. Requisição foi feita sem autenticação.')
      }
    }
    return Promise.reject(error)
  }
)

export default api





