import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'

type CustomFieldType = 'text' | 'number' | 'email' | 'date' | 'boolean' | 'select' | 'textarea' | 'file' | 'url'

interface CustomField {
  id: string
  field_label: string
  field_type: CustomFieldType
  field_name: string
  options?: string[]
  required: boolean
  default_value?: string
  relationship_target?: string
}

interface DynamicFormProps {
  fields: CustomField[]
  onSubmit: (data: Record<string, any>) => void | Promise<void>
  defaultValues?: Record<string, any>
  submitLabel?: string
  className?: string
  showSubmitButton?: boolean
  onChange?: (data: Record<string, any>) => void
}

export function DynamicForm({
  fields,
  onSubmit,
  defaultValues = {},
  submitLabel = 'Salvar',
  className = '',
  showSubmitButton = true,
  onChange,
}: DynamicFormProps) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      ...defaultValues,
      ...fields.reduce((acc, field) => {
        if (field.default_value) {
          acc[field.field_name] = field.default_value
        }
        return acc
      }, {} as Record<string, any>),
    },
  })

  // Watch all fields for onChange callback
  const watchedValues = watch()
  useEffect(() => {
    if (onChange) {
      onChange(watchedValues)
    }
  }, [watchedValues, onChange])

  const renderField = (field: CustomField) => {
    const fieldName = field.field_name
    const isRequired = field.required
    const error = errors[fieldName]

    switch (field.field_type) {
      case 'text':
      case 'email':
      case 'url':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={fieldName}>
              {field.field_label}
              {isRequired && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Input
              id={fieldName}
              type={field.field_type === 'email' ? 'email' : field.field_type === 'url' ? 'url' : 'text'}
              {...register(fieldName, {
                required: isRequired ? `${field.field_label} é obrigatório` : false,
              })}
              className={error ? 'border-red-500' : ''}
            />
            {error && (
              <p className="text-sm text-red-500">{error.message as string}</p>
            )}
          </div>
        )

      case 'number':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={fieldName}>
              {field.field_label}
              {isRequired && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Input
              id={fieldName}
              type="number"
              {...register(fieldName, {
                required: isRequired ? `${field.field_label} é obrigatório` : false,
                valueAsNumber: true,
              })}
              className={error ? 'border-red-500' : ''}
            />
            {error && (
              <p className="text-sm text-red-500">{error.message as string}</p>
            )}
          </div>
        )

      case 'date':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={fieldName}>
              {field.field_label}
              {isRequired && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Input
              id={fieldName}
              type="date"
              {...register(fieldName, {
                required: isRequired ? `${field.field_label} é obrigatório` : false,
              })}
              className={error ? 'border-red-500' : ''}
            />
            {error && (
              <p className="text-sm text-red-500">{error.message as string}</p>
            )}
          </div>
        )

      case 'textarea':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={fieldName}>
              {field.field_label}
              {isRequired && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Textarea
              id={fieldName}
              {...register(fieldName, {
                required: isRequired ? `${field.field_label} é obrigatório` : false,
              })}
              className={error ? 'border-red-500' : ''}
            />
            {error && (
              <p className="text-sm text-red-500">{error.message as string}</p>
            )}
          </div>
        )

      case 'boolean':
        return (
          <div key={field.id} className="space-y-2">
            <div className="flex items-center space-x-2">
              <Controller
                name={fieldName}
                control={control}
                rules={{
                  required: isRequired ? `${field.field_label} é obrigatório` : false,
                }}
                render={({ field: controllerField }) => (
                  <Checkbox
                    id={fieldName}
                    checked={controllerField.value || false}
                    onCheckedChange={controllerField.onChange}
                  />
                )}
              />
              <Label htmlFor={fieldName}>
                {field.field_label}
                {isRequired && <span className="text-red-500 ml-1">*</span>}
              </Label>
            </div>
            {error && (
              <p className="text-sm text-red-500">{error.message as string}</p>
            )}
          </div>
        )

      case 'select':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={fieldName}>
              {field.field_label}
              {isRequired && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Controller
              name={fieldName}
              control={control}
              rules={{
                required: isRequired ? `${field.field_label} é obrigatório` : false,
              }}
              render={({ field: controllerField }) => (
                <Select
                  value={controllerField.value || ''}
                  onValueChange={controllerField.onChange}
                >
                  <SelectTrigger className={error ? 'border-red-500' : ''}>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options?.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {error && (
              <p className="text-sm text-red-500">{error.message as string}</p>
            )}
          </div>
        )

      case 'file':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={fieldName}>
              {field.field_label}
              {isRequired && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Input
              id={fieldName}
              type="file"
              {...register(fieldName, {
                required: isRequired ? `${field.field_label} é obrigatório` : false,
              })}
              className={error ? 'border-red-500' : ''}
            />
            {error && (
              <p className="text-sm text-red-500">{error.message as string}</p>
            )}
          </div>
        )

      default:
        return null
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className={`space-y-4 ${className}`}
    >
      {fields.map((field) => renderField(field))}
      {showSubmitButton && (
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
          >
            {isSubmitting ? 'Salvando...' : submitLabel}
          </button>
        </div>
      )}
    </form>
  )
}

