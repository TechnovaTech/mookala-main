"use client"

import Link from "next/link"
import { usePlatform } from "@/components/platform-provider"

/** Contacts come from the admin panel (GET /public/platform); a value that is not published is not shown. */
export function Footer() {
  const platform = usePlatform()
  const email = platform?.support.email || ""
  const phone = platform?.support.phone || ""
  const address = platform?.support.address || ""
  const general = platform?.contacts.general || ""
  const partnerships = platform?.contacts.partnerships || ""

  const link = "hover:text-foreground transition"
  const hasSupport = Boolean(email || phone || address)
  const hasPartnerships = Boolean(general || partnerships)

  return (
    <footer className="border-t border-border/40 pt-12 pb-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          <div>
            <h3 className="font-bold mb-4">Discover</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/events" className={link}>
                  Browse Events
                </Link>
              </li>
              <li>
                <Link href="/events?type=free" className={link}>
                  Free Events
                </Link>
              </li>
              <li>
                <Link href="/bookings" className={link}>
                  My Bookings
                </Link>
              </li>
            </ul>
          </div>
          {hasSupport && (
            <div>
              <h3 className="font-bold mb-4">Support</h3>
              <ul className="space-y-2 text-sm text-muted-foreground" data-footer="support">
                {email && (
                  <li>
                    <a href={`mailto:${email}`} className={link}>
                      {email}
                    </a>
                  </li>
                )}
                {phone && (
                  <li>
                    <a href={`tel:${phone.replace(/[^+\d]/g, "")}`} className={link}>
                      {phone}
                    </a>
                  </li>
                )}
                {address && <li>{address}</li>}
              </ul>
            </div>
          )}
          <div>
            <h3 className="font-bold mb-4">Legal</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/privacy" className={link}>
                  Privacy
                </Link>
              </li>
              <li>
                <Link href="/terms" className={link}>
                  Terms
                </Link>
              </li>
              <li>
                <Link href="/refund-policy" className={link}>
                  Refund Policy
                </Link>
              </li>
            </ul>
          </div>
          {hasPartnerships && (
            <div>
              <h3 className="font-bold mb-4">Partnerships</h3>
              <ul className="space-y-2 text-sm text-muted-foreground" data-footer="partnerships">
                {general && (
                  <li>
                    <a href={`mailto:${general}`} className={link}>
                      {general}
                    </a>
                  </li>
                )}
                {partnerships && (
                  <li>
                    <a href={`mailto:${partnerships}`} className={link}>
                      {partnerships}
                    </a>
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
        <div className="border-t border-border pt-8 text-center text-sm text-muted-foreground">
          <p>
            &copy; {new Date().getFullYear()} Venootic Enterprises OPC Private Limited. MOOKALAA is a registered
            trademark of Venootic Enterprises OPC Private Limited.
          </p>
        </div>
      </div>
    </footer>
  )
}
