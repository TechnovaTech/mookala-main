'use client'
import React, { useState } from 'react'
import { Check, Copy, Download } from 'lucide-react'
import { Button, Modal } from '@/components/ui'

/** Small building blocks shared by the Security & Audit screens. */

export function Th({ children, right = false }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th scope="col" className={`px-4 py-3 font-medium whitespace-nowrap ${right ? 'text-right' : ''}`}>
      {children}
    </th>
  )
}

export function DataTable({ head, children }: { head: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">{head}</tr>
        </thead>
        <tbody className="divide-y divide-gray-100">{children}</tbody>
      </table>
    </div>
  )
}

export function Pager({
  page,
  limit,
  total,
  onPage,
}: {
  page: number
  limit: number
  total: number
  onPage: (page: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / limit))
  if (total === 0) return null
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-gray-200 text-sm text-gray-600">
      <span>
        {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total.toLocaleString('en-IN')}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <span>
          Page {page} of {pages}
        </span>
        <Button variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  )
}

/** A link styled as a button that downloads a CSV from an admin API. */
export function ExportLink({ href, label = 'Export CSV' }: { href: string; label?: string }) {
  return (
    <a
      href={href}
      className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
    >
      <Download size={16} />
      {label}
    </a>
  )
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }
  return (
    <Button variant="secondary" onClick={copy} aria-label={label}>
      {copied ? <Check size={16} /> : <Copy size={16} />}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  )
}

/** Shows a temporary password exactly once. Closing the dialog discards it. */
export function TemporaryPasswordModal({
  info,
  onClose,
}: {
  info: { email: string; password: string; title: string } | null
  onClose: () => void
}) {
  return (
    <Modal
      open={Boolean(info)}
      title={info?.title || ''}
      onClose={onClose}
      footer={<Button onClick={onClose}>I have saved it</Button>}
    >
      {info && (
        <div className="text-sm text-gray-700 space-y-4">
          <p>
            Temporary password for <strong>{info.email}</strong>. It is shown only now and is not stored anywhere in readable
            form. Pass it to the admin over a private channel.
          </p>
          <div className="flex items-center gap-3">
            <code className="flex-1 font-mono text-base bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 break-all select-all">
              {info.password}
            </code>
            <CopyButton value={info.password} label="Copy the temporary password" />
          </div>
          <p className="text-gray-500">They will be asked to choose their own password after signing in.</p>
        </div>
      )}
    </Modal>
  )
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  )
}
