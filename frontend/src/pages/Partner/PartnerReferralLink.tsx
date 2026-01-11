import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TyrLoadingSpinner } from '@/components/TyrLoadingSpinner'
import { Link2, Copy, Check, Plus, Mail } from 'lucide-react'
import { partnerPortalApi } from '@/lib/api'
import { useToast } from '@/components/ui/use-toast'

interface ReferralLinkData {
  referral_link: string
  partner_id: number
  instructions: string
}

export function PartnerReferralLink() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [linkData, setLinkData] = useState<ReferralLinkData | null>(null)
  const [copied, setCopied] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    tenant_name: '',
  })

  useEffect(() => {
    loadReferralLink()
  }, [])

  const loadReferralLink = async () => {
    try {
      setLoading(true)
      const response = await partnerPortalApi.getReferralLink()
      setLinkData(response.data)
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err.response?.data?.detail || 'Erro ao carregar link de indicação',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCopyLink = () => {
    if (linkData?.referral_link) {
      navigator.clipboard.writeText(linkData.referral_link)
      setCopied(true)
      toast({
        title: 'Link copiado!',
        description: 'Link de indicação copiado para a área de transferência',
      })
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleRegisterCustomer = async () => {
    try {
      await partnerPortalApi.registerCustomer(formData)
      toast({
        title: 'Sucesso',
        description: 'Cliente registrado com sucesso',
      })
      setIsDialogOpen(false)
      setFormData({
        email: '',
        password: '',
        full_name: '',
        tenant_name: '',
      })
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err.response?.data?.detail || 'Erro ao registrar cliente',
        variant: 'destructive',
      })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <TyrLoadingSpinner />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Link de Indicação / Venda</h1>
        <p className="text-gray-600 mt-2">Compartilhe seu link ou cadastre clientes diretamente</p>
      </div>

      {/* Link de Indicação */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Seu Link de Indicação
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="referral-link">Link para compartilhar</Label>
            <div className="flex gap-2 mt-2">
              <Input
                id="referral-link"
                value={linkData?.referral_link || ''}
                readOnly
                className="font-mono text-sm"
              />
              <Button onClick={handleCopyLink} variant="outline">
                {copied ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copiar
                  </>
                )}
              </Button>
            </div>
          </div>
          <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg">
            <p className="text-sm text-blue-900 dark:text-blue-100">
              <strong>Como usar:</strong> {linkData?.instructions}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Cadastro Direto */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Cadastrar Cliente Diretamente
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 mb-4">
            Cadastre um novo cliente diretamente associado ao seu parceiro
          </p>
          <Button onClick={() => setIsDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Cliente
          </Button>
        </CardContent>
      </Card>

      {/* Dialog de Cadastro */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Cadastrar Novo Cliente</DialogTitle>
            <DialogDescription>
              Preencha os dados do cliente. Ele será automaticamente associado ao seu parceiro.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="col-span-2">
              <Label htmlFor="full_name">Nome Completo *</Label>
              <Input
                id="full_name"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="tenant_name">Nome da Empresa *</Label>
              <Input
                id="tenant_name"
                value={formData.tenant_name}
                onChange={(e) => setFormData({ ...formData, tenant_name: e.target.value })}
                required
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="password">Senha Temporária *</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                placeholder="O cliente poderá alterar após o primeiro login"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleRegisterCustomer}>Cadastrar Cliente</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

