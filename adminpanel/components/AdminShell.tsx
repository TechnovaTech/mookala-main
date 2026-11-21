'use client'
import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bell, ChevronDown, LogOut, Search, ShieldCheck, User } from 'lucide-react'
import Sidebar from './Sidebar'
import { api } from './ui'
import { ROLES, can, type AdminIdentity } from '@/lib/permissions'

/**
 * Page frame used by every admin screen: permission-filtered sidebar, header
 * with working global search, operational alerts, the signed-in admin's real
 * name and role, and sign-out.
 *
 *   <AdminShell title="Coupons" subtitle="...">
 *     ...page content...
 *   </AdminShell>
 */

export interface CurrentAdmin extends AdminIdentity {
  permissions?: string[]
  twoFactorEnabled?: boolean
  mustChangePassword?: boolean
}

const AdminContext = createContext<CurrentAdmin | null>(null)

/** The signed-in admin, or null while it is still loading. */
export function useAdmin(): CurrentAdmin | null {
  return useContext(AdminContext)
}

/** True when the signed-in admin holds the permission, e.g. useCan('finance:manage'). */
export function useCan(permission: string): boolean {
  const admin = useAdmin()
  return can(admin, permission)
}

interface SearchResult {
  type: string
  label: string
  detail?: string
  href: string
}

interface Alert {
  key: string
  label: string
  count: number
  href: string
  severity: 'info' | 'warning' | 'critical'
}

function GlobalSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const term = query.trim()
    if (term.length < 2) {
      setResults([])
      return
    }
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const data = await api<{ results: SearchResult[] }>('/api/admin/search?q=' + encodeURIComponent(term))
        setResults(data.results || [])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <div className="relative hidden lg:block" ref={boxRef}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-gray w-4 h-4" />
      <input
        id="global-search"
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search users, artists, events, bookings..."
        aria-label="Search the admin panel"
        className="pl-10 pr-4 py-2 w-80 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal/30 focus:border-teal outline-none"
      />
      {open && query.trim().length >= 2 && (
        <div className="absolute right-0 mt-2 w-[28rem] max-h-96 overflow-y-auto bg-white rounded-lg shadow-xl border border-gray-200 z-50">
          {loading && <p className="px-4 py-3 text-sm text-gray-500">Searching...</p>}
          {!loading && results.length === 0 && (
            <p className="px-4 py-3 text-sm text-gray-500">No records match “{query.trim()}”.</p>
          )}
          {!loading &&
            results.map((result, index) => (
              <Link
                key={result.type + result.href + index}
                href={result.href}
                onClick={() => setOpen(false)}
                className="flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 border-b border-gray-100 last:border-0"
              >
                <span className="mt-0.5 text-[10px] uppercase tracking-wide font-semibold text-teal bg-teal/10 rounded px-1.5 py-0.5 shrink-0">
                  {result.type}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm text-gray-900 truncate">{result.label}</span>
                  {result.detail && <span className="block text-xs text-gray-500 truncate">{result.detail}</span>}
                </span>
              </Link>
            ))}
        </div>
      )}
    </div>
  )
}

function AlertsBell() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    api<{ alerts: Alert[] }>('/api/admin/alerts')
      .then((data) => {
        if (!cancelled) setAlerts(data.alerts || [])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const total = alerts.reduce((sum, alert) => sum + alert.count, 0)

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => setOpen(!open)}
        aria-label={total ? `${total} items need attention` : 'No items need attention'}
        className="relative p-2 text-slate-gray hover:text-deep-blue hover:bg-teal/10 rounded-lg"
      >
        <Bell size={20} />
        {total > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1 bg-red-600 text-white text-xs rounded-full flex items-center justify-center">
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-50">
          <p className="px-4 py-3 text-sm font-semibold text-deep-blue border-b border-gray-200">Needs attention</p>
          {alerts.length === 0 && <p className="px-4 py-4 text-sm text-gray-500">Nothing is waiting for action.</p>}
          {alerts.map((alert) => (
            <Link
              key={alert.key}
              href={alert.href}
              onClick={() => setOpen(false)}
              className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
            >
              <span className="text-gray-800">{alert.label}</span>
              <span
                className={`text-xs font-semibold rounded-full px-2 py-0.5 ${
                  alert.severity === 'critical'
                    ? 'bg-red-100 text-red-700'
                    : alert.severity === 'warning'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-blue-100 text-blue-800'
                }`}
              >
                {alert.count}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AdminShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string
  subtitle?: string
  /** Buttons shown at the right of the page title, e.g. "Add". */
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  const [admin, setAdmin] = useState<CurrentAdmin | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem('admin-sidebar-collapsed') === '1')
    } catch {}

    let cancelled = false
    api<{ admin: CurrentAdmin }>('/api/auth/me')
      .then((data) => {
        if (!cancelled) setAdmin(data.admin)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const toggleSidebar = () => {
    const next = !collapsed
    setCollapsed(next)
    try {
      window.localStorage.setItem('admin-sidebar-collapsed', next ? '1' : '0')
    } catch {}
  }

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
    } finally {
      window.location.href = '/login'
    }
  }

  const roleLabel = ROLES.find((role) => role.value === admin?.role)?.label || ''
  const displayName = admin?.name || admin?.email || ''
  const offset = collapsed ? 'left-16' : 'left-64'

  return (
    <AdminContext.Provider value={admin}>
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar admin={admin} collapsed={collapsed} onToggle={toggleSidebar} />

        <div className={`flex-1 min-w-0 ${collapsed ? 'ml-16' : 'ml-64'} min-h-screen`}>
          <header className={`bg-white shadow-sm border-b border-gray-200 px-6 py-4 fixed top-0 right-0 ${offset} z-40`}>
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-2xl font-bold text-deep-blue truncate">{title}</h1>
                {subtitle && <p className="text-slate-gray text-sm truncate">{subtitle}</p>}
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <GlobalSearch />
                <AlertsBell />

                <div className="relative" ref={menuRef}>
                  <button
                    onClick={() => setMenuOpen(!menuOpen)}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2 hover:bg-teal/10 border border-gray-100"
                  >
                    <span className="w-9 h-9 bg-gradient-to-r from-emerald to-teal rounded-full flex items-center justify-center text-white text-sm font-bold">
                      {(displayName[0] || 'A').toUpperCase()}
                    </span>
                    <span className="hidden md:block text-left">
                      <span className="block text-sm font-medium text-deep-blue max-w-[10rem] truncate">
                        {displayName || 'Loading...'}
                      </span>
                      <span className="block text-xs text-slate-gray">{roleLabel}</span>
                    </span>
                    <ChevronDown size={16} className={`text-slate-gray ${menuOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {menuOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50" role="menu">
                      <Link
                        href="/security/account"
                        role="menuitem"
                        className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <User size={16} className="mr-3 text-slate-gray" />
                        My account
                      </Link>
                      <Link
                        href="/security/account#two-factor"
                        role="menuitem"
                        className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <ShieldCheck size={16} className="mr-3 text-slate-gray" />
                        Password &amp; 2FA
                      </Link>
                      <hr className="my-2 border-gray-200" />
                      <button
                        onClick={logout}
                        role="menuitem"
                        className="w-full flex items-center px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                      >
                        <LogOut size={16} className="mr-3" />
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </header>

          <main className="px-6 pb-10 pt-28">
            {admin?.mustChangePassword && (
              <div className="mb-4 border border-amber-300 bg-amber-50 text-amber-900 rounded-lg px-4 py-3 text-sm" role="alert">
                This account is still using a temporary password.{' '}
                <Link href="/security/account" className="font-semibold underline">
                  Change it now
                </Link>
                .
              </div>
            )}
            {actions && <div className="flex flex-wrap justify-end gap-3 mb-4">{actions}</div>}
            {children}
          </main>
        </div>
      </div>
    </AdminContext.Provider>
  )
}
