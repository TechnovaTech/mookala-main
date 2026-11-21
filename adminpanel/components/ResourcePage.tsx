'use client'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Download, Eye, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import AdminShell from './AdminShell'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Modal,
  NoticeBar,
  Spinner,
  api,
  formatDate,
  formatMoney,
  inputClass,
  type Notice,
} from './ui'
import { getResource } from '@/lib/resources'
import { MATERIAL_TYPES, normaliseMaterials, type FieldDef, type Material, type Option, type ResourceDef } from '@/lib/resource-types'

/**
 * A complete management screen for one resource definition: searchable and
 * filterable list, status tabs with counts, create and edit forms, a detail
 * view with internal notes and change history, status changes with a reason,
 * delete with a reason, and CSV export.
 *
 * The list can be opened pre-filtered from a link: `?q=` (search), `?status=`,
 * `?f_<field key>=` (any filter field) and `?id=` (opens that record) are read
 * from the address once, when the screen loads.
 *
 *   export default function Page() { return <ResourcePage resource="coupons" /> }
 */

type Item = Record<string, any>

/**
 * `inputClass` without its full width. Adding `w-auto` next to `w-full` does
 * not work: both are in the stylesheet and `w-full` wins.
 */
const autoWidthInput = inputClass.replace('w-full ', 'w-auto max-w-full ')

function displayValue(field: FieldDef, item: Item, compact = false): React.ReactNode {
  const value = item[field.key]
  // Removed on the server because this admin's role may not see it.
  if (Array.isArray(item._hiddenFields) && item._hiddenFields.includes(field.key)) {
    return <span className="text-gray-400 italic">Hidden for your role</span>
  }
  if (field.type === 'ref') return item._refs?.[field.key] || (value ? String(value) : '—')
  if (value === null || value === undefined || value === '') return '—'

  if (field.type === 'materials') {
    const list = normaliseMaterials(value)
    if (list.length === 0) return '—'
    if (compact) return list.length === 1 ? '1 material' : `${list.length} materials`
    return (
      <ol className="space-y-1.5 list-decimal list-inside" data-materials={field.key}>
        {list.map((entry, index) => {
          const kind = MATERIAL_TYPES.find((t) => t.value === entry.type)
          return (
            <li key={index} className="break-words">
              <Badge tone={kind?.tone || 'gray'}>{kind?.label || entry.type}</Badge>{' '}
              {/^https?:\/\//i.test(entry.url) ? (
                <a href={entry.url} target="_blank" rel="noopener noreferrer" className="text-teal underline">
                  {entry.title || entry.url}
                </a>
              ) : (
                entry.title || entry.url
              )}
              {entry.title && <span className="block text-xs text-gray-500 break-all pl-5">{entry.url}</span>}
            </li>
          )
        })}
      </ol>
    )
  }

  switch (field.type) {
    case 'money':
      return formatMoney(value)
    case 'percent':
      return `${value}%`
    case 'boolean':
      return value ? 'Yes' : 'No'
    case 'date':
      return formatDate(value)
    case 'datetime':
      return formatDate(value, true)
    case 'select': {
      const option = field.options?.find((o) => o.value === value)
      if (!option) return String(value)
      return option.tone ? <Badge tone={option.tone}>{option.label}</Badge> : option.label
    }
    case 'multiselect':
      return (Array.isArray(value) ? value : [])
        .map((v: string) => field.options?.find((o) => o.value === v)?.label || v)
        .join(', ') || '—'
    case 'tags':
      return (Array.isArray(value) ? value : []).join(', ') || '—'
    case 'url':
      return (
        <a href={String(value)} target="_blank" rel="noopener noreferrer" className="text-teal underline break-all">
          {String(value)}
        </a>
      )
    default:
      return String(value)
  }
}

function toInputValue(field: FieldDef, value: any): any {
  if (value === null || value === undefined) {
    if (field.type === 'boolean') return false
    if (field.type === 'multiselect' || field.type === 'materials') return []
    return ''
  }
  if (field.type === 'materials') return normaliseMaterials(value)
  if (field.type === 'date' || field.type === 'datetime') {
    // A stored value that is not a date must not crash the edit form.
    if (Number.isNaN(new Date(value).getTime())) return ''
  }
  if (field.type === 'date') return new Date(value).toISOString().slice(0, 10)
  if (field.type === 'datetime') {
    const date = new Date(value)
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    return local.toISOString().slice(0, 16)
  }
  if (field.type === 'tags') return Array.isArray(value) ? value.join(', ') : String(value)
  return value
}

/** The problem with one form value, or '' when it can be sent. The server checks everything again. */
function fieldProblem(field: FieldDef, value: any): string {
  const empty =
    value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
  if (empty) {
    if (field.type === 'boolean') return ''
    return field.required && field.default === undefined ? `${field.label} is required.` : ''
  }
  switch (field.type) {
    case 'number':
    case 'money':
    case 'percent': {
      const number = parseFloat(String(value))
      if (!Number.isFinite(number)) return `${field.label} must be a number.`
      if ((field.type === 'money' || field.type === 'percent') && number < 0) return `${field.label} cannot be negative.`
      if (field.type === 'percent' && number > 100) return `${field.label} must be between 0 and 100.`
      if (field.min !== undefined && number < field.min) return `${field.label} must be at least ${field.min}.`
      if (field.max !== undefined && number > field.max) return `${field.label} must be at most ${field.max}.`
      return ''
    }
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim()) ? '' : `${field.label} is not a valid email address.`
    case 'phone':
      return /^\+?\d{7,15}$/.test(String(value).replace(/[\s\-()]/g, ''))
        ? ''
        : `${field.label} is not a valid phone number (7 to 15 digits).`
    case 'url':
      return /^https?:\/\/\S+$/i.test(String(value).trim()) ? '' : `${field.label} must start with http:// or https://`
    case 'materials': {
      const list = normaliseMaterials(value)
      for (let i = 0; i < list.length; i++) {
        if (!list[i].title.trim()) return `Material ${i + 1} needs a title.`
        if (!/^https?:\/\/\S+$/i.test(list[i].url.trim())) return `Material ${i + 1}: the link must start with http:// or https://`
      }
      return ''
    }
    default:
      return ''
  }
}

/**
 * Picks a record of another resource. Shows the first matches and searches the
 * server as the admin types, so it works however many records there are.
 */
function RefPicker({
  id,
  field,
  value,
  knownLabel,
  onChange,
  invalid = false,
  placeholder,
  ariaLabel,
  className = '',
}: {
  id: string
  field: FieldDef
  value: string
  /** The display text of `value` when the caller already has it. */
  knownLabel?: string | null
  onChange: (value: string, label: string) => void
  invalid?: boolean
  placeholder?: string
  ariaLabel?: string
  className?: string
}) {
  const PAGE = 20
  const [text, setText] = useState('')
  const [label, setLabel] = useState('')
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<Option[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState('')
  const [active, setActive] = useState(-1)
  const request = useRef(0)
  /** The record picked from the list, whose display text is therefore already known. */
  const picked = useRef<Option | null>(null)
  const resource = field.ref!.resource
  const labelKey = field.ref!.labelKey
  const filterKey = JSON.stringify(field.ref!.filter || {})

  // Show the name of the chosen record, looking it up when only its id is known.
  useEffect(() => {
    if (!value) {
      setLabel('')
      return
    }
    if (knownLabel) {
      setLabel(knownLabel)
      return
    }
    if (picked.current?.value === value) {
      setLabel(picked.current.label)
      return
    }
    let cancelled = false
    api<any>(`/api/admin/r/${resource}/${encodeURIComponent(value)}`)
      .then((data) => {
        if (!cancelled) setLabel(String(data.item?.[labelKey] ?? value))
      })
      .catch(() => {
        if (!cancelled) setLabel(value)
      })
    return () => {
      cancelled = true
    }
  }, [value, knownLabel, resource, labelKey])

  const search = useCallback(
    async (term: string) => {
      const ticket = ++request.current
      setLoading(true)
      setFailed('')
      try {
        const params = new URLSearchParams({ limit: String(PAGE), sort: labelKey, dir: 'asc', qk: labelKey })
        if (term) params.set('q', term)
        for (const [key, entry] of Object.entries(JSON.parse(filterKey) as Record<string, string>)) params.set(key, entry)
        const data = await api<any>(`/api/admin/r/${resource}?` + params.toString())
        if (ticket !== request.current) return
        setOptions((data.items || []).map((item: Item) => ({ value: item._id, label: String(item[labelKey] ?? item._id) })))
        setTotal(data.total || 0)
        setActive(-1)
      } catch (error: any) {
        if (ticket !== request.current) return
        setOptions([])
        setTotal(0)
        setFailed(error.message || 'Could not load the choices.')
      } finally {
        if (ticket === request.current) setLoading(false)
      }
    },
    [resource, labelKey, filterKey]
  )

  // Search shortly after the admin stops typing.
  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => search(text.trim()), text ? 250 : 0)
    return () => clearTimeout(timer)
  }, [open, text, search])

  const choose = (option: Option) => {
    picked.current = option
    setLabel(option.label)
    onChange(option.value, option.label)
    setOpen(false)
    setText('')
  }

  const listId = id + '-options'

  return (
    <div className={'relative ' + className}>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={invalid || undefined}
        autoComplete="off"
        data-ref-value={value || ''}
        value={open ? text : label}
        placeholder={placeholder || (value ? label : 'Type to search...')}
        onFocus={() => {
          setText('')
          setOpen(true)
        }}
        onChange={(e) => {
          setText(e.target.value)
          setOpen(true)
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) {
            e.stopPropagation()
            setOpen(false)
          } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
            setActive((current) => Math.min(options.length - 1, current + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((current) => Math.max(0, current - 1))
          } else if (e.key === 'Enter' && open) {
            e.preventDefault()
            if (options[active]) choose(options[active])
          }
        }}
        className={inputClass + ' pr-9' + (invalid ? ' border-red-500' : '')}
      />
      {value && (
        <button
          type="button"
          aria-label={`Clear ${field.label}`}
          onClick={() => {
            setLabel('')
            setText('')
            onChange('', '')
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-gray-500 hover:bg-gray-100"
        >
          <X size={14} />
        </button>
      )}
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={`${field.label} choices`}
          className="absolute z-10 left-0 right-0 min-w-[14rem] mt-1 max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg text-sm"
        >
          {loading && options.length === 0 && <li className="px-3 py-2 text-gray-500">Searching...</li>}
          {failed && <li className="px-3 py-2 text-red-600">{failed}</li>}
          {!loading && !failed && options.length === 0 && (
            <li className="px-3 py-2 text-gray-500">{text.trim() ? `Nothing matches "${text.trim()}".` : 'There is nothing to choose from yet.'}</li>
          )}
          {options.map((option, index) => (
            <li
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              data-value={option.value}
              // Keep the focus in the input so the list is not closed before the click lands.
              onMouseDown={(e) => {
                e.preventDefault()
                choose(option)
              }}
              className={`px-3 py-2 cursor-pointer ${index === active ? 'bg-gray-100' : 'hover:bg-gray-50'} ${
                option.value === value ? 'font-medium text-deep-blue' : 'text-gray-800'
              }`}
            >
              {option.label}
            </li>
          ))}
          {total > options.length && (
            <li className="px-3 py-2 text-xs text-gray-500 border-t border-gray-100" data-ref-more>
              Showing {options.length} of {total}. Type to search the rest.
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

/** Ordered list of learning materials: each has a type, a title and a link. */
function MaterialsInput({ id, value, onChange }: { id: string; value: Material[]; onChange: (value: Material[]) => void }) {
  const list = Array.isArray(value) ? value : []
  const update = (index: number, patch: Partial<Material>) =>
    onChange(list.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)))
  const move = (index: number, by: number) => {
    const next = list.slice()
    const [entry] = next.splice(index, 1)
    next.splice(index + by, 0, entry)
    onChange(next)
  }

  return (
    <div id={id} className="space-y-2">
      {list.length === 0 && <p className="text-sm text-gray-500">No materials added.</p>}
      {list.map((entry, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg p-2" data-material-row={index}>
          <span className="text-xs text-gray-500 w-5 text-right">{index + 1}.</span>
          <select
            id={`${id}-${index}-type`}
            aria-label={`Material ${index + 1} type`}
            value={MATERIAL_TYPES.some((t) => t.value === entry.type) ? entry.type : 'link'}
            onChange={(e) => update(index, { type: e.target.value })}
            className={autoWidthInput}
          >
            {MATERIAL_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            id={`${id}-${index}-title`}
            type="text"
            aria-label={`Material ${index + 1} title`}
            placeholder="Title, e.g. Lesson 1: Posture"
            value={entry.title}
            maxLength={200}
            onChange={(e) => update(index, { title: e.target.value })}
            className={inputClass + ' flex-1 min-w-[10rem]'}
          />
          <input
            id={`${id}-${index}-url`}
            type="url"
            aria-label={`Material ${index + 1} link`}
            placeholder="https://..."
            value={entry.url}
            onChange={(e) => update(index, { url: e.target.value })}
            className={inputClass + ' flex-1 min-w-[12rem]'}
          />
          <button
            type="button"
            aria-label={`Move material ${index + 1} up`}
            disabled={index === 0}
            onClick={() => move(index, -1)}
            className="p-2 rounded-lg text-gray-600 hover:bg-gray-200 disabled:text-gray-300 disabled:hover:bg-transparent"
          >
            <ArrowUp size={16} />
          </button>
          <button
            type="button"
            aria-label={`Move material ${index + 1} down`}
            disabled={index === list.length - 1}
            onClick={() => move(index, 1)}
            className="p-2 rounded-lg text-gray-600 hover:bg-gray-200 disabled:text-gray-300 disabled:hover:bg-transparent"
          >
            <ArrowDown size={16} />
          </button>
          <button
            type="button"
            aria-label={`Remove material ${index + 1}`}
            onClick={() => onChange(list.filter((_, i) => i !== index))}
            className="p-2 rounded-lg text-red-600 hover:bg-red-50"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <Button type="button" variant="secondary" onClick={() => onChange([...list, { title: '', type: 'video', url: '' }])}>
        <Plus size={16} />
        Add material
      </Button>
    </div>
  )
}

function FieldInput({
  field,
  value,
  onChange,
  refLabel,
  invalid,
}: {
  field: FieldDef
  value: any
  onChange: (value: any) => void
  /** Display text of the current value of a `ref` field, when known. */
  refLabel?: string | null
  invalid?: boolean
}) {
  const id = 'field-' + field.key
  const common = {
    id,
    name: field.key,
    required: field.required,
    placeholder: field.placeholder,
    'aria-invalid': invalid || undefined,
    'aria-describedby': invalid ? id + '-error' : undefined,
  }

  switch (field.type) {
    case 'textarea':
      return <textarea {...common} rows={4} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />
    case 'select':
      return (
        <select {...common} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
          <option value="">{field.required ? 'Select...' : 'None'}</option>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )
    case 'ref':
      return (
        <RefPicker
          id={id}
          field={field}
          value={value ? String(value) : ''}
          knownLabel={refLabel}
          onChange={(next) => onChange(next)}
          invalid={invalid}
          placeholder={field.placeholder}
        />
      )
    case 'materials':
      return <MaterialsInput id={id} value={normaliseMaterials(value)} onChange={onChange} />
    case 'multiselect':
      return (
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {field.options?.map((option) => {
            const list: string[] = Array.isArray(value) ? value : []
            const checked = list.includes(option.value)
            return (
              <label key={option.value} className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  id={`${id}-${option.value}`}
                  checked={checked}
                  onChange={() => onChange(checked ? list.filter((v) => v !== option.value) : [...list, option.value])}
                />
                {option.label}
              </label>
            )
          })}
        </div>
      )
    case 'boolean':
      return (
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" id={id} checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
          Yes
        </label>
      )
    case 'number':
    case 'money':
    case 'percent':
      return (
        <input
          {...common}
          type="number"
          step="any"
          min={field.type === 'money' || field.type === 'percent' ? 0 : field.min}
          max={field.type === 'percent' ? 100 : field.max}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      )
    case 'date':
      return <input {...common} type="date" value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />
    case 'datetime':
      return <input {...common} type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />
    case 'email':
      return <input {...common} type="email" value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />
    case 'phone':
      return <input {...common} type="tel" value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />
    case 'url':
      return <input {...common} type="url" value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />
    case 'tags':
      return (
        <input
          {...common}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
          placeholder={field.placeholder || 'Separate values with commas'}
        />
      )
    default:
      return <input {...common} type="text" value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />
  }
}

export default function ResourcePage({
  resource,
  children,
  detailActions,
}: {
  resource: string
  /** Optional content shown above the list, e.g. a short explanation. */
  children?: React.ReactNode
  /** Optional extra content for the detail view of a record, e.g. a link to a printable version. */
  detailActions?: (item: Record<string, any>) => React.ReactNode
}) {
  const def = getResource(resource) as ResourceDef | undefined

  const [items, setItems] = useState<Item[]>([])
  const [total, setTotal] = useState(0)
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})
  const [canManage, setCanManage] = useState(false)
  // Whether the admin holds the module's "approve" permission. Status values in
  // `approvalRequired` are refused by the server without it.
  const [canApprove, setCanApprove] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)

  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [page, setPage] = useState(1)
  const limit = 25

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Item | null>(null)
  const [form, setForm] = useState<Record<string, any>>({})
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [editReason, setEditReason] = useState('')
  const [detailNotice, setDetailNotice] = useState<Notice>(null)
  /** False until the filters in the address have been read, so the first load already uses them. */
  const [ready, setReady] = useState(false)
  const loadTicket = useRef(0)

  const [detail, setDetail] = useState<{ item: Item; history: Item[] } | null>(null)
  const [note, setNote] = useState('')
  const [pendingStatus, setPendingStatus] = useState<{ item: Item; status: Option } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Item | null>(null)
  const [busy, setBusy] = useState(false)

  /** Display text of the records chosen in reference filters, keyed by field. */
  const [filterLabels, setFilterLabels] = useState<Record<string, string>>({})

  const listFields = useMemo(() => (def ? def.fields.filter((f) => f.list) : []), [def])
  const formFields = useMemo(() => (def ? def.fields.filter((f) => f.form !== false && !f.readOnly) : []), [def])
  const filterFields = useMemo(() => (def ? def.fields.filter((f) => f.filter) : []), [def])

  const queryString = useCallback(
    (extra: Record<string, string> = {}) => {
      const params = new URLSearchParams()
      if (query) params.set('q', query)
      if (status) params.set('status', status)
      for (const [key, value] of Object.entries(filters)) if (value) params.set('f_' + key, value)
      for (const [key, value] of Object.entries(extra)) params.set(key, value)
      return params.toString()
    },
    [query, status, filters]
  )

  const load = useCallback(async () => {
    if (!def || !ready) return
    // Only the answer to the latest request is shown, so a slow earlier
    // answer cannot replace the list the admin is now looking at.
    const ticket = ++loadTicket.current
    setLoading(true)
    try {
      const data = await api<any>(`/api/admin/r/${def.name}?` + queryString({ page: String(page), limit: String(limit) }))
      if (ticket !== loadTicket.current) return
      const count = data.total || 0
      const lastPage = Math.max(1, Math.ceil(count / limit))
      if (page > lastPage) {
        // The page no longer exists, e.g. its last record was just deleted.
        setPage(lastPage)
        return
      }
      setItems(data.items || [])
      setTotal(count)
      setStatusCounts(data.statusCounts || {})
      setCanManage(Boolean(data.canManage))
      setCanApprove(Boolean(data.canApprove))
    } catch (error: any) {
      if (ticket !== loadTicket.current) return
      setNotice({ type: 'error', text: error.message || 'Could not load the records.' })
    } finally {
      if (ticket === loadTicket.current) setLoading(false)
    }
  }, [def, ready, page, queryString])

  useEffect(() => {
    load()
  }, [load])

  // Search runs shortly after the admin stops typing.
  useEffect(() => {
    if (search.trim() === query) return
    const timer = setTimeout(() => {
      setPage(1)
      setQuery(search.trim())
    }, 350)
    return () => clearTimeout(timer)
    // `query` is left out on purpose: it only changes as a result of this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  // Filters given in the address (?q=, ?status=, ?f_<field>=, ?id=) are applied once, on first load.
  useEffect(() => {
    if (!def) return
    const params = new URLSearchParams(window.location.search)
    const q = (params.get('q') || '').trim().slice(0, 100)
    if (q) {
      setSearch(q)
      setQuery(q)
    }
    const wantedStatus = params.get('status') || ''
    if (wantedStatus && def.status?.options.some((o) => o.value === wantedStatus)) setStatus(wantedStatus)
    const preset: Record<string, string> = {}
    for (const field of def.fields.filter((f) => f.filter)) {
      const value = params.get('f_' + field.key)
      if (!value) continue
      if (field.type === 'boolean' && value !== 'true' && value !== 'false') continue
      if (field.type === 'select' && field.options && !field.options.some((o) => o.value === value)) continue
      preset[field.key] = value.slice(0, 100)
    }
    if (Object.keys(preset).length) setFilters(preset)
    setReady(true)

    const id = params.get('id')
    if (id && /^[a-f0-9]{24}$/i.test(id)) {
      api<any>(`/api/admin/r/${def.name}/${id}`)
        .then((data) => {
          setDetail({ item: data.item, history: data.history || [] })
          setNote('')
          setDetailNotice(null)
        })
        .catch((error: any) => setNotice({ type: 'error', text: error.message || 'Could not open the record.' }))
    }
  }, [def])

  if (!def) {
    return (
      <AdminShell title="Not found">
        <EmptyState title="This screen is not configured." hint={`No resource named "${resource}" is registered.`} />
      </AdminShell>
    )
  }

  const statusOption = (value: string) => def.status?.options.find((o) => o.value === value)

  const openCreate = () => {
    const initial: Record<string, any> = {}
    for (const field of formFields) initial[field.key] = toInputValue(field, field.default ?? null)
    setForm(initial)
    setEditing(null)
    setFormError('')
    setFieldErrors({})
    setEditReason('')
    setFormOpen(true)
  }

  const openEdit = (item: Item) => {
    const initial: Record<string, any> = {}
    // A record saved before a field existed takes that field's default, as a
    // new record would; otherwise an unticked box would silently store "No".
    for (const field of formFields) {
      initial[field.key] = toInputValue(field, item[field.key] === undefined ? field.default ?? null : item[field.key])
    }
    setForm(initial)
    setEditing(item)
    setFormError('')
    setFieldErrors({})
    setEditReason('')
    // The form replaces the detail view; two dialogs are never stacked.
    setDetail(null)
    setFormOpen(true)
  }

  const submitForm = async (event: React.FormEvent) => {
    event.preventDefault()
    if (saving) return

    const problems: Record<string, string> = {}
    for (const field of formFields) {
      const problem = fieldProblem(field, form[field.key])
      if (problem) problems[field.key] = problem
    }
    setFieldErrors(problems)
    const firstBad = formFields.find((field) => problems[field.key])
    if (firstBad) {
      const count = Object.keys(problems).length
      setFormError(count === 1 ? problems[firstBad.key] : `${count} fields need attention. They are marked below.`)
      document.getElementById('field-' + firstBad.key)?.focus?.()
      return
    }

    setSaving(true)
    setFormError('')
    try {
      if (editing) {
        const reason = editReason.trim()
        const result = await api<any>(`/api/admin/r/${def.name}/${editing._id}`, {
          method: 'PUT',
          body: reason ? { ...form, _reason: reason } : form,
        })
        setNotice(
          result?.unchanged
            ? { type: 'info', text: 'Nothing was changed.' }
            : { type: 'success', text: `${def.singular} updated.` }
        )
      } else {
        await api(`/api/admin/r/${def.name}`, { method: 'POST', body: form })
        setNotice({ type: 'success', text: `${def.singular} added.` })
      }
      setFormOpen(false)
      setDetail(null)
      await load()
    } catch (error: any) {
      setFormError(error.message || 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  const openDetail = async (item: Item, keepNotice = false) => {
    try {
      const data = await api<any>(`/api/admin/r/${def.name}/${item._id}`)
      setDetail({ item: data.item, history: data.history || [] })
      setNote('')
      if (!keepNotice) setDetailNotice(null)
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || 'Could not open the record.' })
    }
  }

  const changeStatus = async (reason: string) => {
    if (!pendingStatus) return
    setBusy(true)
    try {
      const data = await api<any>(`/api/admin/r/${def.name}/${pendingStatus.item._id}`, {
        method: 'PATCH',
        body: { status: pendingStatus.status.value, reason },
      })
      const applied = statusOption(data.status)?.label || data.status
      const done: Notice = { type: 'success', text: `${def.singular} is now "${applied}".` }
      setPendingStatus(null)
      // While the detail view is open it covers the page, so the result is shown inside it.
      if (detail) {
        setDetailNotice(done)
        await openDetail(pendingStatus.item, true)
      } else {
        setNotice(done)
      }
      await load()
    } catch (error: any) {
      const failed: Notice = { type: 'error', text: error.message || 'Could not change the status.' }
      if (detail) setDetailNotice(failed)
      else setNotice(failed)
      setPendingStatus(null)
    } finally {
      setBusy(false)
    }
  }

  const addNote = async () => {
    if (!detail || !note.trim()) return
    setBusy(true)
    try {
      await api(`/api/admin/r/${def.name}/${detail.item._id}`, { method: 'PATCH', body: { note } })
      await openDetail(detail.item)
    } catch (error: any) {
      setDetailNotice({ type: 'error', text: error.message || 'Could not add the note.' })
    } finally {
      setBusy(false)
    }
  }

  const remove = async (reason: string) => {
    if (!pendingDelete) return
    setBusy(true)
    try {
      await api(`/api/admin/r/${def.name}/${pendingDelete._id}`, { method: 'DELETE', body: { reason } })
      setNotice({ type: 'success', text: `${def.singular} deleted.` })
      setPendingDelete(null)
      setDetail(null)
      await load()
    } catch (error: any) {
      const failed: Notice = { type: 'error', text: error.message || 'Could not delete.' }
      if (detail) setDetailNotice(failed)
      else setNotice(failed)
      setPendingDelete(null)
    } finally {
      setBusy(false)
    }
  }

  /** Change history reads better with the field's label than with its database key. */
  const historyLabel = (key: string) =>
    def.fields.find((f) => f.key === key)?.label || (def.status?.key === key ? 'Status' : key)
  const historyValue = (value: any) => {
    if (value === null || value === undefined || value === '') return 'empty'
    if (Array.isArray(value) && value.length > 0 && value.every((v) => v && typeof v === 'object')) {
      return `${value.length} ${value.length === 1 ? 'entry' : 'entries'}`
    }
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) return formatDate(value, true)
    const text = JSON.stringify(value)
    return text.length > 120 ? text.slice(0, 117) + '..."' : text
  }

  const pages = Math.max(1, Math.ceil(total / limit))
  const allCount = Object.values(statusCounts).reduce((sum, count) => sum + count, 0)
  const hasFilters = Boolean(query || status || Object.values(filters).some(Boolean))

  return (
    <AdminShell
      title={def.title}
      subtitle={def.subtitle}
      actions={
        <>
          <a
            href={`/api/admin/r/${def.name}?` + queryString({ export: 'csv' })}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
          >
            <Download size={16} />
            Export CSV
          </a>
          {canManage && def.canCreate !== false && (
            <Button onClick={openCreate}>
              <Plus size={16} />
              Add {def.singular.toLowerCase()}
            </Button>
          )}
        </>
      }
    >
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      {def.sourceNote && <NoticeBar notice={{ type: 'info', text: def.sourceNote }} />}
      {children}

      <Card>
        <div className="p-4 border-b border-gray-200 space-y-3">
          {def.status && (
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
              <button
                role="tab"
                aria-selected={status === ''}
                onClick={() => {
                  setStatus('')
                  setPage(1)
                }}
                className={`px-3 py-1.5 rounded-full text-sm ${status === '' ? 'bg-deep-blue text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                All ({allCount})
              </button>
              {def.status.options.map((option) => (
                <button
                  key={option.value}
                  role="tab"
                  aria-selected={status === option.value}
                  onClick={() => {
                    setStatus(option.value)
                    setPage(1)
                  }}
                  className={`px-3 py-1.5 rounded-full text-sm ${
                    status === option.value ? 'bg-deep-blue text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {option.label} ({statusCounts[option.value] || 0})
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[14rem]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                id={`${def.name}-search`}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${def.title.toLowerCase()}...`}
                aria-label={`Search ${def.title}`}
                className={inputClass + ' pl-9'}
              />
            </div>
            {filterFields.map((field) => {
              const options: Option[] =
                field.type === 'boolean'
                  ? [
                      { value: 'true', label: 'Yes' },
                      { value: 'false', label: 'No' },
                    ]
                  : field.options || []
              if (field.type === 'ref' && field.ref) {
                return (
                  <RefPicker
                    key={field.key}
                    id={`${def.name}-filter-${field.key}`}
                    field={field}
                    value={filters[field.key] || ''}
                    knownLabel={filterLabels[field.key]}
                    ariaLabel={`Filter by ${field.label}`}
                    placeholder={`${field.label}: all`}
                    className="w-56"
                    onChange={(value, label) => {
                      setFilterLabels((current) => ({ ...current, [field.key]: label }))
                      setFilters((current) => ({ ...current, [field.key]: value }))
                      setPage(1)
                    }}
                  />
                )
              }
              return (
                <select
                  key={field.key}
                  id={`${def.name}-filter-${field.key}`}
                  aria-label={`Filter by ${field.label}`}
                  value={filters[field.key] || ''}
                  onChange={(e) => {
                    const value = e.target.value
                    setFilters((current) => ({ ...current, [field.key]: value }))
                    setPage(1)
                  }}
                  className={autoWidthInput}
                >
                  <option value="">{field.label}: all</option>
                  {options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )
            })}
          </div>
        </div>

        {hasFilters && (
          <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-gray-200 bg-gray-50 text-sm text-gray-600">
            <span>The list is filtered. Export CSV downloads the filtered records.</span>
            <button
              type="button"
              onClick={() => {
                setSearch('')
                setQuery('')
                setStatus('')
                setFilters({})
                setFilterLabels({})
                setPage(1)
              }}
              className="text-teal underline whitespace-nowrap"
            >
              Clear filters
            </button>
          </div>
        )}

        {loading || !ready ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'No records match these filters.' : def.emptyHint || 'Nothing here yet.'}
            hint={hasFilters ? 'Clear the search or filters to see everything.' : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  {listFields.map((field) => (
                    <th key={field.key} scope="col" className="px-4 py-3 font-medium whitespace-nowrap">
                      {field.label}
                    </th>
                  ))}
                  {def.status && (
                    <th scope="col" className="px-4 py-3 font-medium">
                      Status
                    </th>
                  )}
                  <th scope="col" className="px-4 py-3 font-medium whitespace-nowrap">
                    Created
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item) => {
                  const current = def.status ? statusOption(item[def.status.key]) : null
                  return (
                    <tr key={item._id} className="hover:bg-gray-50">
                      {listFields.map((field) => (
                        <td key={field.key} className="px-4 py-3 text-gray-800 max-w-xs truncate">
                          {displayValue(field, item, true)}
                        </td>
                      ))}
                      {def.status && (
                        <td className="px-4 py-3">
                          <Badge tone={current?.tone || 'gray'}>{current?.label || item[def.status.key] || '—'}</Badge>
                        </td>
                      )}
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(item.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => openDetail(item)}
                            aria-label={`View ${item[def.labelKey] || 'record'}`}
                            className="p-2 rounded-lg text-gray-600 hover:bg-gray-100"
                          >
                            <Eye size={16} />
                          </button>
                          {canManage && def.canEdit !== false && (
                            <button
                              onClick={() => openEdit(item)}
                              aria-label={`Edit ${item[def.labelKey] || 'record'}`}
                              className="p-2 rounded-lg text-gray-600 hover:bg-gray-100"
                            >
                              <Pencil size={16} />
                            </button>
                          )}
                          {canManage && def.canDelete !== false && (
                            <button
                              onClick={() => setPendingDelete(item)}
                              aria-label={`Delete ${item[def.labelKey] || 'record'}`}
                              className="p-2 rounded-lg text-red-600 hover:bg-red-50"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 text-sm text-gray-600">
            <span>
              Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <span>
                Page {page} of {pages}
              </span>
              <Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Create / edit */}
      <Modal
        open={formOpen}
        wide
        title={editing ? `Edit ${def.singular.toLowerCase()}` : `Add ${def.singular.toLowerCase()}`}
        onClose={() => setFormOpen(false)}
      >
        {/* Checked in submitForm so every field type reports its problem the same way, next to the field. */}
        <form onSubmit={submitForm} noValidate className="space-y-4" id={`${def.name}-form`}>
          {formError && <NoticeBar notice={{ type: 'error', text: formError }} />}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {formFields.map((field) => (
              <div
                key={field.key}
                className={field.type === 'textarea' || field.type === 'multiselect' || field.type === 'materials' ? 'sm:col-span-2' : ''}
              >
                <label htmlFor={'field-' + field.key} className="block text-sm font-medium text-gray-700 mb-1">
                  {field.label}
                  {field.required && <span className="text-red-600"> *</span>}
                </label>
                <FieldInput
                  field={field}
                  value={form[field.key] ?? ''}
                  onChange={(value) => {
                    setForm((current) => ({ ...current, [field.key]: value }))
                    if (fieldErrors[field.key]) setFieldErrors((current) => ({ ...current, [field.key]: '' }))
                  }}
                  refLabel={editing && editing[field.key] === form[field.key] ? editing._refs?.[field.key] : undefined}
                  invalid={Boolean(fieldErrors[field.key])}
                />
                {fieldErrors[field.key] && (
                  <p id={`field-${field.key}-error`} className="text-xs text-red-600 mt-1" data-field-error={field.key}>
                    {fieldErrors[field.key]}
                  </p>
                )}
                {field.help && <p className="text-xs text-gray-500 mt-1">{field.help}</p>}
              </div>
            ))}
            {/* Screens with their own reason field (the finance rule tables) keep using that one. */}
            {editing && !formFields.some((field) => field.key === 'changeReason') && (
              <div className="sm:col-span-2">
                <label htmlFor={`${def.name}-edit-reason`} className="block text-sm font-medium text-gray-700 mb-1">
                  Reason for this change <span className="font-normal text-gray-500">(optional unless the screen asks for it)</span>
                </label>
                <input
                  id={`${def.name}-edit-reason`}
                  type="text"
                  value={editReason}
                  maxLength={500}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="This is saved in the activity log"
                  className={inputClass}
                />
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? 'Save changes' : `Add ${def.singular.toLowerCase()}`}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Detail */}
      <Modal
        open={Boolean(detail)}
        wide
        title={detail ? String(detail.item[def.labelKey] || def.singular) : def.singular}
        onClose={() => {
          // Escape reaches every open dialog; a confirmation on top is closed first, on its own.
          if (!pendingStatus && !pendingDelete) setDetail(null)
        }}
        footer={
          detail && canManage ? (
            <>
              {def.canDelete !== false && (
                <Button variant="danger" onClick={() => setPendingDelete(detail.item)}>
                  Delete
                </Button>
              )}
              {def.canEdit !== false && <Button onClick={() => openEdit(detail.item)}>Edit</Button>}
            </>
          ) : undefined
        }
      >
        {detail && (
          <div className="space-y-6">
            {detailNotice && <NoticeBar notice={detailNotice} onClose={() => setDetailNotice(null)} />}
            {detailActions && <div data-detail-actions>{detailActions(detail.item)}</div>}
            {def.status && (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-gray-600">Status</span>
                <Badge tone={statusOption(detail.item[def.status.key])?.tone || 'gray'}>
                  {statusOption(detail.item[def.status.key])?.label || detail.item[def.status.key] || '—'}
                </Badge>
                {detail.item.statusReason && (
                  <span className="text-sm text-gray-500">Reason: {detail.item.statusReason}</span>
                )}
                {canManage && (
                  <select
                    id={`${def.name}-status-change`}
                    aria-label="Change status"
                    value=""
                    onChange={(e) => {
                      const option = statusOption(e.target.value)
                      if (option) setPendingStatus({ item: detail.item, status: option })
                    }}
                    className={autoWidthInput + ' ml-auto'}
                  >
                    <option value="">Change status...</option>
                    {def.status.options
                      .filter((option) => option.value !== detail.item[def.status!.key])
                      .map((option) => {
                        const needsApprover = !canApprove && Boolean(def.status!.approvalRequired?.includes(option.value))
                        return (
                          <option key={option.value} value={option.value} disabled={needsApprover}>
                            {needsApprover ? `${option.label} (needs an approver)` : option.label}
                          </option>
                        )
                      })}
                  </select>
                )}
              </div>
            )}

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              {def.fields.map((field) => (
                <div key={field.key} className={field.type === 'textarea' || field.type === 'materials' ? 'sm:col-span-2' : ''}>
                  <dt className="text-xs uppercase tracking-wide text-gray-500">{field.label}</dt>
                  <dd className="text-sm text-gray-900 whitespace-pre-wrap break-words">{displayValue(field, detail.item)}</dd>
                </div>
              ))}
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-500">Created</dt>
                <dd className="text-sm text-gray-900">
                  {formatDate(detail.item.createdAt, true)}
                  {detail.item.createdBy ? ` by ${detail.item.createdBy}` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-500">Last updated</dt>
                <dd className="text-sm text-gray-900">
                  {formatDate(detail.item.updatedAt, true)}
                  {detail.item.updatedBy ? ` by ${detail.item.updatedBy}` : ''}
                </dd>
              </div>
            </dl>

            <section>
              <h3 className="text-sm font-semibold text-deep-blue mb-2">Internal notes</h3>
              {(detail.item.notes || []).length === 0 && <p className="text-sm text-gray-500">No notes yet.</p>}
              <ul className="space-y-2">
                {(detail.item.notes || []).map((entry: Item, index: number) => (
                  <li key={index} className="bg-gray-50 rounded-lg px-3 py-2 text-sm">
                    <p className="text-gray-800 whitespace-pre-wrap">{entry.text}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {entry.byName || entry.by} · {formatDate(entry.at, true)}
                    </p>
                  </li>
                ))}
              </ul>
              {canManage && (
                <div className="flex gap-2 mt-3">
                  <input
                    id={`${def.name}-note`}
                    aria-label="Add an internal note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add an internal note"
                    className={inputClass}
                  />
                  <Button variant="secondary" onClick={addNote} disabled={!note.trim()} loading={busy}>
                    Add
                  </Button>
                </div>
              )}
            </section>

            <section>
              <h3 className="text-sm font-semibold text-deep-blue mb-2">Change history</h3>
              {detail.history.length === 0 && <p className="text-sm text-gray-500">No changes recorded.</p>}
              <ul className="space-y-2">
                {detail.history.map((entry) => (
                  <li key={entry._id} className="text-sm border-l-2 border-gray-200 pl-3">
                    <p className="text-gray-800">
                      <span className="font-medium">{entry.adminName || entry.adminEmail || 'System'}</span>{' '}
                      {String(entry.action).replace(/_/g, ' ')}
                      {entry.after && entry.action !== 'create' && entry.action !== 'note'
                        ? ': ' +
                          Object.keys(entry.after)
                            .map((key) => `${historyLabel(key)} ${historyValue(entry.before?.[key])} → ${historyValue(entry.after[key])}`)
                            .join(', ')
                        : ''}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDate(entry.createdAt, true)}
                      {entry.reason ? ` · Reason: ${entry.reason}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingStatus)}
        title="Change status"
        message={
          pendingStatus ? (
            <>
              Mark <strong>{String(pendingStatus.item[def.labelKey] || 'this record')}</strong> as{' '}
              <strong>{pendingStatus.status.label}</strong>?
            </>
          ) : null
        }
        askReason
        reasonRequired={Boolean(pendingStatus && def.status?.reasonRequired?.includes(pendingStatus.status.value))}
        busy={busy}
        onConfirm={changeStatus}
        onClose={() => setPendingStatus(null)}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={`Delete ${def.singular.toLowerCase()}`}
        message={
          pendingDelete ? (
            <>
              Delete <strong>{String(pendingDelete[def.labelKey] || 'this record')}</strong>? This cannot be undone.
            </>
          ) : null
        }
        confirmLabel="Delete"
        danger
        askReason
        busy={busy}
        onConfirm={remove}
        onClose={() => setPendingDelete(null)}
      />
    </AdminShell>
  )
}
