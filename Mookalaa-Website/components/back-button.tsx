"use client"

import { ArrowLeft } from "lucide-react"
import { useRouter } from "next/navigation"

interface BackButtonProps {
  /** Where to go when there is no page to go back to (direct link, new tab). */
  fallbackHref?: string
  label?: string
  /** "onDark" for pages that paint their own dark background. */
  variant?: "default" | "onDark"
  className?: string
}

const VARIANTS = {
  default:
    "border-border bg-background/60 text-foreground hover:bg-muted focus-visible:ring-ring",
  onDark:
    "border-white/20 bg-white/10 text-white hover:bg-white/20 focus-visible:ring-white/60",
}

export function BackButton({
  fallbackHref = "/",
  label = "Back",
  variant = "default",
  className = "",
}: BackButtonProps) {
  const router = useRouter()

  const handleBack = () => {
    // history.length is 1 when this page is the first entry in the tab, e.g. a
    // shared link opened directly — router.back() would leave the site.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back()
    } else {
      router.push(fallbackHref)
    }
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      aria-label={label}
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium backdrop-blur transition-colors focus:outline-none focus-visible:ring-2 ${VARIANTS[variant]} ${className}`}
    >
      <ArrowLeft size={18} />
      <span>{label}</span>
    </button>
  )
}
