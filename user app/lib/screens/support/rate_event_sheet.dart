import 'package:flutter/material.dart';

import '../../models/booking.dart';
import '../../services/api_client.dart';
import '../../services/api_service.dart';
import '../../widgets/app_theme.dart';

/// Whether the customer may rate this booking: they attended it (the ticket was
/// scanned, or the booking is marked attended). The server checks this again.
bool canRateBooking(Booking booking) => booking.status == 'attended' || booking.checkedIn;

/// Asks for 1 to 5 stars and an optional comment and sends them
/// (`POST /public/feedback`). Returns the server's message, or null when the
/// sheet was closed without rating.
Future<String?> showRateEventSheet(BuildContext context, Booking booking) {
  return showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
    builder: (_) => _RateEventSheet(booking: booking),
  );
}

class _RateEventSheet extends StatefulWidget {
  const _RateEventSheet({required this.booking});
  final Booking booking;

  @override
  State<_RateEventSheet> createState() => _RateEventSheetState();
}

class _RateEventSheetState extends State<_RateEventSheet> {
  final _comment = TextEditingController();
  int _stars = 0;
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (_stars < 1) {
      setState(() => _error = 'Choose from 1 to 5 stars.');
      return;
    }
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final message = await ApiService.rateEvent(
        bookingId: widget.booking.id,
        eventId: widget.booking.eventId,
        rating: _stars,
        comment: _comment.text,
      );
      if (mounted) Navigator.of(context).pop(message);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _error = e.message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final inset = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + inset),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Rate this event', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            Text(widget.booking.title, style: TextStyle(color: Colors.grey.shade700)),
            const SizedBox(height: 12),
            Row(
              children: [
                for (var i = 1; i <= 5; i++)
                  IconButton(
                    key: ValueKey('star-$i'),
                    tooltip: '$i ${i == 1 ? 'star' : 'stars'}',
                    onPressed: _sending ? null : () => setState(() => _stars = i),
                    icon: Icon(i <= _stars ? Icons.star : Icons.star_border, color: AppColors.warning, size: 34),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            TextField(
              key: const ValueKey('rating-comment'),
              controller: _comment,
              enabled: !_sending,
              maxLength: 1000,
              minLines: 2,
              maxLines: 5,
              decoration: fieldDecoration('Comment (optional)'),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: const TextStyle(color: AppColors.danger)),
            ],
            const SizedBox(height: 12),
            ElevatedButton(
              onPressed: _sending ? null : _send,
              style: primaryButtonStyle(),
              child: Text(_sending ? 'Sending...' : 'Send rating'),
            ),
            const SizedBox(height: 8),
            Text('Your rating is shown on the event once Mookalaa has reviewed it.', style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
          ],
        ),
      ),
    );
  }
}
