'use client'
import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Search, Upload, X } from 'lucide-react'
import { Badge, inputClass } from '@/components/ui'
import type { Tone } from '@/lib/resource-types'

/* Building blocks shared by the event, venue and catalogue screens. */

/** Largest files the server accepts once they are encoded as text (see the catalogue API helpers). */
const MAX_IMAGE_BYTES = 1_100_000
const MAX_VIDEO_BYTES = 2_200_000
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']

export function Field({
  label,
  htmlFor,
  required,
  help,
  children,
}: {
  label: string
  htmlFor: string
  required?: boolean
  help?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      {children}
      {help && <p className="text-xs text-gray-500 mt-1">{help}</p>}
    </div>
  )
}

export function SearchInput({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <div className="relative flex-1 min-w-[14rem]">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={inputClass + ' pl-9'}
      />
    </div>
  )
}

/** Returns `value` after it has stopped changing for `delay` ms. */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

/**
 * File picker that turns an image (or, when allowed, a short video) into a
 * data URL. Files are stored inside the database record, so they are checked
 * against the same size limits as the server before they are sent.
 */
export function MediaUpload({
  id,
  label,
  value,
  onChange,
  onError,
  allowVideo = false,
  required = false,
  help,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  onError: (message: string) => void
  allowVideo?: boolean
  required?: boolean
  help?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const isVideo = value.startsWith('data:video/')

  const pick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const video = file.type.startsWith('video/')
    if (video && !allowVideo) return onError(`${label} must be an image.`)
    if (!video && !IMAGE_TYPES.includes(file.type)) return onError(`${label}: use a PNG, JPG, WEBP, GIF or SVG file.`)

    if (video && file.size > MAX_VIDEO_BYTES) {
      return onError(
        `${label}: this video is ${(file.size / 1_000_000).toFixed(1)} MB. Videos are stored inside the database record and must be about 2 MB or smaller. Larger videos need a file store, which is not set up yet.`
      )
    }
    if (!video && file.size > MAX_IMAGE_BYTES) {
      return onError(`${label}: this image is ${(file.size / 1_000_000).toFixed(1)} MB. Images must be about 1 MB or smaller.`)
    }

    const reader = new FileReader()
    reader.onloadend = () => onChange(String(reader.result || ''))
    reader.onerror = () => onError(`${label}: the file could not be read.`)
    reader.readAsDataURL(file)
  }

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      <div className="border border-dashed border-gray-300 rounded-lg p-3 flex items-center gap-4">
        {value ? (
          isVideo ? (
            <video src={value} className="h-24 w-40 object-cover rounded-lg bg-gray-100" controls />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt={`${label} preview`} className="h-24 w-40 object-cover rounded-lg bg-gray-100" />
          )
        ) : (
          <div className="h-24 w-40 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400">
            <Upload size={22} />
          </div>
        )}
        <div className="space-y-2">
          <input
            ref={inputRef}
            id={id}
            type="file"
            accept={allowVideo ? 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,video/*' : 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml'}
            onChange={pick}
            className="block text-sm text-gray-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border file:border-gray-300 file:bg-white file:text-sm file:text-gray-700"
          />
          {value && !required && (
            <button type="button" onClick={() => onChange('')} className="inline-flex items-center gap-1 text-sm text-red-600 hover:underline">
              <X size={14} />
              Remove
            </button>
          )}
          <p className="text-xs text-gray-500">
            {help || (allowVideo ? 'Image up to about 1 MB, or a video up to about 2 MB.' : 'PNG, JPG, WEBP, GIF or SVG, up to about 1 MB.')}
          </p>
        </div>
      </div>
    </div>
  )
}

const PLACEMENT: Record<string, { label: string; tone: Tone }> = {
  active: { label: 'Active', tone: 'green' },
  inactive: { label: 'Inactive', tone: 'gray' },
  scheduled: { label: 'Scheduled', tone: 'blue' },
  expired: { label: 'Expired', tone: 'red' },
}

/** Badge for a banner or ad: Active, Inactive, Scheduled or Expired. */
export function PlacementBadge({ state }: { state: string }) {
  const entry = PLACEMENT[state] || { label: state, tone: 'gray' as Tone }
  return <Badge tone={entry.tone}>{entry.label}</Badge>
}

const EVENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: 'Pending', tone: 'amber' },
  approved: { label: 'Approved', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
}

export function EventStatusBadge({ status }: { status: string }) {
  const entry = EVENT_STATUS[status] || { label: status || 'Unknown', tone: 'gray' as Tone }
  return <Badge tone={entry.tone}>{entry.label}</Badge>
}

/** Row of links styled as tabs, for screens that are split over several pages. */
export function TabLinks({ tabs, current }: { tabs: { href: string; label: string }[]; current: string }) {
  return (
    <nav className="flex flex-wrap gap-2 mb-4" aria-label="Sections">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.href === current ? 'page' : undefined}
          className={`px-4 py-2 rounded-lg text-sm font-medium border ${
            tab.href === current ? 'bg-deep-blue text-white border-deep-blue' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}

/** Row of buttons styled as tabs, for sections inside one page. */
export function TabButtons<T extends string>({
  tabs,
  current,
  onChange,
}: {
  tabs: { key: T; label: string }[]
  current: T
  onChange: (key: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-2 mb-4" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          role="tab"
          aria-selected={tab.key === current}
          onClick={() => onChange(tab.key)}
          className={`px-4 py-2 rounded-lg text-sm font-medium border ${
            tab.key === current ? 'bg-deep-blue text-white border-deep-blue' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

/** Case-insensitive "contains" over several values, for filtering a short list in the browser. */
export function matches(query: string, ...values: any[]): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return values.some((value) => String(value ?? '').toLowerCase().includes(q))
}

export function toDateInput(value: any): string {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}
