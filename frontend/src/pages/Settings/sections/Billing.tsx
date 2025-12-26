import { useState, useEffect } from 'react'
import { useSettings } from '@/hooks/useSettings'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useToast } from '@/components/ui/use-toast'
import { Download, ArrowUpRight } from 'lucide-react'

export function Billing() {
  const { toast } = useToast()
  const { fetchBilling, fetchInvoices, loading } = useSettings()
  const [billing, setBilling] = useState<any>(null)
  const [invoices, setInvoices] = useState<any[]>([])

  useEffect(() => {
    const loadData = async () => {
      try {
        const [billingData, invoicesData] = await Promise.all([
          fetchBilling(),
          fetchInvoices(),
        ])
        setBilling(billingData)
        setInvoices(invoicesData)
      } catch (error) {
        toast({
          variant: 'destructive',
          title: 'Erro',
          description: 'Não foi possível carregar as informações de faturamento',
        })
      }
    }
    loadData()
  }, [fetchBilling, fetchInvoices, toast])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR')
  }

  const handleDownload = (invoiceId: number) => {
    toast({
      variant: 'success',
      title: 'Download',
      description: 'Download do PDF iniciado',
    })
    // Mock download
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Faturamento & Plano</h2>
        <p className="text-muted-foreground">
          Gerencie seu plano e histórico de faturas
        </p>
      </div>

      {/* Current Plan Card */}
      {billing && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Plano Atual</CardTitle>
                <CardDescription>
                  Seu plano atual e informações de renovação
                </CardDescription>
              </div>
              <Button>
                <ArrowUpRight className="h-4 w-4 mr-2" />
                Fazer Upgrade
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold">{billing.name}</p>
                  <p className="text-muted-foreground">
                    {formatCurrency(billing.price)}/mês
                  </p>
                </div>
              </div>
              <div className="pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  Próxima renovação: {formatDate(billing.nextRenewal)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invoice History */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Faturas</CardTitle>
          <CardDescription>
            Visualize e baixe suas faturas anteriores
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.length > 0 ? (
                  invoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell>{formatDate(invoice.date)}</TableCell>
                      <TableCell className="font-medium">
                        {formatCurrency(invoice.amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownload(invoice.id)}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Download PDF
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      Nenhuma fatura encontrada
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}


