'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import AdminShell from '@/components/AdminShell'
import { Badge, Button, Card, ConfirmDialog, EmptyState, NoticeBar, Spinner, StatCard, api, formatDate, formatMoney, type Notice } from '@/components/ui'
import {
  ADVERTISER_STATUS,
  APPLICATION_STATUS,
  CAMPAIGN_STATUS,
  INVOICE_STATUS,
  PLACEMENT_LABEL,
  linkClass,
} from '@/components/advertising/shared'

interface Account {
  advertiser: Record<string, any>
  applications: Record<string, any>[]
  campaigns: Record<string, any>[]
  invoices: Record<string, any>[]
  totals: Record<string, number>
  history: {
    _id: string
    at: string
    admin: string
    action: string
    entityType: string
    entityLabel: string
    before: any
    after: any
    reason: string | null
  }[]
  canManage: boolean
}

const ENTITY_LABEL: Record<string, string> = {
  advertisers: 'Advertiser',
  'ad-applications': 'Application',
  'ad-campaigns': 'Campaign',
  'ad-payments': 'Invoice',
}

const ACTION_LABEL: Record<string, string> = {
  create: 'Created',
  update: 'Edited',
  status_change: 'Status changed',
  delete: 'Deleted',
  note: 'Note added',
}

const STATUS_ACTIONS: { to: string; label: string; from: string[]; reason: boolean; danger?: boolean }[] = [
  { to: 'verified', label: 'Verify', from: ['pending', 'suspended', 'rejected'], reason: false },
  { to: 'suspended', label: 'Suspend', from: ['verified'], reason: true, danger: true },
  { to: 'rejected', label: 'Reject', from: ['pending'], reason: true, danger: true },
]

function changeText(entry: Account['history'][number]): string {
  const after = entry.after && typeof entry.after === 'object' ? entry.after : null
  const before = entry.before && typeof entry.before === 'object' ? entry.before : null
  if (entry.action === 'create' || !after) return ''
  return Object.keys(after)
    .slice(0, 6)
    .map((key) => {
      const show = (value: any) => (value === null || value === undefined || value === '' ? 'empty' : typeof value === 'object' ? JSON.stringify(value) : String(value))
      return `${key}: ${show(before?.[key])} → ${show(after[key])}`
    })
    .join('; ')
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            {head.map((label) => (
              <th key={label} className="px-4 py-3 font-medium">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">{children}</tbody>
      </table>
    </div>
  )
}

function Section({ title, action, children, name }: { title: string; action?: React.ReactNode; children: React.ReactNode; name: string }) {
  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-gray-200" data-section={name}>
        <h2 className="text-base font-semibold text-deep-blue">{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  )
}

export default function Page({ params }: { params: { id: string } }) {
  const [data, setData] = useState<Account | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)
  const [missing, setMissing] = useState('')
  const [pending, setPending] = useState<(typeof STATUS_ACTIONS)[number] | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setData(await api<Account>(`/api/admin/advertising/advertisers/${params.id}`))
      setMissing('')
    } catch (error: any) {
      setMissing(error.message || 'Could not load the advertiser account.')
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    load()
  }, [load])

  const changeStatus = async (reason: string) => {
    if (!pending || !data) return
    setBusy(true)
    try {
      await api(`/api/admin/r/advertisers/${params.id}`, { method: 'PATCH', body: { status: pending.to, reason } })
      setNotice({ type: 'success', text: `${data.advertiser.businessName} is now ${ADVERTISER_STATUS[pending.to]?.label.toLowerCase() || pending.to}.` })
      await load()
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || 'The status was not changed.' })
    } finally {
      setBusy(false)
      setPending(null)
    }
  }

  const advertiser = data?.advertiser
  const status = advertiser ? String(advertiser.status || 'pending') : ''
  const actions = data?.canManage ? STATUS_ACTIONS.filter((action) => action.from.includes(status)) : []

  return (
    <AdminShell
      title={advertiser ? String(advertiser.businessName) : 'Advertiser account'}
      subtitle="Advertiser account: profile, applications, campaigns, invoices and payments"
      actions={
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => (
            <Button key={action.to} variant={action.danger ? 'danger' : 'primary'} onClick={() => setPending(action)}>
              {action.label}
            </Button>
          ))}
        </div>
      }
    >
      <p className="mb-4">
        <Link href="/advertising/advertisers" className={`inline-flex items-center gap-1 text-sm ${linkClass}`}>
          <ArrowLeft size={15} /> All advertisers
        </Link>
      </p>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      {loading ? (
        <Spinner />
      ) : missing || !data || !advertiser ? (
        <Card>
          <EmptyState title={missing || 'Advertiser not found'} hint="Go back to the list of advertisers and open the account from there." />
        </Card>
      ) : (
        <>
          <Card className="p-5 mb-6">
            <div className="flex flex-wrap items-center gap-3 mb-4" data-section="profile">
              <Badge tone={ADVERTISER_STATUS[status]?.tone || 'gray'}>{ADVERTISER_STATUS[status]?.label || status}</Badge>
              {advertiser.statusReason && <span className="text-sm text-gray-600">Reason: {advertiser.statusReason}</span>}
              {status === 'pending' && <span className="text-sm text-amber-700">Verify this advertiser before approving an application or a campaign.</span>}
              <Link href={`/advertising/advertisers?id=${advertiser._id}`} className={`ml-auto text-sm ${linkClass}`}>
                Edit profile, notes
              </Link>
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3 text-sm">
              {[
                ['Contact name', advertiser.contactName],
                ['Phone', advertiser.phone],
                ['Email', advertiser.email],
                ['City', advertiser.city],
                ['Business category', advertiser.businessCategory],
                ['GST number', advertiser.gstNumber],
                ['Website', advertiser.website],
                ['Registered', formatDate(advertiser.createdAt)],
                ['Business address', advertiser.address],
                ['Business listing', advertiser.listingDescription],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
                  <dd className="text-gray-900 break-words whitespace-pre-wrap">{value || '—'}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6" data-section="totals">
            <StatCard
              label="Outstanding"
              value={<span data-total="outstanding">{formatMoney(data.totals.outstanding)}</span>}
              hint={`${data.totals.outstandingInvoices} unpaid invoice${data.totals.outstandingInvoices === 1 ? '' : 's'}${
                data.totals.overdueInvoices ? `, ${data.totals.overdueInvoices} overdue (${formatMoney(data.totals.overdue)})` : ''
              }`}
              tone={data.totals.overdueInvoices ? 'red' : 'blue'}
            />
            <StatCard
              label="Paid"
              value={<span data-total="paid">{formatMoney(data.totals.paid)}</span>}
              hint={`${data.totals.paidInvoices} invoice${data.totals.paidInvoices === 1 ? '' : 's'}`}
              tone="green"
            />
            <StatCard
              label="Refunded"
              value={<span data-total="refunded">{formatMoney(data.totals.refunded)}</span>}
              hint={`${data.totals.refundedInvoices} invoice${data.totals.refundedInvoices === 1 ? '' : 's'}`}
              tone="purple"
            />
            <StatCard
              label="Campaigns"
              value={data.totals.campaigns}
              hint={`${data.totals.liveCampaigns} live · ${data.totals.impressions} impressions · ${data.totals.clicks} clicks`}
              tone="green"
            />
          </div>
          <p className="text-xs text-gray-500 -mt-4 mb-6">Amounts include GST. Outstanding is every invoice that is invoiced or overdue.</p>

          <Section
            name="applications"
            title={`Applications (${data.applications.length})`}
            action={
              <Link href={`/advertising/applications?f_advertiser=${advertiser._id}`} className={`text-sm ${linkClass}`}>
                Manage applications
              </Link>
            }
          >
            {data.applications.length === 0 ? (
              <EmptyState title="No applications" hint="Applications for this advertiser are entered on the Applications screen." />
            ) : (
              <Table head={['Application', 'Requested start', 'Target locations', 'Status', 'Campaign']}>
                {data.applications.map((row) => (
                  <tr key={row._id}>
                    <td className="px-4 py-2.5">
                      <Link href={`/advertising/applications?id=${row._id}`} className={linkClass}>
                        {row.label || row.package || 'Application'}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(row.requestedStartDate)}</td>
                    <td className="px-4 py-2.5">{(row.targetLocations || []).join(', ') || 'Everywhere'}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={APPLICATION_STATUS[row.status]?.tone || 'gray'}>{APPLICATION_STATUS[row.status]?.label || row.status}</Badge>
                      {row.statusReason && <span className="block text-xs text-gray-500 mt-0.5">{row.statusReason}</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {row.campaign ? (
                        <Link href={`/advertising/campaigns?id=${row.campaign}`} className={linkClass}>
                          {row.campaignName || 'Open campaign'}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Section>

          <Section
            name="campaigns"
            title={`Campaigns (${data.campaigns.length})`}
            action={
              <Link href={`/advertising/campaigns?f_advertiser=${advertiser._id}`} className={`text-sm ${linkClass}`}>
                Manage campaigns
              </Link>
            }
          >
            {data.campaigns.length === 0 ? (
              <EmptyState title="No campaigns" hint="A campaign is created when one of this advertiser's applications is approved." />
            ) : (
              <Table head={['Campaign', 'Placement', 'Runs', 'Target locations', 'Status', 'Creative', 'Impressions', 'Clicks']}>
                {data.campaigns.map((row) => (
                  <tr key={row._id}>
                    <td className="px-4 py-2.5">
                      <Link href={`/advertising/campaigns?id=${row._id}`} className={linkClass}>
                        {row.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">{PLACEMENT_LABEL[row.placement] || row.placement}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {formatDate(row.startDate)} – {formatDate(row.endDate)}
                    </td>
                    <td className="px-4 py-2.5">{(row.targetLocations || []).join(', ') || 'Everywhere'}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={CAMPAIGN_STATUS[row.status]?.tone || 'gray'}>{CAMPAIGN_STATUS[row.status]?.label || row.status}</Badge>
                      {row.statusReason && <span className="block text-xs text-gray-500 mt-0.5">{row.statusReason}</span>}
                    </td>
                    <td className="px-4 py-2.5">{row.hasCreative ? 'Yes' : 'Missing'}</td>
                    <td className="px-4 py-2.5 text-right">{row.impressions}</td>
                    <td className="px-4 py-2.5 text-right">{row.clicks}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Section>

          <Section
            name="invoices"
            title={`Invoices and payments (${data.invoices.length})`}
            action={
              <Link href={`/advertising/payments?f_advertiser=${advertiser._id}`} className={`text-sm ${linkClass}`}>
                Manage invoices
              </Link>
            }
          >
            {data.invoices.length === 0 ? (
              <EmptyState title="No invoices" hint="Raise an invoice from a campaign, or add one on the Ad Payments screen." />
            ) : (
              <Table head={['Invoice', 'Campaign', 'Amount', 'GST', 'Total', 'Due', 'Paid on', 'Method', 'Status']}>
                {data.invoices.map((row) => (
                  <tr key={row._id}>
                    <td className="px-4 py-2.5">
                      <Link href={`/advertising/payments?id=${row._id}`} className={linkClass}>
                        {row.invoiceNumber || 'Invoice'}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">{row.campaignName || '—'}</td>
                    <td className="px-4 py-2.5 text-right">{formatMoney(row.amount)}</td>
                    <td className="px-4 py-2.5 text-right">{formatMoney(row.gstAmount)}</td>
                    <td className="px-4 py-2.5 text-right font-medium">{formatMoney(row.total)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(row.dueDate)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(row.paidOn)}</td>
                    <td className="px-4 py-2.5">{row.method ? String(row.method).replace(/_/g, ' ') : '—'}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={INVOICE_STATUS[row.status]?.tone || 'gray'}>{INVOICE_STATUS[row.status]?.label || row.status}</Badge>
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Section>

          <Section name="history" title="History">
            {data.history.length === 0 ? (
              <EmptyState title="No recorded changes" hint="Every change to this advertiser and its applications, campaigns and invoices is listed here." />
            ) : (
              <Table head={['When', 'Who', 'Record', 'What', 'Change', 'Reason']}>
                {data.history.map((entry) => (
                  <tr key={entry._id} className="align-top">
                    <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(entry.at, true)}</td>
                    <td className="px-4 py-2.5">{entry.admin}</td>
                    <td className="px-4 py-2.5">
                      {ENTITY_LABEL[entry.entityType] || entry.entityType}
                      {entry.entityLabel ? `: ${entry.entityLabel}` : ''}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{ACTION_LABEL[entry.action] || entry.action}</td>
                    <td className="px-4 py-2.5 text-gray-600 break-words max-w-xs">{changeText(entry) || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-600">{entry.reason || '—'}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Section>
        </>
      )}

      <ConfirmDialog
        open={Boolean(pending)}
        title={pending && advertiser ? `${pending.label} ${advertiser.businessName}` : ''}
        message={
          pending?.to === 'verified'
            ? 'A verified advertiser can have applications approved and campaigns go live.'
            : 'Campaigns of this advertiser that are approved or live are paused, and the advertiser cannot have an application approved until it is verified again.'
        }
        confirmLabel={pending?.label}
        danger={pending?.danger}
        askReason
        reasonRequired={Boolean(pending?.reason)}
        busy={busy}
        onConfirm={changeStatus}
        onClose={() => setPending(null)}
      />
    </AdminShell>
  )
}
