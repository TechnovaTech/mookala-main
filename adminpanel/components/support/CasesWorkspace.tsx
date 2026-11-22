'use client'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Download, Eye, Plus, Search } from 'lucide-react'
import AdminShell, { useAdmin } from '@/components/AdminShell'
import { Badge, Button, Card, EmptyState, NoticeBar, Spinner, api, formatDate, inputClass, type Notice } from '@/components/ui'
import { CASE_PRIORITIES, CASE_SERVICES, CASE_STATUSES, CASE_TEAMS, caseResourceName } from '@/lib/resources/support'
import CaseDetail from './CaseDetail'
import { CaseFormDialog, emptyCaseForm, type CaseFormValues } from './CaseDialogs'
import { CaseStatusBadge, EscalatedFlag, PriorityBadge, SlaBadge, serviceLabel, teamName, type CaseRowView } from './shared'

type Mode = 'complaint' | 'ticket' | 'mine'

const MODES: Record<Mode, { title: string; subtitle: string; singular: string; empty: string }> = {
  complaint: {
    title: 'Customer Complaints',
    subtitle: 'Complaints with team assignment, escalation, replies, internal notes and SLA tracking',
    singular: 'Complaint',
    empty: 'No complaints have been recorded yet. Staff add a complaint here when a customer complains by phone, email or in person.',
  },
  ticket: {
    title: 'Support Tickets',
    subtitle: 'Help requests raised by customers in the app or recorded by staff',
    singular: 'Ticket',
    empty: 'No support tickets yet. Customers raise tickets in the app under Help and support; staff can also add one here.',
  },
  mine: {
    title: 'My Cases',
    subtitle: 'Complaints and tickets assigned to you',
    singular: 'Case',
    empty: 'No case is assigned to you. Cases appear here when someone assigns one to you.',
  },
}

const autoWidth = inputClass.replace('w-full ', 'w-auto max-w-full ')

/**
 * The case list used for Complaints, Support Tickets and My Cases. SLA states
 * come from the server, computed at the moment of the request. Opens a case
 * from `?id=` and pre-fills the list from `?q= ?status= ?priority= ?team=
 * ?escalated=1`. `?newRefund=<refund id>` opens the form for a complaint about
 * that refund.
 */
export default function CasesWorkspace({ mode }: { mode: Mode }) {
  const meta = MODES[mode]
  const admin = useAdmin()
  const [items, setItems] = useState<CaseRowView[]>([])
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [canManage, setCanManage] = useState(false)
  const [slaConfigured, setSlaConfigured] = useState(true)
  const [computedAt, setComputedAt] = useState('')
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)
  const [ready, setReady] = useState(false)

  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [team, setTeam] = useState('')
  const [service, setService] = useState('')
  const [source, setSource] = useState('')
  const [sla, setSla] = useState('')
  const [escalated, setEscalated] = useState(false)
  const [page, setPage] = useState(1)
  const limit = 25

  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState<CaseFormValues | null>(null)
  const ticket = useRef(0)

  const params = useCallback(
    (extra: Record<string, string> = {}) => {
      const p = new URLSearchParams()
      if (mode === 'mine') p.set('mine', '1')
      else p.set('kind', mode)
      if (query) p.set('q', query)
      if (status) p.set('status', status)
      if (priority) p.set('priority', priority)
      if (team) p.set('team', team)
      if (service) p.set('service', service)
      if (source) p.set('source', source)
      if (sla) p.set('sla', sla)
      if (escalated) p.set('escalated', '1')
      for (const [k, v] of Object.entries(extra)) p.set(k, v)
      return p.toString()
    },
    [mode, query, status, priority, team, service, source, sla, escalated]
  )

  const load = useCallback(async () => {
    if (!ready) return
    const mine = ++ticket.current
    setLoading(true)
    try {
      const data = await api<any>('/api/admin/support/cases?' + params({ page: String(page), limit: String(limit) }))
      if (mine !== ticket.current) return
      setItems(data.items || [])
      setTotal(data.total || 0)
      setCounts(data.statusCounts || {})
      setCanManage(Boolean(data.canManage))
      setSlaConfigured(Boolean(data.slaConfigured))
      setComputedAt(data.computedAt || '')
    } catch (e: any) {
      if (mine === ticket.current) setNotice({ type: 'error', text: e.message || 'Could not load the cases.' })
    } finally {
      if (mine === ticket.current) setLoading(false)
    }
  }, [ready, params, page])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (search.trim() === query) return
    const timer = setTimeout(() => {
      setPage(1)
      setQuery(search.trim())
    }, 350)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  // Links from other screens.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const q = (p.get('q') || '').trim().slice(0, 100)
    if (q) {
      setSearch(q)
      setQuery(q)
    }
    const s = p.get('status') || ''
    if (s === 'active' || CASE_STATUSES.some((o) => o.value === s)) setStatus(s)
    const pr = p.get('priority') || ''
    if (CASE_PRIORITIES.some((o) => o.value === pr)) setPriority(pr)
    const t = p.get('team') || ''
    if (t === 'unassigned' || CASE_TEAMS.some((o) => o.value === t)) setTeam(t)
    if (p.get('escalated') === '1') setEscalated(true)
    const slaParam = p.get('sla') || ''
    if (['breached', 'within', 'met'].includes(slaParam)) setSla(slaParam)
    const id = p.get('id') || ''
    if (/^[a-f0-9]{24}$/i.test(id)) setOpenId(id)
    const refund = p.get('newRefund') || ''
    if (mode === 'complaint' && /^[a-f0-9]{24}$/i.test(refund)) {
      api<any>(`/api/admin/finance/refunds/${refund}`)
        .then((data) => {
          const r = data.refund || {}
          setCreating({
            ...emptyCaseForm,
            subject: `Refund dispute${r.eventTitle ? ': ' + r.eventTitle : ''}`.slice(0, 200),
            customerPhone: r.customerPhone || '',
            service: 'payment',
            priority: 'high',
            bookingId: r.bookingId || '',
            aboutRefund: true,
            refundId: refund,
            description: r.disputeReason ? `The customer disputes the refund: ${r.disputeReason}` : '',
          })
        })
        .catch((e: any) => setNotice({ type: 'error', text: e.message || 'Could not read that refund.' }))
    }
    setReady(true)
  }, [mode])

  const pages = Math.max(1, Math.ceil(total / limit))
  const allCount = Object.values(counts).reduce((s, c) => s + c, 0)
  const activeCount = ['open', 'in_progress', 'waiting_customer', 'escalated'].reduce((s, k) => s + (counts[k] || 0), 0)
  const filtered = Boolean(query || status || priority || team || service || source || sla || escalated)
  const clear = () => {
    setSearch('')
    setQuery('')
    setStatus('')
    setPriority('')
    setTeam('')
    setService('')
    setSource('')
    setSla('')
    setEscalated(false)
    setPage(1)
  }
  const tab = (value: string, label: string, count: number) => (
    <button
      key={value || 'all'}
      role="tab"
      aria-selected={status === value}
      onClick={() => {
        setStatus(value)
        setPage(1)
      }}
      className={`px-3 py-1.5 rounded-full text-sm ${status === value ? 'bg-deep-blue text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
    >
      {label} ({count})
    </button>
  )

  return (
    <AdminShell
      title={meta.title}
      subtitle={meta.subtitle}
      actions={
        <>
          <a
            href={'/api/admin/support/cases?' + params({ export: 'csv' })}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
          >
            <Download size={16} />
            Export CSV
          </a>
          {canManage && mode !== 'mine' && (
            <Button onClick={() => setCreating({ ...emptyCaseForm })}>
              <Plus size={16} />
              Add {meta.singular.toLowerCase()}
            </Button>
          )}
        </>
      }
    >
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      {mode === 'mine' && admin && (
        <p className="text-sm text-gray-600 mb-3">
          Cases assigned to <strong>{admin.name || admin.email}</strong>. Cases assigned only to a team, without a person, are on{' '}
          <Link href="/support/complaints" className="text-teal underline">
            Complaints
          </Link>{' '}
          and{' '}
          <Link href="/support/tickets" className="text-teal underline">
            Support Tickets
          </Link>
          .
        </p>
      )}
      {!slaConfigured && (
        <NoticeBar
          notice={{ type: 'info', text: 'No SLA targets are set yet, so every case shows "No target set". A support manager sets them on Support Overview.' }}
        />
      )}

      <Card>
        <div className="p-4 border-b border-gray-200 space-y-3">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
            {tab('', 'All', allCount)}
            {tab('active', 'Still open', activeCount)}
            {CASE_STATUSES.map((s) => tab(s.value, s.label, counts[s.value] || 0))}
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[14rem]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                id="cases-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search subject, customer, phone, booking or refund ID..."
                aria-label="Search cases"
                className={inputClass + ' pl-9'}
              />
            </div>
            <select id="cases-priority" aria-label="Filter by priority" value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1) }} className={autoWidth}>
              <option value="">Priority: all</option>
              {CASE_PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            <select id="cases-team" aria-label="Filter by team" value={team} onChange={(e) => { setTeam(e.target.value); setPage(1) }} className={autoWidth}>
              <option value="">Team: all</option>
              {CASE_TEAMS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
              <option value="unassigned">Unassigned</option>
            </select>
            <select id="cases-service" aria-label="Filter by service" value={service} onChange={(e) => { setService(e.target.value); setPage(1) }} className={autoWidth}>
              <option value="">Service: all</option>
              {CASE_SERVICES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <select id="cases-source" aria-label="Filter by source" value={source} onChange={(e) => { setSource(e.target.value); setPage(1) }} className={autoWidth}>
              <option value="">Source: all</option>
              <option value="app">Raised in the app</option>
              <option value="admin">Recorded by staff</option>
            </select>
            <select id="cases-sla" aria-label="Filter by SLA" value={sla} onChange={(e) => { setSla(e.target.value); setPage(1) }} className={autoWidth}>
              <option value="">SLA: all</option>
              <option value="breached">Past target</option>
              <option value="within">Within target</option>
              <option value="met">Met</option>
            </select>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input id="cases-escalated" type="checkbox" checked={escalated} onChange={(e) => { setEscalated(e.target.checked); setPage(1) }} />
              Escalated only
            </label>
          </div>
        </div>

        {filtered && (
          <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-gray-200 bg-gray-50 text-sm text-gray-600">
            <span>The list is filtered. Export CSV downloads the filtered cases.</span>
            <button type="button" onClick={clear} className="text-teal underline whitespace-nowrap">
              Clear filters
            </button>
          </div>
        )}

        {loading || !ready ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState title={filtered ? 'No cases match these filters.' : meta.empty} hint={filtered ? 'Clear the search or filters to see everything.' : undefined} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="cases-table">
              <thead>
                <tr className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th scope="col" className="px-4 py-3 font-medium">Case</th>
                  {mode === 'mine' && <th scope="col" className="px-4 py-3 font-medium">Kind</th>}
                  <th scope="col" className="px-4 py-3 font-medium">Service</th>
                  <th scope="col" className="px-4 py-3 font-medium">Priority</th>
                  <th scope="col" className="px-4 py-3 font-medium">Assigned to</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium whitespace-nowrap">First response</th>
                  <th scope="col" className="px-4 py-3 font-medium">Resolution</th>
                  <th scope="col" className="px-4 py-3 font-medium">Raised</th>
                  <th scope="col" className="px-4 py-3 font-medium text-right">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((c) => (
                  <tr key={c._id} className="hover:bg-gray-50 align-top" data-case-row={c._id}>
                    <td className="px-4 py-3 max-w-xs">
                      <div className="font-medium text-gray-900 truncate">{c.subject || '—'}</div>
                      <div className="text-xs text-gray-500 truncate">
                        {c.customerName || 'Customer'} · {c.customerPhone}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        <EscalatedFlag escalated={c.escalated} level={c.escalationLevel} />
                        {c.source === 'app' && <Badge tone="blue">App</Badge>}
                        {c.aboutRefund && <Badge tone="purple">Refund</Badge>}
                      </div>
                    </td>
                    {mode === 'mine' && <td className="px-4 py-3 text-gray-700">{c.kind === 'complaint' ? 'Complaint' : 'Ticket'}</td>}
                    <td className="px-4 py-3 text-gray-700">{serviceLabel(c.service)}</td>
                    <td className="px-4 py-3"><PriorityBadge value={c.priority} /></td>
                    <td className="px-4 py-3 text-gray-700">
                      <div>{teamName(c.assignedTeam)}</div>
                      {c.assignedToName && <div className="text-xs text-gray-500">{c.assignedToName}</div>}
                    </td>
                    <td className="px-4 py-3"><CaseStatusBadge value={c.status} /></td>
                    <td className="px-4 py-3"><SlaBadge clock={c.sla.response} compact /></td>
                    <td className="px-4 py-3"><SlaBadge clock={c.sla.resolution} compact /></td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(c.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setOpenId(c._id)} aria-label={`Open ${c.subject || 'case'}`} className="p-2 rounded-lg text-gray-600 hover:bg-gray-100">
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-gray-200 text-sm text-gray-600">
            <span>
              Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
              {computedAt ? ` · SLA computed ${formatDate(computedAt, true)}` : ''}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <span>Page {page} of {pages}</span>
              <Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>

      {openId && <CaseDetail id={openId} onClose={() => setOpenId(null)} onChanged={load} />}

      {mode !== 'mine' && (
        <CaseFormDialog
          open={Boolean(creating)}
          resource={caseResourceName(mode)}
          singular={meta.singular}
          editing={null}
          initial={creating || emptyCaseForm}
          onClose={() => setCreating(null)}
          onSaved={(message, id) => {
            setCreating(null)
            setNotice({ type: 'success', text: message })
            load()
            setOpenId(id)
          }}
        />
      )}
    </AdminShell>
  )
}
