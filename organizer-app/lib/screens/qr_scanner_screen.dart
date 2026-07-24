import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../services/api_service.dart';
import 'jatra_registration_screen.dart';
import 'event_management_screen.dart';

class QRScannerScreen extends StatefulWidget {
  const QRScannerScreen({super.key});

  @override
  State<QRScannerScreen> createState() => _QRScannerScreenState();
}

class _QRScannerScreenState extends State<QRScannerScreen> {
  static const navy = Color(0xFF001F3F);

  final MobileScannerController _scannerController = MobileScannerController();
  int _selectedIndex = 3; // Scan tab

  bool _processing = false;
  bool _cameraActive = true;
  Map<String, dynamic>? _result;

  // Real session check-in history
  final List<Map<String, String>> _history = [];

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
    final booking = response['booking'] as Map<String, dynamic>?;
    _history.insert(0, {
      'title': booking?['eventTitle']?.toString() ?? 'Ticket',
      'result': response['valid'] == true
          ? 'Checked in'
          : (response['reason']?.toString() ?? 'invalid'),
      'time': TimeOfDay.fromDateTime(DateTime.now()).format(context),
    });

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
    });
    await _scannerController.start();
  }

  void _onBottomNavTap(int index) {
    setState(() => _selectedIndex = index);
    switch (index) {
      case 0:
        Navigator.pop(context);
        break;
      case 1:
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (context) => const EventManagementScreen()),
        );
        break;
      case 2:
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (context) => const JatraRegistrationScreen()),
        );
        break;
      case 3:
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: navy,
        foregroundColor: Colors.white,
        elevation: 0,
        title: const Text('QR Scanner',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
        actions: [
          IconButton(
            icon: const Icon(Icons.flash_on),
            onPressed: () => _scannerController.toggleTorch(),
          ),
          IconButton(
            icon: const Icon(Icons.history),
            onPressed: _showScanHistory,
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            Expanded(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: Container(
                  width: double.infinity,
                  color: Colors.black,
                  child: _cameraActive
                      ? Stack(
                          alignment: Alignment.center,
                          children: [
                            MobileScanner(controller: _scannerController, onDetect: _onDetect),
                            Container(
                              width: 220,
                              height: 220,
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
            ),
            const SizedBox(height: 16),
            if (_result != null) _buildResultCard(),
          ],
        ),
      ),
      bottomNavigationBar: BottomNavigationBar(
        type: BottomNavigationBarType.fixed,
        backgroundColor: Colors.white,
        selectedItemColor: navy,
        unselectedItemColor: Colors.grey,
        currentIndex: _selectedIndex,
        onTap: _onBottomNavTap,
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.home), label: 'Home'),
          BottomNavigationBarItem(icon: Icon(Icons.event), label: 'Events'),
          BottomNavigationBarItem(icon: Icon(Icons.festival), label: 'Jatra'),
          BottomNavigationBarItem(icon: Icon(Icons.qr_code_scanner), label: 'Scan'),
        ],
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
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color, width: 2),
      ),
      child: Column(
        children: [
          Icon(valid ? Icons.check_circle : Icons.error, size: 40, color: color),
          const SizedBox(height: 8),
          Text(heading,
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: color)),
          const SizedBox(height: 4),
          Text(message, textAlign: TextAlign.center, style: const TextStyle(fontSize: 13)),
          if (booking != null) ...[
            const SizedBox(height: 4),
            Text(
              '${booking['eventTitle'] ?? ''}  •  ${booking['totalSeats'] ?? ''} seats',
              style: TextStyle(fontSize: 13, color: Colors.grey.shade700),
            ),
          ],
        ],
      ),
    );
  }

  void _showScanHistory() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Scan History (this session)'),
        content: SizedBox(
          width: double.maxFinite,
          child: _history.isEmpty
              ? const Text('No tickets scanned yet')
              : ListView.builder(
                  shrinkWrap: true,
                  itemCount: _history.length,
                  itemBuilder: (context, index) {
                    final h = _history[index];
                    final ok = h['result'] == 'Checked in';
                    return ListTile(
                      leading: Icon(ok ? Icons.check_circle : Icons.error,
                          color: ok ? Colors.green : Colors.red),
                      title: Text(h['title'] ?? ''),
                      subtitle: Text('${h['result']} • ${h['time']}'),
                    );
                  },
                ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Close')),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _scannerController.dispose();
    super.dispose();
  }
}
