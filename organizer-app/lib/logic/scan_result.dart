import 'dart:convert';

enum ScanTone { success, warning, error }

/// How one answer of `POST /bookings/verify` is shown at the gate.
class ScanOutcome {
  const ScanOutcome({required this.valid, required this.reason, required this.title, required this.message, required this.tone});

  final bool valid;
  final String reason;
  final String title;

  /// Always the server's own message when it sent one.
  final String message;
  final ScanTone tone;

  static const _titles = <String, String>{
    'ok': 'Entry allowed',
    'already_used': 'Already checked in',
    'cancelled': 'Ticket cancelled',
    'not_found': 'Ticket not found',
    'bad_qr': 'Not a Mookalaa ticket',
    'wrong_event': 'Wrong event',
    'payment_pending': 'Not paid',
    'expired': 'Booking expired',
    'payment_unverified': 'Payment not verified',
    'not_confirmed': 'Not confirmed',
  };

  static const _fallbackMessages = <String, String>{
    'ok': 'Ticket verified and checked in',
    'already_used': 'This ticket was already checked in',
    'cancelled': 'This ticket was cancelled',
    'not_found': 'No ticket matches this code',
    'bad_qr': 'This QR code is not a valid ticket',
    'wrong_event': 'This ticket is for a different event',
    'payment_pending': 'This booking has not been paid',
    'expired': 'This booking expired before it was paid',
    'payment_unverified': 'The payment for this ticket was never verified',
    'not_confirmed': 'This booking is not confirmed',
  };

  factory ScanOutcome.fromResponse(Map<String, dynamic> json) {
    final valid = json['valid'] == true;
    final rawReason = json['reason'];
    final reason = rawReason is String && rawReason.isNotEmpty ? rawReason : (valid ? 'ok' : 'unknown');
    final sent = json['message'] ?? json['error'];
    final message = sent is String && sent.trim().isNotEmpty
        ? sent.trim()
        : (_fallbackMessages[reason] ?? 'The server refused this ticket');
    final tone = valid
        ? ScanTone.success
        : (reason == 'already_used' || reason == 'wrong_event' ? ScanTone.warning : ScanTone.error);
    return ScanOutcome(
      valid: valid,
      reason: reason,
      title: _titles[reason] ?? (valid ? 'Entry allowed' : 'Entry refused'),
      message: message,
      tone: tone,
    );
  }
}

/// The request body for one scanned code.
///
/// Ticket QR codes hold JSON such as `{"bookingId":"..."}`, which is passed to
/// the server untouched as `qrData`. Anything else is sent as a plain
/// `bookingId`. `eventId` is always included when the scanner knows the event.
Map<String, dynamic> scanRequestBody(String scanned, {String? eventId}) {
  final text = scanned.trim();
  final body = <String, dynamic>{};
  var isJsonObject = false;
  if (text.startsWith('{')) {
    try {
      isJsonObject = jsonDecode(text) is Map;
    } catch (_) {
      isJsonObject = false;
    }
  }
  if (isJsonObject) {
    body['qrData'] = text;
  } else {
    body['bookingId'] = text;
  }
  if (eventId != null && eventId.isNotEmpty) body['eventId'] = eventId;
  return body;
}
