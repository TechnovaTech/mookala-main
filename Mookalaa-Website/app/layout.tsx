import type React from "react"
import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"

import { Header } from "@/components/header"
import { MaintenanceGate, PlatformProvider } from "@/components/platform-provider"

// Calling these registers the "Geist" font faces that globals.css names in
// --font-sans and --font-mono.
const geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
}

export const metadata: Metadata = {
  title: "Mookalaa - Unite Through Arts",
  description:
    "Unite Through Arts. Discover and book Jatra, Cinema, Music, Dance, Festivals and Workshops from artists across India.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/mookalaa-logo.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon.ico", sizes: "16x16", type: "image/x-icon" },
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
      <body className={`${geist.className} antialiased bg-background text-foreground`} suppressHydrationWarning>
        <PlatformProvider>
          <Header />
          <MaintenanceGate>{children}</MaintenanceGate>
        </PlatformProvider>
        <Analytics />
      </body>
    </html>
  )
}
