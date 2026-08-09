import type React from "react"
import { BackButton } from "@/components/back-button"

/**
 * Shared shell for the long-form legal pages (Privacy Policy, Terms).
 * Keeps both documents visually identical and easy to extend.
 */
export function LegalPage({
  title,
  intro,
  updated,
  children,
}: {
  title: string
  intro?: string
  updated?: string
  children: React.ReactNode
}) {
  return (
    <main className="min-h-screen pt-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <BackButton />
      </div>

      {/* Hero */}
      <section className="bg-gradient-to-br from-amber-500/10 to-amber-600/10 border-b border-amber-500/20 py-16 mt-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-amber-500 to-amber-600 bg-clip-text text-transparent">
            {title}
          </h1>
          {intro && <p className="text-lg text-muted-foreground max-w-2xl mx-auto">{intro}</p>}
          {updated && <p className="text-sm text-muted-foreground mt-3">{updated}</p>}
        </div>
      </section>

      {/* Body */}
      <section className="px-4 sm:px-6 lg:px-8 py-12 max-w-4xl mx-auto">
        <div className="space-y-6">{children}</div>
      </section>
    </main>
  )
}

export function LegalSection({
  heading,
  children,
  highlight = false,
}: {
  heading: string
  children: React.ReactNode
  highlight?: boolean
}) {
  return (
    <div
      className={
        highlight
          ? "bg-gradient-to-br from-amber-500/10 to-amber-600/10 border border-amber-500/20 rounded-lg p-6"
          : "bg-card border border-border rounded-lg p-6"
      }
    >
      <h2 className="text-2xl font-semibold mb-4 text-amber-600">{heading}</h2>
      <div className="space-y-4 text-muted-foreground leading-relaxed">{children}</div>
    </div>
  )
}

export function LegalSubheading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-semibold text-foreground pt-1">{children}</h3>
}

export function LegalList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5">
          <span className="w-2 h-2 bg-amber-500 rounded-full mt-[0.45rem] flex-shrink-0" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}
