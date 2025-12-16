"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { User, ArrowRight, Camera } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"

export default function ProfileSetupPage() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [city, setCity] = useState("")
  const [profileImage, setProfileImage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isEdit, setIsEdit] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const phone = searchParams.get("phone") || ""

  const cities = [
    "Mumbai", "Delhi", "Bangalore", "Chennai", "Kolkata",
    "Hyderabad", "Pune", "Ahmedabad", "Surat", "Jaipur"
  ]
  
  useEffect(() => {
    // Check if this is edit mode and load existing profile
    const userPhone = localStorage.getItem('userPhone')
    if (userPhone && phone === userPhone) {
      setIsEdit(true)
      fetchProfile(phone)
    }
  }, [phone])
  
  const fetchProfile = async (phoneNumber: string) => {
    try {
      const response = await fetch(`http://localhost:3000/api/user/profile?phone=${phoneNumber}`)
      const data = await response.json()
      
      if (data.success && data.user) {
        const user = data.user
        setName(user.name || "")
        setEmail(user.email || "")
        setCity(user.city || "")
        setProfileImage(user.profileImage || null)
      }
    } catch (error) {
      console.error('Error fetching profile:', error)
    }
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setProfileImage(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSaveProfile = async () => {
    setIsLoading(true)
    
    try {
      const response = await fetch("/api/auth/update-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          name: name || null,
          email: email || null,
          city: city || null,
          profileImage: profileImage || null
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        localStorage.setItem("userPhone", phone)
        if (isEdit) {
          router.push("/profile")
        } else {
          router.push("/")
        }
      } else {
        alert(data.error || "Profile update failed")
      }
    } catch (error) {
      alert("Profile update failed. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen" style={{backgroundColor: '#f8fafc'}}>
      <div className="max-w-2xl mx-auto p-4 py-12">
        <Card className="p-8 shadow-xl border-0">
          <div className="text-center space-y-4 mb-8">
            <div className="w-24 h-24 mx-auto">
              <img src="/mookalaa-logo-2.png" alt="MOOKALAA" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{isEdit ? "Edit Profile" : "Complete Profile"}</h1>
              <p className="text-gray-600 mt-2">{isEdit ? "Update your information" : "Tell us about yourself (optional)"}</p>
            </div>
          </div>

          <div className="space-y-6">
            {/* Profile Image */}
            <div className="flex justify-center mb-8">
              <div className="relative">
                <div className="w-32 h-32 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 flex items-center justify-center overflow-hidden shadow-lg">
                  {profileImage ? (
                    <img src={profileImage} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-16 h-16 text-white" />
                  )}
                </div>
                <label className="absolute bottom-2 right-2 w-10 h-10 bg-white rounded-full flex items-center justify-center cursor-pointer shadow-lg border-2 border-purple-200 hover:border-purple-400 transition-colors">
                  <Camera className="w-5 h-5 text-purple-600" />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Name */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Full Name</label>
                <Input
                  type="text"
                  placeholder="Enter your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-12 border-gray-300 focus:border-purple-500 focus:ring-purple-500"
                />
              </div>

              {/* Email */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Email Address</label>
                <Input
                  type="email"
                  placeholder="Enter your email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 border-gray-300 focus:border-purple-500 focus:ring-purple-500"
                />
              </div>
            </div>

            {/* City */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">City</label>
              <Select value={city} onValueChange={setCity}>
                <SelectTrigger className="h-12 border-gray-300 focus:border-purple-500 focus:ring-purple-500">
                  <SelectValue placeholder="Select your city" />
                </SelectTrigger>
                <SelectContent>
                  {cities.map((cityName) => (
                    <SelectItem key={cityName} value={cityName}>
                      {cityName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="pt-4 space-y-4">
              <Button
                onClick={handleSaveProfile}
                disabled={isLoading}
                className="w-full h-12 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-200"
              >
                {isLoading ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Saving...
                  </div>
                ) : (
                  <>
                    {isEdit ? "Update Profile" : "Save Profile"}
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </>
                )}
              </Button>

              {!isEdit && (
                <Button
                  variant="ghost"
                  onClick={() => router.push("/")}
                  className="w-full h-12 text-gray-600 hover:text-gray-800 hover:bg-gray-100"
                >
                  Skip for now
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}