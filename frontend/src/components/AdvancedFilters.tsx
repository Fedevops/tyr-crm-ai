import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { X, Plus, Filter } from 'lucide-react'
import api from '@/lib/api'

interface FilterField {
  field: string
  type: string
  label: string
  operators: Array<{ value: string; label: string }>
}

interface Filter {
  id: string
  field: string
  operator: string
  value: string | number | boolean | null
  value2?: string | number | null
}

interface AdvancedFiltersProps {
  filters: Filter[]
  onFiltersChange: (filters: Filter[]) => void
  logic: 'AND' | 'OR'
  onLogicChange: (logic: 'AND' | 'OR') => void
  endpoint?: string
}

export function AdvancedFilters({ filters, onFiltersChange, logic, onLogicChange, endpoint = '/api/leads/filter-fields' }: AdvancedFiltersProps) {
  const [showFilters, setShowFilters] = useState(false)
  const [fields, setFields] = useState<FilterField[]>([])
  const [loadingFields, setLoadingFields] = useState(false)

  useEffect(() => {
    fetchFields()
  }, [endpoint])

  const fetchFields = async () => {
    try {
      setLoadingFields(true)
      const response = await api.get(endpoint)
      setFields(response.data.fields || [])
    } catch (error) {
      console.error('Error fetching filter fields:', error)
    } finally {
      setLoadingFields(false)
    }
  }

  const addFilter = () => {
    const newFilter: Filter = {
      id: Date.now().toString(),
      field: fields[0]?.field || '',
      operator: fields[0]?.operators[0]?.value || 'equals',
      value: null
    }
    onFiltersChange([...filters, newFilter])
  }

  const removeFilter = (id: string) => {
    onFiltersChange(filters.filter(f => f.id !== id))
  }

  const updateFilter = (id: string, updates: Partial<Filter>) => {
    onFiltersChange(filters.map(f => f.id === id ? { ...f, ...updates } : f))
  }

  const getSelectedField = (fieldName: string): FilterField | undefined => {
    return fields.find(f => f.field === fieldName)
  }

  const getOperatorsForField = (fieldName: string) => {
    const field = getSelectedField(fieldName)
    return field?.operators || []
  }

  const renderFilterValue = (filter: Filter) => {
    const field = getSelectedField(filter.field)
    if (!field) return null

    const operator = filter.operator

    // Operadores que não precisam de valor
    if (operator === 'is_null' || operator === 'is_not_null') {
      return null
    }

    // Operador BETWEEN precisa de dois valores
    if (operator === 'between') {
      return (
        <div className="flex gap-2 items-center">
          <Input
            type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
            value={filter.value === null || filter.value === undefined ? '' : String(filter.value)}
            onChange={(e) => {
              const val = field.type === 'number' 
                ? (e.target.value === '' ? null : parseFloat(e.target.value))
                : (e.target.value || null)
              updateFilter(filter.id, { value: val })
            }}
            placeholder="Valor inicial"
            className="w-32"
          />
          <span>e</span>
          <Input
            type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
            value={filter.value2 === null || filter.value2 === undefined ? '' : String(filter.value2)}
            onChange={(e) => {
              const val = field.type === 'number' 
                ? (e.target.value === '' ? null : parseFloat(e.target.value))
                : (e.target.value || null)
              updateFilter(filter.id, { value2: val })
            }}
            placeholder="Valor final"
            className="w-32"
          />
        </div>
      )
    }

    // Campo booleano
    if (field.type === 'boolean') {
      return (
        <select
          value={filter.value === null ? '' : String(filter.value)}
          onChange={(e) => updateFilter(filter.id, { value: e.target.value === 'true' })}
          className="flex h-10 w-32 rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">Selecione</option>
          <option value="true">Sim</option>
          <option value="false">Não</option>
        </select>
      )
    }

    // Campo enum (dropdown)
    if (field.type === 'enum') {
      // Para campos enum, podemos usar um input de texto ou um select se conhecermos os valores
      return (
        <Input
          type="text"
          value={filter.value === null || filter.value === undefined ? '' : String(filter.value)}
          onChange={(e) => updateFilter(filter.id, { value: e.target.value || null })}
          placeholder="Valor"
          className="w-48"
        />
      )
    }

    // Campos numéricos
    if (field.type === 'number') {
      return (
        <Input
          type="number"
          step="0.01"
          value={filter.value === null || filter.value === undefined ? '' : filter.value}
          onChange={(e) => {
            const val = e.target.value === '' ? null : parseFloat(e.target.value)
            updateFilter(filter.id, { value: isNaN(val as number) ? null : val })
          }}
          placeholder="Valor"
          className="w-32"
        />
      )
    }

    // Campos de data
    if (field.type === 'date') {
      return (
        <Input
          type="date"
          value={filter.value || ''}
          onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
          className="w-40"
        />
      )
    }

    // Campos de string (padrão)
    return (
      <Input
        type="text"
        value={filter.value === null || filter.value === undefined ? '' : String(filter.value)}
        onChange={(e) => updateFilter(filter.id, { value: e.target.value || null })}
        placeholder="Valor"
        className="w-48"
      />
    )
  }

  return (
    <div className="mb-4">
      <Button
        variant="outline"
        onClick={() => setShowFilters(!showFilters)}
        className="flex items-center gap-2 border-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/20 hover:border-violet-400 transition-all duration-200"
      >
        <Filter className="h-4 w-4 text-violet-600 dark:text-violet-400" />
        Filtros Avançados
        {filters.length > 0 && (
          <span className="ml-2 px-2 py-0.5 bg-gradient-to-r from-violet-600 to-violet-700 text-white rounded-full text-xs shadow-sm">
            {filters.length}
          </span>
        )}
      </Button>

      {showFilters && (
        <Card className="mt-4 border-t-4 border-t-violet-500 bg-gradient-to-br from-violet-50/30 to-white dark:from-violet-950/10 dark:to-background">
          <CardHeader className="bg-gradient-to-r from-violet-50/50 to-transparent dark:from-violet-950/20">
            <div className="flex items-center justify-between">
              <CardTitle className="text-violet-900 dark:text-violet-100">Filtros Avançados</CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-sm">Lógica:</span>
                <select
                  value={logic}
                  onChange={(e) => onLogicChange(e.target.value as 'AND' | 'OR')}
                  className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  <option value="AND">E (AND)</option>
                  <option value="OR">OU (OR)</option>
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loadingFields ? (
              <div className="text-center py-4 text-muted-foreground">Carregando campos...</div>
            ) : (
              <div className="space-y-3">
                {filters.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground">
                    Nenhum filtro adicionado. Clique em "Adicionar Filtro" para começar.
                  </div>
                ) : (
                  filters.map((filter) => {
                    const field = getSelectedField(filter.field)
                    const operators = getOperatorsForField(filter.field)
                    const selectedOperator = operators.find(op => op.value === filter.operator)

                    return (
                      <div key={filter.id} className="flex gap-2 items-start p-3 border rounded-lg">
                        <select
                          value={filter.field}
                          onChange={(e) => {
                            const newField = getSelectedField(e.target.value)
                            updateFilter(filter.id, {
                              field: e.target.value,
                              operator: newField?.operators[0]?.value || 'equals',
                              value: null,
                              value2: undefined
                            })
                          }}
                          className="flex h-10 w-48 rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                          {fields.map(f => (
                            <option key={f.field} value={f.field}>{f.label}</option>
                          ))}
                        </select>

                        <select
                          value={filter.operator}
                          onChange={(e) => updateFilter(filter.id, { operator: e.target.value, value2: undefined })}
                          className="flex h-10 w-48 rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                          {operators.map(op => (
                            <option key={op.value} value={op.value}>{op.label}</option>
                          ))}
                        </select>

                        {renderFilterValue(filter)}

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFilter(filter.id)}
                          className="h-10 w-10 p-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )
                  })
                )}

                <Button
                  variant="outline"
                  onClick={addFilter}
                  className="w-full flex items-center justify-center gap-2 border-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/20 hover:border-violet-400 transition-all duration-200"
                >
                  <Plus className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  Adicionar Filtro
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

