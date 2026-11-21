import { formatRupees } from "./api"
import { bookingQrPayload, qrSvg } from "./qr"
import type { Booking, BookingLine } from "./types"

/** Every value from the backend passes through here before it is written as HTML. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function seatLabel(line: BookingLine): string {
  if (line.fromSeat !== null && line.toSeat !== null) {
    const prefix = line.block || ""
    return line.fromSeat === line.toSeat
      ? `Seat ${prefix}${line.fromSeat}`
      : `Seats ${prefix}${line.fromSeat} to ${prefix}${line.toSeat}`
  }
  return `${line.quantity} ${line.quantity === 1 ? "ticket" : "tickets"} (no seat numbers)`
}

export function bookingStatusLabel(booking: Booking): string {
  switch (booking.status) {
    case "confirmed":
      return "Confirmed"
    case "attended":
      return "Attended"
    case "cancelled":
      return "Cancelled"
    case "pending_payment":
      return "Awaiting payment"
    case "expired":
      return "Expired"
    default:
      return booking.status || "Unknown"
  }
}

export function paymentStatusLabel(booking: Booking): string {
  switch (booking.paymentStatus) {
    case "paid":
      return booking.totalPrice === 0 ? "Free entry" : "Paid"
    case "pending":
      return "Payment pending"
    case "unverified":
      return "Payment not verified"
    case "failed":
      return "Payment failed"
    case "refund_requested":
      return "Refund requested"
    case "refunded":
      return "Refunded"
    default:
      return booking.paymentStatus || "Unknown"
  }
}

export interface TicketHolder {
  name: string
  phone: string
}

export function ticketHtml(booking: Booking, holder: TicketHolder): string {
  const e = escapeHtml
  const lines = booking.tickets
    .map(
      (line) => `
        <tr>
          <td>${e(line.category)}${line.block ? ` &middot; Block ${e(line.block)}` : ""}</td>
          <td>${e(seatLabel(line))}</td>
          <td class="num">${e(line.quantity)}</td>
          <td class="num">${e(formatRupees(line.totalPrice))}</td>
        </tr>`,
    )
    .join("")

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Mookalaa ticket ${e(booking._id)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 0; padding: 24px; }
  .ticket { max-width: 640px; margin: 0 auto; border: 2px solid #124972; border-radius: 12px; overflow: hidden; }
  .head { background: #124972; color: #fff; padding: 14px 20px; display: flex; justify-content: space-between; font-weight: bold; }
  .event { padding: 20px; border-bottom: 1px dashed #9ca3af; }
  .event h1 { margin: 0 0 10px; font-size: 22px; }
  .event p { margin: 3px 0; font-size: 14px; }
  .body { padding: 20px; display: flex; gap: 20px; align-items: flex-start; }
  .details { flex: 1; min-width: 0; }
  .details h2 { font-size: 12px; letter-spacing: .08em; color: #6b7280; margin: 0 0 6px; text-transform: uppercase; }
  .details p { margin: 2px 0 12px; font-size: 14px; word-break: break-word; }
  .qr { text-align: center; font-size: 11px; color: #6b7280; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 20px; border-top: 1px solid #e5e7eb; }
  th { background: #f3f4f6; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
  .num { text-align: right; }
  .total td { font-weight: bold; font-size: 15px; }
  .foot { padding: 12px 20px; font-size: 11px; color: #6b7280; border-top: 1px solid #e5e7eb; word-break: break-all; }
  @media print { body { padding: 0; } @page { size: A4; margin: 15mm; } }
</style>
</head>
<body>
  <div class="ticket">
    <div class="head"><span>MOOKALAA</span><span>EVENT TICKET</span></div>
    <div class="event">
      <h1>${e(booking.eventTitle || "Event")}</h1>
      <p><strong>Date:</strong> ${e(booking.eventDate || "To be announced")}</p>
      <p><strong>Time:</strong> ${e(booking.eventTime || "To be announced")}</p>
      <p><strong>Venue:</strong> ${e(booking.venue || "To be announced")}</p>
    </div>
    <div class="body">
      <div class="details">
        <h2>Booked by</h2>
        <p>${holder.name ? `${e(holder.name)}<br>` : ""}+91 ${e(holder.phone)}</p>
        <h2>Status</h2>
        <p>${e(bookingStatusLabel(booking))} &middot; ${e(paymentStatusLabel(booking))}</p>
        <h2>Seats</h2>
        <p>${e(booking.totalSeats)}</p>
      </div>
      <div class="qr">
        ${qrSvg(bookingQrPayload(booking._id), 160)}
        <div>Show this code at the gate</div>
      </div>
    </div>
    <table>
      <thead><tr><th>Ticket</th><th>Seats</th><th class="num">Qty</th><th class="num">Amount</th></tr></thead>
      <tbody>
        ${lines}
        <tr class="total"><td colspan="3">Total</td><td class="num">${e(formatRupees(booking.totalPrice))}</td></tr>
      </tbody>
    </table>
    <div class="foot">Booking ID: ${e(booking._id)}</div>
  </div>
</body>
</html>`
}

/**
 * Opens the ticket in a new window and asks the browser to print it (from
 * there it can be saved as a PDF). Returns false when the browser blocked the
 * window, so the caller can say so instead of claiming success.
 */
export function printTicket(booking: Booking, holder: TicketHolder): boolean {
  const ticketWindow = window.open("", "_blank")
  if (!ticketWindow) return false
  ticketWindow.document.open()
  ticketWindow.document.write(ticketHtml(booking, holder))
  ticketWindow.document.close()
  ticketWindow.focus()
  // Give the new document a moment to lay out before the print dialog opens.
  ticketWindow.setTimeout(() => ticketWindow.print(), 300)
  return true
}
