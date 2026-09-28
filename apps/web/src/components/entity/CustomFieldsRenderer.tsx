'use client'

import type { FieldDefinition } from '@crm/shared'
import { formatDate } from '@/lib/utils'

interface Props {
  fields: FieldDefinition[]
  values: Record<string, unknown>
  onChange?: (key: string, value: unknown) => void
  readOnly?: boolean
}

export function CustomFieldsRenderer({ fields, values, onChange, readOnly = false }: Props) {
  if (fields.length === 0) return null

  return (
    <div className="space-y-3">
      {fields.map(field => (
        <FieldInput
          key={field.id}
          field={field}
          value={values[field.key]}
          onChange={onChange ? (v) => onChange(field.key, v) : undefined}
          readOnly={readOnly}
        />
      ))}
    </div>
  )
}

function FieldInput({
  field,
  value,
  onChange,
  readOnly,
}: {
  field: FieldDefinition
  value: unknown
  onChange?: (value: unknown) => void
  readOnly?: boolean
}) {
  const inputClass = 'w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white disabled:bg-gray-50 disabled:text-gray-500'

  const renderInput = () => {
    switch (field.fieldType) {
      case 'select':
        return (
          <select
            value={String(value ?? '')}
            onChange={e => onChange?.(e.target.value || null)}
            disabled={readOnly}
            className={inputClass}
          >
            <option value="">— не выбрано —</option>
            {field.options?.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )

      case 'multiselect': {
        const selected = Array.isArray(value) ? value as string[] : []
        return (
          <div className="flex flex-wrap gap-1">
            {field.options?.map(opt => (
              <button
                key={opt.value}
                type="button"
                disabled={readOnly}
                onClick={() => {
                  const next = selected.includes(opt.value)
                    ? selected.filter(v => v !== opt.value)
                    : [...selected, opt.value]
                  onChange?.(next)
                }}
                className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                  selected.includes(opt.value)
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                } disabled:opacity-50`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )
      }

      case 'number':
        return (
          <input
            type="number"
            value={value != null ? String(value) : ''}
            onChange={e => onChange?.(e.target.value ? Number(e.target.value) : null)}
            disabled={readOnly}
            className={inputClass}
          />
        )

      case 'date':
        return (
          <input
            type="date"
            value={value ? String(value).slice(0, 10) : ''}
            onChange={e => onChange?.(e.target.value || null)}
            disabled={readOnly}
            className={inputClass}
          />
        )

      case 'checkbox':
        return (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={e => onChange?.(e.target.checked)}
              disabled={readOnly}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">{field.label}</span>
          </label>
        )

      case 'textarea':
        return (
          <textarea
            value={String(value ?? '')}
            onChange={e => onChange?.(e.target.value || null)}
            disabled={readOnly}
            rows={3}
            className={inputClass + ' resize-none'}
          />
        )

      default:
        return (
          <input
            type="text"
            value={String(value ?? '')}
            onChange={e => onChange?.(e.target.value || null)}
            disabled={readOnly}
            className={inputClass}
          />
        )
    }
  }

  if (field.fieldType === 'checkbox') return renderInput()

  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">
        {field.label}
        {field.required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {renderInput()}
    </div>
  )
}
