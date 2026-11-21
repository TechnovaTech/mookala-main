import 'dart:typed_data';

import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../models/booking.dart';
import 'booking_logic.dart';
import 'formats.dart';

/// The built-in PDF font has no rupee sign, so amounts are written "Rs.".
String _money(double amount) => amount == 0 ? 'Free' : pdfSafe(formatRupees(amount));

/// The built-in PDF fonts only cover Latin-1. Punctuation outside it is
/// replaced with a plain equivalent; any other character (for example a title
/// written in an Indian script) is printed as "?" rather than breaking the PDF.
String pdfSafe(String text) {
  final buffer = StringBuffer();
  for (final rune in text.runes) {
    switch (rune) {
      case 0x2022: // bullet
        buffer.write('|');
        break;
      case 0x2013: // en dash
      case 0x2014: // em dash
        buffer.write('-');
        break;
      case 0x2018:
      case 0x2019:
        buffer.write("'");
        break;
      case 0x201C:
      case 0x201D:
        buffer.write('"');
        break;
      case 0x20B9: // rupee sign
        buffer.write('Rs. ');
        break;
      default:
        buffer.write(rune <= 0xFF ? String.fromCharCode(rune) : '?');
    }
  }
  return buffer.toString();
}

/// Builds the ticket PDF from the booking the server returned. Every line is
/// real booking data; a field the booking does not have is left out.
Future<Uint8List> buildTicketPdf(Booking booking) async {
  final doc = pw.Document(title: 'Ticket ${booking.reference}', author: 'Mookalaa');
  final when = booking.start;
  final navy = PdfColor.fromHex('#001F3F');

  pw.Widget row(String label, String value) => pw.Padding(
        padding: const pw.EdgeInsets.symmetric(vertical: 3),
        child: pw.Row(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            pw.SizedBox(width: 110, child: pw.Text(label, style: const pw.TextStyle(color: PdfColors.grey700, fontSize: 11))),
            pw.Expanded(child: pw.Text(pdfSafe(value), style: const pw.TextStyle(fontSize: 12))),
          ],
        ),
      );

  doc.addPage(
    pw.Page(
      pageFormat: PdfPageFormat.a5,
      margin: const pw.EdgeInsets.all(24),
      build: (context) => pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          pw.Container(
            width: double.infinity,
            padding: const pw.EdgeInsets.all(12),
            color: navy,
            child: pw.Text('Mookalaa ticket', style: pw.TextStyle(color: PdfColors.white, fontSize: 16, fontWeight: pw.FontWeight.bold)),
          ),
          pw.SizedBox(height: 14),
          pw.Text(pdfSafe(booking.title), style: pw.TextStyle(fontSize: 18, fontWeight: pw.FontWeight.bold)),
          pw.SizedBox(height: 10),
          if (when != null) row('Date', when.dateLabel) else if (booking.eventDate.isNotEmpty) row('Date', booking.eventDate),
          if (when != null && when.hasTime) row('Time', when.timeLabel) else if (when == null && booking.eventTime.isNotEmpty) row('Time', booking.eventTime),
          if (booking.venue.isNotEmpty) row('Venue', booking.venue),
          pw.Divider(color: PdfColors.grey400),
          for (final line in booking.lines) row('Tickets', '${line.summary} (${_money(line.totalPrice)})'),
          row('Total tickets', '${booking.totalSeats}'),
          row('Total', _money(booking.totalPrice)),
          row('Status', bookingStatusLabel(booking.status)),
          row('Payment', paymentStatusLabel(booking.paymentStatus, isFree: booking.isFree)),
          if (formatTimestamp(booking.bookingDate).isNotEmpty) row('Booked on', formatTimestamp(booking.bookingDate)),
          row('Booking reference', booking.reference),
          row('Booking ID', booking.id),
          pw.SizedBox(height: 14),
          if (booking.showsQr)
            pw.Center(
              child: pw.Column(
                children: [
                  pw.BarcodeWidget(barcode: pw.Barcode.qrCode(), data: booking.qrPayload, width: 150, height: 150),
                  pw.SizedBox(height: 6),
                  pw.Text('Show this code at the entrance.', style: const pw.TextStyle(color: PdfColors.grey700, fontSize: 10)),
                ],
              ),
            )
          else
            pw.Text('This booking is ${bookingStatusLabel(booking.status).toLowerCase()} and cannot be used for entry.',
                style: const pw.TextStyle(color: PdfColors.red800, fontSize: 11)),
        ],
      ),
    ),
  );

  return doc.save();
}
