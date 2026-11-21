"use client"

import type React from "react"
import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Menu, Search, Ticket, User, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TranslateWidget } from "@/components/translate-widget"
import { useAuth } from "@/lib/auth"

function SearchForm({ className, onSearched }: { className: string; onSearched?: () => void }) {
  const router = useRouter()
  const [query, setQuery] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = query.trim()
    router.push(text ? `/events?search=${encodeURIComponent(text)}` : "/events")
    onSearched?.()
  }

  return (
    <form onSubmit={handleSubmit} role="search" className={className}>
      <div className="relative w-full">
        <input
          type="search"
          aria-label="Search events"
          placeholder="Search arts & events..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-4 pr-10 py-2 bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20 transition text-sm"
        />
        <button type="submit" aria-label="Search" className="absolute right-3 top-1/2 -translate-y-1/2">
          <Search size={18} className="text-muted-foreground" />
        </button>
      </div>
    </form>
  )
}

export function Header() {
  const { ready, isSignedIn, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()

  // Close the mobile menu whenever the visitor lands on another page.
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  const signedIn = ready && isSignedIn

  const handleSignOut = () => {
    signOut()
    setMenuOpen(false)
    // Account pages send themselves home when the session ends.
    if (!["/profile", "/profile-setup"].includes(pathname)) router.push("/")
  }

  const pill = "rounded-lg bg-white text-[#124972] hover:bg-gray-100 text-sm px-4"

  return (
    <header className="sticky top-0 z-50 border-b border-[#124972]/40" style={{ backgroundColor: "#124972" }}>
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-x-3">
          <Link href="/" className="flex items-center h-16 sm:h-20 hover:opacity-80 transition flex-shrink-0">
            <img src="/mookalaa-logo-2.png" alt="MOOKALAA - Unite through Arts" className="h-8 sm:h-10 w-auto" />
          </Link>

          <SearchForm className="hidden lg:flex flex-1 max-w-md mx-4 xl:mx-8" />

          {/* One translate control: in the bar on large screens, in the menu on small ones. */}
          <TranslateWidget
            className={`${menuOpen ? "block" : "hidden"} lg:block order-last lg:order-none basis-full lg:basis-auto pb-3 lg:pb-0`}
          />

          {/* Desktop actions */}
          <nav className="hidden lg:flex items-center gap-3" aria-label="Account">
            {signedIn ? (
              <>
                <Button asChild size="sm" className={pill}>
                  <Link href="/bookings">
                    <Ticket size={16} className="mr-1" />
                    My bookings
                  </Link>
                </Button>
                <Button asChild size="sm" className={pill}>
                  <Link href="/profile">
                    <User size={16} className="mr-1" />
                    Profile
                  </Link>
                </Button>
              </>
            ) : (
              <Button asChild size="sm" className={pill}>
                <Link href="/login">Login</Link>
              </Button>
            )}
            <Button asChild size="sm" className="rounded-lg bg-accent hover:bg-accent/90 text-sm px-4">
              <Link href="/events">Explore</Link>
            </Button>
          </nav>

          {/* Mobile menu button */}
          <button
            type="button"
            className="lg:hidden p-2 rounded-lg text-white hover:bg-white/10"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>

          {/* Mobile menu */}
          {menuOpen && (
            <div id="mobile-menu" className="lg:hidden order-last basis-full pb-4 space-y-3">
              <SearchForm className="flex" onSearched={() => setMenuOpen(false)} />
              <nav className="flex flex-col gap-2" aria-label="Menu">
                <Link href="/events" className="px-3 py-2 rounded-lg text-white hover:bg-white/10">
                  Explore events
                </Link>
                {signedIn ? (
                  <>
                    <Link href="/bookings" className="px-3 py-2 rounded-lg text-white hover:bg-white/10">
                      My bookings
                    </Link>
                    <Link href="/profile" className="px-3 py-2 rounded-lg text-white hover:bg-white/10">
                      Profile
                    </Link>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="px-3 py-2 rounded-lg text-left text-white hover:bg-white/10"
                    >
                      Sign out
                    </button>
                  </>
                ) : (
                  <Link href="/login" className="px-3 py-2 rounded-lg text-white hover:bg-white/10">
                    Login
                  </Link>
                )}
              </nav>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
