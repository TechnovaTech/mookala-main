"use client"

import { useEffect } from "react"

declare global {
  interface Window {
    google?: any
    googleTranslateElementInit?: () => void
  }
}

const LANGUAGES = "en,bn,brx,doi,gu,hi,kn,ks,gom,mai,ml,mni,mr,ne,or,pa,sa,sat,sd,ta,te,ur"

function forgetTranslation() {
  try {
    window.localStorage.removeItem("googtrans")
  } catch {
    // Storage unavailable: nothing was saved.
  }
  document.cookie = "googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;"
}

/**
 * The site's only Google Translate control. It must be mounted once: the
 * widget writes into the element with this id.
 */
export function TranslateWidget({ className = "" }: { className?: string }) {
  useEffect(() => {
    let timer: number | undefined

    window.googleTranslateElementInit = () => {
      if (!window.google?.translate?.TranslateElement) return
      new window.google.translate.TranslateElement(
        {
          pageLanguage: "en",
          includedLanguages: LANGUAGES,
          layout: window.google.translate.TranslateElement.InlineLayout.DROPDOWN,
          multilanguagePage: true,
          autoDisplay: false,
        },
        "google_translate_element",
      )

      timer = window.setTimeout(() => {
        const select = document.querySelector<HTMLSelectElement>(".goog-te-combo")
        if (!select) return

        if (!select.querySelector('option[value=""]')) {
          const placeholder = document.createElement("option")
          placeholder.value = ""
          placeholder.text = "Select Language"
          placeholder.selected = true
          select.insertBefore(placeholder, select.firstChild)
        }
        // Google leaves the page language out of the list; add English back.
        if (!select.querySelector('option[value="en"]')) {
          const english = document.createElement("option")
          english.value = "en"
          english.text = "English"
          const placeholder = select.querySelector('option[value=""]')
          select.insertBefore(english, placeholder ? placeholder.nextSibling : select.firstChild)
        }

        select.addEventListener("change", () => {
          if (select.value === "" || select.value === "en") {
            // Both mean "show the original page".
            forgetTranslation()
            window.location.reload()
          }
        })
      }, 1000)
    }

    forgetTranslation()

    if (!document.getElementById("google-translate-script")) {
      const script = document.createElement("script")
      script.id = "google-translate-script"
      script.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit"
      script.async = true
      document.body.appendChild(script)
    }

    return () => {
      if (timer) window.clearTimeout(timer)
    }
  }, [])

  return (
    <div className={className} suppressHydrationWarning>
      <div id="google_translate_element" suppressHydrationWarning></div>
      <style jsx global>{`
        .goog-te-gadget {
          font-family: inherit !important;
          font-size: 0 !important;
          color: transparent !important;
        }
        .goog-te-gadget > span,
        .goog-te-gadget img,
        .goog-te-gadget-simple a {
          display: none !important;
        }
        .goog-te-combo {
          padding: 8px 12px !important;
          margin: 0 !important;
          border: 1px solid rgba(255, 255, 255, 0.4) !important;
          border-radius: 6px !important;
          background: #124972 !important;
          color: white !important;
          font-size: 14px !important;
          min-width: 150px !important;
          max-width: 100% !important;
        }
        .goog-te-banner-frame,
        #goog-gt-tt,
        .goog-tooltip,
        body > .skiptranslate {
          display: none !important;
        }
        body {
          top: 0 !important;
        }
      `}</style>
    </div>
  )
}
