'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Badge, Button, Card, EmptyState, Spinner, api, formatDate, formatMoney } from '@/components/ui'
import { payeeTypeLabel, serviceLabel } from './RulesShared'

const TYPE_LABEL: Record<string, string> = {
  payment: 'Payment',
  commission: 'Commission',
  gst: 'GST',
  gateway_fee: 'Gateway fee',
  refund: 'Refund',
  refund_deduction: 'Refund deduction kept',
  settlement: 'Payout',
  adjustment: 'Adjustment',
}

/** The ledger entries behind one figure of a statement: transaction by transaction. */
export default function StatementEntries({
  from,
  to,
  service,
  type,
  payeeType,
  payeeId,
}: {
  from: string | null
  to: string | null
  service: string
  type: string
  payeeType: string
  payeeId: string
}) {
  const [page, setPage] = useState(1)
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const params = new URLSearchParams({ view: 'entries', page: String(page) })
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (service) params.set('service', service)
    if (type) params.set('type', type)
    if (payeeId) {
      params.set('payeeId', payeeId)
      if (payeeType) params.set('payeeType', payeeType)
    }
    try {
      setData(await api<any>('/api/admin/finance/statements?' + params.toString()))
      setError('')
    } catch (err: any) {
      setError(err.message || 'Could not load the ledger entries.')
    }
  }, [from, to, service, type, payeeType, payeeId, page])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (data && typeof window !== 'undefined' && window.location.hash === '#entries') {
      document.getElementById('entries')?.scrollIntoView({ block: 'start' })
    }
    // Only on the first load of the entries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(data)])

  const what = [type ? TYPE_LABEL[type] || type : 'All entry types', service ? serviceLabel(service) : 'all services'].join(', ')
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1

  return (
    <Card>
      <div id="entries" className="px-5 pt-5 pb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-deep-blue">Ledger entries: {what}</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {data ? (
              <>
                {data.total} {data.total === 1 ? 'entry' : 'entries'}
                {type ? (
                  <>
                    {' '}
                    adding up to{' '}
                    <span className="font-semibold text-deep-blue" data-testid="entries-sum">
                      {formatMoney(data.sum)}
                    </span>
                  </>
                ) : (
                  ' of every type: the net is the payments less the commission, GST, gateway fees and refunds listed here'
                )}
                {payeeId ? ', for this payee' : ''}.
              </>
            ) : (
              'Loading the entries.'
            )}
          </p>
        </div>
        <p className="text-sm text-gray-500">
          Select a reference to open that entry in the{' '}
          <Link href="/finance/ledger" className="text-deep-blue hover:underline">
            ledger
          </Link>
          .
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-700 px-5 pb-5">
          {error}
        </p>
      ) : !data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <EmptyState title="No ledger entry matches." />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Reference</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Service</th>
                <th className="px-4 py-3 font-medium">Payee</th>
                <th className="px-4 py-3 font-medium">Booking / payment</th>
                <th className="px-4 py-3 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((entry: any) => (
                <tr key={entry._id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-2 whitespace-nowrap">{formatDate(entry.createdAt, true)}</td>
                  <td className="px-4 py-2">
                    <Link href={`/finance/ledger?q=${encodeURIComponent(entry.reference)}`} className="font-mono text-xs text-deep-blue hover:underline">
                      {entry.reference}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={entry.type === 'payment' ? 'green' : entry.type === 'refund' ? 'red' : 'gray'}>{TYPE_LABEL[entry.type] || entry.type}</Badge>
                    {entry.ratePercent != null && entry.type === 'commission' && <span className="block text-xs text-gray-500 mt-0.5">at {entry.ratePercent}%</span>}
                  </td>
                  <td className="px-4 py-2">{serviceLabel(entry.service)}</td>
                  <td className="px-4 py-2">
                    {entry.payeeName || entry.payeeId || '—'}
                    {entry.payeeType && <span className="block text-xs text-gray-500">{payeeTypeLabel(entry.payeeType)}</span>}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{entry.bookingId || entry.parentReference || '—'}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">{formatMoney(entry.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > data.limit && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 text-sm text-gray-600">
          <span>
            Page {page} of {pages}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
