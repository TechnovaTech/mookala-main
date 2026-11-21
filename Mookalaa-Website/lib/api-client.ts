import { API_BASE } from "./config"
import { clearSession, getSession } from "./auth"

/** A backend answer that was not a success, or no answer at all (status 0). */
export class ApiError extends Error {
  status: number
  code: string
  data: Record<string, any>

  constructor(message: string, status: number, data: Record<string, any> = {}) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = typeof data.code === "string" ? data.code : ""
    this.data = data
  }

  /** Seconds the server asked us to wait (OTP cooldown), when it said so. */
  get retryAfterSeconds(): number | null {
    const value = Number(this.data.retryAfterSeconds)
    return Number.isFinite(value) && value > 0 ? Math.ceil(value) : null
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  body?: unknown
  /** Use this token instead of the stored session (during sign-in). */
  token?: string
  signal?: AbortSignal
}

/**
 * Every call to the backend goes through here. It adds the Bearer token when
 * someone is signed in, signs the visitor out when the server says the token is
 * no longer valid (401), and throws ApiError for anything that is not a success.
 */
export async function api<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
  const session = typeof window === "undefined" ? null : getSession()
  const token = options.token || session?.token
  const headers: Record<string, string> = { Accept: "application/json" }
  if (options.body !== undefined) headers["Content-Type"] = "application/json"
  if (token) headers.Authorization = `Bearer ${token}`

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path.startsWith("/") ? path : `/${path}`}`, {
      method: options.method || (options.body !== undefined ? "POST" : "GET"),
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
      signal: options.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error
    throw new ApiError("Could not reach Mookalaa. Check your connection and try again.", 0)
  }

  let data: any = null
  try {
    data = await response.json()
  } catch {
    data = null
  }

  if (response.status === 401 && token && !options.token) clearSession()

  const failed = !response.ok || (data && typeof data === "object" && !Array.isArray(data) && data.success === false)
  if (failed) {
    const details = data && typeof data === "object" && !Array.isArray(data) ? data : {}
    const message =
      (typeof details.error === "string" && details.error) ||
      (typeof details.message === "string" && details.message) ||
      (response.status === 401
        ? "Your session has expired. Please sign in again."
        : `The request failed (${response.status}). Please try again.`)
    throw new ApiError(message, response.status, details)
  }

  return data as T
}

/** The message to show a visitor for any thrown value. */
export function errorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (error instanceof ApiError) return error.message
  return fallback
}
