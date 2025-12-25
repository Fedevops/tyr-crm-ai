import { useState, useCallback } from 'react'
import api from '@/lib/api'

// Types
export interface ProfileData {
  fullName: string
  email: string
  position: string
  bio: string
  avatar?: string
}

export interface BrandingData {
  organizationName: string
  logo?: string
  primaryColor: string
}

export type AccessLevel = 'admin' | 'manager' | 'user'
export type MemberStatus = 'active' | 'pending'

export interface TeamMember {
  id: number
  name: string
  email: string
  accessLevel: AccessLevel
  status: MemberStatus
  invitedAt: string
}

export interface BillingPlan {
  name: string
  price: number
  nextRenewal: string
}

export interface Invoice {
  id: number
  date: string
  amount: number
  pdfUrl: string
}

export interface ActiveSession {
  id: number
  device: string
  ip: string
  lastActivity: string
  location: string
}

export interface ApiKey {
  id: number
  name: string
  key: string
  createdAt: string
  lastUsed?: string
}

export interface SettingsState {
  profile: ProfileData | null
  branding: BrandingData | null
  team: TeamMember[]
  billing: BillingPlan | null
  invoices: Invoice[]
  activeSessions: ActiveSession[]
  apiKeys: ApiKey[]
  webhookUrl: string
  twoFactorEnabled: boolean
}

export function useSettings() {
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  // Helper to set loading state
  const setLoadingState = useCallback((key: string, value: boolean) => {
    setLoading((prev) => ({ ...prev, [key]: value }))
  }, [])

  // Profile functions
  const fetchProfile = useCallback(async (): Promise<ProfileData> => {
    setLoadingState('profile', true)
    setError(null)
    try {
      const response = await api.get('/api/settings/profile')
      return {
        fullName: response.data.full_name,
        email: response.data.email,
        position: response.data.position || '',
        bio: response.data.bio || '',
        avatar: response.data.avatar,
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao carregar perfil')
      throw err
    } finally {
      setLoadingState('profile', false)
    }
  }, [setLoadingState])

  const updateProfile = useCallback(
    async (data: Partial<ProfileData>): Promise<ProfileData> => {
      setLoadingState('updateProfile', true)
      setError(null)
      try {
        const response = await api.put('/api/settings/profile', {
          full_name: data.fullName,
          position: data.position,
          bio: data.bio,
          avatar: data.avatar,
        })
        return {
          fullName: response.data.full_name,
          email: response.data.email,
          position: response.data.position || '',
          bio: response.data.bio || '',
          avatar: response.data.avatar,
        }
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Erro ao atualizar perfil')
        throw err
      } finally {
        setLoadingState('updateProfile', false)
      }
    },
    [setLoadingState]
  )

  // Branding functions
  const fetchBranding = useCallback(async (): Promise<BrandingData> => {
    setLoadingState('branding', true)
    setError(null)
    try {
      const response = await api.get('/api/settings/branding')
      return {
        organizationName: response.data.organization_name,
        logo: response.data.logo,
        primaryColor: response.data.primary_color,
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao carregar branding')
      throw err
    } finally {
      setLoadingState('branding', false)
    }
  }, [setLoadingState])

  const updateBranding = useCallback(
    async (data: Partial<BrandingData>): Promise<BrandingData> => {
      setLoadingState('updateBranding', true)
      setError(null)
      try {
        const response = await api.put('/api/settings/branding', {
          organization_name: data.organizationName,
          logo: data.logo,
          primary_color: data.primaryColor,
        })
        const updated = {
          organizationName: response.data.organization_name,
          logo: response.data.logo,
          primaryColor: response.data.primary_color,
        }
        // Update CSS variable if primary color changed
        if (data.primaryColor) {
          document.documentElement.style.setProperty(
            '--primary-color',
            data.primaryColor
          )
        }
        return updated
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Erro ao atualizar branding')
        throw err
      } finally {
        setLoadingState('updateBranding', false)
      }
    },
    [setLoadingState]
  )

  // Team functions
  const fetchTeam = useCallback(async (): Promise<TeamMember[]> => {
    setLoadingState('team', true)
    setError(null)
    try {
      const response = await api.get('/api/settings/team')
      return response.data.map((member: any) => ({
        id: member.id,
        name: member.name,
        email: member.email,
        accessLevel: member.access_level as AccessLevel,
        status: member.status as MemberStatus,
        invitedAt: member.invited_at,
      }))
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao carregar equipe')
      throw err
    } finally {
      setLoadingState('team', false)
    }
  }, [setLoadingState])

  const inviteMember = useCallback(
    async (email: string, accessLevel: AccessLevel): Promise<TeamMember> => {
      setLoadingState('inviteMember', true)
      setError(null)
      try {
        const response = await api.post('/api/settings/team/invite', {
          email,
          access_level: accessLevel,
        })
        return {
          id: response.data.id,
          name: response.data.name,
          email: response.data.email,
          accessLevel: response.data.access_level as AccessLevel,
          status: response.data.status as MemberStatus,
          invitedAt: response.data.invited_at,
        }
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Erro ao convidar membro')
        throw err
      } finally {
        setLoadingState('inviteMember', false)
      }
    },
    [setLoadingState]
  )

  const removeMember = useCallback(
    async (memberId: number): Promise<void> => {
      setLoadingState('removeMember', true)
      setError(null)
      try {
        await api.delete(`/api/settings/team/${memberId}`)
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Erro ao remover membro')
        throw err
      } finally {
        setLoadingState('removeMember', false)
      }
    },
    [setLoadingState]
  )

  // Billing functions
  const fetchBilling = useCallback(async (): Promise<BillingPlan> => {
    setLoadingState('billing', true)
    setError(null)
    try {
      const response = await api.get('/api/settings/billing')
      return {
        name: response.data.name,
        price: response.data.price,
        nextRenewal: response.data.next_renewal,
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao carregar faturamento')
      throw err
    } finally {
      setLoadingState('billing', false)
    }
  }, [setLoadingState])

  const fetchInvoices = useCallback(async (): Promise<Invoice[]> => {
    setLoadingState('invoices', true)
    setError(null)
    try {
      const response = await api.get('/api/settings/billing/invoices')
      return response.data.map((invoice: any) => ({
        id: invoice.id,
        date: invoice.date,
        amount: invoice.amount,
        pdfUrl: invoice.pdf_url,
      }))
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao carregar faturas')
      throw err
    } finally {
      setLoadingState('invoices', false)
    }
  }, [setLoadingState])

  // Security functions
  const updatePassword = useCallback(
    async (
      currentPassword: string,
      newPassword: string
    ): Promise<void> => {
      setLoadingState('updatePassword', true)
      setError(null)
      try {
        await api.put('/api/settings/security/password', {
          current_password: currentPassword,
          new_password: newPassword,
        })
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Erro ao atualizar senha')
        throw err
      } finally {
        setLoadingState('updatePassword', false)
      }
    },
    [setLoadingState]
  )

  const toggle2FA = useCallback(async (enabled: boolean): Promise<void> => {
    setLoadingState('toggle2FA', true)
    setError(null)
    try {
      await api.put('/api/settings/security/2fa', {
        enabled,
      })
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao alterar 2FA')
      throw err
    } finally {
      setLoadingState('toggle2FA', false)
    }
  }, [setLoadingState])

  const getActiveSessions = useCallback(async (): Promise<ActiveSession[]> => {
    setLoadingState('sessions', true)
    setError(null)
    try {
      const response = await api.get('/api/settings/security/sessions')
      return response.data.map((session: any) => ({
        id: session.id,
        device: session.device,
        ip: session.ip,
        lastActivity: session.last_activity,
        location: session.location,
      }))
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao carregar sessões')
      throw err
    } finally {
      setLoadingState('sessions', false)
    }
  }, [setLoadingState])

  const revokeAllSessions = useCallback(async (): Promise<void> => {
    setLoadingState('revokeSessions', true)
    setError(null)
    try {
      await api.post('/api/settings/security/sessions/revoke-all')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao revogar sessões')
      throw err
    } finally {
      setLoadingState('revokeSessions', false)
    }
  }, [setLoadingState])

  // API Keys functions
  const fetchApiKeys = useCallback(async (): Promise<ApiKey[]> => {
    setLoadingState('apiKeys', true)
    setError(null)
    try {
      const response = await api.get('/api/settings/api-keys')
      return response.data.map((key: any) => ({
        id: key.id,
        name: key.name,
        key: key.key,
        createdAt: key.created_at,
        lastUsed: key.last_used,
      }))
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao carregar chaves de API')
      throw err
    } finally {
      setLoadingState('apiKeys', false)
    }
  }, [setLoadingState])

  const generateApiKey = useCallback(
    async (name: string): Promise<ApiKey> => {
      setLoadingState('generateApiKey', true)
      setError(null)
      try {
        const response = await api.post('/api/settings/api-keys', {
          name,
        })
        return {
          id: response.data.id,
          name: response.data.name,
          key: response.data.key,
          createdAt: response.data.created_at,
          lastUsed: response.data.last_used,
        }
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Erro ao gerar chave de API')
        throw err
      } finally {
        setLoadingState('generateApiKey', false)
      }
    },
    [setLoadingState]
  )

  const revokeApiKey = useCallback(
    async (keyId: number): Promise<void> => {
      setLoadingState('revokeApiKey', true)
      setError(null)
      try {
        await api.delete(`/api/settings/api-keys/${keyId}`)
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Erro ao revogar chave de API')
        throw err
      } finally {
        setLoadingState('revokeApiKey', false)
      }
    },
    [setLoadingState]
  )

  const updateWebhook = useCallback(
    async (url: string): Promise<void> => {
      setLoadingState('updateWebhook', true)
      setError(null)
      try {
        await api.put('/api/settings/webhook', {
          url,
        })
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Erro ao atualizar webhook')
        throw err
      } finally {
        setLoadingState('updateWebhook', false)
      }
    },
    [setLoadingState]
  )

  return {
    loading,
    error,
    // Profile
    fetchProfile,
    updateProfile,
    // Branding
    fetchBranding,
    updateBranding,
    // Team
    fetchTeam,
    inviteMember,
    removeMember,
    // Billing
    fetchBilling,
    fetchInvoices,
    // Security
    updatePassword,
    toggle2FA,
    getActiveSessions,
    revokeAllSessions,
    // API Keys
    fetchApiKeys,
    generateApiKey,
    revokeApiKey,
    updateWebhook,
  }
}

