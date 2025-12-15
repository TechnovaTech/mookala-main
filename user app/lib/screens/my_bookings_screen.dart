import 'package:flutter/material.dart';
import '../services/api_service.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/services.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'dart:html' as html;
import 'package:http/http.dart' as http;

class MyBookingsScreen extends StatefulWidget {
  const MyBookingsScreen({super.key});

  @override
  State<MyBookingsScreen> createState() => _MyBookingsScreenState();
}

class _MyBookingsScreenState extends State<MyBookingsScreen> with TickerProviderStateMixin {
  late TabController _tabController;
  List<Map<String, dynamic>> userBookings = [];
  bool isLoading = true;
  Map<String, Map<String, dynamic>> venueCache = {};

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
        // Fetch user profile for name
        final profileResult = await ApiService.getProfile(userPhone);
        final userName = profileResult['success'] == true ? profileResult['user']['name'] : 'User';
        
        // Add user details and fetch venue info for each booking
        final bookingsWithUserData = <Map<String, dynamic>>[];
        for (var booking in List<Map<String, dynamic>>.from(result['bookings'])) {
          booking['userName'] = userName;
          booking['userPhone'] = userPhone;
          
          // Fetch venue details
          await _fetchVenueForBooking(booking);
          bookingsWithUserData.add(booking);
        }
        
        setState(() {
          userBookings = bookingsWithUserData;
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
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                booking['venueName'] ?? booking['venue'] ?? 'Venue',
                                style: const TextStyle(color: Colors.white70, fontSize: 16, fontWeight: FontWeight.w600),
                              ),
                              if (booking['venueAddress'] != null)
                                Text(
                                  booking['venueAddress'],
                                  style: const TextStyle(color: Colors.white60, fontSize: 12),
                                ),
                              if (booking['venueCity'] != null)
                                Text(
                                  booking['venueCity'],
                                  style: const TextStyle(color: Colors.white60, fontSize: 12),
                                ),
                            ],
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
    
    // Get venue name from booking
    Map<String, dynamic>? venueDetails;
    String venueName = 'VENUE TBD';
    
    // Try to get venue from different possible fields
    String? venueToSearch;
    if (booking['venue'] != null && booking['venue'].toString().isNotEmpty) {
      venueToSearch = booking['venue'].toString();
    } else if (booking['eventVenue'] != null) {
      venueToSearch = booking['eventVenue'].toString();
    } else if (booking['location'] != null) {
      if (booking['location'] is String) {
        venueToSearch = booking['location'].toString();
      } else if (booking['location']['name'] != null) {
        venueToSearch = booking['location']['name'].toString();
      }
    }
    
    if (venueToSearch != null && venueToSearch.isNotEmpty && venueToSearch != 'Venue') {
      venueName = venueToSearch.toUpperCase();
      try {
        final venueResult = await ApiService.getVenueByName(venueToSearch);
        if (venueResult['success'] == true && venueResult['venues'] != null && venueResult['venues'].isNotEmpty) {
          venueDetails = venueResult['venues'][0];
          venueName = venueDetails?['name']?.toString().toUpperCase() ?? venueName;
        }
      } catch (e) {
        print('Error fetching venue: $e');
      }
    }
    
    pdf.addPage(
      pw.Page(
        pageFormat: PdfPageFormat.a4,
        build: (pw.Context context) {
          return pw.Container(
            decoration: pw.BoxDecoration(
              gradient: pw.LinearGradient(
                colors: [PdfColors.blue50, PdfColors.white],
                begin: pw.Alignment.topCenter,
                end: pw.Alignment.bottomCenter,
              ),
            ),
            child: pw.Column(
              children: [
                // Header Banner
                pw.Container(
                  width: double.infinity,
                  padding: const pw.EdgeInsets.all(20),
                  decoration: pw.BoxDecoration(
                    gradient: pw.LinearGradient(
                      colors: [PdfColors.orange, PdfColors.amber],
                      begin: pw.Alignment.centerLeft,
                      end: pw.Alignment.centerRight,
                    ),
                    borderRadius: pw.BorderRadius.only(
                      topLeft: pw.Radius.circular(20),
                      topRight: pw.Radius.circular(20),
                    ),
                  ),
                  child: pw.Row(
                    mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                    children: [
                      pw.Text(
                        'MOOKALA',
                        style: pw.TextStyle(
                          color: PdfColors.white,
                          fontSize: 16,
                          fontWeight: pw.FontWeight.bold,
                        ),
                      ),
                      pw.Text(
                        'EVENT TICKET',
                        style: pw.TextStyle(
                          color: PdfColors.white,
                          fontSize: 14,
                        ),
                      ),
                    ],
                  ),
                ),
                
                // Main Ticket Body
                pw.Container(
                  width: double.infinity,
                  padding: const pw.EdgeInsets.all(25),
                  decoration: pw.BoxDecoration(
                    gradient: pw.LinearGradient(
                      colors: [PdfColors.blue900, PdfColors.blue700],
                      begin: pw.Alignment.topLeft,
                      end: pw.Alignment.bottomRight,
                    ),
                  ),
                  child: pw.Column(
                    crossAxisAlignment: pw.CrossAxisAlignment.start,
                    children: [
                      pw.Text(
                        booking['eventTitle']?.toUpperCase() ?? 'EVENT',
                        style: pw.TextStyle(
                          color: PdfColors.white,
                          fontSize: 24,
                          fontWeight: pw.FontWeight.bold,
                        ),
                      ),
                      pw.SizedBox(height: 5),
                      pw.Text(
                        'GRAND CELEBRATION',
                        style: pw.TextStyle(
                          color: PdfColors.grey300,
                          fontSize: 16,
                        ),
                      ),
                      pw.SizedBox(height: 20),
                      pw.Row(
                        children: [
                          pw.Column(
                            crossAxisAlignment: pw.CrossAxisAlignment.start,
                            children: [
                              pw.Text(
                                'DATE: ${_formatDate(booking['eventDate']) ?? 'DATE TBD'}',
                                style: pw.TextStyle(
                                  color: PdfColors.white,
                                  fontSize: 12,
                                  fontWeight: pw.FontWeight.bold,
                                ),
                              ),
                              pw.SizedBox(height: 5),
                              pw.Text(
                                'TIME: ${_formatTime(booking['eventTime']) ?? 'TIME TBD'}',
                                style: pw.TextStyle(
                                  color: PdfColors.white,
                                  fontSize: 12,
                                  fontWeight: pw.FontWeight.bold,
                                ),
                              ),
                              pw.SizedBox(height: 5),
                              pw.Text(
                                'VENUE: $venueName',
                                style: pw.TextStyle(
                                  color: PdfColors.white,
                                  fontSize: 12,
                                  fontWeight: pw.FontWeight.bold,
                                ),
                              ),
                              if (venueDetails != null && venueDetails['location'] != null) ...[
                                pw.SizedBox(height: 5),
                                if (venueDetails['location']['address'] != null && venueDetails['location']['address'].toString().isNotEmpty)
                                  pw.Text(
                                    'ADDRESS: ${venueDetails['location']['address'].toString().toUpperCase()}',
                                    style: pw.TextStyle(
                                      color: PdfColors.grey300,
                                      fontSize: 10,
                                    ),
                                  ),
                                if (venueDetails['location']['city'] != null || venueDetails['location']['state'] != null)
                                  pw.Text(
                                    '${venueDetails['location']['city']?.toString().toUpperCase() ?? ''}, ${venueDetails['location']['state']?.toString().toUpperCase() ?? ''}',
                                    style: pw.TextStyle(
                                      color: PdfColors.grey300,
                                      fontSize: 10,
                                    ),
                                  ),
                              ],
                            ],
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                
                // Ticket Details Section
                pw.Container(
                  width: double.infinity,
                  padding: const pw.EdgeInsets.all(20),
                  decoration: pw.BoxDecoration(
                    color: PdfColors.white,
                    border: pw.Border(
                      top: pw.BorderSide(
                        color: PdfColors.grey300,
                        width: 2,
                        style: pw.BorderStyle.dashed,
                      ),
                    ),
                  ),
                  child: pw.Row(
                    crossAxisAlignment: pw.CrossAxisAlignment.start,
                    children: [
                      pw.Expanded(
                        flex: 2,
                        child: pw.Column(
                          crossAxisAlignment: pw.CrossAxisAlignment.start,
                          children: [
                            pw.Text(
                              'TICKET DETAILS',
                              style: pw.TextStyle(
                                fontSize: 14,
                                fontWeight: pw.FontWeight.bold,
                                color: PdfColors.blue900,
                              ),
                            ),
                            pw.SizedBox(height: 10),
                            // User Information
                            pw.Container(
                              padding: const pw.EdgeInsets.all(8),
                              decoration: pw.BoxDecoration(
                                color: PdfColors.blue50,
                                borderRadius: pw.BorderRadius.circular(5),
                                border: pw.Border.all(color: PdfColors.blue200),
                              ),
                              child: pw.Column(
                                crossAxisAlignment: pw.CrossAxisAlignment.start,
                                children: [
                                  pw.Text(
                                    'PASSENGER DETAILS',
                                    style: pw.TextStyle(
                                      fontSize: 10,
                                      fontWeight: pw.FontWeight.bold,
                                      color: PdfColors.blue900,
                                    ),
                                  ),
                                  pw.SizedBox(height: 3),
                                  pw.Text(
                                    'Name: ${booking['userName']?.toUpperCase() ?? 'USER'}',
                                    style: const pw.TextStyle(fontSize: 9),
                                  ),
                                  pw.Text(
                                    'Mobile: ${booking['userPhone'] ?? 'N/A'}',
                                    style: const pw.TextStyle(fontSize: 9),
                                  ),
                                ],
                              ),
                            ),
                            pw.SizedBox(height: 10),
                            ...((booking['tickets'] as List?) ?? []).map<pw.Widget>((ticket) {
                              return pw.Container(
                                margin: const pw.EdgeInsets.only(bottom: 8),
                                padding: const pw.EdgeInsets.all(8),
                                decoration: pw.BoxDecoration(
                                  color: PdfColors.orange50,
                                  borderRadius: pw.BorderRadius.circular(5),
                                  border: pw.Border.all(color: PdfColors.orange200),
                                ),
                                child: pw.Column(
                                  crossAxisAlignment: pw.CrossAxisAlignment.start,
                                  children: [
                                    pw.Text(
                                      '${ticket['category']} - Block ${ticket['block']}',
                                      style: pw.TextStyle(
                                        fontSize: 10,
                                        fontWeight: pw.FontWeight.bold,
                                      ),
                                    ),
                                    pw.Text(
                                      'Seats: ${ticket['block']}${ticket['fromSeat']}-${ticket['block']}${ticket['toSeat']}',
                                      style: const pw.TextStyle(fontSize: 9),
                                    ),
                                    pw.Text(
                                      'Rs.${ticket['totalPrice']}',
                                      style: pw.TextStyle(
                                        fontSize: 10,
                                        fontWeight: pw.FontWeight.bold,
                                        color: PdfColors.orange800,
                                      ),
                                    ),
                                  ],
                                ),
                              );
                            }).toList(),
                            pw.SizedBox(height: 10),
                            pw.Container(
                              padding: const pw.EdgeInsets.all(8),
                              decoration: pw.BoxDecoration(
                                color: PdfColors.blue900,
                                borderRadius: pw.BorderRadius.circular(5),
                              ),
                              child: pw.Row(
                                mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                                children: [
                                  pw.Text(
                                    'TOTAL AMOUNT',
                                    style: pw.TextStyle(
                                      color: PdfColors.white,
                                      fontSize: 12,
                                      fontWeight: pw.FontWeight.bold,
                                    ),
                                  ),
                                  pw.Text(
                                    'Rs.${booking['totalPrice']}',
                                    style: pw.TextStyle(
                                      color: PdfColors.white,
                                      fontSize: 14,
                                      fontWeight: pw.FontWeight.bold,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      pw.SizedBox(width: 20),
                      pw.Container(
                        width: 100,
                        height: 100,
                        padding: const pw.EdgeInsets.all(8),
                        decoration: pw.BoxDecoration(
                          color: PdfColors.orange100,
                          borderRadius: pw.BorderRadius.circular(8),
                          border: pw.Border.all(color: PdfColors.orange300),
                        ),
                        child: pw.BarcodeWidget(
                          barcode: pw.Barcode.qrCode(),
                          data: jsonEncode({
                            'bookingId': booking['_id'],
                            'eventTitle': booking['eventTitle'],
                            'eventDate': booking['eventDate'],
                            'eventTime': booking['eventTime'],
                            'venue': booking['venue'],
                            'venueAddress': venueDetails?['location']['address'],
                            'venueCity': venueDetails?['location']['city'],
                            'userName': booking['userName'],
                            'userPhone': booking['userPhone'],
                            'totalSeats': booking['totalSeats'],
                            'totalPrice': booking['totalPrice'],
                            'status': booking['status'],
                          }),
                        ),
                      ),
                    ],
                  ),
                ),
                
                // Footer
                pw.Container(
                  width: double.infinity,
                  padding: const pw.EdgeInsets.all(15),
                  decoration: pw.BoxDecoration(
                    gradient: pw.LinearGradient(
                      colors: [PdfColors.green600, PdfColors.green400],
                      begin: pw.Alignment.centerLeft,
                      end: pw.Alignment.centerRight,
                    ),
                    borderRadius: pw.BorderRadius.only(
                      bottomLeft: pw.Radius.circular(20),
                      bottomRight: pw.Radius.circular(20),
                    ),
                  ),
                  child: pw.Row(
                    mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                    children: [
                      pw.Text(
                        'Official Event Partners',
                        style: pw.TextStyle(
                          color: PdfColors.white,
                          fontSize: 12,
                        ),
                      ),
                      pw.Text(
                        'ID: ${booking['_id']?.toString().substring(0, 8) ?? 'N/A'}',
                        style: pw.TextStyle(
                          color: PdfColors.white,
                          fontSize: 10,
                        ),
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
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(
          children: [
            Icon(Icons.download, color: Colors.blue),
            SizedBox(width: 8),
            Text('Download Ticket'),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.confirmation_number, size: 64, color: Colors.blue),
            SizedBox(height: 16),
            Text(
              'Your ticket for ${booking['eventTitle']} is ready!',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 16),
            ),
            SizedBox(height: 8),
            Text(
              'Ticket will be saved to your device.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey[600]),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () async {
              Navigator.pop(context);
              await _generateAndSaveTicket(booking);
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: Color(0xFF001F3F),
            ),
            child: Text('Download', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  Future<void> _generateAndSaveTicket(Map<String, dynamic> booking) async {
    try {
      final pdf = await _generateTicketPDF(booking);
      final bytes = await pdf.save();
      
      final blob = html.Blob([bytes]);
      final url = html.Url.createObjectUrlFromBlob(blob);
      final anchor = html.document.createElement('a') as html.AnchorElement
        ..href = url
        ..style.display = 'none'
        ..download = 'Ticket_${booking['eventTitle']?.replaceAll(' ', '_') ?? 'Event'}.pdf';
      html.document.body?.children.add(anchor);
      anchor.click();
      html.document.body?.children.remove(anchor);
      html.Url.revokeObjectUrl(url);
      
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Row(
            children: [
              Icon(Icons.download, color: Colors.white),
              SizedBox(width: 8),
              Text('PDF Downloaded!'),
            ],
          ),
          backgroundColor: Colors.green,
          duration: Duration(seconds: 2),
        ),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Download failed'),
          backgroundColor: Colors.red,
        ),
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

  String? _formatDate(String? dateStr) {
    if (dateStr == null || dateStr.isEmpty) return null;
    try {
      // Remove time part if present
      String cleanDate = dateStr.split(' ')[0];
      if (cleanDate.contains('-')) {
        final date = DateTime.parse(cleanDate);
        final months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        return '${date.day} ${months[date.month - 1]} ${date.year}';
      }
      return cleanDate.toUpperCase();
    } catch (e) {
      return dateStr.split(' ')[0].toUpperCase();
    }
  }
  
  String? _formatTime(String? timeStr) {
    if (timeStr == null || timeStr.isEmpty) return null;
    try {
      if (timeStr.contains(':')) {
        final parts = timeStr.split(':');
        if (parts.length >= 2) {
          final hour = int.parse(parts[0]);
          final minute = int.parse(parts[1].replaceAll(RegExp(r'[^0-9]'), ''));
          final period = hour >= 12 ? 'PM' : 'AM';
          final displayHour = hour > 12 ? hour - 12 : (hour == 0 ? 12 : hour);
          return '$displayHour:${minute.toString().padLeft(2, '0')} $period';
        }
      }
      return timeStr.toUpperCase();
    } catch (e) {
      return timeStr.toUpperCase();
    }
  }

  Future<void> _fetchVenueForBooking(Map<String, dynamic> booking) async {
    try {
      // First try to get event details to find venue
      final eventTitle = booking['eventTitle'];
      if (eventTitle != null) {
        final response = await http.get(
          Uri.parse('http://localhost:3000/api/events'),
          headers: {'Content-Type': 'application/json'},
        );
        
        if (response.statusCode == 200) {
          final data = json.decode(response.body);
          if (data['events'] != null) {
            final events = List<Map<String, dynamic>>.from(data['events']);
            final event = events.firstWhere(
              (e) => e['name'] == eventTitle || e['title'] == eventTitle,
              orElse: () => {},
            );
            
            if (event.isNotEmpty && event['location'] != null) {
              String? venueName;
              if (event['location'] is String) {
                venueName = event['location'];
              } else if (event['location']['name'] != null) {
                venueName = event['location']['name'];
              }
              
              if (venueName != null && venueName.isNotEmpty) {
                // Check cache first
                if (venueCache.containsKey(venueName)) {
                  final venueData = venueCache[venueName]!;
                  booking['venueName'] = venueData['name'];
                  booking['venueAddress'] = venueData['address'];
                  booking['venueCity'] = venueData['city'];
                  return;
                }
                
                // Fetch venue details
                final venueResult = await ApiService.getVenueByName(venueName);
                if (venueResult['success'] == true && venueResult['venues'] != null && venueResult['venues'].isNotEmpty) {
                  final venue = venueResult['venues'][0];
                  final venueData = {
                    'name': venue['name'] ?? venueName,
                    'address': venue['location']?['address'] ?? '',
                    'city': '${venue['location']?['city'] ?? ''}, ${venue['location']?['state'] ?? ''}'.trim().replaceAll(RegExp(r'^,\s*|,\s*$'), ''),
                  };
                  
                  // Cache the result
                  venueCache[venueName] = venueData;
                  
                  // Update booking
                  booking['venueName'] = venueData['name'];
                  booking['venueAddress'] = venueData['address'];
                  booking['venueCity'] = venueData['city'];
                  return;
                }
              }
            }
          }
        }
      }
      
      // Fallback: try direct venue lookup from booking
      String? venueToSearch = booking['venue'];
      if (venueToSearch != null && venueToSearch.isNotEmpty && venueToSearch != 'Venue') {
        final venueResult = await ApiService.getVenueByName(venueToSearch);
        if (venueResult['success'] == true && venueResult['venues'] != null && venueResult['venues'].isNotEmpty) {
          final venue = venueResult['venues'][0];
          booking['venueName'] = venue['name'] ?? venueToSearch;
          booking['venueAddress'] = venue['location']?['address'] ?? '';
          booking['venueCity'] = '${venue['location']?['city'] ?? ''}, ${venue['location']?['state'] ?? ''}'.trim().replaceAll(RegExp(r'^,\s*|,\s*$'), '');
        }
      }
    } catch (e) {
      print('Error fetching venue for booking: $e');
    }
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }
}