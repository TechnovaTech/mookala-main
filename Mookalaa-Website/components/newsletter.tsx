"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Mail, User, Phone, MessageSquare, Send } from "lucide-react"
import { useLanguage } from "@/lib/language-context"

export function Newsletter() {
  const { t } = useLanguage()
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    city: "",
    message: ""
  })
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Here you can add API call to send inquiry
    console.log("Inquiry submitted:", formData)
    setSubmitted(true)
    setFormData({ firstName: "", lastName: "", phone: "", email: "", city: "", message: "" })
    setTimeout(() => setSubmitted(false), 3000)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  return (
    <section className="pb-16 rounded-2xl bg-gradient-to-br from-purple-600/10 to-pink-600/10 border border-border/40 backdrop-blur-sm">
      <div className="max-w-3xl mx-auto px-4" suppressHydrationWarning>
        <div className="text-center mb-8" suppressHydrationWarning>
          <div className="flex justify-center mb-4" suppressHydrationWarning>
            <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-pink-600 rounded-lg flex items-center justify-center" suppressHydrationWarning>
              <MessageSquare size={24} className="text-white" />
            </div>
          </div>
          <h2 className="text-3xl font-bold mb-2" suppressHydrationWarning>{t("inquiry.title")}</h2>
          <p className="text-muted-foreground" suppressHydrationWarning>
            {t("inquiry.subtitle")}
          </p>
        </div>
        
        {submitted ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Send size={32} className="text-green-500" />
            </div>
            <h3 className="text-xl font-bold mb-2" suppressHydrationWarning>{t("inquiry.success")}</h3>
            <p className="text-muted-foreground" suppressHydrationWarning>{t("inquiry.successMessage")}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4" suppressHydrationWarning>
              <div className="relative" suppressHydrationWarning>
                <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  name="firstName"
                  placeholder={t("inquiry.firstNamePlaceholder")}
                  value={formData.firstName}
                  onChange={handleChange}
                  required
                  className="w-full pl-10 pr-4 py-3 bg-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 transition"
                />
              </div>
              <div className="relative" suppressHydrationWarning>
                <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  name="lastName"
                  placeholder={t("inquiry.lastNamePlaceholder")}
                  value={formData.lastName}
                  onChange={handleChange}
                  required
                  className="w-full pl-10 pr-4 py-3 bg-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 transition"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4" suppressHydrationWarning>
              <div className="relative" suppressHydrationWarning>
                <Phone size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="tel"
                  name="phone"
                  placeholder={t("inquiry.phonePlaceholder")}
                  value={formData.phone}
                  onChange={handleChange}
                  required
                  className="w-full pl-10 pr-4 py-3 bg-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 transition"
                />
              </div>
              <div className="relative" suppressHydrationWarning>
                <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="email"
                  name="email"
                  placeholder={t("inquiry.emailPlaceholder")}
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="w-full pl-10 pr-4 py-3 bg-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 transition"
                />
              </div>
            </div>
            <div className="relative" suppressHydrationWarning>
              <MessageSquare size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                name="city"
                placeholder={t("inquiry.cityPlaceholder")}
                value={formData.city}
                onChange={handleChange}
                required
                className="w-full pl-10 pr-4 py-3 bg-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 transition"
              />
            </div>
            <div suppressHydrationWarning>
              <textarea
                name="message"
                placeholder={t("inquiry.messagePlaceholder")}
                value={formData.message}
                onChange={handleChange}
                required
                rows={4}
                className="w-full px-4 py-3 bg-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 transition resize-none"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-lg"
              suppressHydrationWarning
            >
              {t("inquiry.submit")}
              <Send size={18} className="ml-2" />
            </Button>
          </form>
        )}
      </div>
    </section>
  )
}
