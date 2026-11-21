"use client"

import { useMemo } from "react"
import { qrMatrix, qrPath } from "@/lib/qr"

/** A QR code drawn in the browser as SVG. Nothing leaves the page. */
export function QrCode({ value, size = 180, label }: { value: string; size?: number; label?: string }) {
  const drawing = useMemo(() => {
    try {
      return qrPath(qrMatrix(value))
    } catch {
      return null
    }
  }, [value])

  if (!drawing) {
    return <p className="text-sm text-red-600">The QR code could not be drawn for this booking.</p>
  }

  return (
    <svg
      role="img"
      aria-label={label || "Ticket QR code"}
      width={size}
      height={size}
      viewBox={`0 0 ${drawing.viewBoxSize} ${drawing.viewBoxSize}`}
      shapeRendering="crispEdges"
    >
      <rect width={drawing.viewBoxSize} height={drawing.viewBoxSize} fill="#ffffff" />
      <path d={drawing.path} fill="#000000" />
    </svg>
  )
}
