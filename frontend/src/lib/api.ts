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

// Proposal Templates API functions
export const proposalTemplatesApi = {
  getTemplates: (isActive?: boolean) => api.get('/api/proposal-templates', { params: { is_active: isActive } }),
  getTemplate: (templateId: number) => api.get(`/api/proposal-templates/${templateId}`),
  createTemplate: (data: any) => api.post('/api/proposal-templates', data),
  updateTemplate: (templateId: number, data: any) => api.put(`/api/proposal-templates/${templateId}`, data),
  deleteTemplate: (templateId: number) => api.delete(`/api/proposal-templates/${templateId}`),
  getTemplateFields: (templateId: number) => api.get(`/api/proposal-templates/${templateId}/fields`),
}

// Proposals API functions
export const proposalsApi = {
  getProposals: (params?: any) => api.get('/api/proposals', { params }),
  getProposal: (proposalId: number) => api.get(`/api/proposals/${proposalId}`),
  createProposal: (data: any) => api.post('/api/proposals', data),
  updateProposal: (proposalId: number, data: any) => api.put(`/api/proposals/${proposalId}`, data),
  deleteProposal: (proposalId: number) => api.delete(`/api/proposals/${proposalId}`),
  exportPdf: (proposalId: number) => api.get(`/api/proposals/${proposalId}/pdf`, { responseType: 'blob' }),
  sendEmail: (proposalId: number, data: any) => api.post(`/api/proposals/${proposalId}/send-email`, data),
  exportHtml: (proposalId: number) => api.get(`/api/proposals/${proposalId}/html`, { responseType: 'text' }),
}

export const itemsApi = {
  getItems: (params?: {
    type?: 'product' | 'service',
    low_stock?: boolean,
    search?: string,
    skip?: number,
    limit?: number
  }) => api.get('/api/items', { params }),
  getItem: (id: number) => api.get(`/api/items/${id}`),
  createItem: (data: any) => api.post('/api/items', data),
  updateItem: (id: number, data: any) => api.put(`/api/items/${id}`, data),
  deleteItem: (id: number) => api.delete(`/api/items/${id}`),
  uploadImage: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/api/items/upload-image', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  },
  adjustStock: (itemId: number, data: { quantity_change: number, transaction_type: string, reason?: string }) =>
    api.post(`/api/items/${itemId}/stock/adjust`, data),
  getStockHistory: (itemId: number, params?: { skip?: number, limit?: number }) =>
    api.get(`/api/items/${itemId}/stock/history`, { params }),
}

// Orders API functions
export const ordersApi = {
  getOrders: (params?: {
    status?: string,
    customer_name?: string,
    date_from?: string,
    date_to?: string
  }) => api.get('/api/orders', { params }),
  getOrder: (orderId: number) => api.get(`/api/orders/${orderId}`),
  createOrder: (data: any) => api.post('/api/orders', data),
  updateOrder: (orderId: number, data: any) => api.put(`/api/orders/${orderId}`, data),
  deleteOrder: (orderId: number) => api.delete(`/api/orders/${orderId}`),
  exportOrderHtml: (orderId: number) => api.get(`/api/orders/${orderId}/html`, { responseType: 'text' }),
}

// Settings API functions
export const settingsApi = {
  getUsage: () => api.get('/api/settings/usage'),
  getProfile: () => api.get('/api/settings/profile'),
  updateProfile: (data: any) => api.put('/api/settings/profile', data),
  getBranding: () => api.get('/api/settings/branding'),
  updateBranding: (data: any) => api.put('/api/settings/branding', data),
  getTeam: () => api.get('/api/settings/team'),
  getBilling: () => api.get('/api/settings/billing'),
  getInvoices: () => api.get('/api/settings/billing/invoices'),
  changePassword: (data: any) => api.put('/api/settings/security/password', data),
  toggle2FA: (data: any) => api.put('/api/settings/security/2fa', data),
  getApiKeys: () => api.get('/api/settings/api-keys'),
  generateApiKey: (data: any) => api.post('/api/settings/api-keys', data),
  revokeApiKey: (keyId: number) => api.delete(`/api/settings/api-keys/${keyId}`),
}

export const integrationsApi = {
  getIntegrations: () => api.get('/api/integrations'),
  getIntegration: (integrationType: string) => api.get(`/api/integrations/${integrationType}`),
  connectIntegration: (integrationType: string, data: any) => api.post(`/api/integrations/${integrationType}/connect`, data),
  updateIntegration: (integrationType: string, data: any) => api.put(`/api/integrations/${integrationType}`, data),
  disconnectIntegration: (integrationType: string) => api.delete(`/api/integrations/${integrationType}`),
  testIntegration: (integrationType: string) => api.get(`/api/integrations/${integrationType}/test`),
  googleCalendarOAuth: () => {
    window.location.href = `${api.defaults.baseURL}/api/integrations/google-calendar/oauth/authorize`
  },
}

export const formsApi = {
  getForms: () => api.get('/api/forms'),
  getForm: (formId: number) => api.get(`/api/forms/${formId}`),
  createForm: (data: any) => api.post('/api/forms', data),
  updateForm: (formId: number, data: any) => api.put(`/api/forms/${formId}`, data),
  deleteForm: (formId: number) => api.delete(`/api/forms/${formId}`),
}

// Custom Fields API functions
export const customFieldsApi = {
  getFields: (moduleTarget?: string) => api.get('/api/custom-fields', { params: { module_target: moduleTarget } }),
  getField: (fieldId: string) => api.get(`/api/custom-fields/${fieldId}`),
  createField: (data: any) => api.post('/api/custom-fields', data),
  updateField: (fieldId: string, data: any) => api.put(`/api/custom-fields/${fieldId}`, data),
  deleteField: (fieldId: string) => api.delete(`/api/custom-fields/${fieldId}`),
}

// Custom Modules API functions
export const customModulesApi = {
  getModules: () => api.get('/api/custom-modules'),
  getModule: (moduleId: string) => api.get(`/api/custom-modules/${moduleId}`),
  createModule: (data: any) => api.post('/api/custom-modules', data),
  updateModule: (moduleId: string, data: any) => api.put(`/api/custom-modules/${moduleId}`, data),
  deleteModule: (moduleId: string) => api.delete(`/api/custom-modules/${moduleId}`),
  getModuleData: (moduleId: string, params?: { skip?: number, limit?: number }) => 
    api.get(`/api/custom-modules/${moduleId}/data`, { params }),
  createModuleData: (moduleId: string, data: any) => 
    api.post(`/api/custom-modules/${moduleId}/data`, data),
  updateModuleData: (moduleId: string, recordId: string, data: any) => 
    api.put(`/api/custom-modules/${moduleId}/data/${recordId}`, data),
  deleteModuleData: (moduleId: string, recordId: string) => 
    api.delete(`/api/custom-modules/${moduleId}/data/${recordId}`),
}

export default api





