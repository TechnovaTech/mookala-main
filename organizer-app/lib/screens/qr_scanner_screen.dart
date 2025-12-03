import 'package:flutter/material.dart';
import 'jatra_registration_screen.dart';
import 'event_management_screen.dart';

class QRScannerScreen extends StatefulWidget {
  const QRScannerScreen({super.key});

  @override
  State<QRScannerScreen> createState() => _QRScannerScreenState();
}

class _QRScannerScreenState extends State<QRScannerScreen> {
  bool _isScanning = false;
  int _selectedIndex = 3; // Scan tab selected
  String _scanResult = '';
  String _resultMessage = '';
  Color _resultColor = Colors.grey;
  
  // Mock scanned tickets for demo
  final List<String> _scannedTickets = [];
  final List<String> _validTickets = ['TICKET001', 'TICKET002', 'TICKET003'];

  void _startScanning() {
    setState(() {
      _isScanning = true;
      _scanResult = '';
      _resultMessage = 'Scanning...';
      _resultColor = Colors.blue;
    });

    // Simulate scanning delay
    Future.delayed(const Duration(seconds: 2), () {
      _simulateScan();
    });
  }

  void _simulateScan() {
    // Simulate different scan results
    final List<String> mockResults = [
      'TICKET001', // Valid
      'TICKET002', // Valid
      'TICKET001', // Duplicate
      'INVALID123', // Invalid
    ];
    
    final String scannedCode = mockResults[DateTime.now().millisecond % mockResults.length];
    _processScanResult(scannedCode);
  }

  void _processScanResult(String code) {
    setState(() {
      _isScanning = false;
      _scanResult = code;
      
      if (!_validTickets.contains(code)) {
        // Invalid ticket
        _resultMessage = 'Invalid Ticket\nTicket does not match event';
        _resultColor = Colors.red;
      } else if (_scannedTickets.contains(code)) {
        // Duplicate ticket
        _resultMessage = 'Duplicate Entry\nTicket already used';
        _resultColor = Colors.red;
      } else {
        // Valid ticket
        _scannedTickets.add(code);
        _resultMessage = 'Check-in Successful\nWelcome to the event!';
        _resultColor = Colors.green;
      }
    });
  }

  void _onBottomNavTap(int index) {
    setState(() {
      _selectedIndex = index;
    });
    
    switch (index) {
      case 0: // Home
        Navigator.pop(context);
        break;
      case 1: // Events
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (context) => const EventManagementScreen()),
        );
        break;
      case 2: // Jatra
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (context) => const JatraRegistrationScreen()),
        );
        break;
      case 3: // Scan - current screen
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: const Color(0xFF001F3F),
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Text(
          'QR Scanner',
          style: TextStyle(
            color: Colors.white,
            fontSize: 18,
            fontWeight: FontWeight.w600,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings, color: Colors.white),
            onPressed: () {
              _showScannerSettings();
            },
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          children: [
            // Scanner Area
            Expanded(
              flex: 2,
              child: Container(
                width: double.infinity,
                decoration: BoxDecoration(
                  color: Colors.grey.shade100,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: Colors.grey.shade300, width: 2),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    if (_isScanning) ...[
                      const CircularProgressIndicator(
                        valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF001F3F)),
                      ),
                      const SizedBox(height: 20),
                      const Text(
                        'Scanning QR Code...',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ] else ...[
                      Icon(
                        Icons.qr_code_scanner,
                        size: 80,
                        color: Colors.grey.shade600,
                      ),
                      const SizedBox(height: 20),
                      Text(
                        'Tap to scan QR code',
                        style: TextStyle(
                          fontSize: 18,
                          color: Colors.grey.shade600,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            
            const SizedBox(height: 24),
            
            // Scan Button
            Container(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _isScanning ? null : _startScanning,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF001F3F),
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: Text(
                  _isScanning ? 'Scanning...' : 'Start Scanning',
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
            
            const SizedBox(height: 24),
            
            // Result Area
            if (_scanResult.isNotEmpty) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: _resultColor.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: _resultColor, width: 2),
                ),
                child: Column(
                  children: [
                    Icon(
                      _resultColor == Colors.green 
                          ? Icons.check_circle 
                          : Icons.error,
                      size: 48,
                      color: _resultColor,
                    ),
                    const SizedBox(height: 12),
                    Text(
                      _resultMessage,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: _resultColor,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Ticket: $_scanResult',
                      style: TextStyle(
                        fontSize: 14,
                        color: Colors.grey.shade700,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
            ],
            

          ],
        ),
      ),
      bottomNavigationBar: BottomNavigationBar(
        type: BottomNavigationBarType.fixed,
        backgroundColor: Colors.white,
        selectedItemColor: const Color(0xFF001F3F),
        unselectedItemColor: Colors.grey,
        currentIndex: _selectedIndex,
        onTap: _onBottomNavTap,
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.home),
            label: 'Home',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.event),
            label: 'Events',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.festival),
            label: 'Jatra',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.qr_code_scanner),
            label: 'Scan',
          ),
        ],
      ),
    );
  }



  void _showScannerSettings() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Scanner Settings'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.person_add, color: Color(0xFF001F3F)),
              title: const Text('Create Scanner Account'),
              subtitle: const Text('Add gate staff with scan-only access'),
              onTap: () {
                Navigator.pop(context);
                _showCreateScannerAccount();
              },
            ),
            ListTile(
              leading: const Icon(Icons.history, color: Color(0xFF001F3F)),
              title: const Text('Scan History'),
              subtitle: const Text('View all scanned tickets'),
              onTap: () {
                Navigator.pop(context);
                _showScanHistory();
              },
            ),
          ],
        ),
      ),
    );
  }

  void _showCreateScannerAccount() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Create Scanner Account'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const TextField(
              decoration: InputDecoration(
                labelText: 'Staff Name',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            const TextField(
              decoration: InputDecoration(
                labelText: 'Email',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Scanner account created successfully')),
              );
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF001F3F),
            ),
            child: const Text('Create', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  void _showScanHistory() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Scan History'),
        content: SizedBox(
          width: double.maxFinite,
          child: ListView.builder(
            shrinkWrap: true,
            itemCount: _scannedTickets.length,
            itemBuilder: (context, index) {
              return ListTile(
                leading: const Icon(Icons.check_circle, color: Colors.green),
                title: Text(_scannedTickets[index]),
                subtitle: Text('Scanned at ${DateTime.now().toString().substring(11, 16)}'),
              );
            },
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }
}