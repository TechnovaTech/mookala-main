"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Phone, ArrowRight } from "lucide-react"
import { useRouter } from "next/navigation"

export default function LoginPage() {
  const [phone, setPhone] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const router = useRouter()
  
  useEffect(() => {
    // Redirect if already logged in
    const userPhone = localStorage.getItem('userPhone')
    if (userPhone) {
      router.push('/')
    }
  }, [router])

  const handleSendOTP = async () => {
    if (phone.length !== 10) {
      alert("Please enter a valid 10-digit phone number")
      return
    }

    setIsLoading(true)
    await new Promise(resolve => setTimeout(resolve, 500))
    setIsLoading(false)
    
    router.push(`/otp-verification?phone=${phone}`)
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{backgroundColor: '#f8fafc'}}>
      <div className="w-full max-w-md p-4">
        <Card className="p-8 shadow-xl border-0">
          <div className="text-center space-y-4 mb-8">
            <div className="w-24 h-24 mx-auto">
              <img src="/mookalaa-logo-2.png" alt="MOOKALAA" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Welcome Back</h1>
              <p className="text-gray-600 mt-2">Enter your phone number to continue</p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Phone Number</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <Input
                  type="tel"
                  placeholder="Enter your 10-digit phone number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  className="pl-10 h-12 text-lg border-gray-300 focus:border-purple-500 focus:ring-purple-500"
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="remember"
                checked={rememberMe}
                onCheckedChange={setRememberMe}
                className="border-gray-300"
              />
              <label htmlFor="remember" className="text-sm text-gray-600">
                Remember me on this device
              </label>
            </div>

            <Button
              onClick={handleSendOTP}
              disabled={isLoading || phone.length !== 10}
              className="w-full h-12 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-200"
            >
              {isLoading ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Sending...
                </div>
              ) : (
                <>
                  Continue
                  <ArrowRight className="w-5 h-5 ml-2" />
                </>
              )}
            </Button>
          </div>

          <div className="text-center mt-6">
            <p className="text-xs text-gray-500">
              By continuing, you agree to our{" "}
              <a href="/terms" className="text-purple-600 hover:underline">Terms of Service</a>
              {" "}and{" "}
              <a href="/privacy" className="text-purple-600 hover:underline">Privacy Policy</a>
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}