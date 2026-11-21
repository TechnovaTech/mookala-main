'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Badge, Card, api, formatDate } from '@/components/ui'

interface Row {
  id: string
  reference: string
  actionLabel: string
  entityLabel: string | null
  entityType: string
  status: 'pending' | 'approved'
  requestedBy: string
  createdAt: string
  expiresAt: string
  canDecide: boolean
  canExecute: boolean
}

/**
 * Changes of the given sensitive actions that are waiting for a second
 * approver or for being carried out, for screens whose own save goes through
 * a shared component. Shows nothing when there are none.
 */
export default function WaitingApprovals({ actions, title }: { actions: string[]; title: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const key = actions.join(',')

  const load = useCallback(async () => {
    try {
      const data = await api<{ approvals: Row[] }>(`/api/admin/security/approvals?status=open&action=${encodeURIComponent(key)}`)
      setRows(data.approvals || [])
    } catch {
      setRows([])
    }
  }, [key])

  useEffect(() => {
    load()
    // A save on this screen may have just created one.
    const timer = window.setInterval(load, 15000)
    return () => window.clearInterval(timer)
  }, [load])

  if (rows.length === 0) return null
  return (
    <div data-testid="waiting-approvals">
    <Card className="p-4 mb-4">
      <p className="text-sm font-semibold text-deep-blue">{title}</p>
      <p className="text-xs text-gray-500 mt-0.5">These changes have not been made yet. They are carried out once a second approver agrees.</p>
      <ul className="mt-2 divide-y divide-gray-100 text-sm">
        {rows.map((row) => (
          <li key={row.id} className="py-2 flex flex-wrap items-center gap-2">
            <Link href={`/security/approvals?id=${row.id}`} className="font-mono text-teal underline">
              {row.reference}
            </Link>
            <Badge tone={row.status === 'approved' ? 'green' : 'amber'}>{row.status === 'approved' ? 'Approved: ready to carry out' : 'Waiting for approval'}</Badge>
            <span className="text-gray-800">{row.actionLabel}: {row.entityLabel || row.entityType}</span>
            <span className="text-xs text-gray-500">
              by {row.requestedBy} on {formatDate(row.createdAt, true)}, expires {formatDate(row.expiresAt, true)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
    </div>
  )
}
