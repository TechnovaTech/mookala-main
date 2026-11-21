/** A `next` value from the URL, only when it is a path on this site. */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value) return null
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null
  return value
}

export function loginPath(next?: string): string {
  return next ? `/login?next=${encodeURIComponent(next)}` : "/login"
}
