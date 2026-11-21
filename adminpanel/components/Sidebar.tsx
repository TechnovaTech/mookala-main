'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity,
  BadgeCheck,
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileBarChart,
  Gift,
  GraduationCap,
  Lock,
  Megaphone,
  MessageSquare,
  Music,
  Percent,
  Scale,
  ShieldAlert,
  Ticket,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { NAV, can, type AdminIdentity, type NavGroup } from '@/lib/permissions'

const ICONS: Record<string, LucideIcon> = {
  Activity,
  BadgeCheck,
  BarChart3,
  CreditCard,
  FileBarChart,
  Gift,
  GraduationCap,
  Lock,
  Megaphone,
  MessageSquare,
  Music,
  Percent,
  Scale,
  ShieldAlert,
  Ticket,
  Users,
}

function isActive(pathname: string, href: string, siblings: string[]): boolean {
  if (pathname === href) return true
  if (!pathname.startsWith(href + '/')) return false
  // A longer sibling link that also matches wins, e.g. /finance/refunds over /finance.
  return !siblings.some((other) => other !== href && other.length > href.length && (pathname === other || pathname.startsWith(other + '/')))
}

export default function Sidebar({
  admin: adminProp,
  collapsed = false,
  onToggle,
}: {
  /** The signed-in admin. Menu entries the admin may not open are hidden. */
  admin?: AdminIdentity | null
  collapsed?: boolean
  onToggle?: () => void
}) {
  const pathname = usePathname() || ''
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const [fetched, setFetched] = useState<AdminIdentity | null>(null)

  // Pages that render <Sidebar /> on their own (without AdminShell) still get a
  // permission-filtered menu: the signed-in admin is looked up here.
  useEffect(() => {
    if (adminProp !== undefined) return
    let cancelled = false
    fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.admin) setFetched(data.admin)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [adminProp])

  const admin = adminProp !== undefined ? adminProp : fetched

  // Until the admin is known, show nothing rather than links that may be refused.
  const visible: NavGroup[] = admin
    ? NAV.map((group) => {
        if (!group.items) return can(admin, group.permission || '') ? group : null
        const items = group.items.filter((item) => can(admin, item.permission))
        return items.length ? { ...group, items } : null
      }).filter((group): group is NavGroup => Boolean(group))
    : []

  const allLinks = NAV.flatMap((group) => (group.items ? group.items.map((i) => i.href) : [group.href || '']))

  useEffect(() => {
    const current = NAV.find((group) => group.items?.some((item) => isActive(pathname, item.href, allLinks)))
    if (current) setOpenGroup(current.label)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  return (
    <aside
      className={`${collapsed ? 'w-16' : 'w-64'} bg-gradient-to-b from-deep-blue to-indigo h-screen fixed left-0 top-0 z-50 shadow-2xl flex flex-col`}
    >
      <div className={`border-b border-white/10 flex items-center ${collapsed ? 'justify-center p-3' : 'justify-between p-5'}`}>
        {!collapsed && (
          <div>
            <p className="text-white text-xl font-bold tracking-wide">Mookalaa</p>
            <p className="text-white/70 text-xs font-medium">Admin Panel</p>
          </div>
        )}
        <button
          onClick={onToggle}
          aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
          className="text-white/70 hover:text-white p-2 rounded-lg hover:bg-white/10"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-hide py-3" aria-label="Admin sections">
        {visible.map((group) => {
          const Icon = ICONS[group.icon] || BarChart3
          const groupActive = group.items
            ? group.items.some((item) => isActive(pathname, item.href, allLinks))
            : isActive(pathname, group.href || '', allLinks)
          const open = openGroup === group.label

          const rowClass = `w-full flex items-center ${collapsed ? 'justify-center px-2' : 'justify-between px-5'} py-3 text-left text-sm ${
            groupActive ? 'bg-white/15 text-white font-semibold' : 'text-white/80 hover:text-white hover:bg-white/10'
          }`

          if (!group.items) {
            return (
              <Link key={group.label} href={group.href || '/dashboard'} className={rowClass} title={group.label}>
                <span className="flex items-center gap-3">
                  <Icon size={18} />
                  {!collapsed && group.label}
                </span>
              </Link>
            )
          }

          // When the menu is collapsed a group links straight to its first page.
          if (collapsed) {
            return (
              <Link key={group.label} href={group.items[0].href} className={rowClass} title={group.label}>
                <Icon size={18} />
              </Link>
            )
          }

          return (
            <div key={group.label}>
              <button
                type="button"
                className={rowClass}
                aria-expanded={open}
                onClick={() => setOpenGroup(open ? null : group.label)}
              >
                <span className="flex items-center gap-3">
                  <Icon size={18} />
                  {group.label}
                </span>
                <ChevronDown size={15} className={open ? 'rotate-180' : ''} />
              </button>

              {open && (
                <div className="bg-black/15 py-1">
                  {group.items.map((item) => {
                    const active = isActive(pathname, item.href, allLinks)
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={`block pl-12 pr-4 py-2 text-sm ${
                          active
                            ? 'text-white font-medium bg-gradient-to-r from-emerald to-teal'
                            : 'text-white/70 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        {item.label}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>
    </aside>
  )
}
