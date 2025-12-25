import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useSettings } from '@/hooks/useSettings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { Key, Plus, Copy, Trash2, Loader2, Check } from 'lucide-react'

const webhookSchema = z.object({
  webhookUrl: z.string().url('URL inválida').optional().or(z.literal('')),
})

const apiKeyNameSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
})

type WebhookFormData = z.infer<typeof webhookSchema>
type ApiKeyNameFormData = z.infer<typeof apiKeyNameSchema>

export function ApiKeys() {
  const { toast } = useToast()
  const {
    fetchApiKeys,
    generateApiKey,
    revokeApiKey,
    updateWebhook,
    loading,
  } = useSettings()
  const [apiKeys, setApiKeys] = useState<any[]>([])
  const [webhookUrl, setWebhookUrl] = useState('')
  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = useState(false)
  const [newApiKey, setNewApiKey] = useState<string | null>(null)
  const [copiedKeyId, setCopiedKeyId] = useState<number | null>(null)

  const {
    register: registerWebhook,
    handleSubmit: handleWebhookSubmit,
    formState: { errors: webhookErrors },
    reset: resetWebhook,
  } = useForm<WebhookFormData>({
    resolver: zodResolver(webhookSchema),
  })

  const {
    register: registerApiKey,
    handleSubmit: handleApiKeySubmit,
    formState: { errors: apiKeyErrors, isSubmitting: isGenerating },
    reset: resetApiKey,
  } = useForm<ApiKeyNameFormData>({
    resolver: zodResolver(apiKeyNameSchema),
  })

  useEffect(() => {
    const loadData = async () => {
      try {
        const keys = await fetchApiKeys()
        setApiKeys(keys)
      } catch (error) {
        toast({
          variant: 'destructive',
          title: 'Erro',
          description: 'Não foi possível carregar as chaves de API',
        })
      }
    }
    loadData()
  }, [fetchApiKeys, toast])

  const onGenerateApiKey = async (data: ApiKeyNameFormData) => {
    try {
      const newKey = await generateApiKey(data.name)
      setNewApiKey(newKey.key)
      setApiKeys((prev) => [...prev, newKey])
      toast({
        variant: 'success',
        title: 'Sucesso',
        description: 'Chave de API gerada com sucesso!',
      })
      resetApiKey()
      setIsGenerateDialogOpen(false)
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível gerar a chave de API',
      })
    }
  }

  const onRevokeApiKey = async (keyId: number) => {
    if (!confirm('Tem certeza que deseja revogar esta chave de API?')) {
      return
    }
    try {
      await revokeApiKey(keyId)
      setApiKeys((prev) => prev.filter((k) => k.id !== keyId))
      toast({
        variant: 'success',
        title: 'Sucesso',
        description: 'Chave de API revogada com sucesso',
      })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível revogar a chave de API',
      })
    }
  }

  const onUpdateWebhook = async (data: WebhookFormData) => {
    try {
      await updateWebhook(data.webhookUrl || '')
      setWebhookUrl(data.webhookUrl || '')
      toast({
        variant: 'success',
        title: 'Sucesso',
        description: 'Webhook atualizado com sucesso!',
      })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível atualizar o webhook',
      })
    }
  }

  const maskApiKey = (key: string) => {
    if (key.length <= 8) return key
    return `${key.substring(0, 8)}${'*'.repeat(key.length - 12)}${key.substring(key.length - 4)}`
  }

  const copyToClipboard = async (text: string, keyId: number) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKeyId(keyId)
      toast({
        variant: 'success',
        title: 'Copiado',
        description: 'Chave copiada para a área de transferência',
      })
      setTimeout(() => setCopiedKeyId(null), 2000)
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível copiar a chave',
      })
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR')
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Desenvolvedor & API</h2>
        <p className="text-muted-foreground">
          Gerencie suas chaves de API e webhooks
        </p>
      </div>

      {/* API Keys */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Chaves de API</CardTitle>
              <CardDescription>
                Gerencie suas chaves de API para integrações
              </CardDescription>
            </div>
            <Dialog open={isGenerateDialogOpen} onOpenChange={setIsGenerateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Gerar Nova Chave
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Gerar Nova Chave de API</DialogTitle>
                  <DialogDescription>
                    Dê um nome descritivo para esta chave de API
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleApiKeySubmit(onGenerateApiKey)} className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="name" className="text-sm font-medium">
                      Nome da Chave *
                    </label>
                    <Input
                      id="name"
                      {...registerApiKey('name')}
                      placeholder="Ex: Produção, Desenvolvimento, etc."
                    />
                    {apiKeyErrors.name && (
                      <p className="text-sm text-destructive">
                        {apiKeyErrors.name.message}
                      </p>
                    )}
                  </div>
                  {newApiKey && (
                    <div className="p-4 bg-muted rounded-md space-y-2">
                      <p className="text-sm font-medium">Sua nova chave de API:</p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 p-2 bg-background rounded text-sm font-mono">
                          {newApiKey}
                        </code>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => copyToClipboard(newApiKey, 0)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        ⚠️ Guarde esta chave com segurança. Ela não será exibida novamente.
                      </p>
                    </div>
                  )}
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setIsGenerateDialogOpen(false)
                        setNewApiKey(null)
                        resetApiKey()
                      }}
                    >
                      Fechar
                    </Button>
                    {!newApiKey && (
                      <Button type="submit" disabled={isGenerating}>
                        {isGenerating ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Gerando...
                          </>
                        ) : (
                          'Gerar Chave'
                        )}
                      </Button>
                    )}
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Chave</TableHead>
                  <TableHead>Criada em</TableHead>
                  <TableHead>Último uso</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apiKeys.length > 0 ? (
                  apiKeys.map((key) => (
                    <TableRow key={key.id}>
                      <TableCell className="font-medium">{key.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <code className="text-sm font-mono">
                            {maskApiKey(key.key)}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => copyToClipboard(key.key, key.id)}
                          >
                            {copiedKeyId === key.id ? (
                              <Check className="h-4 w-4 text-green-600" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>{formatDate(key.createdAt)}</TableCell>
                      <TableCell>
                        {key.lastUsed ? formatDate(key.lastUsed) : 'Nunca'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onRevokeApiKey(key.id)}
                          disabled={loading.revokeApiKey}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      Nenhuma chave de API encontrada
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Webhooks */}
      <Card>
        <CardHeader>
          <CardTitle>Webhooks</CardTitle>
          <CardDescription>
            Configure uma URL para receber eventos do sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleWebhookSubmit(onUpdateWebhook)} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="webhookUrl" className="text-sm font-medium">
                URL do Webhook
              </label>
              <Input
                id="webhookUrl"
                type="url"
                {...registerWebhook('webhookUrl')}
                placeholder="https://exemplo.com/webhook"
              />
              {webhookErrors.webhookUrl && (
                <p className="text-sm text-destructive">
                  {webhookErrors.webhookUrl.message}
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                Eventos do sistema serão enviados para esta URL
              </p>
            </div>
            <Button
              type="submit"
              disabled={loading.updateWebhook}
            >
              {loading.updateWebhook ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar Webhook'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

