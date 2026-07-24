import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../services/api_service.dart';

class QRScannerScreen extends StatefulWidget {
  const QRScannerScreen({super.key});

  @override
  State<QRScannerScreen> createState() => _QRScannerScreenState();
}

class _QRScannerScreenState extends State<QRScannerScreen> {
  static const navy = Color(0xFF001F3F);

  final TextEditingController _qrController = TextEditingController();
  final MobileScannerController _scannerController = MobileScannerController();

  bool _processing = false;
  bool _cameraActive = true;
  Map<String, dynamic>? _result; // backend verify response

  bool get _isValid => _result != null && _result!['valid'] == true;

  Future<void> _handleRaw(String raw) async {
    if (_processing) return;
    setState(() => _processing = true);
    await _scannerController.stop();

    final trimmed = raw.trim();
    final Map<String, dynamic> response;
    if (trimmed.startsWith('{')) {
      response = await ApiService.verifyTicket(qrData: trimmed);
    } else {
      response = await ApiService.verifyTicket(bookingId: trimmed);
    }

    if (!mounted) return;
    setState(() {
      _result = response;
      _cameraActive = false;
      _processing = false;
    });
  }

  void _onDetect(BarcodeCapture capture) {
    if (_processing) return;
    for (final barcode in capture.barcodes) {
      final raw = barcode.rawValue;
      if (raw != null && raw.isNotEmpty) {
        _handleRaw(raw);
        break;
      }
    }
  }

  Future<void> _scanAgain() async {
    setState(() {
      _result = null;
      _cameraActive = true;
      _qrController.clear();
    });
    await _scannerController.start();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      appBar: AppBar(
        backgroundColor: navy,
        foregroundColor: Colors.white,
        elevation: 0,
        title: const Text('QR Scanner', style: TextStyle(fontWeight: FontWeight.bold)),
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
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Camera scanner
            ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: Container(
                height: 280,
                width: double.infinity,
                color: Colors.black,
                child: _cameraActive
                    ? Stack(
                        alignment: Alignment.center,
                        children: [
                          MobileScanner(
                            controller: _scannerController,
                            onDetect: _onDetect,
                          ),
                          // Scan frame overlay
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
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.qr_code_2, color: Colors.white54, size: 60),
                            const SizedBox(height: 8),
                            TextButton.icon(
                              onPressed: _scanAgain,
                              icon: const Icon(Icons.refresh, color: Colors.white),
                              label: const Text('Scan Next Ticket',
                                  style: TextStyle(color: Colors.white)),
                            ),
                          ],
                        ),
                      ),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Point the camera at the ticket QR code',
              style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
            ),

            // Result
            if (_result != null) ...[
              const SizedBox(height: 20),
              _buildResultCard(),
            ],

            const SizedBox(height: 20),
            // Manual fallback
            ExpansionTile(
              tilePadding: EdgeInsets.zero,
              title: const Text('Enter code manually',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: navy)),
              children: [
                TextField(
                  controller: _qrController,
                  maxLines: 3,
                  decoration: InputDecoration(
                    hintText: 'Paste QR data or booking ID...',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () {
                      if (_qrController.text.trim().isNotEmpty) {
                        _handleRaw(_qrController.text);
                      }
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: navy,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                    child: const Text('Verify Ticket',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
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
        ? 'VALID TICKET'
        : (reason == 'already_used'
            ? 'ALREADY USED'
            : reason == 'not_found'
                ? 'NOT FOUND'
                : reason == 'cancelled'
                    ? 'CANCELLED'
                    : 'INVALID TICKET');

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: valid ? Colors.green.shade50 : Colors.red.shade50,
        borderRadius: BorderRadius.circular(16),
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
            const SizedBox(height: 16),
            _row('Event', booking['eventTitle']?.toString() ?? 'N/A'),
            _row('Date', booking['eventDate']?.toString() ?? 'N/A'),
            _row('Time', booking['eventTime']?.toString() ?? 'N/A'),
            _row('Venue', booking['venue']?.toString() ?? 'N/A'),
            _row('Seats', booking['totalSeats']?.toString() ?? 'N/A'),
            _row('Amount', '₹${booking['totalPrice'] ?? 'N/A'}'),
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
    _qrController.dispose();
    _scannerController.dispose();
    super.dispose();
  }
}
