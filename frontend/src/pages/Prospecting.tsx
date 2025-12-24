import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { 
  Search, 
  Download, 
  Upload,
  Building2,
  MapPin,
  FileText,
  CheckCircle2,
  XCircle,
  Loader2
} from 'lucide-react'

interface ProspectingParams {
  uf?: string
  municipio?: string
  cnae?: string
  cnae_descricao?: string
  porte?: string
  natureza_juridica?: string
  situacao_cadastral?: string
  capital_social_min?: number
  capital_social_max?: number
  data_abertura_inicio?: string
  data_abertura_fim?: string
  simples_nacional?: boolean
  razao_social_contem?: string
  nome_fantasia_contem?: string
  com_email?: boolean
  com_telefone?: boolean
  somente_celular?: boolean
  limite?: number
  pagina?: number
  tipo_resultado?: string
  auto_import?: boolean
}

interface Empresa {
  cnpj: string
  razao_social?: string
  nome_fantasia?: string
  situacao_cadastral?: {
    situacao_cadastral?: string
    motivo?: string
    data?: string
  } | string
  endereco?: {
    municipio?: string
    uf?: string
    logradouro?: string
    numero?: string
    bairro?: string
    cep?: string
    complemento?: string
  }
  porte_empresa?: {
    codigo?: string
    descricao?: string
  } | string
  capital_social?: number
  data_abertura?: string
  contato_telefonico?: string | string[] | {
    completo?: string
    ddd?: string
    numero?: string
    tipo?: string
  } | Array<{
    completo?: string
    ddd?: string
    numero?: string
    tipo?: string
  }>
  contato_email?: string | string[] | {
    email?: string
    valido?: boolean
    dominio?: string
  } | Array<{
    email?: string
    valido?: boolean
    dominio?: string
  }>
  telefone?: string | string[]  // Fallback
  ddd?: string
  email?: string | string[]  // Fallback
  quadro_societario?: Array<{
    nome?: string
    qualificacao_socio?: string
    documento?: string
    data_entrada_sociedade?: string
  }>
  [key: string]: any
}

export function Prospecting() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [params, setParams] = useState<ProspectingParams>({
    limite: 100,
    pagina: 1,
    tipo_resultado: 'completo',
    auto_import: false
  })
  const [results, setResults] = useState<any>(null)
  const [selectedEmpresas, setSelectedEmpresas] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)

  const handleSearch = async () => {
    setLoading(true)
    setResults(null)
    setSelectedEmpresas(new Set())
    
    try {
      const response = await api.post('/api/prospecting/search', params)
      setResults(response.data)
    } catch (error: any) {
      console.error('Error searching:', error)
      alert(error.response?.data?.detail || 'Erro ao buscar empresas. Verifique se a API key da Casa dos Dados está configurada.')
    } finally {
      setLoading(false)
    }
  }

  const handleImportSelected = async () => {
    if (selectedEmpresas.size === 0) {
      alert('Selecione pelo menos uma empresa para importar')
      return
    }

    if (!results?.empresas) {
      alert('Nenhum resultado disponível para importar')
      return
    }

    const empresasToImport = results.empresas.filter((e: Empresa) => 
      selectedEmpresas.has(e.cnpj)
    )

    setImporting(true)
    try {
      const response = await api.post('/api/prospecting/import-results', empresasToImport)
      alert(`Importação concluída! ${response.data.leads_created} leads criados, ${response.data.leads_updated} atualizados.`)
      
      // Limpar seleção
      setSelectedEmpresas(new Set())
      
      // Atualizar resultados se houver erros
      if (response.data.errors && response.data.errors.length > 0) {
        console.warn('Erros na importação:', response.data.errors)
      }
    } catch (error: any) {
      console.error('Error importing:', error)
      alert(error.response?.data?.detail || 'Erro ao importar empresas')
    } finally {
      setImporting(false)
    }
  }

  const handleSelectAll = () => {
    if (!results?.empresas) return
    
    if (selectedEmpresas.size === results.empresas.length) {
      setSelectedEmpresas(new Set())
    } else {
      setSelectedEmpresas(new Set(results.empresas.map((e: Empresa) => e.cnpj)))
    }
  }

  const handleSelectEmpresa = (cnpj: string) => {
    const newSelected = new Set(selectedEmpresas)
    if (newSelected.has(cnpj)) {
      newSelected.delete(cnpj)
    } else {
      newSelected.add(cnpj)
    }
    setSelectedEmpresas(newSelected)
  }

  const handleExportCSV = () => {
    if (!results?.empresas || results.empresas.length === 0) {
      alert('Nenhum resultado para exportar')
      return
    }

    const headers = ['CNPJ', 'Razão Social', 'Nome Fantasia', 'Situação', 'Município', 'UF', 'CNAE', 'Capital Social']
    const rows = results.empresas.map((e: Empresa) => [
      e.cnpj || '',
      e.razao_social || '',
      e.nome_fantasia || '',
      e.situacao_cadastral || '',
      e.municipio || '',
      e.uf || '',
      e.cnae_principal?.descricao || e.cnae_principal?.codigo || '',
      e.capital_social?.toString() || ''
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8-sig;' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `prospeccao_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Prospecção</h1>
          <p className="text-muted-foreground">Busque empresas na Casa dos Dados e gere leads automaticamente</p>
        </div>
      </div>

      {/* Formulário de Busca */}
      <Card className="border-t-4 border-t-amber-500 bg-gradient-to-br from-amber-50/30 to-white dark:from-amber-950/10 dark:to-background">
        <CardHeader className="bg-gradient-to-r from-amber-50/50 to-transparent dark:from-amber-950/20">
          <CardTitle className="flex items-center gap-2 text-amber-900 dark:text-amber-100">
            <Search className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            Parâmetros de Busca
          </CardTitle>
          <CardDescription className="text-amber-800/80 dark:text-amber-200/80">
            Defina os critérios para buscar empresas na API da Casa dos Dados
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">UF</label>
              <Input
                value={params.uf || ''}
                onChange={(e) => setParams({ ...params, uf: e.target.value.toUpperCase() })}
                placeholder="SP, RJ, MG..."
                maxLength={2}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Município</label>
              <Input
                value={params.municipio || ''}
                onChange={(e) => setParams({ ...params, municipio: e.target.value })}
                placeholder="São Paulo, Rio de Janeiro..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">CNAE (Código)</label>
              <Input
                value={params.cnae || ''}
                onChange={(e) => setParams({ ...params, cnae: e.target.value })}
                placeholder="6201-5/00"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">CNAE (Descrição)</label>
              <Input
                value={params.cnae_descricao || ''}
                onChange={(e) => setParams({ ...params, cnae_descricao: e.target.value })}
                placeholder="Desenvolvimento de software"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Porte</label>
              <select
                value={params.porte || ''}
                onChange={(e) => setParams({ ...params, porte: e.target.value || undefined })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Todos</option>
                <option value="ME">Micro Empresa</option>
                <option value="EPP">Empresa de Pequeno Porte</option>
                <option value="Grande">Grande Empresa</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Situação Cadastral</label>
              <select
                value={params.situacao_cadastral || ''}
                onChange={(e) => setParams({ ...params, situacao_cadastral: e.target.value || undefined })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Todas</option>
                <option value="ATIVA">Ativa</option>
                <option value="BAIXADA">Baixada</option>
                <option value="INAPTA">Inapta</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Capital Social Mínimo (R$)</label>
              <Input
                type="number"
                step="0.01"
                value={params.capital_social_min || ''}
                onChange={(e) => setParams({ ...params, capital_social_min: e.target.value ? parseFloat(e.target.value) : undefined })}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Capital Social Máximo (R$)</label>
              <Input
                type="number"
                step="0.01"
                value={params.capital_social_max || ''}
                onChange={(e) => setParams({ ...params, capital_social_max: e.target.value ? parseFloat(e.target.value) : undefined })}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Data Abertura Início</label>
              <Input
                type="date"
                value={params.data_abertura_inicio || ''}
                onChange={(e) => setParams({ ...params, data_abertura_inicio: e.target.value || undefined })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Data Abertura Fim</label>
              <Input
                type="date"
                value={params.data_abertura_fim || ''}
                onChange={(e) => setParams({ ...params, data_abertura_fim: e.target.value || undefined })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Razão Social Contém</label>
              <Input
                value={params.razao_social_contem || ''}
                onChange={(e) => setParams({ ...params, razao_social_contem: e.target.value || undefined })}
                placeholder="Tecnologia, Software..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Nome Fantasia Contém</label>
              <Input
                value={params.nome_fantasia_contem || ''}
                onChange={(e) => setParams({ ...params, nome_fantasia_contem: e.target.value || undefined })}
                placeholder="Tech, Solutions..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Limite de Resultados</label>
              <Input
                type="number"
                min="1"
                max="1000"
                value={params.limite || 100}
                onChange={(e) => setParams({ ...params, limite: parseInt(e.target.value) || 100 })}
              />
            </div>
            <div className="space-y-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={params.auto_import || false}
                onChange={(e) => setParams({ ...params, auto_import: e.target.checked })}
                className="h-4 w-4"
              />
              <label className="text-sm font-medium">Importar automaticamente como leads</label>
            </div>
            <div className="space-y-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={params.simples_nacional || false}
                onChange={(e) => setParams({ ...params, simples_nacional: e.target.checked || undefined })}
                className="h-4 w-4"
              />
              <label className="text-sm font-medium">Optante do Simples Nacional</label>
            </div>
            
            <div className="border-t pt-4 mt-4">
              <h4 className="text-sm font-semibold mb-3">Filtros de Contato</h4>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={params.com_email || false}
                    onChange={(e) => setParams({ ...params, com_email: e.target.checked || undefined })}
                    className="h-4 w-4"
                  />
                  <label className="text-sm font-medium">Apenas empresas com e-mail</label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={params.com_telefone || false}
                    onChange={(e) => setParams({ ...params, com_telefone: e.target.checked || undefined })}
                    className="h-4 w-4"
                  />
                  <label className="text-sm font-medium">Apenas empresas com telefone</label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={params.somente_celular || false}
                    onChange={(e) => setParams({ ...params, somente_celular: e.target.checked || undefined })}
                    className="h-4 w-4"
                    disabled={!params.com_telefone}
                  />
                  <label className={`text-sm font-medium ${!params.com_telefone ? 'text-muted-foreground' : ''}`}>
                    Apenas celular (não fixo)
                  </label>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex gap-2 mt-6">
            <Button 
              onClick={handleSearch} 
              disabled={loading}
              className="flex items-center gap-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white shadow-md hover:shadow-lg transition-all duration-200"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Buscando...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" />
                  Buscar Empresas
                </>
              )}
            </Button>
            <Button
              variant="outline"
              className="border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/20"
              onClick={() => setParams({ limite: 100, auto_import: false })}
            >
              Limpar Filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Resultados */}
      {results && (
        <Card className="border-t-4 border-t-orange-500 bg-gradient-to-br from-orange-50/30 to-white dark:from-orange-950/10 dark:to-background">
          <CardHeader className="bg-gradient-to-r from-orange-50/50 to-transparent dark:from-orange-950/20">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-orange-900 dark:text-orange-100">
                  <Building2 className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                  Resultados da Busca
                </CardTitle>
                <CardDescription className="text-orange-800/80 dark:text-orange-200/80">
                  {results.total_found} empresa(s) encontrada(s)
                  {results.leads_created > 0 && ` • ${results.leads_created} lead(s) criado(s)`}
                  {results.leads_updated > 0 && ` • ${results.leads_updated} lead(s) atualizado(s)`}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                {selectedEmpresas.size > 0 && (
                  <Button
                    variant="outline"
                    onClick={handleImportSelected}
                    disabled={importing}
                    className="flex items-center gap-2"
                  >
                    {importing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Importando...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        Importar Selecionadas ({selectedEmpresas.size})
                      </>
                    )}
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={handleExportCSV}
                  className="flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  Exportar CSV
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {results.empresas && results.empresas.length > 0 ? (
              <>
                <div className="mb-4 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedEmpresas.size === results.empresas.length && results.empresas.length > 0}
                    onChange={handleSelectAll}
                    className="h-4 w-4"
                  />
                  <span className="text-sm text-muted-foreground">
                    Selecionar todas ({selectedEmpresas.size} de {results.empresas.length})
                  </span>
                </div>
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {results.empresas.map((empresa: Empresa) => (
                    <div
                      key={empresa.cnpj}
                      className={`p-4 border-l-4 border-l-orange-300 rounded-lg cursor-pointer hover:shadow-lg transition-all duration-200 bg-gradient-to-r from-white to-orange-50/30 dark:from-background dark:to-orange-950/20 ${
                        selectedEmpresas.has(empresa.cnpj) ? 'border-l-orange-600 bg-orange-50 dark:bg-orange-950/30' : ''
                      }`}
                      onClick={() => handleSelectEmpresa(empresa.cnpj)}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={selectedEmpresas.has(empresa.cnpj)}
                          onChange={() => handleSelectEmpresa(empresa.cnpj)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 mt-1"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold">
                              {empresa.nome_fantasia || empresa.razao_social || 'Sem nome'}
                            </h3>
                            {(() => {
                              const situacao = typeof empresa.situacao_cadastral === 'string' 
                                ? empresa.situacao_cadastral 
                                : empresa.situacao_cadastral?.situacao_cadastral;
                              return situacao === 'ATIVA' ? (
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                              ) : (
                                <XCircle className="h-4 w-4 text-red-600" />
                              );
                            })()}
                          </div>
                          <div className="grid gap-1 text-sm text-muted-foreground">
                            <div className="flex items-center gap-2">
                              <FileText className="h-3 w-3" />
                              <span>CNPJ: {empresa.cnpj}</span>
                            </div>
                            {empresa.razao_social && (
                              <div>Razão Social: {empresa.razao_social}</div>
                            )}
                            {empresa.endereco && (
                              <div className="flex items-center gap-2">
                                <MapPin className="h-3 w-3" />
                                <span>
                                  {empresa.endereco.municipio || ''} {empresa.endereco.uf ? `- ${empresa.endereco.uf}` : ''}
                                </span>
                              </div>
                            )}
                            {empresa.porte_empresa && (
                              <div>Porte: {
                                typeof empresa.porte_empresa === 'string' 
                                  ? empresa.porte_empresa 
                                  : empresa.porte_empresa.descricao || empresa.porte_empresa.codigo
                              }</div>
                            )}
                            {empresa.capital_social && (
                              <div>Capital Social: R$ {empresa.capital_social.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                            )}
                            {(() => {
                              // API v5 usa contato_telefonico que pode ser objeto {completo, ddd, numero, tipo} ou string/array
                              let telefone = null;
                              
                              if (empresa.contato_telefonico) {
                                if (typeof empresa.contato_telefonico === 'object' && !Array.isArray(empresa.contato_telefonico)) {
                                  // É um objeto com {completo, ddd, numero, tipo}
                                  telefone = empresa.contato_telefonico.completo || 
                                            (empresa.contato_telefonico.ddd && empresa.contato_telefonico.numero 
                                              ? `(${empresa.contato_telefonico.ddd}) ${empresa.contato_telefonico.numero}`
                                              : empresa.contato_telefonico.numero);
                                } else if (Array.isArray(empresa.contato_telefonico)) {
                                  // É um array - pegar o primeiro e verificar se é objeto
                                  const primeiro = empresa.contato_telefonico[0];
                                  if (typeof primeiro === 'object' && primeiro.completo) {
                                    telefone = primeiro.completo || 
                                              (primeiro.ddd && primeiro.numero 
                                                ? `(${primeiro.ddd}) ${primeiro.numero}`
                                                : primeiro.numero);
                                  } else {
                                    telefone = primeiro;
                                  }
                                } else {
                                  // É string
                                  telefone = empresa.contato_telefonico;
                                }
                              } else if (empresa.telefone) {
                                // Fallback para campo antigo
                                telefone = Array.isArray(empresa.telefone) ? empresa.telefone[0] : empresa.telefone;
                              }
                              
                              return telefone && (
                                <div className="text-blue-600 font-medium">📞 {telefone}</div>
                              );
                            })()}
                            {(() => {
                              // API v5 usa contato_email que pode ser objeto {email, valido, dominio} ou string/array
                              let email = null;
                              
                              if (empresa.contato_email) {
                                if (typeof empresa.contato_email === 'object' && !Array.isArray(empresa.contato_email)) {
                                  // É um objeto com {email, valido, dominio}
                                  email = empresa.contato_email.email;
                                } else if (Array.isArray(empresa.contato_email)) {
                                  // É um array - pegar o primeiro e verificar se é objeto
                                  const primeiro = empresa.contato_email[0];
                                  if (typeof primeiro === 'object' && primeiro.email) {
                                    email = primeiro.email;
                                  } else {
                                    email = primeiro;
                                  }
                                } else {
                                  // É string
                                  email = empresa.contato_email;
                                }
                              } else if (empresa.email) {
                                // Fallback para campo antigo
                                email = Array.isArray(empresa.email) ? empresa.email[0] : empresa.email;
                              }
                              
                              return email && (
                                <div className="text-blue-600 font-medium">✉️ {email}</div>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                Nenhuma empresa encontrada com os critérios especificados
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

