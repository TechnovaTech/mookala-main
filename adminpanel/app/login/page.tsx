'use client'
import { useState } from 'react'
import { Eye, EyeOff, Lock, Mail, Shield } from 'lucide-react'

export default function Login() {
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [code, setCode] = useState('')
  const [needsCode, setNeedsCode] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, code: needsCode ? code : undefined })
      })

      const data = await response.json().catch(() => ({}))

      if (response.ok) {
        // Return to the page the admin was trying to open, if it is one of ours.
        const next = new URLSearchParams(window.location.search).get('next')
        const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'
        window.location.replace(data.mustChangePassword ? '/security/account' : target)
      } else {
        if (data.twoFactorRequired) setNeedsCode(true)
        setError(data.twoFactorRequired && !needsCode ? '' : data.error || 'Login failed')
      }
    } catch (err) {
      console.error('Login error:', err)
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-deep-blue via-indigo to-teal flex items-center justify-center p-4">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-20">
        <div className="w-full h-full" style={{backgroundImage: "url('data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')"}}></div>
      </div>
      
      <div className="relative w-full max-w-md">
        {/* Login Card */}
        <div className="bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl border border-white/20 p-8">
          {/* Header */}
          <div className="text-center mb-4">
            <div className="w-32 h-32 flex items-center justify-center mx-auto mb-4 overflow-hidden">
              <img src="/logo.png" alt="Mookalla Logo" className="w-full h-full object-contain" />
            </div>
            
          </div>

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-6">
            {/* Email Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-gray w-5 h-5" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@mookalaa.com"
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl bg-gray-50/50 focus:ring-2 focus:ring-teal/20 focus:border-teal focus:bg-white outline-none transition-all duration-200"
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-gray w-5 h-5" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-10 pr-12 py-3 border border-gray-200 rounded-xl bg-gray-50/50 focus:ring-2 focus:ring-teal/20 focus:border-teal focus:bg-white outline-none transition-all duration-200"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-gray hover:text-deep-blue transition-colors"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {/* Two-factor code, shown only when the account has 2FA switched on */}
            {needsCode && (
              <div>
                <label htmlFor="login-code" className="block text-sm font-medium text-gray-700 mb-2">
                  Authenticator code
                </label>
                <input
                  id="login-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="6-digit code"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50/50 tracking-widest focus:ring-2 focus:ring-teal/20 focus:border-teal focus:bg-white outline-none"
                  autoFocus
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Open your authenticator app and enter the current code.</p>
              </div>
            )}

            <div className="text-right">
              <button
                type="button"
                onClick={() => setShowHelp(!showHelp)}
                className="text-sm text-teal hover:text-emerald"
              >
                Forgot password?
              </button>
              {showHelp && (
                <p className="text-sm text-gray-600 text-left bg-gray-50 rounded-lg p-3 mt-2">
                  Ask a Super Admin to reset your password from Security &amp; Audit → Admins &amp; Roles. You will be
                  asked to choose a new one when you next sign in.
                </p>
              )}
            </div>

            {/* Error Message */}
            {error && (
              <div className="text-red-600 text-sm text-center bg-red-50 p-3 rounded-lg" role="alert">
                {error}
              </div>
            )}

            {/* Login Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-emerald to-teal text-white py-3 rounded-xl font-semibold hover:shadow-lg hover:scale-[1.02] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing In...' : 'Sign In'}
            </button>
          </form>


        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-white/70 text-sm">
            © {new Date().getFullYear()} Mookalaa. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  )
}