import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function Settings() {
  const { t } = useTranslation()

  return (
    <div className="flex-1 space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">{t('navigation.settings')}</h1>
        <p className="text-muted-foreground">Configurações da conta</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configurações</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Funcionalidade de configurações em desenvolvimento.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}








