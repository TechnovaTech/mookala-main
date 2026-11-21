'use client'
import React, { useCallback, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import AdminShell, { useAdmin } from '@/components/AdminShell'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Modal, NoticeBar, Spinner, api, formatDate, inputClass, type Notice } from '@/components/ui'
import { DataTable, Field, TemporaryPasswordModal, Th } from '@/components/security/shared'
import { ApprovalHeldNotice, apiOrHeld, type HeldForApproval } from '@/components/security/approval'
import { MODULES, MODULE_LABELS, ROLES, ROLE_PERMISSIONS, can, normaliseRole, type Role } from '@/lib/permissions'

interface AdminRow {
  id: string
  name: string
  email: string
  role: Role | null
  extraPermissions: string[]
  status: 'active' | 'disabled'
  twoFactorEnabled: boolean
  mustChangePassword: boolean
  lastLoginAt: string | null
  activeSessions: number
  isSelf: boolean
}

const ACTIONS = ['view', 'manage', 'approve'] as const

function roleLabel(role: string | null) {
  return ROLES.find((item) => item.value === role)?.label || 'No role'
}

/** Checkbox grid for permissions granted on top of the role. */
function PermissionPicker({ role, value, onChange }: { role: string; value: string[]; onChange: (next: string[]) => void }) {
  if (role === 'super_admin') {
    return <p className="text-sm text-gray-500">A Super Admin already holds every permission.</p>
  }
  const toggle = (permission: string) =>
    onChange(value.includes(permission) ? value.filter((item) => item !== permission) : [...value, permission])

  return (
    <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-gray-50">
          <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
            <th scope="col" className="px-3 py-2 font-medium">Module</th>
            {ACTIONS.map((action) => (
              <th key={action} scope="col" className="px-3 py-2 font-medium text-center capitalize">{action}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {MODULES.map((module) => (
            <tr key={module}>
              <td className="px-3 py-1.5 text-gray-800">{MODULE_LABELS[module]}</td>
              {ACTIONS.map((action) => {
                const permission = `${module}:${action}`
                const fromRole = can({ role }, permission)
                return (
                  <td key={action} className="px-3 py-1.5 text-center">
                    <input
                      type="checkbox"
                      aria-label={`${MODULE_LABELS[module]}: ${action}${fromRole ? ' (granted by the role)' : ''}`}
                      checked={fromRole || value.includes(permission)}
                      disabled={fromRole}
                      onChange={() => toggle(permission)}
                      className="h-4 w-4 accent-teal disabled:opacity-50"
                    />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Built from ROLE_PERMISSIONS at render time, so it always matches what the server enforces. */
function RoleMatrix() {
  return (
    <Card className="mt-8">
      <div className="px-5 pt-5 pb-3">
        <h2 className="text-lg font-semibold text-deep-blue">Role matrix</h2>
        <p className="text-sm text-gray-500">
          What each role can do by default. This table is generated from the same rules the server checks. Extra permissions
          granted to an individual admin are added on top.
        </p>
      </div>
      <DataTable
        head={
          <>
            <Th>Module</Th>
            {ROLES.map((role) => (
              <Th key={role.value}>{role.label}</Th>
            ))}
          </>
        }
      >
        {MODULES.map((module) => (
          <tr key={module}>
            <td className="px-4 py-2.5 text-gray-800 whitespace-nowrap">{MODULE_LABELS[module]}</td>
            {ROLES.map((role) => {
              const identity = { role: role.value }
              const view = can(identity, `${module}:view`)
              const manage = can(identity, `${module}:manage`)
              const approve = can(identity, `${module}:approve`)
              return (
                <td key={role.value} className="px-4 py-2.5">
                  {!view && !manage && !approve ? (
                    <span className="text-gray-400">No access</span>
                  ) : (
                    <span className="flex flex-wrap gap-1">
                      {view && <Badge tone="gray">View</Badge>}
                      {manage && <Badge tone="blue">Manage</Badge>}
                      {approve && <Badge tone="purple">Approve</Badge>}
                    </span>
                  )}
                </td>
              )
            })}
          </tr>
        ))}
      </DataTable>
      <ul className="px-5 py-4 text-xs text-gray-500 space-y-1 border-t border-gray-100">
        {ROLES.map((role) => (
          <li key={role.value}>
            <span className="font-medium text-gray-700">{role.label}:</span> {role.description}
            {role.value !== 'super_admin' && ` (${ROLE_PERMISSIONS[role.value as Exclude<Role, 'super_admin'>].length} permissions)`}
          </li>
        ))}
      </ul>
    </Card>
  )
}

type Pending = { type: 'disable' | 'enable' | 'reset_password' | 'reset_2fa'; admin: AdminRow } | null

function AdminsBody() {
  const me = useAdmin()
  const isSuper = normaliseRole(me?.role) === 'super_admin'
  const canManage = can(me, 'security:manage')

  const [rows, setRows] = useState<AdminRow[] | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [held, setHeld] = useState<HeldForApproval | null>(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<Pending>(null)
  const [temporary, setTemporary] = useState<{ email: string; password: string; title: string } | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<AdminRow | null>(null)
  const [form, setForm] = useState({ email: '', name: '', role: 'operations', extraPermissions: [] as string[], reason: '' })
  const [formError, setFormError] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await api<{ admins: AdminRow[] }>('/api/admin/security/admins')
      setRows(data.admins)
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message })
      setRows([])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openCreate = () => {
    setEditing(null)
    setForm({ email: '', name: '', role: 'operations', extraPermissions: [], reason: '' })
    setFormError('')
    setFormOpen(true)
  }

  const openEdit = (admin: AdminRow) => {
    setEditing(admin)
    setForm({ email: admin.email, name: admin.name, role: admin.role || 'operations', extraPermissions: admin.extraPermissions, reason: '' })
    setFormError('')
    setFormOpen(true)
  }

  const submitForm = async () => {
    setFormError('')
    if (!form.reason.trim()) {
      setFormError('Give a reason. It is saved in the activity log.')
      return
    }
    setBusy(true)
    try {
      // Permissions the role already grants are not stored as extras.
      const extraPermissions = form.extraPermissions.filter((permission) => !can({ role: form.role }, permission))
      setHeld(null)
      if (editing) {
        const result = await apiOrHeld<{ message: string }>('/api/admin/security/admins/' + editing.id, {
          method: 'PATCH',
          body: { action: 'update', name: form.name, role: form.role, extraPermissions, reason: form.reason },
        })
        if (result.held) setHeld(result)
        else setNotice({ type: 'success', text: result.data.message })
      } else {
        const result = await apiOrHeld<{ temporaryPassword: string; admin: AdminRow }>('/api/admin/security/admins', {
          method: 'POST',
          body: { email: form.email, name: form.name, role: form.role, extraPermissions, reason: form.reason },
        })
        // A held creation makes no account and no password yet: the password is shown to whoever carries it out.
        if (result.held) setHeld(result)
        else setTemporary({ email: result.data.admin.email, password: result.data.temporaryPassword, title: 'Admin created' })
      }
      setFormOpen(false)
      await load()
    } catch (err: any) {
      setFormError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const runPending = async (reason: string) => {
    if (!pending) return
    setBusy(true)
    try {
      setHeld(null)
      const result = await apiOrHeld<{ message: string; temporaryPassword?: string }>('/api/admin/security/admins/' + pending.admin.id, {
        method: 'PATCH',
        body: { action: pending.type, reason },
      })
      const data = result.held ? null : result.data
      if (result.held) {
        setHeld(result)
      } else if (data?.temporaryPassword) {
        setTemporary({ email: pending.admin.email, password: data.temporaryPassword, title: 'Password reset' })
      } else if (data) {
        setNotice({ type: 'success', text: data.message })
      }
      setPending(null)
      await load()
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message })
      setPending(null)
    } finally {
      setBusy(false)
    }
  }

  const dialog = pending && {
    disable: {
      title: 'Disable this admin?',
      message: <>{pending.admin.email} will be signed out everywhere and will not be able to sign in until the account is enabled again.</>,
      label: 'Disable account',
      danger: true,
    },
    enable: { title: 'Enable this admin?', message: <>{pending.admin.email} will be able to sign in again.</>, label: 'Enable account', danger: false },
    reset_password: {
      title: 'Reset password?',
      message: <>A new temporary password is created for {pending.admin.email} and shown to you once. All of their sessions are ended and they must choose a new password after signing in.</>,
      label: 'Reset password',
      danger: true,
    },
    reset_2fa: {
      title: 'Turn off two-factor authentication?',
      message: <>Use this when {pending.admin.email} has lost their authenticator app. They will sign in with the password alone until they set 2FA up again.</>,
      label: 'Turn off 2FA',
      danger: true,
    },
  }[pending.type]

  return (
    <>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <ApprovalHeldNotice held={held} onClose={() => setHeld(null)} />

      {isSuper && canManage && (
        <div className="flex justify-end mb-4">
          <Button onClick={openCreate}>
            <Plus size={16} />
            Add admin
          </Button>
        </div>
      )}
      {me && !isSuper && (
        <NoticeBar notice={{ type: 'info', text: 'Only a Super Admin can create admins or change roles and permissions.' }} />
      )}

      <Card>
        {rows === null ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState title="No admin accounts were returned" hint="Admin accounts are stored in the admins collection." />
        ) : (
          <DataTable
            head={
              <>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>2FA</Th>
                <Th>Last login</Th>
                <Th>Sessions</Th>
                <Th right>Actions</Th>
              </>
            }
          >
            {rows.map((admin) => {
              const mayAct = canManage && !admin.isSelf && (isSuper || admin.role !== 'super_admin')
              return (
                <tr key={admin.id}>
                  <td className="px-4 py-3 text-gray-800">
                    {admin.name || '—'} {admin.isSelf && <Badge tone="blue">You</Badge>}
                  </td>
                  <td className="px-4 py-3 text-gray-800">{admin.email}</td>
                  <td className="px-4 py-3">
                    <span className="text-gray-800">{roleLabel(admin.role)}</span>
                    {admin.extraPermissions.length > 0 && (
                      <span className="block text-xs text-gray-500" title={admin.extraPermissions.join(', ')}>
                        +{admin.extraPermissions.length} extra permission{admin.extraPermissions.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={admin.status === 'active' ? 'green' : 'red'}>{admin.status === 'active' ? 'Active' : 'Disabled'}</Badge>
                    {admin.mustChangePassword && <span className="block text-xs text-amber-700 mt-1">Temporary password</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={admin.twoFactorEnabled ? 'green' : 'gray'}>{admin.twoFactorEnabled ? 'On' : 'Off'}</Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{admin.lastLoginAt ? formatDate(admin.lastLoginAt, true) : 'Never'}</td>
                  <td className="px-4 py-3 text-gray-800">{admin.activeSessions}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1 whitespace-nowrap">
                      {isSuper && canManage && (
                        <Button variant="ghost" className="!px-2 !py-1" onClick={() => openEdit(admin)}>
                          Edit role
                        </Button>
                      )}
                      {mayAct && (
                        <>
                          <Button variant="ghost" className="!px-2 !py-1" onClick={() => setPending({ type: 'reset_password', admin })}>
                            Reset password
                          </Button>
                          {admin.twoFactorEnabled && (
                            <Button variant="ghost" className="!px-2 !py-1" onClick={() => setPending({ type: 'reset_2fa', admin })}>
                              Reset 2FA
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            className={`!px-2 !py-1 ${admin.status === 'active' ? '!text-red-600' : ''}`}
                            onClick={() => setPending({ type: admin.status === 'active' ? 'disable' : 'enable', admin })}
                          >
                            {admin.status === 'active' ? 'Disable' : 'Enable'}
                          </Button>
                        </>
                      )}
                      {!isSuper && !mayAct && <span className="text-xs text-gray-400">View only</span>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </DataTable>
        )}
      </Card>

      <RoleMatrix />

      <Modal
        open={formOpen}
        wide
        title={editing ? `Edit ${editing.email}` : 'Add admin'}
        onClose={() => setFormOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submitForm} loading={busy}>
              {editing ? 'Save changes' : 'Create admin'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <NoticeBar notice={formError ? { type: 'error', text: formError } : null} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Email" htmlFor="admin-email">
              <input
                id="admin-email"
                type="email"
                autoComplete="off"
                value={form.email}
                disabled={Boolean(editing)}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Name" htmlFor="admin-name">
              <input id="admin-name" type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
            </Field>
          </div>
          <Field
            label="Role"
            htmlFor="admin-role"
            hint={
              editing?.isSelf
                ? 'You cannot change your own role.'
                : ROLES.find((role) => role.value === form.role)?.description
            }
          >
            <select
              id="admin-role"
              value={form.role}
              disabled={Boolean(editing?.isSelf)}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className={inputClass}
            >
              {ROLES.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </Field>
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1">Extra permissions (optional)</p>
            <PermissionPicker role={form.role} value={form.extraPermissions} onChange={(next) => setForm({ ...form, extraPermissions: next })} />
          </div>
          <Field label="Reason" htmlFor="admin-reason" hint="Saved in the activity log.">
            <textarea id="admin-reason" rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className={inputClass} />
          </Field>
          {!editing && (
            <p className="text-sm text-gray-500">
              A temporary password is generated on the server and shown to you once after the admin is created.
            </p>
          )}
          {editing && !editing.isSelf && (
            <p className="text-sm text-gray-500">Changing the role or permissions signs this admin out so the change applies at their next sign-in.</p>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(pending)}
        title={dialog?.title || ''}
        message={dialog?.message || ''}
        confirmLabel={dialog?.label}
        danger={dialog?.danger}
        askReason
        reasonRequired
        busy={busy}
        onConfirm={runPending}
        onClose={() => setPending(null)}
      />

      <TemporaryPasswordModal info={temporary} onClose={() => setTemporary(null)} />
    </>
  )
}

export default function AdminsPage() {
  return (
    <AdminShell title="Admins & Roles" subtitle="Who can sign in to the admin panel and what each role may do">
      <AdminsBody />
    </AdminShell>
  )
}
