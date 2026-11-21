/**
 * Turns a browser user-agent string into a short "Chrome 126 on macOS" label.
 * Pure text handling, shared by the security API routes and screens.
 */
export function describeDevice(userAgent?: string | null): string {
  const ua = String(userAgent || '').trim()
  if (!ua) return 'Unknown device'

  let os = ''
  if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS'
  else if (/Android/.test(ua)) os = 'Android'
  else if (/Windows NT/.test(ua)) os = 'Windows'
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS'
  else if (/CrOS/.test(ua)) os = 'ChromeOS'
  else if (/Linux/.test(ua)) os = 'Linux'

  const pick = (pattern: RegExp, name: string) => {
    const match = ua.match(pattern)
    return match ? `${name} ${match[1]}` : ''
  }

  // Order matters: Edge and Opera also say "Chrome", Chrome also says "Safari".
  const browser =
    pick(/Edg(?:e|A|iOS)?\/(\d+)/, 'Edge') ||
    pick(/OPR\/(\d+)/, 'Opera') ||
    pick(/Firefox\/(\d+)/, 'Firefox') ||
    pick(/(?:Chrome|CriOS)\/(\d+)/, 'Chrome') ||
    (/Safari\//.test(ua) ? pick(/Version\/(\d+)/, 'Safari') || 'Safari' : '') ||
    pick(/^curl\/(\d+)/, 'curl') ||
    pick(/PostmanRuntime\/(\d+)/, 'Postman') ||
    pick(/Dart\/(\d+)/, 'Dart app') ||
    pick(/okhttp\/(\d+)/, 'Android app') ||
    pick(/node(?:-fetch)?\/?v?(\d+)/i, 'Node')

  if (browser && os) return `${browser} on ${os}`
  if (browser) return browser
  if (os) return `Unknown browser on ${os}`
  return ua.length > 40 ? ua.slice(0, 40) + '…' : ua
}
