/**
 * Downloads a file from an admin API route with the admin's session cookie.
 * Unlike a plain link, a refusal (no permission, expired file) comes back as a
 * message that the screen can show instead of a page of JSON.
 */
export async function downloadFile(url: string): Promise<{ filename: string; size: number; sha256: string | null }> {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' })

  if (response.status === 401 && typeof window !== 'undefined') {
    window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname)
    throw new Error('Your session has ended. Please sign in again.')
  }
  if (!response.ok) {
    let message = `The download failed (${response.status}).`
    try {
      const data = await response.json()
      if (data && data.error) message = data.error
    } catch {
      // The body was not JSON: keep the generic message.
    }
    throw new Error(message)
  }

  const disposition = response.headers.get('Content-Disposition') || ''
  const match = /filename="([^"]+)"/.exec(disposition)
  const filename = match ? match[1] : 'report'
  const blob = await response.blob()

  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoked a little later so the browser has started reading the file.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000)

  return { filename, size: blob.size, sha256: response.headers.get('X-Checksum-Sha256') }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const FORMAT_LABELS: Record<string, string> = { xlsx: 'Excel', pdf: 'PDF', csv: 'CSV' }

/** "21 Nov 2026, 06:55 pm IST": times on the report screens are always shown in India time. */
export function istTime(value: any, withTime = true): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  const text = date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  })
  return withTime ? text + ' IST' : text
}
