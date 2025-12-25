import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useSettings, AccessLevel, TeamMember } from '@/hooks/useSettings'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { UserPlus, Trash2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const inviteSchema = z.object({
  email: z.string().email('E-mail inválido'),
  accessLevel: z.enum(['admin', 'manager', 'user']),
})

type InviteFormData = z.infer<typeof inviteSchema>

export function Team() {
  const { toast } = useToast()
  const { fetchTeam, inviteMember, removeMember, loading } = useSettings()
  const [team, setTeam] = useState<TeamMember[]>([])
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setValue,
    watch,
  } = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      accessLevel: 'user',
    },
  })

  const accessLevel = watch('accessLevel')

  useEffect(() => {
    const loadTeam = async () => {
      try {
        const teamData = await fetchTeam()
        setTeam(teamData)
      } catch (error) {
        toast({
          variant: 'destructive',
          title: 'Erro',
          description: 'Não foi possível carregar a equipe',
        })
      }
    }
    loadTeam()
  }, [fetchTeam, toast])

  const onInvite = async (data: InviteFormData) => {
    try {
      const newMember = await inviteMember(data.email, data.accessLevel)
      setTeam((prev: any) => [...prev, newMember])
      toast({
        variant: 'success',
        title: 'Sucesso',
        description: 'Convite enviado com sucesso!',
      })
      reset()
      setIsDialogOpen(false)
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível enviar o convite',
      })
    }
  }

  const onRemove = async (memberId: number) => {
    if (!confirm('Tem certeza que deseja remover este membro?')) {
      return
    }
    try {
      await removeMember(memberId)
      setTeam((prev: any) => prev.filter((m: any) => m.id !== memberId))
      toast({
        variant: 'success',
        title: 'Sucesso',
        description: 'Membro removido com sucesso!',
      })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível remover o membro',
      })
    }
  }

  const getAccessLevelLabel = (level: AccessLevel) => {
    const labels = {
      admin: 'Admin',
      manager: 'Manager',
      user: 'User',
    }
    return labels[level]
  }

  const getStatusBadge = (status: string) => {
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
          status === 'active'
            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
            : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
        )}
      >
        {status === 'active' ? 'Ativo' : 'Pendente'}
      </span>
    )
  }

  const getAccessLevelBadge = (level: AccessLevel) => {
    const colors = {
      admin: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      manager: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      user: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
    }
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
          colors[level]
        )}
      >
        {getAccessLevelLabel(level)}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Equipe & Membros</h2>
          <p className="text-muted-foreground">
            Gerencie os membros da sua equipe
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="h-4 w-4 mr-2" />
              Convidar Novo Membro
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Convidar Novo Membro</DialogTitle>
              <DialogDescription>
                Envie um convite por e-mail para adicionar um novo membro à
                equipe
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit(onInvite)} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
                  E-mail *
                </label>
                <Input
                  id="email"
                  type="email"
                  {...register('email')}
                  placeholder="membro@exemplo.com"
                />
                {errors.email && (
                  <p className="text-sm text-destructive">
                    {errors.email.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <label htmlFor="accessLevel" className="text-sm font-medium">
                  Nível de Acesso *
                </label>
                <Select
                  value={accessLevel}
                  onValueChange={(value) =>
                    setValue('accessLevel', value as AccessLevel)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o nível de acesso" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="user">User</SelectItem>
                  </SelectContent>
                </Select>
                {errors.accessLevel && (
                  <p className="text-sm text-destructive">
                    {errors.accessLevel.message}
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    'Enviar Convite'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Nível de Acesso</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {team && team.length > 0 ? (
              team.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">{member.name}</TableCell>
                  <TableCell>{member.email}</TableCell>
                  <TableCell>{getAccessLevelBadge(member.accessLevel)}</TableCell>
                  <TableCell>{getStatusBadge(member.status)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onRemove(member.id)}
                      disabled={loading.removeMember}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Nenhum membro encontrado
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

