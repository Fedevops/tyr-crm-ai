import { useState, useEffect } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import api from '@/lib/api'

export function Register() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { register } = useAuth()
  const partnerId = searchParams.get('partner_id')
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    fullName: '',
    tenantName: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // Se houver partner_id na URL, passar como query parameter
      if (partnerId) {
        const response = await api.post(`/api/auth/register?partner_id=${partnerId}`, {
          email: formData.email,
          password: formData.password,
          full_name: formData.fullName,
          tenant_name: formData.tenantName,
        })
        // Após registro, fazer login
        await register(formData.email, formData.password, formData.fullName, formData.tenantName)
      } else {
        await register(formData.email, formData.password, formData.fullName, formData.tenantName)
      }
      navigate('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.detail || t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-purple-50 via-indigo-50 to-blue-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="flex justify-center mb-4">
          <div className="relative">
            <img 
              src="/assets/LOGO AZUL.png" 
              alt="TYR CRM AI" 
              className="h-32 w-auto dark:hidden transition-all duration-300 hover:scale-105"
            />
            <img 
              src="/assets/LOGO BRANCO.svg" 
              alt="TYR CRM AI" 
              className="h-32 w-auto hidden dark:block transition-all duration-300 hover:scale-105"
            />
          </div>
        </div>
        
        <Card className="w-full border-t-4 border-t-purple-500 bg-gradient-to-br from-white to-purple-50/50 dark:from-background dark:to-purple-950/20 shadow-xl">
          <CardHeader className="bg-gradient-to-r from-purple-50/50 to-transparent dark:from-purple-950/20">
            <CardTitle className="text-purple-900 dark:text-purple-100 text-center">{t('auth.registerTitle')}</CardTitle>
            <CardDescription className="text-purple-700/80 dark:text-purple-300/80 text-center">{t('auth.registerTitle')}</CardDescription>
          </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-gradient-to-r from-red-50 to-red-100 dark:from-red-950/30 dark:to-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-300">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <label htmlFor="fullName" className="text-sm font-medium">
                {t('auth.fullName')}
              </label>
              <Input
                id="fullName"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                {t('auth.email')}
              </label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="tenantName" className="text-sm font-medium">
                {t('auth.tenantName')}
              </label>
              <Input
                id="tenantName"
                value={formData.tenantName}
                onChange={(e) => setFormData({ ...formData, tenantName: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                {t('auth.password')}
              </label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
              />
            </div>
            <Button 
              type="submit" 
              className="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white shadow-md hover:shadow-lg transition-all duration-200" 
              disabled={loading}
            >
              {loading ? t('common.loading') : t('auth.register')}
            </Button>
            <div className="text-center text-sm">
              <span className="text-muted-foreground">{t('auth.hasAccount')} </span>
              <Link to="/login" className="text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 font-medium hover:underline transition-colors">
                {t('auth.login')}
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
      </div>
    </div>
  )
}






