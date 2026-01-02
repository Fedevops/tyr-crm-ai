import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { financeApi } from '@/lib/api'
import { useToast } from '@/components/ui/use-toast'

const accountSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  description: z.string().optional(),
  is_active: z.boolean().default(true),
})

type AccountFormData = z.infer<typeof accountSchema>

interface AccountModalProps {
  open: boolean
  onClose: () => void
  account?: {
    id: number
    name: string
    description?: string
    is_active: boolean
  }
  onSaved: () => void
}

export function AccountModal({ open, onClose, account, onSaved }: AccountModalProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<AccountFormData>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      name: '',
      description: '',
      is_active: true,
    }
  })

  const isActive = watch('is_active')

  useEffect(() => {
    if (account) {
      reset({
        name: account.name,
        description: account.description || '',
        is_active: account.is_active,
      })
    } else {
      reset({
        name: '',
        description: '',
        is_active: true,
      })
    }
  }, [account, reset, open])

  const onSubmit = async (data: AccountFormData) => {
    try {
      setLoading(true)
      
      if (account) {
        await financeApi.updateAccount(account.id, data)
        toast({
          title: 'Sucesso',
          description: 'Conta atualizada com sucesso'
        })
      } else {
        await financeApi.createAccount(data)
        toast({
          title: 'Sucesso',
          description: 'Conta criada com sucesso'
        })
      }

      onSaved()
      onClose()
    } catch (error: any) {
      console.error('Erro ao salvar conta:', error)
      toast({
        title: 'Erro',
        description: error.response?.data?.detail || 'Erro ao salvar conta',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {account ? 'Editar Conta Financeira' : 'Nova Conta Financeira'}
          </DialogTitle>
          <DialogDescription>
            {account ? 'Atualize os dados da conta' : 'Crie uma nova conta financeira para organizar suas transações'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome da Conta *</Label>
            <Input
              id="name"
              {...register('name')}
              placeholder="Ex: Conta Principal, Caixa Pequeno, etc."
            />
            {errors.name && (
              <p className="text-sm text-red-500">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição (opcional)</Label>
            <Textarea
              id="description"
              {...register('description')}
              placeholder="Descrição da conta financeira"
              rows={3}
            />
            {errors.description && (
              <p className="text-sm text-red-500">{errors.description.message}</p>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="is_active"
              checked={isActive}
              onCheckedChange={(checked) => setValue('is_active', checked)}
            />
            <Label htmlFor="is_active" className="cursor-pointer">
              Conta ativa
            </Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvando...' : account ? 'Atualizar' : 'Criar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}



