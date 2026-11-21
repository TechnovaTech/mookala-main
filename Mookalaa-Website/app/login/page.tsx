"use client"

import type React from "react"
import { Suspense, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowRight, Phone, Shield } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { BackButton } from "@/components/back-button"
import { sendOtp, verifyOtp } from "@/lib/api"
import { ApiError } from "@/lib/api-client"
import { setSession, useAuth } from "@/lib/auth"
import { safeNextPath } from "@/lib/navigation"

/** The server allows one code every 30 seconds. */
const RESEND_SECONDS = 30

function sendErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      const wait = error.retryAfterSeconds
      return wait
        ? `Too many codes were requested for this number. You can ask for a new one in ${wait} seconds.`
        : "Too many codes were requested for this number. Please wait a few minutes and try again."
    }
    if (error.status === 503) return "Sign-in by SMS is not available right now. Please try again later."
    if (error.status === 403) return error.message
    return error.message
  }
  return "The code could not be sent. Please try again."
}

function verifyErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return "Too many wrong codes were entered. Please request a new code."
    if (error.status === 403) return error.message
    if (error.status === 400) {
      const left = Number(error.data.attemptsLeft)
      if (Number.isFinite(left)) {
        return left > 0
          ? `${error.message} (${left} ${left === 1 ? "attempt" : "attempts"} left)`
          : `${error.message} Please request a new code.`
      }
    }
    return error.message
  }
  return "The code could not be checked. Please try again."
}

function Spinner() {
  return <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2" aria-hidden="true"></span>
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = safeNextPath(searchParams.get("next"))
  const { ready, isSignedIn } = useAuth()

  const [step, setStep] = useState<"phone" | "code">("phone")
  const [phone, setPhone] = useState("")
  const [code, setCode] = useState("")
  const [devMode, setDevMode] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [cooldown, setCooldown] = useState(0)
  const signingIn = useRef(false)

  // Someone who is already signed in has nothing to do here.
  useEffect(() => {
    if (ready && isSignedIn && !signingIn.current) router.replace(next || "/")
  }, [ready, isSignedIn, next, router])

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setTimeout(() => setCooldown((seconds) => seconds - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])

  const requestCode = async (isResend: boolean) => {
    if (phone.length !== 10 || busy) return
    setBusy(true)
    setError("")
    setNotice("")
    try {
      const sent = await sendOtp(phone)
      setDevMode(sent.devMode)
      setStep("code")
      setCode("")
      setCooldown(RESEND_SECONDS)
      setNotice(isResend ? "A new code has been sent." : "")
    } catch (err) {
      setError(sendErrorMessage(err))
      if (err instanceof ApiError && err.retryAfterSeconds) setCooldown(err.retryAfterSeconds)
    } finally {
      setBusy(false)
    }
  }

  const submitPhone = (e: React.FormEvent) => {
    e.preventDefault()
    requestCode(false)
  }

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (code.length < 4 || busy) return
    setBusy(true)
    setError("")
    setNotice("")
    try {
      const result = await verifyOtp(phone, code)
      signingIn.current = true
      setSession({ token: result.token, phone: result.phone })
      if (result.profileComplete) {
        router.replace(next || "/")
      } else {
        router.replace(next ? `/profile-setup?next=${encodeURIComponent(next)}` : "/profile-setup")
      }
    } catch (err) {
      setError(verifyErrorMessage(err))
      setCode("")
      setBusy(false)
    }
  }

  const primary =
    "w-full h-12 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold rounded-lg shadow-lg"

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f8fafc" }}>
      <div className="w-full max-w-md p-4">
        <BackButton className="mb-4 !text-gray-700 !border-gray-300 !bg-white" />
        <Card className="p-8 shadow-xl border-0 bg-white text-gray-900 gap-0">
          <div className="text-center space-y-4 mb-8">
            <div className="w-24 h-24 mx-auto">
              <img src="/mookalaa-logo-2.png" alt="MOOKALAA" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{step === "phone" ? "Sign in" : "Enter the code"}</h1>
              <p className="text-gray-600 mt-2">
                {step === "phone"
                  ? "Enter your phone number and we will send you a one-time code."
                  : `We sent a code by SMS to +91 ${phone}.`}
              </p>
              {step === "code" && devMode && (
                <p className="text-sm text-purple-700 font-medium mt-2">
                  Development mode: no SMS was sent. Use the code 1234.
                </p>
              )}
            </div>
          </div>

          {error && (
            <p role="alert" className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
              {error}
            </p>
          )}
          {notice && !error && (
            <p role="status" className="mb-4 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3">
              {notice}
            </p>
          )}

          {step === "phone" ? (
            <form onSubmit={submitPhone} className="space-y-6" noValidate>
              <div className="space-y-2">
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                  Phone number
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <Input
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    placeholder="10-digit phone number"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    className="pl-10 h-12 text-lg bg-white text-gray-900 border-gray-300"
                  />
                </div>
              </div>

              <Button type="submit" disabled={busy || phone.length !== 10 || cooldown > 0} className={primary}>
                {busy ? (
                  <>
                    <Spinner />
                    Sending...
                  </>
                ) : cooldown > 0 ? (
                  `Try again in ${cooldown}s`
                ) : (
                  <>
                    Send code
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </>
                )}
              </Button>
              <p className="text-xs text-gray-500 text-center">
                You stay signed in on this device for 30 days, or until you sign out.
              </p>
            </form>
          ) : (
            <form onSubmit={submitCode} className="space-y-6" noValidate>
              <div className="space-y-2">
                <label htmlFor="otp" className="block text-sm font-medium text-gray-700">
                  One-time code
                </label>
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <Input
                    id="otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    placeholder="Code from the SMS"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                    className="pl-10 h-12 text-xl tracking-[0.3em] bg-white text-gray-900 border-gray-300"
                  />
                </div>
              </div>

              <Button type="submit" disabled={busy || code.length < 4} className={primary}>
                {busy ? (
                  <>
                    <Spinner />
                    Checking...
                  </>
                ) : (
                  <>
                    Verify &amp; continue
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </>
                )}
              </Button>

              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  className="text-gray-600 hover:underline"
                  onClick={() => {
                    setStep("phone")
                    setCode("")
                    setError("")
                    setNotice("")
                  }}
                >
                  Change number
                </button>
                {cooldown > 0 ? (
                  <span className="text-gray-500">Resend in {cooldown}s</span>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    className="text-purple-700 font-medium hover:underline disabled:opacity-50"
                    onClick={() => requestCode(true)}
                  >
                    Resend code
                  </button>
                )}
              </div>
            </form>
          )}

          <p className="text-xs text-gray-500 text-center mt-6">
            By continuing, you agree to our{" "}
            <a href="/terms" className="text-purple-700 hover:underline">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="/privacy" className="text-purple-700 hover:underline">
              Privacy Policy
            </a>
          </p>
        </Card>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ backgroundColor: "#f8fafc" }}></div>}>
      <LoginForm />
    </Suspense>
  )
}
