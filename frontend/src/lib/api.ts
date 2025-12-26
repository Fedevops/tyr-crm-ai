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
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const url = error.config?.url || ''
      const isAuthEndpoint = url.includes('/api/auth/')
      
      // Para endpoints de autenticação (login, register), apenas rejeitar o erro
      if (isAuthEndpoint) {
        return Promise.reject(error)
      }
      
      // Para outros endpoints com 401, verificar se há um token
      const token = localStorage.getItem('token')
      
      if (token) {
        // Token existe mas foi rejeitado - está expirado ou inválido
        console.log('⚠️ Token expirado ou inválido. Limpando autenticação...')
        console.log('URL:', url)
        console.log('Detalhes do erro:', error.response?.data)
        
        // Limpar token do localStorage
        localStorage.removeItem('token')
        
        // Disparar evento customizado para notificar outros componentes
        window.dispatchEvent(new CustomEvent('auth:token-expired'))
        
        // Redirecionar para login apenas se não estiver já na página de login
        if (!window.location.pathname.includes('/login')) {
          console.log('Redirecionando para login...')
          // Usar setTimeout para evitar problemas com navegação durante tratamento de erro
          setTimeout(() => {
            window.location.href = '/login'
          }, 100)
        }
      } else {
        console.log('Token não existe no localStorage. Requisição foi feita sem autenticação.')
      }
    }
    return Promise.reject(error)
  }
)

// Live Pulse API functions
export const livePulseApi = {
  getVisitors: () => api.get('/api/live-pulse/visitors'),
  getVisitor: (visitorId: string) => api.get(`/api/live-pulse/visitors/${visitorId}`),
  createVisitor: (data: any) => api.post('/api/live-pulse/visitors', data),
  updateVisitor: (visitorId: string, data: any) => api.put(`/api/live-pulse/visitors/${visitorId}`, data),
  getChatHistory: (visitorId: string) => api.get(`/api/live-pulse/visitors/${visitorId}/chat`),
  sendChatMessage: (visitorId: string, message: string) => api.post(`/api/live-pulse/visitors/${visitorId}/chat`, { message }),
  convertToLead: (visitorId: string, data: any) => api.post(`/api/live-pulse/visitors/${visitorId}/convert-to-lead`, data),
  getVisitReports: (skip?: number, limit?: number) => api.get('/api/live-pulse/visit-reports', { params: { skip, limit } }),
  getVisitReport: (reportId: number) => api.get(`/api/live-pulse/visit-reports/${reportId}`),
}

export default api





