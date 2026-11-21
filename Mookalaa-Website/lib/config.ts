/**
 * The one place that knows where the Mookalaa backend lives.
 * Set NEXT_PUBLIC_ADMIN_API_URL (for example in .env.local) to point the
 * website at another backend; production builds default to the live one.
 */
const DEFAULT_API_URL = "https://mookala.vercel.app/api"

export const API_BASE = (process.env.NEXT_PUBLIC_ADMIN_API_URL || DEFAULT_API_URL).replace(/\/+$/, "")

/** The backend host without the /api suffix: images stored as paths live there. */
export const API_ORIGIN = API_BASE.replace(/\/api$/, "")

/**
 * Turns an image value from the backend into something an <img> can show.
 * The backend stores images as a full URL, a path on the backend host, a
 * `data:` URL (older website saves) or raw base64 (the mobile apps).
 */
export function resolveImage(value: unknown): string | null {
  if (typeof value !== "string") return null
  const text = value.trim()
  if (!text) return null
  if (text.startsWith("data:")) return text
  if (/^https?:\/\//i.test(text)) return text
  // Raw base64 is checked before paths: JPEG data itself starts with "/9j/".
  // PNG data starts with iVBOR; everything else is treated as JPEG.
  if (text.length > 200 && /^[A-Za-z0-9+/=\s]+$/.test(text)) {
    const mime = text.startsWith("iVBOR") ? "image/png" : "image/jpeg"
    return `data:${mime};base64,${text}`
  }
  if (text.startsWith("/")) return `${API_ORIGIN}${text}`
  return null
}
