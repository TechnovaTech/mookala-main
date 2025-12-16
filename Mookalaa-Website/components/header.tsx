"use client"

import type React from "react"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Search, Menu, X } from "lucide-react"
import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/lib/language-context"

declare global {
  interface Window {
    google: any
    googleTranslateElementInit: () => void
  }
}

export function Header() {
  const [searchQuery, setSearchQuery] = useState("")
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const { language, setLanguage, t } = useLanguage()
  const router = useRouter()

  useEffect(() => {
    const addScript = () => {
      if (!document.getElementById('google-translate-script')) {
        const script = document.createElement('script')
        script.id = 'google-translate-script'
        script.src = '//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit'
        script.async = true
        document.body.appendChild(script)
      }
    }

    window.googleTranslateElementInit = () => {
      new window.google.translate.TranslateElement(
        {
          pageLanguage: 'en',
          includedLanguages: 'bn,brx,doi,gu,hi,kn,ks,gom,mai,ml,mni,mr,ne,or,pa,sa,sat,sd,ta,te,ur',
          layout: window.google.translate.TranslateElement.InlineLayout.DROPDOWN,
          multilanguagePage: true,
          autoDisplay: false
        },
        'google_translate_element'
      )
      
      setTimeout(() => {
        const banner = document.querySelector('.goog-te-banner-frame')
        if (banner) banner.remove()
        
        // Clear any saved language to always start fresh
        localStorage.removeItem('googtrans')
        document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
        
        const combo = document.querySelector('.goog-te-combo')
        if (combo) {
          // Add default "Select Language" option
          const selectElement = combo as HTMLSelectElement
          if (selectElement && !selectElement.querySelector('option[value=""]')) {
            const defaultOption = document.createElement('option')
            defaultOption.value = ''
            defaultOption.text = 'Select Language'
            defaultOption.selected = true
            selectElement.insertBefore(defaultOption, selectElement.firstChild)
          }
          
          combo.addEventListener('change', function() {
            const selectedValue = (this as HTMLSelectElement).value
            if (selectedValue === '') {
              // Reset to English if "Select Language" is chosen
              window.location.reload()
            } else {
              setTimeout(() => {
                const banner = document.querySelector('.goog-te-banner-frame')
                if (banner) banner.remove()
              }, 100)
            }
          })
        }
      }, 1000)
    }

    addScript()
    
    // Always clear translation data on page load
    localStorage.removeItem('googtrans')
    document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
    
    const observer = new MutationObserver(() => {
      const banner = document.querySelector('.goog-te-banner-frame')
      if (banner) banner.remove()
    })
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    })
    
    return () => observer.disconnect()
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      router.push(`/events?search=${encodeURIComponent(searchQuery)}`)
    }
  }

  return (
    <header className="sticky top-0 z-50 backdrop-blur-lg border-b border-[#124972]/40" style={{backgroundColor: '#124972'}}>
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 font-bold text-xl hover:opacity-80 transition flex-shrink-0">
            <img src="/mookalaa-logo-2.png" alt="MOOKALAA - Unite through Arts" className="h-8 sm:h-10 w-auto" />
          </Link>

          {/* Search Bar - Hidden on mobile */}
          <form onSubmit={handleSearch} className="hidden lg:flex flex-1 max-w-md mx-4 xl:mx-8">
            <div className="relative w-full">
              <input
                type="text"
                placeholder="Search arts & events..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20 transition text-sm"
              />
              <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2">
                <Search size={18} className="text-muted-foreground" />
              </button>
            </div>
          </form>

          {/* Google Translate */}
          <div className="hidden lg:block" suppressHydrationWarning>
            <div id="google_translate_element" suppressHydrationWarning></div>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2 sm:gap-3" suppressHydrationWarning>

            
            {/* Explore Button */}
            <Button asChild size="sm" className="rounded-lg bg-accent hover:bg-accent/90 text-xs sm:text-sm px-3 sm:px-4">
              <Link href="/events">{t("explore")}</Link>
            </Button>
          </div>
        </div>
      </div>
      <style jsx global>{`
        .goog-te-gadget {
          font-family: inherit !important;
        }
        .goog-te-gadget-simple {
          background-color: transparent !important;
          border: none !important;
          font-size: 14px !important;
        }
        .goog-te-gadget-simple .goog-te-menu-value {
          color: white !important;
        }
        .goog-te-banner-frame {
          display: none !important;
        }
        .goog-te-combo {
          padding: 12px 12px 8px 12px !important;
          border: 1px solid #ccc !important;
          border-radius: 4px !important;
          background: #124972 !important;
          color: white !important;
          font-size: 14px !important;
          min-width: 150px !important;
        }
        .goog-te-gadget-simple a {
          display: none !important;
        }
        .goog-te-gadget img {
          display: none !important;
        }
        #goog-gt-tt {
          display: none !important;
        }
        .goog-tooltip {
          display: none !important;
        }
        body > .skiptranslate {
          display: none !important;
        }
      `}</style>
    </header>
  )
}
