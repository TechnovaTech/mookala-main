"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { User, LogOut, Phone, Mail, MapPin, Edit } from "lucide-react"
import { useRouter } from "next/navigation"

interface UserProfile {
  phone: string
  name?: string
  email?: string
  city?: string
  profileImage?: string
  createdAt?: string
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const userPhone = localStorage.getItem('userPhone')
    if (!userPhone) {
      router.push('/login')
      return
    }

    fetchProfile(userPhone)
  }, [router])

  const fetchProfile = async (phone: string) => {
    try {
      const response = await fetch(`http://localhost:3000/api/user/profile?phone=${phone}`)
      const data = await response.json()
      
      if (data.success && data.user) {
        setProfile(data.user)
      } else {
        setProfile({ phone })
      }
    } catch (error) {
      console.error('Error fetching profile:', error)
      setProfile({ phone })
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('userPhone')
    router.push('/')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading profile...</p>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-8 text-center">
          <h1 className="text-2xl font-bold mb-4">Profile Not Found</h1>
          <Button onClick={() => router.push('/')}>Go Home</Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{backgroundColor: '#124972'}}>
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">My Profile</h1>
          <p className="text-gray-600 text-lg">Manage your account information and preferences</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Profile Card */}
          <div className="lg:col-span-4">
            <div className="rounded-2xl shadow-xl p-8 text-center border" style={{backgroundColor: '#124972', borderColor: '#1e40af'}}>
              <div className="relative inline-block mb-6">
                <div className="w-32 h-32 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-red-500 flex items-center justify-center overflow-hidden shadow-2xl">
                  {profile.profileImage ? (
                    <img 
                      src={profile.profileImage} 
                      alt="Profile" 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-16 h-16 text-white" />
                  )}
                </div>
                <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-green-500 rounded-full border-4 border-white"></div>
              </div>
              
              <h2 className="text-2xl font-bold text-white mb-2">
                {profile.name || 'Welcome User!'}
              </h2>
              <p className="text-gray-300 mb-2 text-sm">
                +91 {profile.phone}
              </p>
              <p className="text-gray-400 mb-6">
                {profile.email || 'Complete your profile'}
              </p>
              
              <div className="space-y-3">
                <Button 
                  className="w-full h-12 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
                  onClick={() => router.push(`/profile-setup?phone=${profile.phone}`)}
                >
                  <Edit className="w-5 h-5 mr-2" />
                  Edit Profile
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full h-12 border-2 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 rounded-xl font-semibold transition-all duration-300"
                  onClick={handleLogout}
                >
                  <LogOut className="w-5 h-5 mr-2" />
                  Logout
                </Button>
              </div>
            </div>
          </div>

          {/* Profile Details */}
          <div className="lg:col-span-8">
            <div className="rounded-2xl shadow-xl p-8 border" style={{backgroundColor: '#124972', borderColor: '#1e40af'}}>
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-2xl font-bold text-white">Account Information</h3>
                <div className="px-4 py-2 bg-green-500 text-white rounded-full text-sm font-medium">
                  Active Account
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Phone */}
                <div className="group">
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                      <Phone className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-white">Phone Number</label>
                      <p className="text-xs text-green-400">Verified</p>
                    </div>
                  </div>
                  <div className="bg-white/10 rounded-xl p-4 border-2 border-transparent group-hover:border-blue-400 transition-all duration-300">
                    <p className="text-white font-semibold text-lg">+91 {profile.phone}</p>
                  </div>
                </div>

                {/* Name */}
                <div className="group">
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center">
                      <User className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-white">Full Name</label>
                      <p className="text-xs text-gray-300">{profile.name ? 'Completed' : 'Incomplete'}</p>
                    </div>
                  </div>
                  <div className="bg-white/10 rounded-xl p-4 border-2 border-transparent group-hover:border-purple-400 transition-all duration-300">
                    <p className={`text-lg font-semibold ${
                      profile.name 
                        ? 'text-white' 
                        : 'text-gray-400 italic'
                    }`}>
                      {profile.name || 'Add your name'}
                    </p>
                  </div>
                </div>

                {/* Email */}
                <div className="group">
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
                      <Mail className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-white">Email Address</label>
                      <p className="text-xs text-gray-300">{profile.email ? 'Completed' : 'Incomplete'}</p>
                    </div>
                  </div>
                  <div className="bg-white/10 rounded-xl p-4 border-2 border-transparent group-hover:border-green-400 transition-all duration-300">
                    <p className={`text-lg font-semibold ${
                      profile.email 
                        ? 'text-white' 
                        : 'text-gray-400 italic'
                    }`}>
                      {profile.email || 'Add your email'}
                    </p>
                  </div>
                </div>

                {/* City */}
                <div className="group">
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
                      <MapPin className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-white">City</label>
                      <p className="text-xs text-gray-300">{profile.city ? 'Completed' : 'Incomplete'}</p>
                    </div>
                  </div>
                  <div className="bg-white/10 rounded-xl p-4 border-2 border-transparent group-hover:border-orange-400 transition-all duration-300">
                    <p className={`text-lg font-semibold ${
                      profile.city 
                        ? 'text-white' 
                        : 'text-gray-400 italic'
                    }`}>
                      {profile.city || 'Select your city'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Member Since */}
              {profile.createdAt && (
                <div className="mt-8 pt-8 border-t border-gray-200">
                  <div className="flex items-center space-x-4 bg-white/5 rounded-xl p-6 border border-white/10">
                    <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center shadow-lg">
                      <div className="w-4 h-4 bg-white rounded-full"></div>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-300">Member Since</p>
                      <p className="text-xl font-bold text-white">
                        {new Date(profile.createdAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}