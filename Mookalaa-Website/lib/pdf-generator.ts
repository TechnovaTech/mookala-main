import { generateQRCode } from './qr-generator'

export const generateTicketPDF = async (booking: any): Promise<Blob> => {
  // Create HTML content for PDF
  const qrCodeUrl = generateQRCode(JSON.stringify({
    bookingId: booking._id,
    eventTitle: booking.eventTitle,
    eventDate: booking.eventDate,
    eventTime: booking.eventTime,
    venue: booking.venue,
    totalSeats: booking.totalSeats,
    totalPrice: booking.totalPrice,
    tickets: booking.tickets,
    status: booking.status,
  }))

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Mookalaa Ticket - ${booking.eventTitle}</title>
      <style>
        body { 
          font-family: Arial, sans-serif; 
          margin: 20px; 
          background: #f9f9f9;
        }
        .ticket {
          background: white;
          border: 2px solid #9333ea;
          border-radius: 15px;
          padding: 30px;
          max-width: 600px;
          margin: 0 auto;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .header {
          text-align: center;
          border-bottom: 2px dashed #9333ea;
          padding-bottom: 20px;
          margin-bottom: 20px;
        }
        .logo {
          font-size: 24px;
          font-weight: bold;
          color: #9333ea;
          margin-bottom: 10px;
        }
        .event-title {
          font-size: 20px;
          font-weight: bold;
          color: #333;
          margin-bottom: 10px;
        }
        .event-details {
          display: flex;
          justify-content: space-between;
          margin-bottom: 20px;
        }
        .detail-box {
          background: #f3f4f6;
          padding: 10px;
          border-radius: 8px;
          text-align: center;
          flex: 1;
          margin: 0 5px;
        }
        .detail-label {
          font-size: 12px;
          color: #666;
          margin-bottom: 5px;
        }
        .detail-value {
          font-weight: bold;
          color: #333;
        }
        .tickets-section {
          margin: 20px 0;
        }
        .ticket-item {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 15px;
          margin-bottom: 10px;
        }
        .qr-section {
          text-align: center;
          margin-top: 20px;
          padding-top: 20px;
          border-top: 2px dashed #9333ea;
        }
        .qr-code {
          margin: 10px 0;
        }
        .footer {
          text-align: center;
          margin-top: 20px;
          font-size: 12px;
          color: #666;
        }
        .booking-id {
          background: #9333ea;
          color: white;
          padding: 5px 10px;
          border-radius: 5px;
          font-family: monospace;
        }
      </style>
    </head>
    <body>
      <div class="ticket">
        <div class="header">
          <div class="logo">🎭 MOOKALAA</div>
          <div class="event-title">${booking.eventTitle}</div>
          <div class="booking-id">Booking ID: ${booking._id}</div>
        </div>

        <div class="event-details">
          <div class="detail-box">
            <div class="detail-label">📅 Date</div>
            <div class="detail-value">${booking.eventDate}</div>
          </div>
          <div class="detail-box">
            <div class="detail-label">🕐 Time</div>
            <div class="detail-value">${booking.eventTime}</div>
          </div>
          <div class="detail-box">
            <div class="detail-label">📍 Venue</div>
            <div class="detail-value">${booking.venue}</div>
          </div>
        </div>

        <div class="tickets-section">
          <h3 style="color: #9333ea; margin-bottom: 15px;">🎫 Ticket Details</h3>
          ${booking.tickets.map((ticket: any, index: number) => `
            <div class="ticket-item">
              <strong>Ticket ${index + 1}: ${ticket.category}</strong><br>
              Block ${ticket.block}: Seats ${ticket.block}${ticket.fromSeat} to ${ticket.block}${ticket.toSeat}<br>
              Quantity: ${ticket.quantity} seats | Price: ₹${ticket.totalPrice}
            </div>
          `).join('')}
        </div>

        <div style="display: flex; justify-content: space-between; margin: 20px 0;">
          <div>
            <strong>Total Seats: ${booking.totalSeats}</strong>
          </div>
          <div>
            <strong style="color: #9333ea; font-size: 18px;">Total: ₹${booking.totalPrice}</strong>
          </div>
        </div>

        <div class="qr-section">
          <div style="font-weight: bold; margin-bottom: 10px;">Entry QR Code</div>
          <div class="qr-code">
            <img src="${qrCodeUrl}" alt="QR Code" style="border: 1px solid #ddd; border-radius: 8px;" />
          </div>
          <div style="font-size: 12px; color: #666;">
            Show this QR code at the venue for entry
          </div>
        </div>

        <div class="footer">
          <p><strong>Status:</strong> ${booking.status.toUpperCase()}</p>
          <p>Booked on: ${new Date(booking.bookingDate).toLocaleDateString()}</p>
          <p>Thank you for booking with Mookalaa! 🎭</p>
          <p style="margin-top: 15px; font-size: 10px;">
            For support: support@mookalaa.com | +91 9583023002
          </p>
        </div>
      </div>
    </body>
    </html>
  `

  // Convert HTML to PDF (using browser's print functionality)
  const blob = new Blob([htmlContent], { type: 'text/html' })
  return blob
}

export const downloadTicketHTML = (booking: any) => {
  generateTicketPDF(booking).then(blob => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `Mookalaa_Ticket_${booking.eventTitle.replace(/[^a-zA-Z0-9]/g, '_')}_${booking._id.substring(0, 8)}.html`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  })
}