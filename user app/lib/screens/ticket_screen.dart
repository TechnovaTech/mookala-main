import 'dart:io';

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';

import '../models/booking.dart';
import '../services/api_client.dart';
import '../services/api_service.dart';
import '../utils/booking_logic.dart';
import '../utils/formats.dart';
import '../utils/ticket_pdf.dart';
import '../widgets/app_theme.dart';
import 'my_bookings_screen.dart';

Color bookingStatusColor(String status) {
  switch (status) {
    case 'confirmed':
      return Colors.green.shade700;
    case 'attended':
      return Colors.blueGrey.shade700;
    case 'cancelled':
    case 'expired':
      return AppColors.danger;
    default:
      return AppColors.warning;
  }
}

/// One booking: the QR for the gate, its real status, the PDF and cancellation.
/// Pops with `true` when the booking was changed (cancelled).
class TicketScreen extends StatefulWidget {
  const TicketScreen({super.key, required this.booking, this.justBooked = false});

  final Booking booking;

  /// True when arriving straight from a successful booking.
  final bool justBooked;

  @override
  State<TicketScreen> createState() => _TicketScreenState();
}

class _TicketScreenState extends State<TicketScreen> {
  late Booking _booking = widget.booking;
  bool _makingPdf = false;
  bool _cancelBusy = false;
  bool _changed = false;

  bool get _mayCancel =>
      _booking.status == 'confirmed' && !_booking.checkedIn && bookingGroupOf(_booking, DateTime.now()) == BookingGroup.upcoming;

  /* -------------------------------- PDF -------------------------------- */

  Future<void> _sharePdf() async {
    setState(() => _makingPdf = true);
    try {
      final bytes = await buildTicketPdf(_booking);
      final dir = await getApplicationDocumentsDirectory();
      final folder = Directory('${dir.path}/tickets');
      if (!folder.existsSync()) folder.createSync(recursive: true);
      final file = File('${folder.path}/mookalaa-ticket-${_booking.reference}.pdf');
      await file.writeAsBytes(bytes, flush: true);
      if (!mounted) return;
      setState(() => _makingPdf = false);
      // iPad shows the share sheet as a popover and needs to know where to anchor it.
      final box = context.findRenderObject();
      final origin = box is RenderBox && box.hasSize ? box.localToGlobal(Offset.zero) & box.size : null;
      // The share sheet lets the person open, save or send the saved file.
      await Share.shareXFiles(
        [XFile(file.path, mimeType: 'application/pdf')],
        subject: 'Ticket: ${_booking.title}',
        sharePositionOrigin: origin,
      );
    } catch (_) {
      if (!mounted) return;
      setState(() => _makingPdf = false);
      showMessage(context, 'The ticket PDF could not be created on this device.');
    }
  }

  /* ------------------------------- Cancel ------------------------------- */

  Future<void> _startCancel() async {
    setState(() => _cancelBusy = true);
    CancelPreview preview;
    try {
      preview = await ApiService.previewCancellation(_booking.id);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _cancelBusy = false);
      showMessage(context, e.message);
      return;
    }
    if (!mounted) return;
    setState(() => _cancelBusy = false);

    if (!preview.cancellable) {
      await showDialog<void>(
        context: context,
        builder: (dialog) => AlertDialog(
          title: const Text('This booking cannot be cancelled'),
          content: Text(preview.explanation.isNotEmpty
              ? preview.explanation
              : 'Its status is "${bookingStatusLabel(preview.status)}".'),
          actions: [TextButton(onPressed: () => Navigator.pop(dialog), child: const Text('OK'))],
        ),
      );
      return;
    }

    final reason = await showDialog<String>(context: context, builder: (_) => _CancelDialog(preview: preview));
    if (reason == null || !mounted) return;

    setState(() => _cancelBusy = true);
    try {
      final message = await ApiService.cancelBooking(_booking.id, reason);
      // Show what the server now says about this booking, not a guess.
      Booking? fresh;
      try {
        final all = await ApiService.getMyBookings();
        for (final b in all) {
          if (b.id == _booking.id) fresh = b;
        }
      } on ApiException {
        fresh = null;
      }
      if (!mounted) return;
      _changed = true;
      if (fresh == null) {
        showMessage(context, message);
        Navigator.of(context).pop(true);
        return;
      }
      setState(() {
        _booking = fresh!;
        _cancelBusy = false;
      });
      showMessage(context, message);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _cancelBusy = false);
      showMessage(context, e.message);
    }
  }

  /* --------------------------------- UI --------------------------------- */

  Widget _row(IconData icon, String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 18, color: Colors.grey.shade600),
            const SizedBox(width: 10),
            SizedBox(width: 96, child: Text(label, style: TextStyle(color: Colors.grey.shade600))),
            Expanded(child: Text(value, style: const TextStyle(fontWeight: FontWeight.w500))),
          ],
        ),
      );

  @override
  Widget build(BuildContext context) {
    final b = _booking;
    final when = b.start;
    final statusColor = bookingStatusColor(b.status);

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) Navigator.of(context).pop(_changed);
      },
      child: Scaffold(
        backgroundColor: Colors.grey.shade100,
        appBar: navyAppBar('Ticket'),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (widget.justBooked && b.status == 'confirmed')
              Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: Colors.green.shade50, borderRadius: BorderRadius.circular(8)),
                child: Row(
                  children: [
                    Icon(Icons.check_circle, color: Colors.green.shade700),
                    const SizedBox(width: 8),
                    const Expanded(child: Text('Booking confirmed. Your ticket is below.', style: TextStyle(fontWeight: FontWeight.w600))),
                  ],
                ),
              ),
            Card(
              color: Colors.white,
              surfaceTintColor: Colors.white,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(b.title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 6,
                      children: [
                        _chip(bookingStatusLabel(b.status), statusColor),
                        _chip(paymentStatusLabel(b.paymentStatus, isFree: b.isFree), Colors.blueGrey.shade700),
                        if (b.checkedIn) _chip('Checked in', Colors.blueGrey.shade700),
                      ],
                    ),
                    const Divider(height: 28),
                    if (when != null) _row(Icons.calendar_today, 'Date', when.dateLabel) else if (b.eventDate.isNotEmpty) _row(Icons.calendar_today, 'Date', b.eventDate),
                    if (when != null && when.hasTime) _row(Icons.access_time, 'Time', when.timeLabel) else if (when == null && b.eventTime.isNotEmpty) _row(Icons.access_time, 'Time', b.eventTime),
                    if (b.venue.isNotEmpty) _row(Icons.location_on_outlined, 'Venue', b.venue),
                    for (final line in b.lines) _row(Icons.confirmation_number_outlined, 'Tickets', line.summary),
                    _row(Icons.payments_outlined, 'Total', b.priceLabel),
                    if (formatTimestamp(b.bookingDate).isNotEmpty) _row(Icons.event_available, 'Booked on', formatTimestamp(b.bookingDate)),
                    _row(Icons.tag, 'Reference', b.reference),
                    if (b.cancelReason.isNotEmpty) _row(Icons.info_outline, 'Reason', b.cancelReason),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            Card(
              color: Colors.white,
              surfaceTintColor: Colors.white,
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: b.showsQr
                    ? Column(
                        children: [
                          QrImageView(data: b.qrPayload, size: 220, backgroundColor: Colors.white),
                          const SizedBox(height: 8),
                          Text(
                            b.status == 'attended' ? 'This ticket has already been used.' : 'Show this code at the entrance.',
                            style: TextStyle(color: Colors.grey.shade700),
                          ),
                        ],
                      )
                    : Text(
                        'This booking is ${bookingStatusLabel(b.status).toLowerCase()}, so it has no entry code.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Colors.grey.shade700),
                      ),
              ),
            ),
            const SizedBox(height: 16),
            if (b.showsQr)
              ElevatedButton.icon(
                onPressed: _makingPdf ? null : _sharePdf,
                style: primaryButtonStyle(),
                icon: _makingPdf
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.picture_as_pdf_outlined),
                label: const Text('SAVE OR SHARE TICKET (PDF)'),
              ),
            if (_mayCancel) ...[
              const SizedBox(height: 8),
              OutlinedButton(
                onPressed: _cancelBusy ? null : _startCancel,
                style: OutlinedButton.styleFrom(foregroundColor: AppColors.danger, minimumSize: const Size.fromHeight(48)),
                child: _cancelBusy
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Cancel booking'),
              ),
            ],
            if (widget.justBooked) ...[
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const MyBookingsScreen())),
                child: const Text('View all my bookings'),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _chip(String text, Color color) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
        child: Text(text, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600)),
      );
}

/// Shows the refund the server quoted and asks for the required reason.
/// Pops with the reason, or null when the customer keeps the booking.
class _CancelDialog extends StatefulWidget {
  const _CancelDialog({required this.preview});
  final CancelPreview preview;

  @override
  State<_CancelDialog> createState() => _CancelDialogState();
}

class _CancelDialogState extends State<_CancelDialog> {
  final _reason = TextEditingController();

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.preview;
    final hasReason = _reason.text.trim().length >= 3;
    return AlertDialog(
      title: const Text('Cancel this booking?'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (p.explanation.isNotEmpty) Text(p.explanation),
            const SizedBox(height: 12),
            if (p.amountPaid > 0) Text('Paid: ${formatRupees(p.amountPaid)}'),
            Text('Refund: ${formatRupees(p.refundAmount)}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            if (p.amountPaid > 0 && p.deductionAmount > 0) Text('Not refunded: ${formatRupees(p.deductionAmount)}'),
            const SizedBox(height: 4),
            Text('A cancelled booking cannot be restored.', style: TextStyle(color: Colors.grey.shade700, fontSize: 13)),
            const SizedBox(height: 16),
            TextField(
              controller: _reason,
              maxLength: 500,
              maxLines: 2,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(labelText: 'Reason for cancelling (required)', border: OutlineInputBorder()),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Keep booking')),
        TextButton(
          onPressed: hasReason ? () => Navigator.pop(context, _reason.text.trim()) : null,
          style: TextButton.styleFrom(foregroundColor: AppColors.danger),
          child: const Text('Cancel booking'),
        ),
      ],
    );
  }
}
