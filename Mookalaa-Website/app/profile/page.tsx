"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Edit, LogOut, Mail, MapPin, Phone, Ticket, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BackButton } from "@/components/back-button"
import { fetchProfile } from "@/lib/api"
import { errorMessage } from "@/lib/api-client"
import { useAuth } from "@/lib/auth"
import { loginPath } from "@/lib/navigation"
import type { UserProfile } from "@/lib/types"

const PAGE_BACKGROUND = { background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)" }
const PANEL = { background: "linear-gradient(135deg, #1e293b 0%, #334155 100%)" }

export default function ProfilePage() {
  const router = useRouter()
  const { ready, phone, signOut } = useAuth()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    if (!phone) return
    setLoading(true)
    setError("")
    try {
      setProfile(await fetchProfile(phone))
    } catch (err) {
      setProfile(null)
      setError(errorMessage(err, "Your profile could not be loaded."))
    } finally {
      setLoading(false)
    }
  }, [phone])

  // True once this page has seen a session: losing it later means "signed
  // out" (go home), not "never signed in" (go to sign-in and come back).
  const hadSession = useRef(false)

  useEffect(() => {
    if (!ready) return
    if (!phone) {
      router.replace(hadSession.current ? "/" : loginPath("/profile"))
      return
    }
    hadSession.current = true
    load()
  }, [ready, phone, router, load])

  const handleLogout = () => {
    signOut()
  }

  if (!ready || !phone || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={PAGE_BACKGROUND}>
        <p className="text-blue-200" role="status">
          Loading profile...
        </p>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={PAGE_BACKGROUND}>
        <div className="p-8 text-center bg-white rounded-3xl shadow-2xl max-w-md">
          <h1 className="text-2xl font-bold mb-3 text-gray-900">Profile unavailable</h1>
          <p className="text-gray-600 mb-6" role="alert">
            {error}
          </p>
          <div className="flex gap-3 justify-center">
            <Button onClick={load}>Try again</Button>
            <Button variant="outline" onClick={handleLogout} className="text-gray-900 bg-white">
              Sign out
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const rows = [
    { icon: Phone, label: "Phone number", value: `+91 ${profile.phone}`, hint: "Verified by one-time code" },
    { icon: User, label: "Full name", value: profile.name, hint: "" },
    { icon: Mail, label: "Email address", value: profile.email, hint: "" },
    { icon: MapPin, label: "City", value: profile.city, hint: "" },
  ]

  const memberSince = profile.createdAt ? new Date(profile.createdAt) : null

  return (
    <div className="min-h-screen" style={PAGE_BACKGROUND}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <BackButton variant="onDark" className="mb-6" />
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-10 text-center">My Profile</h1>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4">
            <div className="rounded-2xl shadow-2xl p-8 text-center border border-blue-800/30" style={PANEL}>
              <div className="w-32 h-32 mx-auto mb-6 rounded-full bg-gradient-to-br from-blue-500 via-purple-500 to-indigo-500 flex items-center justify-center overflow-hidden shadow-2xl">
                {profile.profileImage ? (
                  <img src={profile.profileImage} alt="Your profile photo" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-16 h-16 text-white" />
                )}
              </div>

              <h2 className="text-2xl font-bold text-white mb-2 break-words">{profile.name || "Name not added yet"}</h2>
              <p className="text-blue-200 mb-6 text-sm">+91 {profile.phone}</p>

              <div className="space-y-3">
                <Button
                  className="w-full h-12 text-white font-semibold rounded-xl"
                  style={{ background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)" }}
                  onClick={() => router.push("/bookings")}
                >
                  <Ticket className="w-5 h-5 mr-2" />
                  My Bookings
                </Button>
                <Button
                  className="w-full h-12 text-white font-semibold rounded-xl"
                  style={{ background: "linear-gradient(135deg, #475569 0%, #64748b 100%)" }}
                  onClick={() => router.push("/profile-setup?next=/profile")}
                >
                  <Edit className="w-5 h-5 mr-2" />
                  Edit Profile
                </Button>
                <Button
                  variant="outline"
                  className="w-full h-12 border-2 border-red-400/50 bg-transparent text-red-300 hover:bg-red-500/20 hover:text-red-200 rounded-xl font-semibold"
                  onClick={handleLogout}
                >
                  <LogOut className="w-5 h-5 mr-2" />
                  Sign out
                </Button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-8">
            <div className="rounded-2xl shadow-2xl p-6 sm:p-8 border border-blue-800/30" style={PANEL}>
              <h2 className="text-2xl font-bold text-white mb-8">Account information</h2>

              <dl className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {rows.map(({ icon: Icon, label, value, hint }) => (
                  <div key={label}>
                    <dt className="flex items-center gap-3 mb-3">
                      <span className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                        <Icon className="w-5 h-5 text-white" />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-white">{label}</span>
                        {hint && <span className="block text-xs text-green-400">{hint}</span>}
                      </span>
                    </dt>
                    <dd
                      className="rounded-xl p-4 border-2 border-blue-700/30 text-lg font-semibold break-words"
                      style={{ background: "rgba(30, 41, 59, 0.3)" }}
                    >
                      {value ? (
                        <span className="text-white">{value}</span>
                      ) : (
                        <span className="text-blue-300 italic font-normal">Not added yet</span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>

              {memberSince && !Number.isNaN(memberSince.getTime()) && (
                <p className="mt-8 pt-6 border-t border-blue-700/30 text-blue-200">
                  Member since{" "}
                  <span className="font-semibold text-white">
                    {memberSince.toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}
                  </span>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
