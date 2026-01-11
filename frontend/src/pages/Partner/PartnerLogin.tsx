import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePartnerAuth } from '@/contexts/PartnerAuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function PartnerLogin() {
  const navigate = useNavigate()
  const { login } = usePartnerAuth()
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
      navigate('/partner/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao fazer login')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 p-4">
      <div className="w-full max-w-md space-y-4 md:space-y-6">
        <div className="flex justify-center mb-2 md:mb-4">
          <div className="relative">
            <img 
              src="/assets/LOGO AZUL.png" 
              alt="TYR CRM AI" 
              className="h-24 md:h-32 w-auto dark:hidden transition-all duration-300 hover:scale-105"
            />
            <img 
              src="/assets/LOGO BRANCO.svg" 
              alt="TYR CRM AI" 
              className="h-24 md:h-32 w-auto hidden dark:block transition-all duration-300 hover:scale-105"
            />
          </div>
        </div>
        
        <Card className="w-full border-t-4 border-t-blue-500 bg-gradient-to-br from-white to-blue-50/50 dark:from-background dark:to-blue-950/20 shadow-xl">
          <CardHeader className="bg-gradient-to-r from-blue-50/50 to-transparent dark:from-blue-950/20">
            <CardTitle className="text-blue-900 dark:text-blue-100 text-center">Portal do Parceiro</CardTitle>
            <CardDescription className="text-blue-700/80 dark:text-blue-300/80 text-center">Acesso exclusivo para parceiros</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-300">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
                  Email
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
                  Senha
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
                {loading ? 'Carregando...' : 'Entrar'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

