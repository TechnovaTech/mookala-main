"use client"

import { useEffect, useState, useSyncExternalStore } from "react"

/**
 * The signed-in session: the phone that passed OTP and the token the backend
 * issued for it. Both live in localStorage. Every component that calls
 * `useAuth()` re-renders the moment the session changes, in this tab or another.
 */
export interface Session {
  token: string
  phone: string
}

const TOKEN_KEY = "mookalaaToken"
const PHONE_KEY = "userPhone"
const CHANGE_EVENT = "mookalaa-auth-change"

let cachedRaw: string | null = null
let cachedSession: Session | null = null

function read(): Session | null {
  if (typeof window === "undefined") return null
  let token: string | null = null
  let phone: string | null = null
  try {
    token = window.localStorage.getItem(TOKEN_KEY)
    phone = window.localStorage.getItem(PHONE_KEY)
  } catch {
    return null
  }
  const raw = token && phone ? `${phone}|${token}` : ""
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cachedSession = token && phone ? { token, phone } : null
  }
  return cachedSession
}

function announce() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function getSession(): Session | null {
  return read()
}

export function setSession(session: Session) {
  try {
    window.localStorage.setItem(TOKEN_KEY, session.token)
    window.localStorage.setItem(PHONE_KEY, session.phone)
  } catch {
    // Storage is unavailable (private mode): the session cannot be kept.
  }
  announce()
}

export function clearSession() {
  try {
    window.localStorage.removeItem(TOKEN_KEY)
    window.localStorage.removeItem(PHONE_KEY)
  } catch {
    // Nothing to clear.
  }
  announce()
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener("storage", onChange)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener("storage", onChange)
  }
}

/**
 * `ready` is false during server rendering and the first client render, when
 * localStorage has not been read yet. Wait for it before redirecting to /login.
 */
export function useAuth() {
  const session = useSyncExternalStore(subscribe, read, () => null)
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])

  return {
    ready,
    session,
    isSignedIn: Boolean(session),
    phone: session?.phone ?? null,
    signOut: clearSession,
  }
}
