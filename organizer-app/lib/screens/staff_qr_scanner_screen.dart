import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../services/api_service.dart';

class StaffQRScannerScreen extends StatefulWidget {
  final String eventId;

  const StaffQRScannerScreen({super.key, required this.eventId});

  @override
  State<StaffQRScannerScreen> createState() => _StaffQRScannerScreenState();
}

class _StaffQRScannerScreenState extends State<StaffQRScannerScreen> {
  static const navy = Color(0xFF001F3F);

  final TextEditingController _ticketController = TextEditingController();
  final MobileScannerController _scannerController = MobileScannerController();

  bool _processing = false;
  bool _cameraActive = true;
  Map<String, dynamic>? _result;

  bool get _isValid => _result != null && _result!['valid'] == true;

  Future<void> _verify(String raw) async {
    if (_processing) return;
    setState(() => _processing = true);
    await _scannerController.stop();

    final trimmed = raw.trim();
    final Map<String, dynamic> response = trimmed.startsWith('{')
        ? await ApiService.verifyTicket(qrData: trimmed)
        : await ApiService.verifyTicket(bookingId: trimmed);

    if (!mounted) return;
    setState(() {
      _result = response;
      _cameraActive = false;
      _processing = false;
    });
  }

  void _onDetect(BarcodeCapture capture) {
    if (_processing) return;
    for (final b in capture.barcodes) {
      final raw = b.rawValue;
      if (raw != null && raw.isNotEmpty) {
        _verify(raw);
        break;
      }
    }
  }

  Future<void> _scanAgain() async {
    setState(() {
      _result = null;
      _cameraActive = true;
      _ticketController.clear();
    });
    await _scannerController.start();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: navy,
        foregroundColor: Colors.white,
        title: const Text('Scan Ticket'),
        actions: [
          IconButton(
            icon: const Icon(Icons.flash_on),
            onPressed: () => _scannerController.toggleTorch(),
          ),
          IconButton(
            icon: const Icon(Icons.cameraswitch),
            onPressed: () => _scannerController.switchCamera(),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Container(
                width: double.infinity,
                height: 280,
                color: Colors.black,
                child: _cameraActive
                    ? Stack(
                        alignment: Alignment.center,
                        children: [
                          MobileScanner(controller: _scannerController, onDetect: _onDetect),
                          Container(
                            width: 200,
                            height: 200,
                            decoration: BoxDecoration(
                              border: Border.all(color: Colors.white, width: 3),
                              borderRadius: BorderRadius.circular(16),
                            ),
                          ),
                          if (_processing)
                            const CircularProgressIndicator(color: Colors.white),
                        ],
                      )
                    : Center(
                        child: TextButton.icon(
                          onPressed: _scanAgain,
                          icon: const Icon(Icons.refresh, color: Colors.white),
                          label: const Text('Scan Next Ticket',
                              style: TextStyle(color: Colors.white)),
                        ),
                      ),
              ),
            ),
            const SizedBox(height: 8),
            Text('Point the camera at the ticket QR code',
                style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),

            if (_result != null) ...[
              const SizedBox(height: 20),
              _buildResultCard(),
            ],

            const SizedBox(height: 20),
            ExpansionTile(
              tilePadding: EdgeInsets.zero,
              title: const Text('Manual ticket entry',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: navy)),
              children: [
                TextField(
                  controller: _ticketController,
                  decoration: InputDecoration(
                    labelText: 'Enter Ticket / Booking ID',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                    prefixIcon: const Icon(Icons.confirmation_number),
                  ),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () {
                      if (_ticketController.text.trim().isNotEmpty) {
                        _verify(_ticketController.text);
                      }
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: navy,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                    child: const Text('Verify Ticket',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildResultCard() {
    final valid = _isValid;
    final reason = _result?['reason']?.toString() ?? '';
    final message = _result?['message']?.toString() ??
        (valid ? 'Ticket verified' : 'Invalid ticket');
    final booking = _result?['booking'] as Map<String, dynamic>?;
    final Color color = valid ? Colors.green : Colors.red;
    final String heading = valid
        ? 'CHECK-IN OK'
        : (reason == 'already_used'
            ? 'ALREADY USED'
            : reason == 'not_found'
                ? 'NOT FOUND'
                : reason == 'cancelled'
                    ? 'CANCELLED'
                    : 'INVALID');

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: valid ? Colors.green.shade50 : Colors.red.shade50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color, width: 2),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(valid ? Icons.check_circle : Icons.cancel, color: color, size: 26),
              const SizedBox(width: 8),
              Text(heading,
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: color)),
            ],
          ),
          const SizedBox(height: 6),
          Text(message, style: TextStyle(fontSize: 14, color: Colors.grey.shade800)),
          if (booking != null) ...[
            const SizedBox(height: 14),
            _row('Event', booking['eventTitle']?.toString() ?? 'N/A'),
            _row('Date', booking['eventDate']?.toString() ?? 'N/A'),
            _row('Venue', booking['venue']?.toString() ?? 'N/A'),
            _row('Seats', booking['totalSeats']?.toString() ?? 'N/A'),
            _row('Status', booking['status']?.toString().toUpperCase() ?? 'N/A'),
            if (booking['checkedInAt'] != null)
              _row('Checked in', booking['checkedInAt'].toString()),
          ],
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: _scanAgain,
              icon: const Icon(Icons.qr_code_scanner),
              label: const Text('Scan Next Ticket'),
              style: OutlinedButton.styleFrom(
                foregroundColor: navy,
                side: const BorderSide(color: navy),
                padding: const EdgeInsets.symmetric(vertical: 12),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _row(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 100,
            child: Text('$label:',
                style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
          ),
          Expanded(child: Text(value, style: const TextStyle(fontSize: 14))),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _ticketController.dispose();
    _scannerController.dispose();
    super.dispose();
  }
}
