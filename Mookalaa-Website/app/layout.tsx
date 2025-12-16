import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"

import { Header } from "@/components/header"
import { LanguageProvider } from "@/lib/language-context"
import GoogleTranslate from "@/components/GoogleTranslate"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Mookalaa Website",
  description:
    "Unite Through Arts. Discover amazing Jatra, Cinema, Music, Dance, Festivals, Workshops, and Custom Orders from artists worldwide.",
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
  icons: {
    icon: [
      { url: "/mookalaa-logo.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon.ico", sizes: "16x16", type: "image/x-icon" }
    ],
    apple: "/mookalaa-logo.png",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="icon" type="image/png" href="/mookalaa-logo.png" />
      </head>
      <body className={`font-sans antialiased bg-background text-foreground`} suppressHydrationWarning>
        <LanguageProvider>
          <Header />
          {children}
          <GoogleTranslate />
          <Analytics />
        </LanguageProvider>
      </body>
    </html>
  )
}
