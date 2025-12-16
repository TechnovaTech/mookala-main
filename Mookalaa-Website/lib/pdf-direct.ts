import { generateQRCode } from './qr-generator'

// Direct PDF generation without external libraries
export const generateTicketPDF = (booking: any) => {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  
  // Set canvas size (A4 proportions)
  canvas.width = 400
  canvas.height = 600
  
  // Orange header
  ctx.fillStyle = '#f59e0b'
  ctx.fillRect(0, 0, 400, 80)
  
  // Header text
  ctx.fillStyle = 'white'
  ctx.font = 'bold 18px Arial'
  ctx.fillText('MOOKALAA', 20, 30)
  ctx.font = '14px Arial'
  ctx.fillText('EVENT TICKET', 280, 30)
  
  // Blue event section
  ctx.fillStyle = '#3b82f6'
  ctx.fillRect(0, 80, 400, 120)
  
  // Event details
  ctx.fillStyle = 'white'
  ctx.font = 'bold 24px Arial'
  ctx.fillText(booking.eventTitle.toUpperCase(), 20, 120)
  ctx.font = '16px Arial'
  ctx.fillText('GRAND CELEBRATION', 20, 145)
  ctx.font = '14px Arial'
  ctx.fillText(`DATE: ${booking.eventDate}`, 20, 170)
  ctx.fillText(`TIME: ${booking.eventTime}`, 20, 185)
  ctx.fillText(`VENUE: ${booking.venue.toUpperCase()}`, 20, 200)
  
  // White background for details
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 200, 400, 250)
  
  // Ticket details
  ctx.fillStyle = '#3b82f6'
  ctx.font = 'bold 16px Arial'
  ctx.fillText('TICKET DETAILS', 20, 230)
  
  // Passenger details box
  ctx.fillStyle = '#dbeafe'
  ctx.fillRect(20, 240, 360, 50)
  ctx.fillStyle = 'black'
  ctx.font = 'bold 12px Arial'
  ctx.fillText('PASSENGER DETAILS', 30, 260)
  ctx.font = '12px Arial'
  ctx.fillText('Name: USER1', 30, 275)
  ctx.fillText('Mobile: 3333333333', 30, 285)
  
  // Ticket box
  let yPos = 300
  booking.tickets.forEach((ticket: any) => {
    ctx.fillStyle = '#fef3c7'
    ctx.fillRect(20, yPos, 360, 50)
    ctx.fillStyle = 'black'
    ctx.font = 'bold 12px Arial'
    ctx.fillText(`${ticket.category} - Block ${ticket.block}`, 30, yPos + 20)
    ctx.font = '12px Arial'
    ctx.fillText(`Seats: ${ticket.block}${ticket.fromSeat}-${ticket.block}${ticket.toSeat}`, 30, yPos + 35)
    ctx.fillText(`Rs.${ticket.totalPrice}`, 30, yPos + 45)
    yPos += 60
  })
  
  // Total section
  ctx.fillStyle = '#3b82f6'
  ctx.fillRect(0, 450, 400, 50)
  ctx.fillStyle = 'white'
  ctx.font = 'bold 16px Arial'
  ctx.fillText('TOTAL AMOUNT', 20, 480)
  ctx.fillText(`Rs.${booking.totalPrice}`, 280, 480)
  
  // Footer
  ctx.fillStyle = '#22c55e'
  ctx.fillRect(0, 550, 400, 50)
  ctx.fillStyle = 'white'
  ctx.font = '12px Arial'
  ctx.fillText('Official Event Partners', 20, 575)
  ctx.fillText(`ID: ${booking._id.substring(0, 8)}`, 280, 575)
  
  // Convert canvas to blob and download
  canvas.toBlob((blob) => {
    if (blob) {
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `Mookalaa_Ticket_${booking.eventTitle.replace(/[^a-zA-Z0-9]/g, '_')}_${booking._id.substring(0, 8)}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    }
  }, 'image/png')
}

// Simple PDF-like generation using browser print
export const printTicketPDF = (booking: any) => {
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

  const printContent = `
    <div style="width: 350px; margin: 20px auto; font-family: Arial, sans-serif; border-radius: 20px; overflow: hidden; background: white; box-shadow: 0 4px 20px rgba(0,0,0,0.15);">
      <!-- Orange Header -->
      <div style="background: #f59e0b; color: white; padding: 15px 20px; display: flex; justify-content: space-between; align-items: center;">
        <div style="font-size: 16px; font-weight: bold;">MOOKALAA</div>
        <div style="font-size: 14px; font-weight: 500;">EVENT TICKET</div>
      </div>

      <!-- Blue Event Section -->
      <div style="background: #2563eb; color: white; padding: 20px;">
        <div style="font-size: 24px; font-weight: bold; margin-bottom: 5px;">${booking.eventTitle.toUpperCase()}</div>
        <div style="font-size: 14px; margin-bottom: 15px; opacity: 0.9;">GRAND CELEBRATION</div>
        <div style="font-size: 12px; line-height: 1.4;">
          <div style="margin-bottom: 3px;"><strong>DATE:</strong> ${booking.eventDate}</div>
          <div style="margin-bottom: 3px;"><strong>TIME:</strong> ${booking.eventTime}</div>
          <div style="margin-bottom: 3px;"><strong>VENUE:</strong> ${booking.venue.toUpperCase()}</div>
          <div style="font-size: 11px; margin-top: 8px; opacity: 0.8;">ADDRESS: RAJKOT<br>RAJKOT, GUJARAT</div>
        </div>
      </div>

      <!-- White Details Section -->
      <div style="background: white; padding: 20px; position: relative;">
        <div style="color: #2563eb; font-size: 14px; font-weight: bold; margin-bottom: 15px;">TICKET DETAILS</div>
        
        <!-- QR Code positioned on right -->
        <div style="position: absolute; top: 20px; right: 20px;">
          <img src="${qrCodeUrl}" alt="QR Code" style="width: 80px; height: 80px; border: 1px solid #d1d5db; border-radius: 4px;" />
        </div>
        
        <!-- Passenger Details -->
        <div style="background: #dbeafe; border: 1px solid #93c5fd; padding: 10px; border-radius: 6px; margin-bottom: 12px; font-size: 11px; width: 200px;">
          <div style="color: #1e40af; font-weight: bold; margin-bottom: 4px;">PASSENGER DETAILS</div>
          <div>Name: USER1</div>
          <div>Mobile: 3333333333</div>
        </div>

        <!-- Ticket Details -->
        ${booking.tickets.map((ticket: any) => `
          <div style="background: #fef3c7; border: 1px solid #fbbf24; padding: 10px; border-radius: 6px; margin-bottom: 12px; font-size: 11px; width: 200px;">
            <div style="font-weight: bold; margin-bottom: 4px;">${ticket.category} - Block ${ticket.block} - Block ${ticket.block}</div>
            <div style="margin-bottom: 2px;">Seats: ${ticket.block}${ticket.fromSeat}-${ticket.block}${ticket.toSeat}</div>
            <div style="color: #d97706; font-weight: bold;">Rs.${ticket.totalPrice}</div>
          </div>
        `).join('')}
      </div>

      <!-- Blue Total Section -->
      <div style="background: #2563eb; color: white; padding: 12px 20px; font-weight: bold; font-size: 14px; display: flex; justify-content: space-between;">
        <div>TOTAL AMOUNT</div>
        <div>Rs.${booking.totalPrice}</div>
      </div>

      <!-- Green Footer -->
      <div style="background: #16a34a; color: white; padding: 12px 20px; font-size: 11px; display: flex; justify-content: space-between;">
        <div>Official Event Partners</div>
        <div>ID: ${booking._id.substring(0, 8)}</div>
      </div>
    </div>
  `

  // Create print window
  const printWindow = window.open('', '_blank')
  if (printWindow) {
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Mookalaa Ticket</title>
        <style>
          @media print {
            body { margin: 0; }
            @page { size: A4; margin: 20mm; }
          }
        </style>
      </head>
      <body>
        ${printContent}
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
              window.close();
            }, 1000);
          }
        </script>
      </body>
      </html>
    `)
    printWindow.document.close()
  }
}