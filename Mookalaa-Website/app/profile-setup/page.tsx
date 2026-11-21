"use client"

import type React from "react"
import { Suspense, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowRight, Camera, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { fetchProfile, saveProfile } from "@/lib/api"
import { errorMessage } from "@/lib/api-client"
import { useAuth } from "@/lib/auth"
import { photoToBase64 } from "@/lib/image"
import { loginPath, safeNextPath } from "@/lib/navigation"

function ProfileSetupForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = safeNextPath(searchParams.get("next"))
  // The phone always comes from the signed-in session, never from the URL.
  const { ready, phone } = useAuth()

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [city, setCity] = useState("")
  const [currentImage, setCurrentImage] = useState<string | null>(null)
  const [newImageBase64, setNewImageBase64] = useState("")
  const [isEdit, setIsEdit] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const hadSession = useRef(false)

  useEffect(() => {
    if (!ready) return
    if (!phone) {
      router.replace(hadSession.current ? "/" : loginPath("/profile-setup"))
      return
    }
    hadSession.current = true
    let cancelled = false
    fetchProfile(phone)
      .then((profile) => {
        if (cancelled) return
        setName(profile.name)
        setEmail(profile.email)
        setCity(profile.city)
        setCurrentImage(profile.profileImage)
        setIsEdit(profile.status === "completed")
      })
      .catch((err) => {
        if (!cancelled && err?.status !== 404) setError(errorMessage(err, "Your profile could not be loaded."))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [ready, phone, router])

  const handleImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setError("")
    try {
      setNewImageBase64(await photoToBase64(file))
    } catch (err) {
      setError(err instanceof Error ? err.message : "This image could not be used.")
    }
  }

  const done = () => router.replace(next || (isEdit ? "/profile" : "/"))

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!phone || saving) return
    const trimmedName = name.trim()
    const trimmedEmail = email.trim()
    if (!trimmedName) {
      setError("Please enter your name.")
      return
    }
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Please enter a valid email address, or leave it empty.")
      return
    }

    setSaving(true)
    setError("")
    try {
      await saveProfile({
        phone,
        name: trimmedName,
        email: trimmedEmail,
        city: city.trim(),
        profileImageBase64: newImageBase64 || undefined,
      })
      done()
    } catch (err) {
      setError(errorMessage(err, "Your profile could not be saved. Please try again."))
      setSaving(false)
    }
  }

  if (!ready || !phone || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f8fafc" }}>
        <p className="text-gray-600" role="status">
          Loading...
        </p>
      </div>
    )
  }

  const preview = newImageBase64 ? `data:image/jpeg;base64,${newImageBase64}` : currentImage
  const field = "h-12 bg-white text-gray-900 border-gray-300"

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f8fafc" }}>
      <div className="max-w-2xl mx-auto p-4 py-12">
        <Card className="p-8 shadow-xl border-0 bg-white text-gray-900 gap-0">
          <div className="text-center space-y-2 mb-8">
            <h1 className="text-3xl font-bold text-gray-900">{isEdit ? "Edit profile" : "Complete your profile"}</h1>
            <p className="text-gray-600">Signed in as +91 {phone}</p>
          </div>

          {error && (
            <p role="alert" className="mb-6 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
              {error}
            </p>
          )}

          <form onSubmit={handleSave} className="space-y-6" noValidate>
            <div className="flex justify-center">
              <div className="relative">
                <div className="w-32 h-32 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 flex items-center justify-center overflow-hidden shadow-lg">
                  {preview ? (
                    <img src={preview} alt="Your profile photo" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-16 h-16 text-white" />
                  )}
                </div>
                <label className="absolute bottom-2 right-2 w-10 h-10 bg-white rounded-full flex items-center justify-center cursor-pointer shadow-lg border-2 border-purple-200 hover:border-purple-400 transition-colors">
                  <Camera className="w-5 h-5 text-purple-600" />
                  <span className="sr-only">Choose a profile photo</span>
                  <input type="file" accept="image/*" onChange={handleImage} className="sr-only" />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                  Full name
                </label>
                <Input
                  id="name"
                  type="text"
                  autoComplete="name"
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={field}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email address (optional)
                </label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  maxLength={200}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={field}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="city" className="block text-sm font-medium text-gray-700">
                City (optional)
              </label>
              <Input
                id="city"
                type="text"
                autoComplete="address-level2"
                maxLength={120}
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className={field}
              />
            </div>

            <div className="pt-4 space-y-3">
              <Button
                type="submit"
                disabled={saving}
                className="w-full h-12 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold rounded-lg shadow-lg"
              >
                {saving ? (
                  "Saving..."
                ) : (
                  <>
                    {isEdit ? "Update profile" : "Save profile"}
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={done}
                className="w-full h-12 text-gray-600 hover:text-gray-800 hover:bg-gray-100"
              >
                {isEdit ? "Cancel" : "Skip for now"}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  )
}

export default function ProfileSetupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ backgroundColor: "#f8fafc" }}></div>}>
      <ProfileSetupForm />
    </Suspense>
  )
}
