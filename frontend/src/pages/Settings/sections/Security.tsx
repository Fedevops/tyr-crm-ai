import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useSettings } from '@/hooks/useSettings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, LogOut } from 'lucide-react'

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Senha atual é obrigatória'),
    newPassword: z.string().min(8, 'Nova senha deve ter pelo menos 8 caracteres'),
    confirmPassword: z.string().min(1, 'Confirmação de senha é obrigatória'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'As senhas não coincidem',
    path: ['confirmPassword'],
  })

type PasswordFormData = z.infer<typeof passwordSchema>

export function Security() {
  const { toast } = useToast()
  const {
    updatePassword,
    toggle2FA,
    getActiveSessions,
    revokeAllSessions,
    loading,
  } = useSettings()
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)
  const [sessions, setSessions] = useState<any[]>([])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
  })

  useEffect(() => {
    const loadSessions = async () => {
      try {
        const sessionsData = await getActiveSessions()
        setSessions(sessionsData)
      } catch (error) {
        // Silent fail for sessions
      }
    }
    loadSessions()
  }, [getActiveSessions])

  const onPasswordChange = async (data: PasswordFormData) => {
    try {
      await updatePassword(data.currentPassword, data.newPassword)
      toast({
        variant: 'success',
        title: 'Sucesso',
        description: 'Senha alterada com sucesso!',
      })
      reset()
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível alterar a senha',
      })
    }
  }

  const onToggle2FA = async (enabled: boolean) => {
    try {
      await toggle2FA(enabled)
      setTwoFactorEnabled(enabled)
      toast({
        variant: 'success',
        title: 'Sucesso',
        description: `Autenticação de dois fatores ${enabled ? 'ativada' : 'desativada'}`,
      })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível alterar a configuração de 2FA',
      })
    }
  }

  const onRevokeAllSessions = async () => {
    if (!confirm('Tem certeza que deseja desconectar todos os dispositivos?')) {
      return
    }
    try {
      await revokeAllSessions()
      setSessions([])
      toast({
        variant: 'success',
        title: 'Sucesso',
        description: 'Todas as sessões foram desconectadas',
      })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível desconectar as sessões',
      })
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('pt-BR')
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Segurança</h2>
        <p className="text-muted-foreground">
          Gerencie as configurações de segurança da sua conta
        </p>
      </div>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle>Alterar Senha</CardTitle>
          <CardDescription>
            Atualize sua senha para manter sua conta segura
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onPasswordChange)} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="currentPassword" className="text-sm font-medium">
                Senha Atual *
              </label>
              <Input
                id="currentPassword"
                type="password"
                {...register('currentPassword')}
                placeholder="Digite sua senha atual"
              />
              {errors.currentPassword && (
                <p className="text-sm text-destructive">
                  {errors.currentPassword.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="newPassword" className="text-sm font-medium">
                Nova Senha *
              </label>
              <Input
                id="newPassword"
                type="password"
                {...register('newPassword')}
                placeholder="Digite sua nova senha"
              />
              {errors.newPassword && (
                <p className="text-sm text-destructive">
                  {errors.newPassword.message}
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                Mínimo de 8 caracteres
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="text-sm font-medium">
                Confirmar Nova Senha *
              </label>
              <Input
                id="confirmPassword"
                type="password"
                {...register('confirmPassword')}
                placeholder="Confirme sua nova senha"
              />
              {errors.confirmPassword && (
                <p className="text-sm text-destructive">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              disabled={isSubmitting || loading.updatePassword}
            >
              {isSubmitting || loading.updatePassword ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Alterar Senha'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Two Factor Authentication */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Autenticação de Dois Fatores (2FA)</CardTitle>
              <CardDescription>
                Adicione uma camada extra de segurança à sua conta
              </CardDescription>
            </div>
            <Switch
              checked={twoFactorEnabled}
              onCheckedChange={onToggle2FA}
              disabled={loading.toggle2FA}
            />
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Quando ativado, você precisará fornecer um código de verificação
            adicional além da sua senha ao fazer login.
          </p>
        </CardContent>
      </Card>

      {/* Active Sessions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Sessões Ativas</CardTitle>
              <CardDescription>
                Dispositivos conectados à sua conta
              </CardDescription>
            </div>
            {sessions.length > 0 && (
              <Button
                variant="outline"
                onClick={onRevokeAllSessions}
                disabled={loading.revokeSessions}
              >
                <LogOut className="h-4 w-4 mr-2" />
                Desconectar Todos
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dispositivo</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Localização</TableHead>
                  <TableHead>Última Atividade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.length > 0 ? (
                  sessions.map((session) => (
                    <TableRow key={session.id}>
                      <TableCell className="font-medium">
                        {session.device}
                      </TableCell>
                      <TableCell>{session.ip}</TableCell>
                      <TableCell>{session.location}</TableCell>
                      <TableCell>{formatDate(session.lastActivity)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      Nenhuma sessão ativa
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}



