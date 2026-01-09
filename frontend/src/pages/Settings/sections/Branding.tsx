import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useSettings } from '@/hooks/useSettings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ColorPicker } from '@/components/ui/color-picker'
import { useToast } from '@/components/ui/use-toast'
import { Upload, Loader2 } from 'lucide-react'

const brandingSchema = z.object({
  organizationName: z.string().min(1, 'Nome da organização é obrigatório'),
  primaryColor: z.string().regex(/^#[0-9A-F]{6}$/i, 'Cor deve ser um hex válido'),
})

type BrandingFormData = z.infer<typeof brandingSchema>

export function Branding() {
  const { toast } = useToast()
  const { fetchBranding, updateBranding, loading } = useSettings()
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    watch,
    setValue,
  } = useForm<BrandingFormData>({
    resolver: zodResolver(brandingSchema),
  })

  const primaryColor = watch('primaryColor')

  useEffect(() => {
    const loadBranding = async () => {
      try {
        const branding = await fetchBranding()
        reset({
          organizationName: branding.organizationName,
          primaryColor: branding.primaryColor,
        })
        if (branding.logo) {
          setLogoPreview(branding.logo)
        }
        // Set initial CSS variable
        if (branding.primaryColor) {
          document.documentElement.style.setProperty(
            '--primary-color',
            branding.primaryColor
          )
        }
      } catch (error) {
        toast({
          variant: 'destructive',
          title: 'Erro',
          description: 'Não foi possível carregar as configurações de branding',
        })
      }
    }
    loadBranding()
  }, [fetchBranding, reset, toast])

  // Update CSS variable when color changes
  useEffect(() => {
    if (primaryColor) {
      document.documentElement.style.setProperty('--primary-color', primaryColor)
    }
  }, [primaryColor])

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setLogoFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setLogoPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const onSubmit = async (data: BrandingFormData) => {
    try {
      await updateBranding({
        ...data,
        logo: logoPreview || undefined,
      })
      toast({
        variant: 'success',
        title: 'Sucesso',
        description: 'Configurações de branding atualizadas com sucesso!',
      })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível atualizar as configurações de branding',
      })
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Branding & Personalização</h2>
        <p className="text-muted-foreground">
          Personalize a identidade visual da sua organização
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Organization Name */}
        <div className="space-y-2">
          <label htmlFor="organizationName" className="text-sm font-medium">
            Nome da Organização *
          </label>
          <Input
            id="organizationName"
            {...register('organizationName')}
            placeholder="Nome da sua organização"
          />
          {errors.organizationName && (
            <p className="text-sm text-destructive">
              {errors.organizationName.message}
            </p>
          )}
        </div>

        {/* Logo Upload */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Logotipo</label>
          <div className="flex items-center gap-6">
            <div className="relative">
              <div className="h-32 w-32 rounded-lg bg-muted flex items-center justify-center overflow-hidden border-2 border-dashed border-muted-foreground/25">
                {logoPreview ? (
                  <img
                    src={logoPreview}
                    alt="Logo"
                    className="h-full w-full object-contain p-2"
                  />
                ) : (
                  <div className="text-center p-4">
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-xs text-muted-foreground">Sem logo</p>
                  </div>
                )}
              </div>
            </div>
            <div>
              <label htmlFor="logo-upload">
                <Button variant="outline" type="button" asChild>
                  <span className="cursor-pointer">
                    <Upload className="h-4 w-4 mr-2" />
                    {logoPreview ? 'Alterar Logo' : 'Enviar Logo'}
                  </span>
                </Button>
              </label>
              <input
                id="logo-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoChange}
              />
              <p className="text-sm text-muted-foreground mt-2">
                PNG, JPG ou SVG. Recomendado: 200x200px
              </p>
            </div>
          </div>
        </div>

        {/* Primary Color */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Cor Primária</label>
          <div className="flex items-center gap-4">
            <ColorPicker
              {...register('primaryColor')}
              value={primaryColor || '#3b82f6'}
              onChange={(e) => setValue('primaryColor', e.target.value)}
              className="w-24"
            />
            <div className="flex-1">
              <Input
                value={primaryColor || '#3b82f6'}
                onChange={(e) => setValue('primaryColor', e.target.value)}
                placeholder="#3b82f6"
                className="font-mono"
              />
            </div>
            <div
              className="h-12 w-24 rounded-md border-2 border-input"
              style={{ backgroundColor: primaryColor || '#3b82f6' }}
            />
          </div>
          {errors.primaryColor && (
            <p className="text-sm text-destructive">
              {errors.primaryColor.message}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Esta cor será usada em toda a interface do sistema
          </p>
        </div>

        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={isSubmitting || loading.updateBranding}
          >
            {isSubmitting || loading.updateBranding ? (
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






