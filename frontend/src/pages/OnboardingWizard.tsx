import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export function OnboardingWizard() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState({
    industry: '',
    companySize: '',
    targetMarket: '',
    icpDescription: '',
    apiKeys: '',
  })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    setLoading(true)
    try {
      // Here you would save the company profile
      // For now, we'll just navigate to dashboard
      await api.post('/api/company-profile', {
        industry: formData.industry,
        company_size: formData.companySize,
        target_market: formData.targetMarket,
        icp_description: formData.icpDescription,
        api_keys: formData.apiKeys,
      })
      navigate('/dashboard')
    } catch (error) {
      console.error('Error saving profile:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>{t('onboarding.title')}</CardTitle>
          <CardDescription>
            {step === 1 && t('onboarding.step1')}
            {step === 2 && t('onboarding.step2')}
            {step === 3 && t('onboarding.step3')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('onboarding.industry')}</label>
                <Input
                  value={formData.industry}
                  onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                  placeholder="Ex: Tecnologia, SaaS, E-commerce"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('onboarding.companySize')}</label>
                <Input
                  value={formData.companySize}
                  onChange={(e) => setFormData({ ...formData, companySize: e.target.value })}
                  placeholder="Ex: 10-50, 50-200, 200+"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('onboarding.targetMarket')}</label>
                <Input
                  value={formData.targetMarket}
                  onChange={(e) => setFormData({ ...formData, targetMarket: e.target.value })}
                  placeholder="Ex: PMEs, Startups, Enterprise"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('onboarding.icpDescription')}</label>
                <Textarea
                  value={formData.icpDescription}
                  onChange={(e) => setFormData({ ...formData, icpDescription: e.target.value })}
                  rows={8}
                  placeholder="Descreva seu cliente ideal: características, necessidades, desafios..."
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('onboarding.apiKeys')}</label>
                <Textarea
                  value={formData.apiKeys}
                  onChange={(e) => setFormData({ ...formData, apiKeys: e.target.value })}
                  rows={6}
                  placeholder='{"openai": "sk-...", "other": "key..."}'
                />
                <p className="text-xs text-muted-foreground">
                  Formato JSON com suas chaves de API (opcional)
                </p>
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-between">
            <Button
              variant="outline"
              onClick={() => setStep(step - 1)}
              disabled={step === 1}
            >
              {t('onboarding.previous')}
            </Button>
            {step < 3 ? (
              <Button onClick={() => setStep(step + 1)}>
                {t('onboarding.next')}
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={loading}>
                {loading ? t('common.loading') : t('onboarding.finish')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}









