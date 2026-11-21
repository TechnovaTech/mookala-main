'use client'
import React, { useCallback, useEffect, useState } from 'react'
import AdminShell from '@/components/AdminShell'
import { Badge, Button, Card, EmptyState, Modal, NoticeBar, Spinner, api, formatDate, inputClass, type Notice } from '@/components/ui'
import { DataTable, ExportLink, Field, Pager, Th } from '@/components/security/shared'
import { MODULE_LABELS } from '@/lib/permissions'

interface Entry {
  _id: string
  adminName: string | null
  adminEmail: string | null
  adminRole: string | null
  action: string
  module: string
  entityType: string
  entityId: string | null
  entityLabel: string | null
  reason: string | null
  ip: string | null
  createdAt: string
}

const EMPTY = { q: '', admin: '', module: '', action: '', entityType: '', entityId: '', from: '', to: '' }

const moduleLabel = (module: string) => (MODULE_LABELS as Record<string, string>)[module] || module
const words = (value: string) => String(value || '').replace(/_/g, ' ')

function ValueBlock({ title, value }: { title: string; value: any }) {
  const empty = value === null || value === undefined || (typeof value === 'object' && Object.keys(value).length === 0)
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">{title}</p>
      {empty ? (
        <p className="text-sm text-gray-500">Not recorded for this action.</p>
      ) : (
        <pre className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words">
          {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  )
}

function AuditBody() {
  const [draft, setDraft] = useState(EMPTY)
  const [filters, setFilters] = useState(EMPTY)
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ entries: Entry[]; total: number; limit: number; facets: { modules: string[]; actions: string[]; entityTypes: string[] } } | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)
  const [detail, setDetail] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const query = useCallback(
    (extra: Record<string, string> = {}) => {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries({ ...filters, ...extra })) if (value) params.set(key, value)
      return params.toString()
    },
    [filters]
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await api('/api/admin/security/audit?' + query({ page: String(page) })))
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message })
    } finally {
      setLoading(false)
    }
  }, [query, page])

  useEffect(() => {
    load()
  }, [load])

  const apply = (event: React.FormEvent) => {
    event.preventDefault()
    setPage(1)
    setFilters(draft)
  }

  const open = async (id: string) => {
    setDetailLoading(true)
    setDetail({})
    try {
      const result = await api<{ entry: any }>('/api/admin/security/audit?id=' + encodeURIComponent(id))
      setDetail(result.entry)
    } catch (err: any) {
      setDetail(null)
      setNotice({ type: 'error', text: err.message })
    } finally {
      setDetailLoading(false)
    }
  }

  const set = (key: keyof typeof EMPTY) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setDraft({ ...draft, [key]: event.target.value })

  return (
    <>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      <Card className="p-4 mb-4">
        <form onSubmit={apply}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Field label="Search" htmlFor="audit-q">
              <input id="audit-q" type="search" value={draft.q} onChange={set('q')} className={inputClass} placeholder="Record, reason, admin, IP" />
            </Field>
            <Field label="Admin" htmlFor="audit-admin">
              <input id="audit-admin" type="search" value={draft.admin} onChange={set('admin')} className={inputClass} placeholder="Name or email" />
            </Field>
            <Field label="Module" htmlFor="audit-module">
              <select id="audit-module" value={draft.module} onChange={set('module')} className={inputClass}>
                <option value="">All modules</option>
                {(data?.facets.modules || []).map((value) => (
                  <option key={value} value={value}>{moduleLabel(value)}</option>
                ))}
              </select>
            </Field>
            <Field label="Action" htmlFor="audit-action">
              <select id="audit-action" value={draft.action} onChange={set('action')} className={inputClass}>
                <option value="">All actions</option>
                {(data?.facets.actions || []).map((value) => (
                  <option key={value} value={value}>{words(value)}</option>
                ))}
              </select>
            </Field>
            <Field label="Record type" htmlFor="audit-entity-type">
              <select id="audit-entity-type" value={draft.entityType} onChange={set('entityType')} className={inputClass}>
                <option value="">All record types</option>
                {(data?.facets.entityTypes || []).map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </Field>
            <Field label="Record id" htmlFor="audit-entity-id">
              <input id="audit-entity-id" type="text" value={draft.entityId} onChange={set('entityId')} className={inputClass} placeholder="Exact id" />
            </Field>
            <Field label="From" htmlFor="audit-from">
              <input id="audit-from" type="date" value={draft.from} onChange={set('from')} className={inputClass} />
            </Field>
            <Field label="To" htmlFor="audit-to">
              <input id="audit-to" type="date" value={draft.to} onChange={set('to')} className={inputClass} />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <Button type="submit">Apply filters</Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDraft(EMPTY)
                setFilters(EMPTY)
                setPage(1)
              }}
            >
              Clear
            </Button>
            <span className="text-xs text-gray-500">Dates use India Standard Time (Asia/Kolkata). Entries cannot be edited or deleted.</span>
            <div className="ml-auto">
              <ExportLink href={'/api/admin/security/audit?' + query({ format: 'csv' })} />
            </div>
          </div>
        </form>
      </Card>

      <Card>
        {!data && loading ? (
          <Spinner />
        ) : !data || data.entries.length === 0 ? (
          <EmptyState title="No activity matches" hint="Every change an admin makes is recorded here with the old value, the new value and the reason." />
        ) : (
          <>
            <DataTable
              head={
                <>
                  <Th>Time</Th>
                  <Th>Admin</Th>
                  <Th>Module</Th>
                  <Th>Action</Th>
                  <Th>Record</Th>
                  <Th>Reason</Th>
                  <Th right>Details</Th>
                </>
              }
            >
              {data.entries.map((entry) => (
                <tr key={entry._id}>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(entry.createdAt, true)}</td>
                  <td className="px-4 py-3">
                    <span className="text-gray-800">{entry.adminName || entry.adminEmail || 'System'}</span>
                    {entry.adminName && entry.adminEmail && <span className="block text-xs text-gray-500">{entry.adminEmail}</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-800">{moduleLabel(entry.module)}</td>
                  <td className="px-4 py-3">
                    <Badge tone="blue">{words(entry.action)}</Badge>
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <span className="block text-gray-800 truncate">{entry.entityLabel || entry.entityId || '—'}</span>
                    <span className="block text-xs text-gray-500">{entry.entityType}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-700 max-w-xs truncate" title={entry.reason || ''}>{entry.reason || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" className="!px-2 !py-1" onClick={() => open(entry._id)} aria-label={`View details of ${words(entry.action)} on ${entry.entityLabel || entry.entityType}`}>
                      View
                    </Button>
                  </td>
                </tr>
              ))}
            </DataTable>
            <Pager page={page} limit={data.limit} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>

      <Modal open={detail !== null} wide title="Activity details" onClose={() => setDetail(null)} footer={<Button variant="secondary" onClick={() => setDetail(null)}>Close</Button>}>
        {detailLoading || !detail?._id ? (
          <Spinner />
        ) : (
          <div className="space-y-4">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {[
                ['Time', formatDate(detail.createdAt, true)],
                ['Admin', [detail.adminName, detail.adminEmail].filter(Boolean).join(' · ') || 'System'],
                ['Role at the time', detail.adminRole || '—'],
                ['Module', moduleLabel(detail.module)],
                ['Action', words(detail.action)],
                ['Record', detail.entityLabel || '—'],
                ['Record type', detail.entityType || '—'],
                ['Record id', detail.entityId || '—'],
                ['IP address', detail.ip || '—'],
                ['Device', detail.device || '—'],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
                  <dd className="text-gray-800 break-words">{value}</dd>
                </div>
              ))}
            </dl>
            <ValueBlock title="Reason" value={detail.reason} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ValueBlock title="Old value" value={detail.before} />
              <ValueBlock title="New value" value={detail.after} />
            </div>
            {detail.meta && <ValueBlock title="Additional information" value={detail.meta} />}
          </div>
        )}
      </Modal>
    </>
  )
}

export default function AuditPage() {
  return (
    <AdminShell title="Activity Log" subtitle="Who changed what, when, from where and why">
      <AuditBody />
    </AdminShell>
  )
}
