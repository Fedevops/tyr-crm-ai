import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useSettings } from '@/hooks/useSettings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'
import { Upload, Loader2 } from 'lucide-react'

const profileSchema = z.object({
  fullName: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  email: z.string().email('E-mail inválido'),
  position: z.string().optional(),
  bio: z.string().optional(),
})

type ProfileFormData = z.infer<typeof profileSchema>

export function Profile() {
  const { toast } = useToast()
  const { fetchProfile, updateProfile, loading } = useSettings()
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    watch,
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
  })

  const fullName = watch('fullName')

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const profile = await fetchProfile()
        reset({
          fullName: profile.fullName,
          email: profile.email,
          position: profile.position || '',
          bio: profile.bio || '',
        })
        if (profile.avatar) {
          setAvatarPreview(profile.avatar)
        }
      } catch (error) {
        toast({
          variant: 'destructive',
          title: 'Erro',
          description: 'Não foi possível carregar o perfil',
        })
      }
    }
    loadProfile()
  }, [fetchProfile, reset, toast])

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setAvatarFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const onSubmit = async (data: ProfileFormData) => {
    try {
      await updateProfile({
        ...data,
        avatar: avatarPreview || undefined,
      })
      toast({
        variant: 'success',
        title: 'Sucesso',
        description: 'Perfil atualizado com sucesso!',
      })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível atualizar o perfil',
      })
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Perfil do Usuário</h2>
        <p className="text-muted-foreground">
          Gerencie suas informações pessoais
        </p>
      </div>

      {/* Avatar Upload */}
      <div className="flex items-center gap-6">
        <div className="relative">
          <div className="h-24 w-24 rounded-full bg-muted flex items-center justify-center overflow-hidden">
            {avatarPreview ? (
              <img
                src={avatarPreview}
                alt="Avatar"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full bg-primary/20 flex items-center justify-center">
                <span className="text-2xl font-semibold text-primary">
                  {fullName?.[0]?.toUpperCase() || 'U'}
                </span>
              </div>
            )}
          </div>
        </div>
        <div>
          <label htmlFor="avatar-upload">
            <Button variant="outline" type="button" asChild>
              <span className="cursor-pointer">
                <Upload className="h-4 w-4 mr-2" />
                Alterar Foto
              </span>
            </Button>
          </label>
          <input
            id="avatar-upload"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
          <p className="text-sm text-muted-foreground mt-2">
            JPG, PNG ou GIF. Máximo 2MB.
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="fullName" className="text-sm font-medium">
            Nome Completo *
          </label>
          <Input
            id="fullName"
            {...register('fullName')}
            placeholder="Seu nome completo"
          />
          {errors.fullName && (
            <p className="text-sm text-destructive">{errors.fullName.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium">
            E-mail
          </label>
          <Input
            id="email"
            {...register('email')}
            disabled
            className="bg-muted"
          />
          <p className="text-sm text-muted-foreground">
            O e-mail não pode ser alterado
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="position" className="text-sm font-medium">
            Cargo
          </label>
          <Input
            id="position"
            {...register('position')}
            placeholder="Ex: CEO, Gerente, etc."
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="bio" className="text-sm font-medium">
            Bio
          </label>
          <Textarea
            id="bio"
            {...register('bio')}
            placeholder="Conte um pouco sobre você..."
            rows={4}
          />
        </div>

        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={isSubmitting || loading.updateProfile}
          >
            {isSubmitting || loading.updateProfile ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              'Salvar Alterações'
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}

