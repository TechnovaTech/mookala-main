import 'package:flutter/material.dart';
import '../services/api_service.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/services.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:path_provider/path_provider.dart';
import 'package:open_file/open_file.dart';

class MyBookingsScreen extends StatefulWidget {
  const MyBookingsScreen({super.key});

  @override
  State<MyBookingsScreen> createState() => _MyBookingsScreenState();
}

class _MyBookingsScreenState extends State<MyBookingsScreen> with TickerProviderStateMixin {
  late TabController _tabController;
  List<Map<String, dynamic>> userBookings = [];
  bool isLoading = true;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadUserBookings();
  }
  
  Future<void> _loadUserBookings() async {
    final userPhone = await ApiService.getUserPhone();
    if (userPhone != null) {
      final result = await ApiService.getUserBookings(userPhone);
      if (result['success'] == true && result['bookings'] != null) {
        setState(() {
          userBookings = List<Map<String, dynamic>>.from(result['bookings']);
          isLoading = false;
        });
      } else {
        setState(() {
          isLoading = false;
        });
      }
    } else {
      setState(() {
        isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.black),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Text(
          'My Bookings',
          style: TextStyle(
            color: Colors.black,
            fontSize: 20,
            fontWeight: FontWeight.bold,
          ),
        ),
        bottom: TabBar(
          controller: _tabController,
          labelColor: const Color(0xFF001F3F),
          unselectedLabelColor: Colors.grey,
          indicatorColor: const Color(0xFF001F3F),
          tabs: const [
            Tab(text: 'Upcoming'),
            Tab(text: 'Past Events'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildUpcomingTab(),
          _buildPastTab(),
        ],
      ),
    );
  }

  Widget _buildUpcomingTab() {
    if (isLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    
    final upcoming = userBookings.where((b) => b['status'] == 'confirmed').toList();
    
    if (upcoming.isEmpty) {
      return _buildEmptyState('No upcoming bookings', 'Book your first event now!');
    }

    return ListView.builder(
      padding: const EdgeInsets.all(20),
      itemCount: upcoming.length,
      itemBuilder: (context, index) {
        final booking = upcoming[index];
        return _buildTicketCard(booking, true);
      },
    );
  }

  Widget _buildPastTab() {
    if (isLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    
    final past = userBookings.where((b) => b['status'] == 'attended').toList();
    
    if (past.isEmpty) {
      return _buildEmptyState('No past bookings', 'Your event history will appear here');
    }

    return ListView.builder(
      padding: const EdgeInsets.all(20),
      itemCount: past.length,
      itemBuilder: (context, index) {
        final booking = past[index];
        return _buildTicketCard(booking, false);
      },
    );
  }

  Widget _buildEmptyState(String title, String subtitle) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.confirmation_number_outlined,
            size: 80,
            color: Colors.grey.shade400,
          ),
          const SizedBox(height: 16),
          Text(
            title,
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: Colors.grey.shade600,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            subtitle,
            style: TextStyle(
              fontSize: 14,
              color: Colors.grey.shade500,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTicketCard(Map<String, dynamic> booking, bool isUpcoming) {
    return Container(
      margin: const EdgeInsets.only(bottom: 20),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.1),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              colors: [Color(0xFF001F3F), Color(0xFF003366)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
          ),
          child: Column(
            children: [
              // Ticket Header
              Container(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Text(
                            booking['eventTitle'] ?? 'Event',
                            style: const TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.bold,
                              color: Colors.white,
                            ),
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          decoration: BoxDecoration(
                            color: isUpcoming ? Colors.green : Colors.grey,
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(
                            isUpcoming ? 'CONFIRMED' : 'ATTENDED',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        const Icon(Icons.calendar_today, color: Colors.white70, size: 18),
                        const SizedBox(width: 8),
                        Text(
                          '${booking['eventDate']} • ${booking['eventTime']}',
                          style: const TextStyle(color: Colors.white70, fontSize: 16),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        const Icon(Icons.location_on, color: Colors.white70, size: 18),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            booking['venue'] ?? 'Venue',
                            style: const TextStyle(color: Colors.white70, fontSize: 16),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              
              // Ticket Details Section
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(20),
                decoration: const BoxDecoration(
                  color: Colors.white,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.confirmation_number, color: Color(0xFF001F3F), size: 18),
                        const SizedBox(width: 8),
                        Text(
                          '${booking['totalSeats']} Tickets',
                          style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 16,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    ...((booking['tickets'] as List?) ?? []).map<Widget>((ticket) {
                      return Container(
                        margin: const EdgeInsets.only(bottom: 8),
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.grey.shade50,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: Colors.grey.shade200),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Expanded(
                              child: Text(
                                '${ticket['category']} - Block ${ticket['block']}: ${ticket['block']}${ticket['fromSeat']}-${ticket['block']}${ticket['toSeat']}',
                                style: const TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ),
                            Text(
                              '₹${ticket['totalPrice']}',
                              style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.bold,
                                color: Color(0xFF001F3F),
                              ),
                            ),
                          ],
                        ),
                      );
                    }).toList(),
                    const SizedBox(height: 16),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Booking ID',
                              style: TextStyle(
                                color: Colors.grey.shade600,
                                fontSize: 12,
                              ),
                            ),
                            Text(
                              booking['_id']?.toString().substring(0, 8) ?? 'N/A',
                              style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(
                              'Total Amount',
                              style: TextStyle(
                                color: Colors.grey.shade600,
                                fontSize: 12,
                              ),
                            ),
                            Text(
                              '₹${booking['totalPrice']}',
                              style: const TextStyle(
                                color: Color(0xFF001F3F),
                                fontSize: 20,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                    if (isUpcoming) ...[
                      const SizedBox(height: 20),
                      Row(
                        children: [
                          Expanded(
                            child: ElevatedButton.icon(
                              onPressed: () => _downloadTicketPDF(booking),
                              icon: const Icon(Icons.download, size: 18),
                              label: const Text('Download PDF'),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: Colors.grey.shade700,
                                foregroundColor: Colors.white,
                                padding: const EdgeInsets.symmetric(vertical: 12),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(8),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: ElevatedButton.icon(
                              onPressed: () => _showTicketQR(booking),
                              icon: const Icon(Icons.qr_code, size: 18),
                              label: const Text('Show QR'),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFF001F3F),
                                foregroundColor: Colors.white,
                                padding: const EdgeInsets.symmetric(vertical: 12),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(8),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<pw.Document> _generateTicketPDF(Map<String, dynamic> booking) async {
    final pdf = pw.Document();
    
    pdf.addPage(
      pw.Page(
        pageFormat: PdfPageFormat.a4,
        build: (pw.Context context) {
          return pw.Container(
            padding: const pw.EdgeInsets.all(20),
            child: pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                // Header
                pw.Container(
                  width: double.infinity,
                  padding: const pw.EdgeInsets.all(20),
                  decoration: pw.BoxDecoration(
                    color: PdfColors.blue900,
                    borderRadius: pw.BorderRadius.circular(10),
                  ),
                  child: pw.Column(
                    crossAxisAlignment: pw.CrossAxisAlignment.start,
                    children: [
                      pw.Text(
                        'EVENT TICKET',
                        style: pw.TextStyle(
                          color: PdfColors.white,
                          fontSize: 24,
                          fontWeight: pw.FontWeight.bold,
                        ),
                      ),
                      pw.SizedBox(height: 10),
                      pw.Text(
                        booking['eventTitle'] ?? 'Event',
                        style: pw.TextStyle(
                          color: PdfColors.white,
                          fontSize: 20,
                          fontWeight: pw.FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
                pw.SizedBox(height: 20),
                
                // Event Details
                pw.Container(
                  padding: const pw.EdgeInsets.all(15),
                  decoration: pw.BoxDecoration(
                    border: pw.Border.all(color: PdfColors.grey300),
                    borderRadius: pw.BorderRadius.circular(8),
                  ),
                  child: pw.Column(
                    crossAxisAlignment: pw.CrossAxisAlignment.start,
                    children: [
                      pw.Text(
                        'EVENT DETAILS',
                        style: pw.TextStyle(
                          fontSize: 16,
                          fontWeight: pw.FontWeight.bold,
                          color: PdfColors.blue900,
                        ),
                      ),
                      pw.SizedBox(height: 10),
                      pw.Row(
                        children: [
                          pw.Text('Date: ', style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
                          pw.Text('${booking['eventDate']} at ${booking['eventTime']}'),
                        ],
                      ),
                      pw.SizedBox(height: 5),
                      pw.Row(
                        children: [
                          pw.Text('Venue: ', style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
                          pw.Text(booking['venue'] ?? 'Venue'),
                        ],
                      ),
                      pw.SizedBox(height: 5),
                      pw.Row(
                        children: [
                          pw.Text('Total Seats: ', style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
                          pw.Text('${booking['totalSeats']}'),
                        ],
                      ),
                    ],
                  ),
                ),
                pw.SizedBox(height: 20),
                
                // Ticket Details
                pw.Container(
                  padding: const pw.EdgeInsets.all(15),
                  decoration: pw.BoxDecoration(
                    border: pw.Border.all(color: PdfColors.grey300),
                    borderRadius: pw.BorderRadius.circular(8),
                  ),
                  child: pw.Column(
                    crossAxisAlignment: pw.CrossAxisAlignment.start,
                    children: [
                      pw.Text(
                        'TICKET DETAILS',
                        style: pw.TextStyle(
                          fontSize: 16,
                          fontWeight: pw.FontWeight.bold,
                          color: PdfColors.blue900,
                        ),
                      ),
                      pw.SizedBox(height: 10),
                      ...((booking['tickets'] as List?) ?? []).map<pw.Widget>((ticket) {
                        return pw.Container(
                          margin: const pw.EdgeInsets.only(bottom: 8),
                          padding: const pw.EdgeInsets.all(10),
                          decoration: pw.BoxDecoration(
                            color: PdfColors.grey100,
                            borderRadius: pw.BorderRadius.circular(5),
                          ),
                          child: pw.Row(
                            mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                            children: [
                              pw.Text('${ticket['category']} - Block ${ticket['block']}: ${ticket['block']}${ticket['fromSeat']}-${ticket['block']}${ticket['toSeat']}'),
                              pw.Text('₹${ticket['totalPrice']}', style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
                            ],
                          ),
                        );
                      }).toList(),
                    ],
                  ),
                ),
                pw.SizedBox(height: 20),
                
                // QR Code and Booking Info
                pw.Row(
                  crossAxisAlignment: pw.CrossAxisAlignment.start,
                  children: [
                    pw.Expanded(
                      child: pw.Container(
                        padding: const pw.EdgeInsets.all(15),
                        decoration: pw.BoxDecoration(
                          border: pw.Border.all(color: PdfColors.grey300),
                          borderRadius: pw.BorderRadius.circular(8),
                        ),
                        child: pw.Column(
                          crossAxisAlignment: pw.CrossAxisAlignment.start,
                          children: [
                            pw.Text(
                              'BOOKING INFORMATION',
                              style: pw.TextStyle(
                                fontSize: 14,
                                fontWeight: pw.FontWeight.bold,
                                color: PdfColors.blue900,
                              ),
                            ),
                            pw.SizedBox(height: 10),
                            pw.Text('Booking ID: ${booking['_id']?.toString().substring(0, 8) ?? 'N/A'}'),
                            pw.SizedBox(height: 5),
                            pw.Text('Status: ${booking['status']?.toUpperCase() ?? 'CONFIRMED'}'),
                            pw.SizedBox(height: 5),
                            pw.Text(
                              'Total: ₹${booking['totalPrice']}',
                              style: pw.TextStyle(
                                fontSize: 16,
                                fontWeight: pw.FontWeight.bold,
                                color: PdfColors.blue900,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    pw.SizedBox(width: 20),
                    pw.Container(
                      width: 120,
                      height: 120,
                      padding: const pw.EdgeInsets.all(10),
                      decoration: pw.BoxDecoration(
                        border: pw.Border.all(color: PdfColors.grey300),
                        borderRadius: pw.BorderRadius.circular(8),
                      ),
                      child: pw.BarcodeWidget(
                        barcode: pw.Barcode.qrCode(),
                        data: jsonEncode({
                          'bookingId': booking['_id'],
                          'eventTitle': booking['eventTitle'],
                          'eventDate': booking['eventDate'],
                          'eventTime': booking['eventTime'],
                          'venue': booking['venue'],
                          'totalSeats': booking['totalSeats'],
                          'totalPrice': booking['totalPrice'],
                          'status': booking['status'],
                        }),
                      ),
                    ),
                  ],
                ),
                pw.SizedBox(height: 20),
                
                // Footer
                pw.Container(
                  width: double.infinity,
                  padding: const pw.EdgeInsets.all(15),
                  decoration: pw.BoxDecoration(
                    color: PdfColors.grey100,
                    borderRadius: pw.BorderRadius.circular(8),
                  ),
                  child: pw.Column(
                    children: [
                      pw.Text(
                        'Please present this ticket at the venue entrance',
                        style: pw.TextStyle(
                          fontSize: 12,
                          fontWeight: pw.FontWeight.bold,
                        ),
                        textAlign: pw.TextAlign.center,
                      ),
                      pw.SizedBox(height: 5),
                      pw.Text(
                        'Scan the QR code for verification',
                        style: const pw.TextStyle(fontSize: 10),
                        textAlign: pw.TextAlign.center,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
    
    return pdf;
  }

  Future<void> _downloadTicketPDF(Map<String, dynamic> booking) async {
    try {
      final pdf = await _generateTicketPDF(booking);
      final output = await getExternalStorageDirectory();
      final file = File('${output!.path}/ticket_${booking['_id']}.pdf');
      await file.writeAsBytes(await pdf.save());
      
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Ticket downloaded to ${file.path}'),
          action: SnackBarAction(
            label: 'Open',
            onPressed: () => OpenFile.open(file.path),
          ),
        ),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Error downloading ticket')),
      );
    }
  }

  void _showTicketQR(Map<String, dynamic> booking) {
    final qrData = jsonEncode({
      'bookingId': booking['_id'],
      'eventTitle': booking['eventTitle'],
      'eventDate': booking['eventDate'],
      'eventTime': booking['eventTime'],
      'venue': booking['venue'],
      'totalSeats': booking['totalSeats'],
      'totalPrice': booking['totalPrice'],
      'tickets': booking['tickets'],
      'status': booking['status'],
    });

    showDialog(
      context: context,
      builder: (context) => Dialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        child: Container(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Event Ticket QR Code',
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF001F3F),
                ),
              ),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.grey.shade300),
                ),
                child: QrImageView(
                  data: qrData,
                  version: QrVersions.auto,
                  size: 200.0,
                  backgroundColor: Colors.white,
                ),
              ),
              const SizedBox(height: 16),
              Text(
                booking['eventTitle'] ?? 'Event',
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                'Booking ID: ${booking['_id']?.toString().substring(0, 8) ?? 'N/A'}',
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.grey.shade600,
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('Close'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () {
                        Clipboard.setData(ClipboardData(text: qrData));
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('QR data copied to clipboard')),
                        );
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF001F3F),
                      ),
                      child: const Text('Copy Data', style: TextStyle(color: Colors.white)),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }
}