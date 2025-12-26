import { useState, useEffect } from 'react'
import { FileText, Clock, MapPin, User, Globe, CheckCircle, XCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { livePulseApi } from '@/lib/api'

interface VisitReport {
  id: number
  visitor_id: string
  ip?: string
  city?: string
  country?: string
  name?: string
  email?: string
  pages_visited: string[]
  total_duration: number
  chat_initiated: boolean
  messages_count: number
  converted_to_lead: boolean
  lead_id?: number
  started_at: string
  ended_at: string
  created_at: string
}

export function VisitReports() {
  const [reports, setReports] = useState<VisitReport[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedReport, setSelectedReport] = useState<VisitReport | null>(null)

  useEffect(() => {
    fetchReports()
  }, [])

  const fetchReports = async () => {
    try {
      setLoading(true)
      const response = await livePulseApi.getVisitReports()
      setReports(response.data)
    } catch (error) {
      console.error('Error fetching visit reports:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`
    } else {
      return `${secs}s`
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Relatórios de Visitas</h1>
          <p className="text-slate-400 mt-1">Histórico completo de visitas ao site</p>
        </div>
      </div>

      {reports.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-slate-400 mb-4" />
            <p className="text-slate-400">Nenhum relatório de visita encontrado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Lista de Relatórios */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Relatórios ({reports.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Visitante</TableHead>
                      <TableHead>Localização</TableHead>
                      <TableHead>Duração</TableHead>
                      <TableHead>Páginas</TableHead>
                      <TableHead>Chat</TableHead>
                      <TableHead>Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reports.map((report) => (
                      <TableRow
                        key={report.id}
                        className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
                        onClick={() => setSelectedReport(report)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {report.name ? (
                              <>
                                <User className="h-4 w-4 text-slate-400" />
                                <span className="font-medium">{report.name}</span>
                              </>
                            ) : (
                              <span className="text-slate-400">Anônimo</span>
                            )}
                          </div>
                          {report.email && (
                            <div className="text-xs text-slate-400 mt-1">{report.email}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          {report.city && report.country ? (
                            <div className="flex items-center gap-1 text-sm">
                              <MapPin className="h-3 w-3 text-slate-400" />
                              {report.city}, {report.country}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm">
                            <Clock className="h-3 w-3 text-slate-400" />
                            {formatDuration(report.total_duration)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{report.pages_visited.length}</span>
                        </TableCell>
                        <TableCell>
                          {report.chat_initiated ? (
                            <div className="flex items-center gap-1 text-green-600">
                              <CheckCircle className="h-4 w-4" />
                              <span className="text-sm">{report.messages_count}</span>
                            </div>
                          ) : (
                            <XCircle className="h-4 w-4 text-slate-400" />
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-slate-400">
                          {formatDate(report.ended_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* Detalhes do Relatório Selecionado */}
          <div className="lg:col-span-1">
            {selectedReport ? (
              <Card>
                <CardHeader>
                  <CardTitle>Detalhes da Visita</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Informações do Visitante */}
                  <div>
                    <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Visitante
                    </h3>
                    <div className="space-y-1 text-sm">
                      <div>
                        <span className="text-slate-400">Nome:</span>{' '}
                        {selectedReport.name || 'Anônimo'}
                      </div>
                      {selectedReport.email && (
                        <div>
                          <span className="text-slate-400">Email:</span>{' '}
                          {selectedReport.email}
                        </div>
                      )}
                      <div>
                        <span className="text-slate-400">ID:</span>{' '}
                        <span className="font-mono text-xs">{selectedReport.visitor_id}</span>
                      </div>
                    </div>
                  </div>

                  {/* Localização */}
                  {(selectedReport.city || selectedReport.country) && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        Localização
                      </h3>
                      <div className="text-sm">
                        {selectedReport.city && selectedReport.country ? (
                          <div>{selectedReport.city}, {selectedReport.country}</div>
                        ) : (
                          <div className="text-slate-400">Não disponível</div>
                        )}
                        {selectedReport.ip && (
                          <div className="text-xs text-slate-400 mt-1">IP: {selectedReport.ip}</div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Estatísticas */}
                  <div>
                    <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Estatísticas
                    </h3>
                    <div className="space-y-1 text-sm">
                      <div>
                        <span className="text-slate-400">Duração:</span>{' '}
                        {formatDuration(selectedReport.total_duration)}
                      </div>
                      <div>
                        <span className="text-slate-400">Páginas visitadas:</span>{' '}
                        {selectedReport.pages_visited.length}
                      </div>
                      <div>
                        <span className="text-slate-400">Chat iniciado:</span>{' '}
                        {selectedReport.chat_initiated ? (
                          <span className="text-green-600">Sim ({selectedReport.messages_count} mensagens)</span>
                        ) : (
                          <span className="text-slate-400">Não</span>
                        )}
                      </div>
                      <div>
                        <span className="text-slate-400">Convertido em lead:</span>{' '}
                        {selectedReport.converted_to_lead ? (
                          <span className="text-green-600">Sim</span>
                        ) : (
                          <span className="text-slate-400">Não</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Páginas Visitadas */}
                  {selectedReport.pages_visited.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                        <Globe className="h-4 w-4" />
                        Páginas Visitadas
                      </h3>
                      <div className="space-y-1">
                        {selectedReport.pages_visited.map((page, index) => (
                          <div key={index} className="text-sm text-slate-600 dark:text-slate-300 font-mono text-xs bg-slate-50 dark:bg-slate-800 p-2 rounded">
                            {page}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Datas */}
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Período</h3>
                    <div className="space-y-1 text-sm text-slate-400">
                      <div>Início: {formatDate(selectedReport.started_at)}</div>
                      <div>Fim: {formatDate(selectedReport.ended_at)}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FileText className="h-12 w-12 text-slate-400 mb-4" />
                  <p className="text-slate-400 text-sm">Selecione um relatório para ver os detalhes</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

