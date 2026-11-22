"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { Wrench } from "lucide-react"
import { api, ApiError } from "@/lib/api-client"
import { clearSession, getSession } from "@/lib/auth"
import { showToast } from "@/lib/toast"
import type { PlatformInfo } from "@/lib/types"

/** What GET /public/platform publishes, as the website uses it. Every value is set in the admin panel. */
export interface SitePlatform extends PlatformInfo {
  /** General enquiries and partnerships addresses ("" when not published). */
  contacts: { general: string; partnerships: string }
  /** The website's public address ("" when not set). */
  website: string
}

const PlatformContext = createContext<SitePlatform | null>(null)

/** Platform details from the backend (name, contacts, maintenance); null until loaded. */
export function usePlatform(): SitePlatform | null {
  return useContext(PlatformContext)
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

async function loadPlatform(): Promise<SitePlatform> {
  const data = await api<any>("/public/platform")
  const policyLinks: Record<string, string> = {}
  if (data.policyLinks && typeof data.policyLinks === "object") {
    for (const [key, value] of Object.entries(data.policyLinks)) {
      if (text(value)) policyLinks[key] = text(value)
    }
  }
  return {
    name: text(data.name) || "Mookalaa",
    support: {
      email: text(data.support?.email),
      phone: text(data.support?.phone),
      address: text(data.support?.address),
    },
    contacts: {
      general: text(data.contacts?.general),
      partnerships: text(data.contacts?.partnerships),
    },
    website: text(data.website),
    policyLinks,
    maintenance: {
      active: data.maintenance?.active === true,
      message: text(data.maintenance?.message),
      endsAt: data.maintenance?.endsAt || null,
      upcomingWindow: data.maintenance?.upcomingWindow || null,
    },
  }
}

function formatWhen(value: string | null): string {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  // The platform runs on India time (the timezone the backend publishes is fixed to Asia/Kolkata).
  return (
    date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) + " IST"
  )
}

export function PlatformProvider({ children }: { children: ReactNode }) {
  const [platform, setPlatform] = useState<SitePlatform | null>(null)

  useEffect(() => {
    let cancelled = false
    loadPlatform()
      .then((info) => {
        if (!cancelled) setPlatform(info)
      })
      .catch(() => {
        // Without this information the site still works; nothing is assumed.
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Check a stored session once when the site opens. A 401 signs the visitor
  // out inside api(); a 403 means the account was suspended or blocked.
  useEffect(() => {
    if (!getSession()) return
    api("/public/session").catch((error) => {
      if (error instanceof ApiError && error.status === 403) {
        clearSession()
        showToast(error.message, "error")
      }
    })
  }, [])

  return <PlatformContext.Provider value={platform}>{children}</PlatformContext.Provider>
}

/** Replaces the page with the maintenance message while the backend says maintenance is on. */
export function MaintenanceGate({ children }: { children: ReactNode }) {
  const platform = usePlatform()
  const maintenance = platform?.maintenance

  if (platform && maintenance?.active) {
    const until = formatWhen(maintenance.endsAt)
    return (
      <main className="min-h-[70vh] flex items-center justify-center px-4 py-16">
        <div className="max-w-lg text-center bg-card border border-border rounded-2xl p-10">
          <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-amber-500/20 flex items-center justify-center">
            <Wrench className="text-amber-500" size={28} />
          </div>
          <h1 className="text-2xl font-bold mb-3">{platform.name} is under maintenance</h1>
          <p className="text-muted-foreground">
            {maintenance.message || "We are making some improvements. Please come back in a little while."}
          </p>
          {until && <p className="text-sm text-muted-foreground mt-4">Expected back by {until}.</p>}
          {platform.support.email && (
            <p className="text-sm text-muted-foreground mt-4">
              Need help? Write to{" "}
              <a className="underline" href={`mailto:${platform.support.email}`}>
                {platform.support.email}
              </a>
            </p>
          )}
        </div>
      </main>
    )
  }

  const upcoming = maintenance?.upcomingWindow
  const startsAt = upcoming ? new Date(upcoming.startsAt).getTime() : NaN
  const showNotice = Number.isFinite(startsAt) && startsAt > Date.now() && startsAt - Date.now() < 24 * 3600 * 1000

  return (
    <>
      {showNotice && upcoming && (
        <div role="status" className="bg-amber-500/15 border-b border-amber-500/30 text-sm text-center px-4 py-2">
          Planned maintenance from {formatWhen(upcoming.startsAt)} to {formatWhen(upcoming.endsAt)}
          {upcoming.message ? `: ${upcoming.message}` : "."}
        </div>
      )}
      {children}
    </>
  )
}
