'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

interface Props {
  value: string[]
  onChange: (tags: string[]) => void
  suggestions?: string[]
  placeholder?: string
  disabled?: boolean
}

// Свободный ввод тегов чипами + автокомплит по уже существующим тегам (используется и для
// редактирования тегов сделки/контакта, и для мультиселект-фильтра в списках — в обоих случаях
// это просто "набор строк", различается только источник suggestions и что делает onChange).
export function TagInput({ value, onChange, suggestions = [], placeholder = 'Добавить тег...', disabled }: Props) {
  const [input, setInput] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)

  const add = (tag: string) => {
    const trimmed = tag.trim()
    if (trimmed && !value.includes(trimmed)) onChange([...value, trimmed])
    setInput('')
  }
  const remove = (tag: string) => onChange(value.filter(t => t !== tag))

  const matches = suggestions.filter(s => !value.includes(s) && s.toLowerCase().includes(input.toLowerCase()))

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 border border-gray-200 rounded-md focus-within:ring-1 focus-within:ring-blue-500">
        {value.map(tag => (
          <span key={tag} className="flex items-center gap-1 px-2 py-0.5 text-xs bg-blue-50 text-blue-700 rounded-full">
            {tag}
            {!disabled && (
              <button type="button" onClick={() => remove(tag)} className="hover:text-blue-900">
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
        {!disabled && (
          <input
            type="text"
            value={input}
            placeholder={value.length === 0 ? placeholder : ''}
            onChange={e => setInput(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(input) }
              else if (e.key === 'Backspace' && !input && value.length > 0) remove(value[value.length - 1])
            }}
            className="flex-1 min-w-[80px] text-sm outline-none"
          />
        )}
      </div>
      {showSuggestions && matches.length > 0 && (
        <div className="absolute z-10 mt-1 w-full max-h-40 overflow-y-auto bg-white border border-gray-200 rounded-md shadow-sm">
          {matches.map(tag => (
            <button
              key={tag}
              type="button"
              onMouseDown={e => { e.preventDefault(); add(tag) }}
              className="block w-full text-left px-2.5 py-1 text-sm text-gray-700 hover:bg-gray-50"
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
