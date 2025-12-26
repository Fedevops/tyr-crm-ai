import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { Copy, Check, Radio, Code, Settings, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export function LivePulse() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [copied, setCopied] = useState(false)
  const [widgetConfig, setWidgetConfig] = useState({
    position: 'bottom-right',
    primaryColor: '#3b82f6',
    buttonText: 'Fale Conosco',
    enabled: true,
  })

  const tenantId = user?.tenant_id || 1

  // Código de instalação do widget
  const installationCode = `<!-- TYR Live Pulse Widget -->
<script>
  (function() {
    console.log('[TYR Widget] Iniciando instalação...');
    const TYR_CONFIG = {
      apiUrl: '${API_URL}',
      tenantId: ${tenantId},
      position: '${widgetConfig.position}',
      primaryColor: '${widgetConfig.primaryColor}',
      buttonText: '${widgetConfig.buttonText}',
    };
    
    console.log('[TYR Widget] Config:', TYR_CONFIG);
    
    // Definir config antes de carregar o script
    window.TYR_CONFIG = TYR_CONFIG;

    const script = document.createElement('script');
    script.src = '${API_URL}/api/widgets/tyr-live-pulse.js';
    script.async = true;
    script.onload = function() {
      console.log('[TYR Widget] Script carregado, inicializando...');
      if (window.TYRLivePulse) {
        window.TYRLivePulse.init(TYR_CONFIG);
      } else {
        console.error('[TYR Widget] TYRLivePulse não encontrado após carregar script');
      }
    };
    script.onerror = function() {
      console.error('[TYR Widget] Erro ao carregar script:', script.src);
    };
    document.head.appendChild(script);
  })();
</script>`

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast({
        title: 'Copiado!',
        description: 'Código copiado para a área de transferência',
      })
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível copiar o código',
      })
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Live Pulse Widget</h2>
        <p className="text-muted-foreground">
          Configure e instale o widget de rastreamento de visitantes e chat em tempo real no seu site
        </p>
      </div>

      {/* Instruções de Instalação */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            Código de Instalação
          </CardTitle>
          <CardDescription>
            Copie e cole este código antes do fechamento da tag &lt;/body&gt; em todas as páginas do seu site
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm">
              <code>{installationCode}</code>
            </pre>
            <Button
              variant="outline"
              size="sm"
              className="absolute top-2 right-2"
              onClick={() => copyToClipboard(installationCode)}
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Copiado!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copiar
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Configurações do Widget */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Configurações do Widget
          </CardTitle>
          <CardDescription>
            Personalize a aparência e comportamento do widget
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Posição do Widget</label>
              <select
                value={widgetConfig.position}
                onChange={(e) => setWidgetConfig({ ...widgetConfig, position: e.target.value })}
                className="w-full p-2 border rounded-md bg-background"
              >
                <option value="bottom-right">Canto Inferior Direito</option>
                <option value="bottom-left">Canto Inferior Esquerdo</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Cor Principal</label>
              <Input
                type="color"
                value={widgetConfig.primaryColor}
                onChange={(e) => setWidgetConfig({ ...widgetConfig, primaryColor: e.target.value })}
                className="h-10"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Texto do Botão</label>
            <Input
              value={widgetConfig.buttonText}
              onChange={(e) => setWidgetConfig({ ...widgetConfig, buttonText: e.target.value })}
              placeholder="Fale Conosco"
            />
          </div>
        </CardContent>
      </Card>

      {/* Informações do Tenant */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5" />
            Informações da Conta
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Tenant ID:</span>
              <code className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">{tenantId}</code>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">API URL:</span>
              <code className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-xs break-all">{API_URL}</code>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Instruções */}
      <Card>
        <CardHeader>
          <CardTitle>Como Funciona</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
            <li>Copie o código de instalação acima</li>
            <li>Cole antes do fechamento da tag &lt;/body&gt; em todas as páginas do seu site</li>
            <li>Os visitantes serão rastreados automaticamente e aparecerão no dashboard Live Pulse</li>
            <li>Quando um visitante iniciar um chat, você poderá conversar em tempo real</li>
            <li>Use o botão "Converter em Lead" para salvar visitantes como leads no CRM</li>
          </ol>
        </CardContent>
      </Card>

      {/* Aviso */}
      <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-800">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-yellow-800 dark:text-yellow-200 mb-1">
                Importante
              </p>
              <p className="text-yellow-700 dark:text-yellow-300">
                Certifique-se de que a URL da API está acessível publicamente. Em produção, use HTTPS.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

