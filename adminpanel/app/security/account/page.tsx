'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Download } from 'lucide-react'
import AdminShell from '@/components/AdminShell'
import { Badge, Button, Card, ConfirmDialog, NoticeBar, Spinner, api, formatDate, inputClass, type Notice } from '@/components/ui'
import { CopyButton, DataTable, Field, Th } from '@/components/security/shared'
import { ROLES } from '@/lib/permissions'
import { passwordProblem } from '@/lib/password'

interface Account {
  email: string
  name: string
  phone: string
  role: string
  twoFactorEnabled: boolean
  twoFactorRequired: boolean
  recoveryCodesLeft: number | null
  mustChangePassword: boolean
  restriction: 'password_change' | 'two_factor_setup' | null
  restrictionMessage: string | null
  lastLoginAt: string | null
}

interface DeviceRow {
  ip: string
  device: string
  userAgent: string
  firstSeen: string
  lastSeen: string
  signIns: number
  sessionOpen: boolean
}

const REQUIRED_TEXT: Record<string, string> = {
  password_change: 'You are signed in with a temporary password. Choose your own password below before you use the rest of the admin panel.',
  two_factor_setup: 'Two-factor authentication is required for your role. Turn it on below before you use the rest of the admin panel.',
}

/** Shows recovery codes once, with copy and download. Closing it discards them from the page. */
function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const text = `Mookalaa admin recovery codes\nEach code works once, in place of an authenticator code.\n\n${codes.join('\n')}\n`
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'mookalaa-admin-recovery-codes.txt'
    link.click()
    URL.revokeObjectURL(url)
  }
  return (
    <div className="border border-amber-300 bg-amber-50 rounded-lg p-4 mt-4" data-testid="recovery-codes">
      <p className="text-sm font-semibold text-amber-900">Save these recovery codes now</p>
      <p className="text-sm text-amber-900 mt-1">
        They are shown only this once. If you lose your authenticator app, each code lets you sign in one time instead of a 6-digit code.
        Keep them somewhere safe and private.
      </p>
      <ol className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3 font-mono text-sm text-gray-900">
        {codes.map((code) => (
          <li key={code} className="bg-white border border-amber-200 rounded px-2 py-1 text-center select-all">{code}</li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2 mt-3">
        <CopyButton value={codes.join('\n')} label="Copy all recovery codes" />
        <Button variant="secondary" onClick={download}>
          <Download size={16} />
          Download as text
        </Button>
        <Button onClick={onDone}>I have saved them</Button>
      </div>
    </div>
  )
}

interface SessionRow {
  id: string
  adminId: string
  ip: string
  device: string
  userAgent: string
  createdAt: string
  lastSeenAt: string
  expiresAt: string
  current: boolean
}

interface LoginRow {
  id: string
  success: boolean
  reasonLabel: string
  ip: string
  device: string
  newDevice: boolean
  createdAt: string
}

/** The same rules lib/password.ts enforces on the server. */
const PASSWORD_RULES: { label: string; test: (value: string) => boolean }[] = [
  { label: 'At least 10 characters (128 at most)', test: (value) => value.length >= 10 && value.length <= 128 },
  { label: 'An upper case and a lower case letter', test: (value) => /[a-z]/.test(value) && /[A-Z]/.test(value) },
  { label: 'A number', test: (value) => /[0-9]/.test(value) },
  { label: 'A symbol such as # or @', test: (value) => /[^A-Za-z0-9]/.test(value) },
]

/**
 * The password and 2FA endpoints answer 401 for a wrong password. The shared
 * api() helper treats every 401 as an ended session and leaves the page, so
 * these two calls read the response themselves and show the server's message.
 */
async function postCredential(url: string, body: Record<string, any>): Promise<any> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'same-origin',
    cache: 'no-store',
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || (data && data.success === false)) {
    throw new Error((data && data.error) || `Request failed (${response.status})`)
  }
  return data
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold text-deep-blue mb-1">{children}</h2>
}

function AccountBody() {
  const [account, setAccount] = useState<Account | null>(null)
  const [sessions, setSessions] = useState<SessionRow[] | null>(null)
  const [logins, setLogins] = useState<LoginRow[] | null>(null)
  const [loadError, setLoadError] = useState('')

  const [profile, setProfile] = useState({ name: '', phone: '' })
  const [profileNotice, setProfileNotice] = useState<Notice>(null)
  const [profileBusy, setProfileBusy] = useState(false)

  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' })
  const [passwordNotice, setPasswordNotice] = useState<Notice>(null)
  const [passwordBusy, setPasswordBusy] = useState(false)

  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null)
  const [code, setCode] = useState('')
  const [disablePassword, setDisablePassword] = useState('')
  const [twoFactorNotice, setTwoFactorNotice] = useState<Notice>(null)
  const [twoFactorBusy, setTwoFactorBusy] = useState(false)

  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
  const [regeneratePassword, setRegeneratePassword] = useState('')
  const [required, setRequired] = useState<string | null>(null)
  const [devices, setDevices] = useState<DeviceRow[] | null>(null)

  const [sessionNotice, setSessionNotice] = useState<Notice>(null)
  const [pending, setPending] = useState<{ type: 'one'; session: SessionRow } | { type: 'others' } | null>(null)
  const [sessionBusy, setSessionBusy] = useState(false)

  const loadAccount = useCallback(async () => {
    try {
      const data = await api<{ admin: Account }>('/api/auth/me')
      setAccount(data.admin)
      setProfile({ name: data.admin.name || '', phone: data.admin.phone || '' })
    } catch (err: any) {
      setLoadError(err.message)
    }
  }, [])

  const loadSessions = useCallback(async () => {
    try {
      const data = await api<{ sessions: SessionRow[] }>('/api/admin/security/sessions?mine=1')
      setSessions(data.sessions)
    } catch {
      setSessions([])
    }
  }, [])

  const loadLogins = useCallback(async () => {
    try {
      const data = await api<{ logins: LoginRow[] }>('/api/admin/security/logins?mine=1&limit=10')
      setLogins(data.logins)
    } catch {
      setLogins([])
    }
  }, [])

  const loadDevices = useCallback(async () => {
    try {
      const data = await api<{ devices: DeviceRow[] }>('/api/admin/security/sessions?mine=1&devices=1')
      setDevices(data.devices)
    } catch {
      setDevices([])
    }
  }, [])

  useEffect(() => {
    // The middleware sends every page here with ?required=<reason> while the account is restricted.
    const reason = new URLSearchParams(window.location.search).get('required')
    if (reason && REQUIRED_TEXT[reason]) setRequired(reason)
    loadAccount()
    loadSessions()
    loadLogins()
    loadDevices()
  }, [loadAccount, loadSessions, loadLogins, loadDevices])

  // Bring the two-factor section into view when the header menu links to it.
  useEffect(() => {
    if (account && window.location.hash === '#two-factor') {
      document.getElementById('two-factor')?.scrollIntoView({ block: 'start' })
    }
  }, [account])

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault()
    setProfileBusy(true)
    setProfileNotice(null)
    try {
      const data = await api<{ message: string }>('/api/auth/me', { method: 'PUT', body: profile })
      setProfileNotice({ type: 'success', text: data.message })
      await loadAccount()
    } catch (err: any) {
      setProfileNotice({ type: 'error', text: err.message })
    } finally {
      setProfileBusy(false)
    }
  }

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault()
    setPasswordNotice(null)
    const problem = passwordProblem(passwords.next)
    if (problem) return setPasswordNotice({ type: 'error', text: problem })
    if (passwords.next !== passwords.confirm) return setPasswordNotice({ type: 'error', text: 'The new password and its confirmation do not match.' })

    setPasswordBusy(true)
    try {
      const data = await postCredential('/api/auth/change-password', { currentPassword: passwords.current, newPassword: passwords.next })
      setPasswordNotice({ type: 'success', text: data.message })
      setPasswords({ current: '', next: '', confirm: '' })
      await Promise.all([loadAccount(), loadSessions()])
    } catch (err: any) {
      setPasswordNotice({ type: 'error', text: err.message })
    } finally {
      setPasswordBusy(false)
    }
  }

  const twoFactor = async (body: Record<string, any>, after: () => void) => {
    setTwoFactorBusy(true)
    setTwoFactorNotice(null)
    try {
      const data = await postCredential('/api/auth/2fa', body)
      if (body.action === 'setup') setSetup({ secret: data.secret, uri: data.uri })
      else setTwoFactorNotice({ type: 'success', text: data.message })
      if (Array.isArray(data.recoveryCodes)) setRecoveryCodes(data.recoveryCodes)
      after()
      if (body.action !== 'setup') await loadAccount()
    } catch (err: any) {
      setTwoFactorNotice({ type: 'error', text: err.message })
    } finally {
      setTwoFactorBusy(false)
    }
  }

  const endSessions = async (reason: string) => {
    if (!pending || !sessions) return
    setSessionBusy(true)
    try {
      const body =
        pending.type === 'one'
          ? { action: 'revoke', id: pending.session.id, reason }
          : { action: 'revoke_all', adminId: sessions[0]?.adminId, reason }
      const data = await api<{ message: string; endedOwnSession?: boolean }>('/api/admin/security/sessions', { method: 'POST', body })
      if (data.endedOwnSession) {
        window.location.href = '/login'
        return
      }
      setSessionNotice({ type: 'success', text: data.message })
      await loadSessions()
    } catch (err: any) {
      setSessionNotice({ type: 'error', text: err.message })
    } finally {
      setSessionBusy(false)
      setPending(null)
    }
  }

  if (loadError) return <NoticeBar notice={{ type: 'error', text: loadError }} />
  if (!account) return <Spinner />

  const roleLabel = ROLES.find((role) => role.value === account.role)?.label || account.role
  const others = (sessions || []).filter((session) => !session.current).length
  const stillRequired = account.restriction

  return (
    <div className="max-w-4xl space-y-6">
      {/* --------------------------- required action -------------------------- */}
      {stillRequired ? (
        <div className="border border-amber-300 bg-amber-50 rounded-lg px-4 py-3 text-sm text-amber-900" role="alert" data-testid="required-banner">
          <p className="font-semibold">Action required before you can continue</p>
          <p className="mt-1">{REQUIRED_TEXT[stillRequired] || account.restrictionMessage}</p>
        </div>
      ) : required ? (
        <div className="border border-green-200 bg-green-50 rounded-lg px-4 py-3 text-sm text-green-800" role="status" data-testid="required-done">
          <p className="font-semibold">Done. Your account can use the admin panel now.</p>
          <Link href="/dashboard" className="underline font-medium">Go to the dashboard</Link>
        </div>
      ) : null}

      {/* ------------------------------- profile ------------------------------ */}
      <Card className="p-6">
        <Heading>Profile</Heading>
        <p className="text-sm text-gray-500 mb-4">
          {account.email} · {roleLabel}
          {account.lastLoginAt ? ` · last sign-in ${formatDate(account.lastLoginAt, true)}` : ''}
        </p>
        <NoticeBar notice={profileNotice} onClose={() => setProfileNotice(null)} />
        <form onSubmit={saveProfile} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Name" htmlFor="account-name">
            <input id="account-name" type="text" required maxLength={80} value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} className={inputClass} />
          </Field>
          <Field label="Phone" htmlFor="account-phone">
            <input id="account-phone" type="tel" maxLength={20} value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} className={inputClass} />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" loading={profileBusy}>Save profile</Button>
          </div>
        </form>
      </Card>

      {/* ------------------------------- password ----------------------------- */}
      <Card className="p-6">
        <Heading>Change password</Heading>
        {account.mustChangePassword && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
            You are signed in with a temporary password. Choose your own password now.
          </p>
        )}
        <NoticeBar notice={passwordNotice} onClose={() => setPasswordNotice(null)} />
        <form onSubmit={changePassword} className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <Field label="Current password" htmlFor="account-current-password">
              <input id="account-current-password" type="password" required autoComplete="current-password" value={passwords.current} onChange={(e) => setPasswords({ ...passwords, current: e.target.value })} className={inputClass} />
            </Field>
            <Field label="New password" htmlFor="account-new-password">
              <input id="account-new-password" type="password" required autoComplete="new-password" value={passwords.next} onChange={(e) => setPasswords({ ...passwords, next: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Confirm new password" htmlFor="account-confirm-password">
              <input id="account-confirm-password" type="password" required autoComplete="new-password" value={passwords.confirm} onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })} className={inputClass} />
            </Field>
            <Button type="submit" loading={passwordBusy}>Change password</Button>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Password rules</p>
            <ul className="text-sm space-y-1.5">
              {PASSWORD_RULES.map((rule) => {
                const met = passwords.next.length > 0 && rule.test(passwords.next)
                return (
                  <li key={rule.label} className={met ? 'text-green-700' : 'text-gray-600'}>
                    <span aria-hidden="true">{met ? '✓' : '•'}</span> {rule.label}
                    <span className="sr-only">{met ? ' (met)' : ' (not met yet)'}</span>
                  </li>
                )
              })}
              <li className="text-gray-600"><span aria-hidden="true">•</span> Different from the current password</li>
            </ul>
            <p className="text-xs text-gray-500 mt-3">Changing the password signs out your other devices.</p>
          </div>
        </form>
      </Card>

      {/* ------------------------------ two factor ---------------------------- */}
      <Card className="p-6 scroll-mt-28">
        <section id="two-factor" className="scroll-mt-28" aria-labelledby="two-factor-heading">
          <div className="flex items-center gap-3 mb-1">
            <h2 id="two-factor-heading" className="text-lg font-semibold text-deep-blue">Two-factor authentication</h2>
            <Badge tone={account.twoFactorEnabled ? 'green' : 'gray'}>{account.twoFactorEnabled ? 'On' : 'Off'}</Badge>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            With 2FA on, signing in needs your password and a 6-digit code from an authenticator app such as Google Authenticator,
            Microsoft Authenticator or Authy.
          </p>
          <NoticeBar notice={twoFactorNotice} onClose={() => setTwoFactorNotice(null)} />

          {!account.twoFactorEnabled && !setup && (
            <Button onClick={() => twoFactor({ action: 'setup' }, () => setCode(''))} loading={twoFactorBusy}>
              Set up two-factor authentication
            </Button>
          )}

          {!account.twoFactorEnabled && setup && (
            <div className="space-y-4">
              <ol className="list-decimal list-inside text-sm text-gray-700 space-y-1">
                <li>Open your authenticator app and choose to add an account by entering a setup key.</li>
                <li>Type or paste the key below. Account name: {account.email}. Type: time based.</li>
                <li>Enter the 6-digit code the app shows to finish.</li>
              </ol>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Setup key</p>
                <div className="flex items-center gap-3">
                  <code className="flex-1 font-mono text-base bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 break-all select-all">
                    {setup.secret.replace(/(.{4})/g, '$1 ').trim()}
                  </code>
                  <CopyButton value={setup.secret} label="Copy the setup key" />
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Or paste this setup link into an app that accepts one</p>
                <div className="flex items-center gap-3">
                  <code className="flex-1 font-mono text-xs bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 break-all select-all">{setup.uri}</code>
                  <CopyButton value={setup.uri} label="Copy the setup link" />
                </div>
              </div>
              <p className="text-xs text-gray-500">
                The key is shown only during setup and is never sent anywhere outside this admin panel. A QR code is not offered
                because this panel does not include a QR generator.
              </p>
              <form
                className="flex flex-wrap items-end gap-3"
                onSubmit={(event) => {
                  event.preventDefault()
                  twoFactor({ action: 'enable', code }, () => {
                    setSetup(null)
                    setCode('')
                  })
                }}
              >
                <div className="w-44">
                  <Field label="6-digit code" htmlFor="two-factor-code">
                    <input
                      id="two-factor-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      required
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                      className={inputClass}
                    />
                  </Field>
                </div>
                <Button type="submit" loading={twoFactorBusy} disabled={code.length !== 6}>Turn on 2FA</Button>
                <Button type="button" variant="ghost" onClick={() => setSetup(null)}>Cancel</Button>
              </form>
            </div>
          )}

          {recoveryCodes && <RecoveryCodes codes={recoveryCodes} onDone={() => setRecoveryCodes(null)} />}

          {account.twoFactorEnabled && (
            <div className="space-y-5 mt-4">
              <div>
                <p className="text-sm font-medium text-gray-700">Recovery codes</p>
                <p className="text-sm text-gray-600" data-testid="recovery-left">
                  {account.recoveryCodesLeft === null
                    ? 'No recovery codes have been issued.'
                    : `${account.recoveryCodesLeft} unused recovery code${account.recoveryCodesLeft === 1 ? '' : 's'} left.`}{' '}
                  Creating new codes makes every old code stop working.
                </p>
                {account.recoveryCodesLeft !== null && account.recoveryCodesLeft <= 2 && (
                  <p className="text-sm text-amber-800 mt-1">You are running out of recovery codes. Create new ones.</p>
                )}
                <form
                  className="flex flex-wrap items-end gap-3 mt-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    twoFactor({ action: 'recovery_codes', password: regeneratePassword }, () => setRegeneratePassword(''))
                  }}
                >
                  <div className="w-64">
                    <Field label="Your password" htmlFor="recovery-password" hint="Needed to create new recovery codes.">
                      <input id="recovery-password" type="password" required autoComplete="current-password" value={regeneratePassword} onChange={(e) => setRegeneratePassword(e.target.value)} className={inputClass} />
                    </Field>
                  </div>
                  <Button type="submit" variant="secondary" loading={twoFactorBusy} className="mb-5">Create new recovery codes</Button>
                </form>
              </div>
              {account.twoFactorRequired ? (
                <p className="text-sm text-gray-600">Two-factor authentication is required for your role, so it cannot be turned off.</p>
              ) : (
                <form
                  className="flex flex-wrap items-end gap-3"
                  onSubmit={(event) => {
                    event.preventDefault()
                    twoFactor({ action: 'disable', password: disablePassword }, () => setDisablePassword(''))
                  }}
                >
                  <div className="w-64">
                    <Field label="Your password" htmlFor="two-factor-password" hint="Needed to turn 2FA off.">
                      <input id="two-factor-password" type="password" required autoComplete="current-password" value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} className={inputClass} />
                    </Field>
                  </div>
                  <Button type="submit" variant="danger" loading={twoFactorBusy} className="mb-5">Turn off 2FA</Button>
                </form>
              )}
            </div>
          )}
        </section>
      </Card>

      {/* ------------------------------- sessions ----------------------------- */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-5 pb-3">
          <div>
            <Heading>Your active sessions</Heading>
            <p className="text-sm text-gray-500">Devices where you are signed in right now.</p>
          </div>
          {others > 0 && (
            <Button variant="secondary" onClick={() => setPending({ type: 'others' })}>
              Sign out other devices
            </Button>
          )}
        </div>
        <div className="px-6"><NoticeBar notice={sessionNotice} onClose={() => setSessionNotice(null)} /></div>
        {sessions === null ? (
          <Spinner />
        ) : (
          <DataTable head={<><Th>Device</Th><Th>IP address</Th><Th>Started</Th><Th>Last seen</Th><Th>Expires</Th><Th right>Action</Th></>}>
            {sessions.map((session) => (
              <tr key={session.id}>
                <td className="px-4 py-3 text-gray-800" title={session.userAgent}>
                  {session.device} {session.current && <Badge tone="green">This session</Badge>}
                </td>
                <td className="px-4 py-3 text-gray-800 whitespace-nowrap">{session.ip}</td>
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(session.createdAt, true)}</td>
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(session.lastSeenAt, true)}</td>
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(session.expiresAt, true)}</td>
                <td className="px-4 py-3 text-right">
                  {!session.current && (
                    <Button variant="ghost" className="!px-2 !py-1 !text-red-600" onClick={() => setPending({ type: 'one', session })}>
                      End session
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>

      {/* ------------------------------- devices ------------------------------ */}
      <Card>
        <div className="px-6 pt-5 pb-3">
          <Heading>Your devices</Heading>
          <p className="text-sm text-gray-500">
            Every browser and network address you have signed in from. A sign-in from one that is not listed here is reported as a security event.
          </p>
        </div>
        {devices === null ? (
          <Spinner />
        ) : devices.length === 0 ? (
          <p className="px-6 pb-5 text-sm text-gray-500">No successful sign-in is recorded for your email yet.</p>
        ) : (
          <DataTable head={<><Th>Device</Th><Th>IP address</Th><Th>First sign-in</Th><Th>Last sign-in</Th><Th>Sign-ins</Th><Th>Session now</Th></>}>
            {devices.map((row) => (
              <tr key={`${row.ip}|${row.userAgent}`}>
                <td className="px-4 py-3 text-gray-800" title={row.userAgent}>{row.device}</td>
                <td className="px-4 py-3 text-gray-800 whitespace-nowrap">{row.ip}</td>
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(row.firstSeen, true)}</td>
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(row.lastSeen, true)}</td>
                <td className="px-4 py-3 text-gray-800">{row.signIns}</td>
                <td className="px-4 py-3">{row.sessionOpen ? <Badge tone="green">Signed in</Badge> : <span className="text-gray-400 text-xs">No</span>}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>

      {/* -------------------------------- logins ------------------------------ */}
      <Card>
        <div className="px-6 pt-5 pb-3">
          <Heading>Your recent sign-ins</Heading>
          <p className="text-sm text-gray-500">The last ten attempts to sign in with your email. Tell a Super Admin if you do not recognise one.</p>
        </div>
        {logins === null ? (
          <Spinner />
        ) : logins.length === 0 ? (
          <p className="px-6 pb-5 text-sm text-gray-500">No sign-in attempts are recorded for your email yet.</p>
        ) : (
          <DataTable head={<><Th>Time</Th><Th>Result</Th><Th>IP address</Th><Th>Device</Th></>}>
            {logins.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(row.createdAt, true)}</td>
                <td className="px-4 py-3">
                  <Badge tone={row.success ? 'green' : 'red'}>{row.success ? 'Success' : 'Failure'}</Badge>
                  {!row.success && <span className="block text-xs text-gray-500 mt-1">{row.reasonLabel}</span>}
                </td>
                <td className="px-4 py-3 text-gray-800 whitespace-nowrap">{row.ip}</td>
                <td className="px-4 py-3 text-gray-800">
                  {row.device} {row.newDevice && <Badge tone="amber">New device or location</Badge>}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(pending)}
        title={pending?.type === 'others' ? 'Sign out your other devices?' : 'End this session?'}
        message={
          pending?.type === 'one'
            ? <>{pending.session.device} ({pending.session.ip}) will be signed out immediately.</>
            : 'Every session except the one you are using now is ended.'
        }
        confirmLabel="Sign out"
        danger
        askReason
        reasonRequired
        busy={sessionBusy}
        onConfirm={endSessions}
        onClose={() => setPending(null)}
      />
    </div>
  )
}

export default function AccountPage() {
  return (
    <AdminShell title="My Account" subtitle="Your profile, password, two-factor authentication and sessions">
      <AccountBody />
    </AdminShell>
  )
}
