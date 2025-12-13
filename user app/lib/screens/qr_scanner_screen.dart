import 'package:flutter/material.dart';
import 'dart:convert';

class QRScannerScreen extends StatefulWidget {
  const QRScannerScreen({super.key});

  @override
  State<QRScannerScreen> createState() => _QRScannerScreenState();
}

class _QRScannerScreenState extends State<QRScannerScreen> {
  final TextEditingController _qrController = TextEditingController();
  Map<String, dynamic>? scannedTicket;
  bool isValidTicket = false;

  void _processQRCode(String qrData) {
    try {
      final ticketData = jsonDecode(qrData);
      setState(() {
        scannedTicket = ticketData;
        isValidTicket = _validateTicket(ticketData);
      });
    } catch (e) {
      setState(() {
        scannedTicket = null;
        isValidTicket = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Invalid QR Code format'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  bool _validateTicket(Map<String, dynamic> ticketData) {
    // Basic validation - check required fields
    return ticketData.containsKey('bookingId') &&
           ticketData.containsKey('eventTitle') &&
           ticketData.containsKey('status') &&
           ticketData['status'] == 'confirmed';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey.shade50,
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
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Scanner Section
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                boxShadow: [
                  BoxShadow(
                    color: Colors.grey.withOpacity(0.1),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Column(
                children: [
                  const Icon(
                    Icons.qr_code_scanner,
                    size: 80,
                    color: Color(0xFF001F3F),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'Scan Ticket QR Code',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF001F3F),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Paste the QR code data below to verify ticket',
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.grey.shade600,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 20),
                  TextField(
                    controller: _qrController,
                    maxLines: 3,
                    decoration: InputDecoration(
                      labelText: 'QR Code Data',
                      hintText: 'Paste QR code data here...',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                        borderSide: const BorderSide(color: Color(0xFF001F3F)),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: () {
                        if (_qrController.text.isNotEmpty) {
                          _processQRCode(_qrController.text);
                        }
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF001F3F),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                      child: const Text(
                        'Verify Ticket',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),

            if (scannedTicket != null) ...[
              const SizedBox(height: 20),
              // Ticket Details
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: isValidTicket ? Colors.green.shade50 : Colors.red.shade50,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: isValidTicket ? Colors.green : Colors.red,
                    width: 2,
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(
                          isValidTicket ? Icons.check_circle : Icons.error,
                          color: isValidTicket ? Colors.green : Colors.red,
                          size: 24,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          isValidTicket ? 'VALID TICKET' : 'INVALID TICKET',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            color: isValidTicket ? Colors.green : Colors.red,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    _buildDetailRow('Event', scannedTicket!['eventTitle'] ?? 'N/A'),
                    _buildDetailRow('Date', scannedTicket!['eventDate'] ?? 'N/A'),
                    _buildDetailRow('Time', scannedTicket!['eventTime'] ?? 'N/A'),
                    _buildDetailRow('Venue', scannedTicket!['venue'] ?? 'N/A'),
                    _buildDetailRow('Booking ID', scannedTicket!['bookingId']?.toString().substring(0, 8) ?? 'N/A'),
                    _buildDetailRow('Total Seats', scannedTicket!['totalSeats']?.toString() ?? 'N/A'),
                    _buildDetailRow('Total Price', '₹${scannedTicket!['totalPrice'] ?? 'N/A'}'),
                    _buildDetailRow('Status', scannedTicket!['status']?.toString().toUpperCase() ?? 'N/A'),
                    
                    if (scannedTicket!['tickets'] != null) ...[
                      const SizedBox(height: 16),
                      const Text(
                        'Ticket Details:',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 8),
                      ...((scannedTicket!['tickets'] as List?) ?? []).map<Widget>((ticket) {
                        return Container(
                          margin: const EdgeInsets.only(bottom: 8),
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: Colors.grey.shade300),
                          ),
                          child: Text(
                            '${ticket['category']} - Block ${ticket['block']}: ${ticket['block']}${ticket['fromSeat']}-${ticket['block']}${ticket['toSeat']} (${ticket['quantity']} seats) - ₹${ticket['totalPrice']}',
                            style: const TextStyle(fontSize: 14),
                          ),
                        );
                      }).toList(),
                    ],
                  ],
                ),
              ),
            ],

            const SizedBox(height: 20),
            // Instructions
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Colors.blue.shade50,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: Colors.blue.shade200),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'How to use:',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF001F3F),
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    '1. Ask the customer to show their ticket QR code',
                    style: TextStyle(fontSize: 14),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    '2. Copy the QR data from their ticket',
                    style: TextStyle(fontSize: 14),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    '3. Paste it in the field above and verify',
                    style: TextStyle(fontSize: 14),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    '4. Check if the ticket shows as VALID',
                    style: TextStyle(fontSize: 14),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDetailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 100,
            child: Text(
              '$label:',
              style: const TextStyle(
                fontWeight: FontWeight.w600,
                fontSize: 14,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontSize: 14),
            ),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _qrController.dispose();
    super.dispose();
  }
}