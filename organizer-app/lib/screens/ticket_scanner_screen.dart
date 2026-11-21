import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../logic/scan_result.dart';
import '../services/api.dart';
import '../services/api_client.dart';
import '../widgets/common.dart';

/// The one ticket scanner of the app, used by organisers and gate staff.
///
/// Every scanned code is checked by the server (`POST /bookings/verify`);
/// [eventId] is always sent when it is known so a ticket of another event is
/// refused.
class TicketScannerScreen extends StatefulWidget {
  const TicketScannerScreen({super.key, required this.eventId, this.eventName, this.onScanned, this.embedded = false});

  final String? eventId;
  final String? eventName;

  /// Called after every answer from the server (to refresh statistics).
  final VoidCallback? onScanned;

  /// Shown as a tab body: no Scaffold or AppBar of its own.
  final bool embedded;

  @override
  State<TicketScannerScreen> createState() => _TicketScannerScreenState();
}

class _TicketScannerScreenState extends State<TicketScannerScreen> {
  final MobileScannerController _controller = MobileScannerController();

  bool _processing = false;
  ScanOutcome? _outcome;
  Map<String, dynamic>? _booking;
  String? _checkedInAt;

  /// A failed request: not a verdict about the ticket.
  String? _requestError;
  String? _lastCode;

  bool get _hasEvent => (widget.eventId ?? '').isNotEmpty;
  bool get _showingResult => _outcome != null || _requestError != null;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    if (_processing || _showingResult) return;
    for (final barcode in capture.barcodes) {
      final raw = barcode.rawValue;
      if (raw != null && raw.trim().isNotEmpty) {
        _verify(raw);
        return;
      }
    }
  }

  Future<void> _verify(String raw) async {
    if (_processing) return;
    setState(() {
      _processing = true;
      _lastCode = raw;
      _outcome = null;
      _requestError = null;
    });
    try {
      await _controller.stop();
    } catch (_) {
      // The camera may already be stopped.
    }
    try {
      final response = await Api.verifyTicket(raw, eventId: widget.eventId);
      if (!mounted) return;
      final booking = response['booking'];
      final at = response['checkedInAt'] ?? (booking is Map ? booking['checkedInAt'] : null);
      setState(() {
        _outcome = ScanOutcome.fromResponse(response);
        _booking = booking is Map ? Map<String, dynamic>.from(booking) : null;
        _checkedInAt = at is String && at.isNotEmpty ? at : null;
      });
      widget.onScanned?.call();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _requestError = e.message);
    } finally {
      if (mounted) setState(() => _processing = false);
    }
  }

  Future<void> _scanNext() async {
    setState(() {
      _outcome = null;
      _booking = null;
      _checkedInAt = null;
      _requestError = null;
      _lastCode = null;
    });
    try {
      await _controller.start();
    } catch (_) {
      // MobileScanner shows its own error through errorBuilder.
    }
  }

  Future<void> _toggleTorch() async {
    try {
      await _controller.toggleTorch();
    } catch (_) {
      if (mounted) showMessage(context, 'This device has no flashlight.', error: true);
    }
  }

  static String _formatTime(String iso) {
    final parsed = DateTime.tryParse(iso);
    if (parsed == null) return iso;
    final local = parsed.toLocal();
    final hour = local.hour % 12 == 0 ? 12 : local.hour % 12;
    final period = local.hour >= 12 ? 'PM' : 'AM';
    return '${local.day}/${local.month}/${local.year}, $hour:${local.minute.toString().padLeft(2, '0')} $period';
  }

  static String _text(dynamic value) => (value ?? '').toString().trim();

  static String _ticketLine(Map ticket) {
    final category = _text(ticket['category']);
    final block = _text(ticket['block']);
    final from = _text(ticket['fromSeat']);
    final to = _text(ticket['toSeat']);
    final quantity = _text(ticket['quantity']);
    final parts = <String>[
      if (category.isNotEmpty) category,
      if (block.isNotEmpty) 'Block $block',
      if (from.isNotEmpty && to.isNotEmpty) (from == to ? 'Seat $from' : 'Seats $from-$to'),
      if (quantity.isNotEmpty) '× $quantity',
    ];
    return parts.join(' · ');
  }

  Widget _detail(String label, String value) {
    if (value.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 96, child: Text(label, style: const TextStyle(color: Colors.black54))),
          Expanded(child: Text(value, style: const TextStyle(fontWeight: FontWeight.w600))),
        ],
      ),
    );
  }

  Widget _resultPanel() {
    final outcome = _outcome!;
    final MaterialColor color;
    final IconData icon;
    switch (outcome.tone) {
      case ScanTone.success:
        color = Colors.green;
        icon = Icons.check_circle;
        break;
      case ScanTone.warning:
        color = Colors.orange;
        icon = Icons.warning_amber_rounded;
        break;
      case ScanTone.error:
        color = Colors.red;
        icon = Icons.cancel;
        break;
    }
    final booking = _booking;
    final tickets = booking?['tickets'];
    final lines = tickets is List
        ? tickets.whereType<Map>().map(_ticketLine).where((line) => line.isNotEmpty).toList()
        : <String>[];
    final seats = _text(booking?['totalSeats']);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        children: [
          Icon(icon, size: 84, color: color.shade600),
          const SizedBox(height: 10),
          Text(outcome.title,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: color.shade800)),
          const SizedBox(height: 6),
          Text(outcome.message, textAlign: TextAlign.center, style: const TextStyle(fontSize: 16, height: 1.35)),
          if (booking != null) ...[
            const SizedBox(height: 16),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: color.shade50,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: color.shade200),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _detail('Event', _text(booking['eventTitle'])),
                  _detail('Seats', seats == '0' ? '' : seats),
                  for (final line in lines) _detail('Ticket', line),
                  _detail('Booking', _text(booking['status'])),
                  _detail('Payment', _text(booking['paymentStatus']).replaceAll('_', ' ')),
                  if (_checkedInAt != null && (outcome.reason == 'already_used' || outcome.valid))
                    _detail('Checked in', _formatTime(_checkedInAt!)),
                ],
              ),
            ),
          ],
          const SizedBox(height: 20),
          PrimaryButton(label: 'Scan next', icon: Icons.qr_code_scanner, onPressed: _scanNext),
        ],
      ),
    );
  }

  Widget _requestErrorPanel() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        children: [
          Icon(Icons.cloud_off, size: 72, color: Colors.grey.shade600),
          const SizedBox(height: 10),
          const Text('Could not check this ticket',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: AppColors.navy)),
          const SizedBox(height: 6),
          Text(_requestError!, textAlign: TextAlign.center, style: const TextStyle(fontSize: 15, height: 1.35)),
          const SizedBox(height: 12),
          const InfoBanner(
            'The ticket was NOT checked: this is a connection or server problem, not a decision about the ticket. '
            'Do not admit or refuse on this screen. Try again.',
          ),
          const SizedBox(height: 20),
          if (_lastCode != null) ...[
            PrimaryButton(label: 'Try the same ticket again', icon: Icons.refresh, onPressed: () => _verify(_lastCode!)),
            const SizedBox(height: 10),
          ],
          OutlinedButton(
            onPressed: _scanNext,
            style: OutlinedButton.styleFrom(foregroundColor: AppColors.navy, minimumSize: const Size.fromHeight(48)),
            child: const Text('Scan another ticket'),
          ),
        ],
      ),
    );
  }

  Widget _cameraError(BuildContext context, MobileScannerException error, Widget? child) {
    final String message;
    switch (error.errorCode) {
      case MobileScannerErrorCode.permissionDenied:
        message = 'Camera permission is off. Allow camera access for Mookalaa Organizer in your phone settings, '
            'then come back and tap "Try again".';
        break;
      case MobileScannerErrorCode.unsupported:
        message = 'This device cannot scan QR codes (no usable camera).';
        break;
      default:
        message = 'The camera could not be started. Close other apps that use the camera and try again.';
    }
    return Container(
      color: Colors.black,
      alignment: Alignment.center,
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.no_photography_outlined, color: Colors.white70, size: 48),
          const SizedBox(height: 12),
          Text(message, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, height: 1.4)),
          const SizedBox(height: 12),
          OutlinedButton(
            onPressed: _scanNext,
            style: OutlinedButton.styleFrom(foregroundColor: Colors.white, side: const BorderSide(color: Colors.white70)),
            child: const Text('Try again'),
          ),
        ],
      ),
    );
  }

  Widget _camera() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: Column(
        children: [
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: Stack(
                alignment: Alignment.center,
                fit: StackFit.expand,
                children: [
                  MobileScanner(controller: _controller, onDetect: _onDetect, errorBuilder: _cameraError),
                  Center(
                    child: IgnorePointer(
                      child: Container(
                        width: 230,
                        height: 230,
                        decoration: BoxDecoration(
                          border: Border.all(color: Colors.white, width: 3),
                          borderRadius: BorderRadius.circular(16),
                        ),
                      ),
                    ),
                  ),
                  if (_processing)
                    Container(
                      color: Colors.black54,
                      alignment: Alignment.center,
                      child: const Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          CircularProgressIndicator(color: Colors.white),
                          SizedBox(height: 12),
                          Text('Checking ticket…', style: TextStyle(color: Colors.white)),
                        ],
                      ),
                    ),
                  Positioned(
                    right: 8,
                    top: 8,
                    child: ValueListenableBuilder<TorchState>(
                      valueListenable: _controller.torchState,
                      builder: (context, state, _) => IconButton.filled(
                        tooltip: 'Flashlight',
                        style: IconButton.styleFrom(backgroundColor: Colors.black54, foregroundColor: Colors.white),
                        icon: Icon(state == TorchState.on ? Icons.flash_on : Icons.flash_off),
                        onPressed: _toggleTorch,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 10),
          const Text('Point the camera at the QR code on the ticket', style: TextStyle(color: Colors.black54)),
        ],
      ),
    );
  }

  Widget _body() {
    final name = (widget.eventName ?? '').trim();
    final Widget content;
    if (_requestError != null) {
      content = _requestErrorPanel();
    } else if (_outcome != null) {
      content = _resultPanel();
    } else {
      content = _camera();
    }
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: _hasEvent
              ? InfoBanner(
                  name.isEmpty ? 'Scanning tickets for this event only.' : 'Scanning tickets for: $name',
                  color: Colors.blue,
                  icon: Icons.event_available,
                )
              : const InfoBanner(
                  'No event selected: a valid ticket of ANY event will be accepted and checked in.',
                  color: Colors.red,
                  icon: Icons.warning_amber_rounded,
                ),
        ),
        Expanded(child: content),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    if (widget.embedded) return _body();
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: appBar('Scan tickets'),
      body: SafeArea(child: _body()),
    );
  }
}
