import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { 
  MessageSquare, 
  Calendar, 
  Mail, 
  Building2, 
  Cloud,
  CheckCircle2,
  XCircle,
  Settings,
  Loader2
} from 'lucide-react'
import { integrationsApi } from '@/lib/api'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'

interface Integration {
  id: number
  tenant_id: number
  integration_type: string
  is_active: boolean
  config?: any
  last_sync_at?: string
  created_at: string
  updated_at: string
}

interface IntegrationConfig {
  whatsapp_twilio: {
    name: string
    icon: typeof MessageSquare
    description: string
    fields: Array<{ name: string; label: string; type: string; required: boolean }>
  }
  google_calendar: {
    name: string
    icon: typeof Calendar
    description: string
    fields: Array<{ name: string; label: string; type: string; required: boolean }>
  }
  email_smtp: {
    name: string
    icon: typeof Mail
    description: string
    fields: Array<{ name: string; label: string; type: string; required: boolean }>
  }
  email_imap: {
    name: string
    icon: typeof Mail
    description: string
    fields: Array<{ name: string; label: string; type: string; required: boolean }>
  }
  totvs: {
    name: string
    icon: typeof Building2
    description: string
    fields: Array<{ name: string; label: string; type: string; required: boolean }>
  }
  salesforce: {
    name: string
    icon: typeof Cloud
    description: string
    fields: Array<{ name: string; label: string; type: string; required: boolean }>
  }
}

const INTEGRATION_CONFIGS: IntegrationConfig = {
  whatsapp_twilio: {
    name: 'WhatsApp (Twilio)',
    icon: MessageSquare,
    description: 'Envie mensagens via WhatsApp usando a API do Twilio',
    fields: [
      { name: 'account_sid', label: 'Account SID', type: 'text', required: true },
      { name: 'auth_token', label: 'Auth Token', type: 'password', required: true },
      { name: 'phone_number', label: 'Número do WhatsApp', type: 'text', required: true },
    ]
  },
  google_calendar: {
    name: 'Google Agenda',
    icon: Calendar,
    description: 'Sincronize eventos e compromissos com o Google Calendar',
    fields: []
  },
  email_smtp: {
    name: 'E-mail (SMTP)',
    icon: Mail,
    description: 'Envie e-mails através de servidor SMTP',
    fields: [
      { name: 'smtp_host', label: 'Servidor SMTP', type: 'text', required: true },
      { name: 'smtp_port', label: 'Porta', type: 'number', required: true },
      { name: 'smtp_user', label: 'Usuário', type: 'text', required: true },
      { name: 'smtp_password', label: 'Senha', type: 'password', required: true },
      { name: 'smtp_use_tls', label: 'Usar TLS', type: 'checkbox', required: false },
    ]
  },
  email_imap: {
    name: 'E-mail (IMAP)',
    icon: Mail,
    description: 'Receba e-mails através de servidor IMAP',
    fields: [
      { name: 'imap_host', label: 'Servidor IMAP', type: 'text', required: true },
      { name: 'imap_port', label: 'Porta', type: 'number', required: true },
      { name: 'imap_user', label: 'Usuário', type: 'text', required: true },
      { name: 'imap_password', label: 'Senha', type: 'password', required: true },
      { name: 'imap_use_ssl', label: 'Usar SSL', type: 'checkbox', required: false },
    ]
  },
  totvs: {
    name: 'TOTVS',
    icon: Building2,
    description: 'Integre com sistemas TOTVS para sincronização de pedidos',
    fields: [
      { name: 'api_url', label: 'URL da API', type: 'text', required: true },
      { name: 'api_key', label: 'Chave da API', type: 'password', required: true },
    ]
  },
  salesforce: {
    name: 'Salesforce',
    icon: Cloud,
    description: 'Integre com Salesforce para sincronização de oportunidades',
    fields: [
      { name: 'instance_url', label: 'URL da Instância', type: 'text', required: true },
      { name: 'access_token', label: 'Access Token', type: 'password', required: true },
    ]
  }
}

const INTEGRATION_TYPES = Object.keys(INTEGRATION_CONFIGS) as Array<keyof IntegrationConfig>

export function Integrations() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIntegration, setSelectedIntegration] = useState<keyof IntegrationConfig | null>(null)
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [configData, setConfigData] = useState<Record<string, string>>({})
  const [testing, setTesting] = useState(false)

  const fetchIntegrations = useCallback(async () => {
    setLoading(true)
    try {
      const response = await integrationsApi.getIntegrations()
      setIntegrations(response.data)
    } catch (error) {
      console.error('Erro ao buscar integrações:', error)
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível carregar as integrações.',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchIntegrations()
  }, [fetchIntegrations])

  const getIntegrationStatus = (type: string): Integration | null => {
    return integrations.find(i => i.integration_type === type) || null
  }

  const handleConfigure = (type: keyof IntegrationConfig) => {
    setSelectedIntegration(type)
    const existing = getIntegrationStatus(type)
    if (existing) {
      // Não carregar credenciais por segurança
      setConfigData({})
    } else {
      setConfigData({})
    }
    setShowConfigModal(true)
  }

  const handleConnect = async () => {
    if (!selectedIntegration) return

    // Google Calendar usa OAuth2
    if (selectedIntegration === 'google_calendar') {
      try {
        integrationsApi.googleCalendarOAuth()
      } catch (error) {
        toast({
          variant: 'destructive',
          title: 'Erro',
          description: 'Não foi possível iniciar autenticação do Google.',
        })
      }
      return
    }

    try {
      const config = INTEGRATION_CONFIGS[selectedIntegration]
      const credentials: Record<string, any> = {}
      
      for (const field of config.fields) {
        if (field.required && !configData[field.name]) {
          toast({
            variant: 'destructive',
            title: 'Erro',
            description: `Campo ${field.label} é obrigatório`,
          })
          return
        }
        if (configData[field.name]) {
          credentials[field.name] = configData[field.name]
        }
      }

      await integrationsApi.connectIntegration(selectedIntegration, {
        credentials,
        is_active: true
      })

      toast({
        title: 'Sucesso',
        description: 'Integração configurada com sucesso!',
      })
      setShowConfigModal(false)
      fetchIntegrations()
    } catch (error: any) {
      console.error('Erro ao conectar integração:', error)
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error.response?.data?.detail || 'Não foi possível conectar a integração.',
      })
    }
  }

  const handleDisconnect = async (type: string) => {
    try {
      await integrationsApi.disconnectIntegration(type)
      toast({
        title: 'Sucesso',
        description: 'Integração desconectada com sucesso!',
      })
      fetchIntegrations()
    } catch (error: any) {
      console.error('Erro ao desconectar integração:', error)
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error.response?.data?.detail || 'Não foi possível desconectar a integração.',
      })
    }
  }

  const handleTest = async (type: string) => {
    setTesting(true)
    try {
      await integrationsApi.testIntegration(type)
      toast({
        title: 'Sucesso',
        description: 'Conexão testada com sucesso!',
      })
    } catch (error: any) {
      console.error('Erro ao testar integração:', error)
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error.response?.data?.detail || 'Falha ao testar conexão.',
      })
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
        <div className="text-muted-foreground">Carregando integrações...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Central de Integrações</h2>
        <p className="text-muted-foreground mt-1">
          Conecte suas ferramentas favoritas para automatizar seu fluxo de trabalho
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {INTEGRATION_TYPES.map((type) => {
          const config = INTEGRATION_CONFIGS[type]
          const Icon = config.icon
          const integration = getIntegrationStatus(type)
          const isActive = integration?.is_active || false

          return (
            <Card key={type} className={cn("relative", isActive && "border-primary")}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-2 rounded-lg",
                      isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    )}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{config.name}</CardTitle>
                      <CardDescription className="text-xs mt-1">
                        {config.description}
                      </CardDescription>
                    </div>
                  </div>
                  {isActive && (
                    <Badge variant="default" className="ml-2">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Conectado
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Button
                    variant={isActive ? "outline" : "default"}
                    size="sm"
                    onClick={() => handleConfigure(type)}
                    className="flex-1"
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    {isActive ? 'Configurar' : 'Conectar'}
                  </Button>
                  {isActive && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTest(type)}
                        disabled={testing}
                      >
                        {testing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Testar'
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDisconnect(type)}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Modal de Configuração */}
      <Dialog open={showConfigModal} onOpenChange={setShowConfigModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedIntegration && INTEGRATION_CONFIGS[selectedIntegration].name}
            </DialogTitle>
            <DialogDescription>
              {selectedIntegration && INTEGRATION_CONFIGS[selectedIntegration].description}
            </DialogDescription>
          </DialogHeader>
          {selectedIntegration && selectedIntegration !== 'google_calendar' && (
            <div className="space-y-4">
              {INTEGRATION_CONFIGS[selectedIntegration].fields.map((field) => (
                <div key={field.name}>
                  <Label htmlFor={field.name}>
                    {field.label}
                    {field.required && <span className="text-destructive ml-1">*</span>}
                  </Label>
                  {field.type === 'checkbox' ? (
                    <div className="mt-2">
                      <input
                        type="checkbox"
                        id={field.name}
                        checked={configData[field.name] === 'true'}
                        onChange={(e) =>
                          setConfigData({ ...configData, [field.name]: e.target.checked ? 'true' : 'false' })
                        }
                        className="mr-2"
                      />
                      <label htmlFor={field.name} className="text-sm text-muted-foreground">
                        {field.label}
                      </label>
                    </div>
                  ) : (
                    <Input
                      id={field.name}
                      type={field.type}
                      value={configData[field.name] || ''}
                      onChange={(e) =>
                        setConfigData({ ...configData, [field.name]: e.target.value })
                      }
                      className="mt-1"
                      required={field.required}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
          {selectedIntegration === 'google_calendar' && (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-4">
                Você será redirecionado para autenticar com sua conta Google
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfigModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConnect}>
              {selectedIntegration === 'google_calendar' ? 'Autenticar' : 'Conectar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}




