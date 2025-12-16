"use client"

import { useEffect } from 'react'

declare global {
  interface Window {
    google: any
    googleTranslateElementInit: () => void
  }
}

const GoogleTranslate = () => {
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
          gaTrack: true,
          gaId: 'UA-XXXXX-X'
        },
        'google_translate_element'
      )
      
      // Remove banner elements after initialization
      setTimeout(() => {
        const banner = document.querySelector('.goog-te-banner-frame')
        if (banner) banner.remove()
        
        // Fix dropdown functionality
        const combo = document.querySelector('.goog-te-combo')
        if (combo) {
          combo.addEventListener('change', function() {
            setTimeout(() => {
              const banner = document.querySelector('.goog-te-banner-frame')
              if (banner) banner.remove()
            }, 100)
          })
        }
      }, 500)
    }

    addScript()
    
    // Additional banner removal on page load
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

  return (
    <div className="fixed top-4 right-4 z-50 rounded-lg shadow-lg p-2" style={{backgroundColor: '#124972'}} suppressHydrationWarning>
      <div id="google_translate_element" suppressHydrationWarning></div>
      <style jsx global>{`
        /* Hide Google Translate banner */
        .goog-te-banner-frame {
          display: none !important;
        }
        
        /* Hide Google branding */
        .goog-logo-link {
          display: none !important;
        }
        
        /* Style the main gadget */
        .goog-te-gadget {
          font-family: inherit !important;
        }
        
        .goog-te-gadget-simple {
          background-color: transparent !important;
          border: none !important;
          font-size: 14px !important;
          width: 100% !important;
        }
        
        /* Style the dropdown text */
        .goog-te-gadget-simple .goog-te-menu-value {
          color: white !important;
          font-weight: 500 !important;
        }
        
        .goog-te-gadget-simple .goog-te-menu-value:hover {
          text-decoration: none !important;
        }
        
        /* Style the dropdown menu */
        .goog-te-menu-frame {
          max-height: 300px !important;
          overflow-y: auto !important;
          border-radius: 8px !important;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1) !important;
        }
        
        .goog-te-menu2 {
          max-height: 300px !important;
          overflow-y: auto !important;
          border: 1px solid #e5e7eb !important;
          border-radius: 8px !important;
          background: white !important;
        }
        
        .goog-te-menu2-item {
          padding: 8px 12px !important;
          font-size: 14px !important;
          color: #374151 !important;
          border-bottom: 1px solid #f3f4f6 !important;
        }
        
        .goog-te-menu2-item:hover {
          background-color: #f9fafb !important;
        }
        
        .goog-te-menu2-item-selected {
          background-color: #dbeafe !important;
          color: #1d4ed8 !important;
        }
        
        /* Hide unwanted elements */
        .goog-te-gadget img {
          display: none !important;
        }
        
        .goog-te-gadget-icon {
          display: none !important;
        }
        
        /* Remove body top margin */
        body {
          top: 0 !important;
        }
        
        /* Hide tooltips */
        #goog-gt-tt {
          display: none !important;
        }
        
        .goog-tooltip {
          display: none !important;
        }
        
        /* Hide text highlighting */
        .goog-text-highlight {
          background: none !important;
          box-shadow: none !important;
        }
        
        /* Hide all banner frames */
        .VIpgJd-ZVi9od-ORHb-OEVmcd,
        .VIpgJd-ZVi9od-xl07Ob-OEVmcd {
          display: none !important;
        }
        
        /* Hide skiptranslate iframes */
        .skiptranslate > iframe,
        iframe.skiptranslate {
          visibility: hidden !important;
          position: absolute !important;
          left: -9999px !important;
          top: -9999px !important;
        }
        
        body > .skiptranslate,
        html > body > .skiptranslate {
          display: none !important;
        }
      `}</style>
    </div>
  )
}

export default GoogleTranslate