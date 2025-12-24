import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function Login() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.detail || t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
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
        
        <Card className="w-full border-t-4 border-t-blue-500 bg-gradient-to-br from-white to-blue-50/50 dark:from-background dark:to-blue-950/20 shadow-xl">
          <CardHeader className="bg-gradient-to-r from-blue-50/50 to-transparent dark:from-blue-950/20">
            <CardTitle className="text-blue-900 dark:text-blue-100 text-center">{t('auth.loginTitle')}</CardTitle>
            <CardDescription className="text-blue-700/80 dark:text-blue-300/80 text-center">{t('auth.loginTitle')}</CardDescription>
          </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-gradient-to-r from-red-50 to-red-100 dark:from-red-950/30 dark:to-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-300">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                {t('auth.email')}
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button 
              type="submit" 
              className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-md hover:shadow-lg transition-all duration-200" 
              disabled={loading}
            >
              {loading ? t('common.loading') : t('auth.login')}
            </Button>
            <div className="text-center text-sm">
              <span className="text-muted-foreground">{t('auth.noAccount')} </span>
              <Link to="/register" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium hover:underline transition-colors">
                {t('auth.register')}
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
      </div>
    </div>
  )
}






