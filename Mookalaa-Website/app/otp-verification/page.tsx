"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Shield, ArrowRight } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"

export default function OTPVerificationPage() {
  const [otp, setOtp] = useState(["", "", "", ""])
  const [isLoading, setIsLoading] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [resendTimer, setResendTimer] = useState(30)
  const [canResend, setCanResend] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const phone = searchParams.get("phone") || ""

  useEffect(() => {
    startResendTimer()
  }, [])

  const startResendTimer = () => {
    setCanResend(false)
    setResendTimer(30)
    
    const timer = setInterval(() => {
      setResendTimer(prev => {
        if (prev <= 1) {
          setCanResend(true)
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) return
    
    const newOtp = [...otp]
    newOtp[index] = value
    setOtp(newOtp)
    
    if (value && index < 3) {
      const nextInput = document.getElementById(`otp-${index + 1}`)
      nextInput?.focus()
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      const prevInput = document.getElementById(`otp-${index - 1}`)
      prevInput?.focus()
    }
  }

  const handleVerifyOTP = async () => {
    const otpCode = otp.join("")
    if (otpCode.length !== 4) {
      alert("Please enter complete OTP")
      return
    }

    setIsLoading(true)
    
    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otp: otpCode })
      })
      
      const data = await response.json()
      
      if (data.success) {
        localStorage.setItem("userPhone", phone)
        if (data.isProfileComplete) {
          router.push("/")
        } else {
          router.push(`/profile-setup?phone=${phone}`)
        }
      } else {
        alert(data.error || "Invalid OTP")
      }
    } catch (error) {
      alert("Verification failed. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleResendOTP = async () => {
    setIsResending(true)
    await new Promise(resolve => setTimeout(resolve, 1000))
    setIsResending(false)
    startResendTimer()
    alert("OTP is 1234")
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
              <h1 className="text-3xl font-bold text-gray-900">Verify Code</h1>
              <p className="text-gray-600 mt-2">
                Enter the verification code sent to {phone}
                <br />
                <span className="text-sm text-purple-600 font-medium">(Use: 1234)</span>
              </p>
            </div>
          </div>

          <div className="space-y-8">
            <div className="flex justify-center space-x-3">
              {otp.map((digit, index) => (
                <Input
                  key={index}
                  id={`otp-${index}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(index, e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  className="w-16 h-16 text-center text-2xl font-bold border-gray-300 focus:border-purple-500 focus:ring-purple-500 rounded-lg"
                />
              ))}
            </div>

            <Button
              onClick={handleVerifyOTP}
              disabled={isLoading || otp.join("").length !== 4}
              className="w-full h-12 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-200"
            >
              {isLoading ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Verifying...
                </div>
              ) : (
                <>
                  Verify & Continue
                  <ArrowRight className="w-5 h-5 ml-2" />
                </>
              )}
            </Button>

            <div className="text-center">
              {canResend ? (
                <Button
                  variant="ghost"
                  onClick={handleResendOTP}
                  disabled={isResending}
                  className="text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                >
                  {isResending ? (
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600 mr-2"></div>
                      Resending...
                    </div>
                  ) : (
                    "Resend Code"
                  )}
                </Button>
              ) : (
                <p className="text-sm text-gray-500">
                  Didn't receive the code? Resend in <span className="font-medium text-purple-600">{resendTimer}s</span>
                </p>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}