'use client'
import React, { useCallback, useEffect, useState } from 'react'
import AdminShell from '@/components/AdminShell'
import { Badge, Button, Card, ConfirmDialog, EmptyState, NoticeBar, Spinner, api, formatDate, inputClass, type Notice } from '@/components/ui'
import { DataTable, Th } from '@/components/security/shared'
import { ROLES } from '@/lib/permissions'

interface SessionRow {
  id: string
  adminId: string
  adminName: string
  email: string
  role: string | null
  ip: string
  device: string
  userAgent: string
  createdAt: string
  lastSeenAt: string
  expiresAt: string
  current: boolean
}

interface DeviceRow {
  email: string
  adminName: string
  ip: string
  userAgent: string
  device: string
  firstSeen: string
  lastSeen: string
  signIns: number
  sessionOpen: boolean
}

type Pending = { type: 'one'; session: SessionRow } | { type: 'all'; adminId: string; email: string } | null

function SessionsBody() {
  const [rows, setRows] = useState<SessionRow[] | null>(null)
  const [scope, setScope] = useState<'all' | 'own'>('own')
  const [rules, setRules] = useState<{ sessionHours: number; idleTimeoutMinutes: number; maxSessions: number } | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [busy, setBusy] = useState(false)
  const [adminFilter, setAdminFilter] = useState('')
  const [devices, setDevices] = useState<DeviceRow[] | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await api<{ sessions: SessionRow[]; scope: 'all' | 'own'; rules: any }>('/api/admin/security/sessions')
      setRows(data.sessions)
      setScope(data.scope)
      setRules(data.rules)
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message })
      setRows([])
    }
  }, [])

  const loadDevices = useCallback(async () => {
    try {
      const data = await api<{ devices: DeviceRow[] }>('/api/admin/security/sessions?devices=1' + (adminFilter ? '&adminId=' + encodeURIComponent(adminFilter) : ''))
      setDevices(data.devices)
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message })
      setDevices([])
    }
  }, [adminFilter])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    loadDevices()
  }, [loadDevices])

  const confirm = async (reason: string) => {
    if (!pending) return
    setBusy(true)
    try {
      const body =
        pending.type === 'one'
          ? { action: 'revoke', id: pending.session.id, reason }
          : { action: 'revoke_all', adminId: pending.adminId, reason }
      const data = await api<{ message: string; endedOwnSession?: boolean }>('/api/admin/security/sessions', { method: 'POST', body })
      if (data.endedOwnSession) {
        window.location.href = '/login'
        return
      }
      setNotice({ type: 'success', text: data.message })
      setPending(null)
      await Promise.all([load(), loadDevices()])
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message })
      setPending(null)
    } finally {
      setBusy(false)
    }
  }

  const perAdmin = new Map<string, number>()
  for (const row of rows || []) perAdmin.set(row.adminId, (perAdmin.get(row.adminId) || 0) + 1)
  const admins = Array.from(new Map((rows || []).map((row) => [row.adminId, row])).values())
  const visible = (rows || []).filter((row) => !adminFilter || row.adminId === adminFilter)
  const rulesText = rules
    ? `A session ends when the admin signs out, when it is ended here, after ${rules.idleTimeoutMinutes} minutes without activity, or ${rules.sessionHours} hours after sign-in. Each admin can have at most ${rules.maxSessions} sessions at once.`
    : ''

  return (
    <>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <p className="text-sm text-gray-600 mb-4">
        {scope === 'all'
          ? `Every active admin session, your own included. ${rulesText}`
          : `Your own active sessions. Only a Super Admin can see or end the sessions of other admins. ${rulesText}`}
      </p>
      {scope === 'all' && admins.length > 1 && (
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div className="w-72">
            <label htmlFor="sessions-admin" className="block text-sm font-medium text-gray-700 mb-1">Admin</label>
            <select id="sessions-admin" value={adminFilter} onChange={(e) => setAdminFilter(e.target.value)} className={inputClass}>
              <option value="">All admins</option>
              {admins.map((row) => (
                <option key={row.adminId} value={row.adminId}>{row.adminName ? `${row.adminName} (${row.email})` : row.email}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <Card>
        {rows === null ? (
          <Spinner />
        ) : visible.length === 0 ? (
          <EmptyState title="No active sessions" hint="Sessions are recorded each time an admin signs in." />
        ) : (
          <DataTable
            head={
              <>
                <Th>Admin</Th>
                <Th>IP address</Th>
                <Th>Device</Th>
                <Th>Started</Th>
                <Th>Last seen</Th>
                <Th>Expires</Th>
                <Th right>Actions</Th>
              </>
            }
          >
            {visible.map((session) => (
              <tr key={session.id}>
                <td className="px-4 py-3">
                  <span className="text-gray-800">{session.adminName || session.email}</span>{' '}
                  {session.current && <Badge tone="green">This session</Badge>}
                  <span className="block text-xs text-gray-500">
                    {session.email}
                    {session.role ? ` · ${ROLES.find((role) => role.value === session.role)?.label || session.role}` : ''}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-800 whitespace-nowrap">{session.ip}</td>
                <td className="px-4 py-3 text-gray-800" title={session.userAgent}>{session.device}</td>
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(session.createdAt, true)}</td>
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(session.lastSeenAt, true)}</td>
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(session.expiresAt, true)}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1 whitespace-nowrap">
                    <Button variant="ghost" className="!px-2 !py-1 !text-red-600" onClick={() => setPending({ type: 'one', session })}>
                      End session
                    </Button>
                    {(perAdmin.get(session.adminId) || 0) > 1 && (
                      <Button
                        variant="ghost"
                        className="!px-2 !py-1"
                        onClick={() => setPending({ type: 'all', adminId: session.adminId, email: session.email })}
                      >
                        End all for this admin
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>

      <Card className="mt-6">
        <div className="px-5 pt-5 pb-3">
          <h2 className="text-lg font-semibold text-deep-blue">Known devices</h2>
          <p className="text-sm text-gray-500">
            {scope === 'all' ? (adminFilter ? 'Devices of the selected admin.' : 'Devices of every admin.') : 'Your devices.'} A device is a network address
            plus a browser, taken from successful sign-ins. A sign-in from a device that is not on this list raises a security event.
          </p>
        </div>
        {devices === null ? (
          <Spinner />
        ) : devices.length === 0 ? (
          <EmptyState title="No devices recorded" hint="A device is recorded at each successful sign-in." />
        ) : (
          <DataTable
            head={
              <>
                {scope === 'all' && <Th>Admin</Th>}
                <Th>Device</Th>
                <Th>IP address</Th>
                <Th>First sign-in</Th>
                <Th>Last sign-in</Th>
                <Th>Sign-ins</Th>
                <Th>Session now</Th>
              </>
            }
          >
            {devices.map((row) => (
              <tr key={`${row.email}|${row.ip}|${row.userAgent}`}>
                {scope === 'all' && (
                  <td className="px-4 py-3">
                    <span className="block text-gray-800">{row.adminName || row.email}</span>
                    {row.adminName && <span className="block text-xs text-gray-500">{row.email}</span>}
                  </td>
                )}
                <td className="px-4 py-3 text-gray-800" title={row.userAgent}>{row.device}</td>
                <td className="px-4 py-3 text-gray-800 whitespace-nowrap">{row.ip}</td>
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(row.firstSeen, true)}</td>
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(row.lastSeen, true)}</td>
                <td className="px-4 py-3 text-gray-800">{row.signIns}</td>
                <td className="px-4 py-3">{row.sessionOpen ? <Badge tone="green">Signed in</Badge> : <span className="text-xs text-gray-400">No</span>}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(pending)}
        title={pending?.type === 'all' ? 'End all sessions of this admin?' : 'End this session?'}
        message={
          pending?.type === 'all' ? (
            <>Every active session of {pending.email} is ended. If this is your own account, the session you are using now is kept.</>
          ) : pending?.type === 'one' ? (
            pending.session.current ? (
              <>This is the session you are using. You will be signed out.</>
            ) : (
              <>
                {pending.session.email} on {pending.session.device} ({pending.session.ip}) will be signed out immediately.
              </>
            )
          ) : (
            ''
          )
        }
        confirmLabel="End session"
        danger
        askReason
        reasonRequired
        busy={busy}
        onConfirm={confirm}
        onClose={() => setPending(null)}
      />
    </>
  )
}

export default function SessionsPage() {
  return (
    <AdminShell title="Sessions & Devices" subtitle="Where admins are signed in right now">
      <SessionsBody />
    </AdminShell>
  )
}
