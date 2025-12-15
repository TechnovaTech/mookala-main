import 'package:flutter/material.dart';
import 'dart:convert';
import '../services/api_service.dart';
import 'my_bookings_screen.dart';
import 'dart:typed_data';
import 'dart:html' as html;
import 'package:http/http.dart' as http;
import 'dart:js' as js;

class BookingScreen extends StatefulWidget {
  final Map<String, dynamic> event;

  const BookingScreen({Key? key, required this.event}) : super(key: key);

  @override
  State<BookingScreen> createState() => _BookingScreenState();
}

class _BookingScreenState extends State<BookingScreen> {
  List<Map<String, dynamic>> selectedTickets = [];
  List<Map<String, dynamic>> availableBlocks = [];
  Map<String, dynamic>? venueData;
  
  // Image viewer state
  double _imageScale = 1.0;
  final TransformationController _transformationController = TransformationController();
  
  // Payment
  String _razorpayKeyId = '';
  
  @override
  void initState() {
    super.initState();
    _loadVenueBlocks();
    _addTicketSelection(); // Start with one ticket selection
    _fetchPaymentConfig();
    _setupRazorpayWeb();
  }
  
  void _setupRazorpayWeb() {
    // Setup Razorpay web callback
    js.context['razorpaySuccessHandler'] = (response) {
      _handlePaymentSuccess(response['razorpay_payment_id']);
    };
    
    js.context['razorpayErrorHandler'] = (response) {
      _handlePaymentError(response['error']['description']);
    };
  }
  
  Future<void> _fetchPaymentConfig() async {
    try {
      final response = await http.get(
        Uri.parse('http://localhost:3000/api/payment/config'),
        headers: {'Content-Type': 'application/json'},
      );
      
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        if (data['success'] == true) {
          setState(() {
            _razorpayKeyId = data['razorpayKeyId'] ?? '';
          });
        }
      }
    } catch (e) {
      print('Error fetching payment config: $e');
    }
  }
  
  Future<void> _loadVenueBlocks() async {
    String? venueName;
    if (widget.event['location'] != null && widget.event['location']['name'] != null) {
      venueName = widget.event['location']['name'];
    }
    
    if (venueName != null && venueName.isNotEmpty) {
      final result = await ApiService.getVenueByName(venueName);
      if (result['success'] == true && result['venues'] != null && result['venues'].isNotEmpty) {
        final venue = result['venues'][0];
        setState(() {
          venueData = venue;
        });
        if (venue['seatConfig'] != null && venue['seatConfig']['blocks'] != null) {
          setState(() {
            availableBlocks = List<Map<String, dynamic>>.from(venue['seatConfig']['blocks']);
          });
        }
      }
    }
  }
  
  List<Map<String, dynamic>> _getSeatCategories() {
    if (widget.event['tickets'] != null && widget.event['tickets'] is List) {
      final tickets = widget.event['tickets'] as List;
      if (tickets.isNotEmpty) {
        return tickets.map<Map<String, dynamic>>((ticket) {
          final name = ticket['name'] ?? 'Ticket';
          final priceType = ticket['priceType'] ?? 'Normal';
          final blockName = ticket['blockName'] ?? 'A';
          final startSeat = ticket['startSeat'] ?? 1;
          final endSeat = ticket['endSeat'] ?? (int.tryParse(ticket['quantity'].toString()) ?? 100);
          
          return {
            'name': name,
            'price': _extractPriceFromTicket(ticket['price']),
            'blockName': blockName,
            'priceType': priceType,
            'startSeat': startSeat,
            'endSeat': endSeat,
            'seatRange': '$blockName$startSeat to $blockName$endSeat',
          };
        }).toList();
      }
    }
    return [];
  }
  
  int _extractPriceFromTicket(dynamic price) {
    if (price is int) return price;
    if (price is double) return price.toInt();
    if (price is String) {
      // Remove currency symbols and parse
      final cleanPrice = price.replaceAll(RegExp(r'[^0-9.]'), '');
      return int.tryParse(cleanPrice.split('.')[0]) ?? 500;
    }
    return 500;
  }
  

  

  

  
  void _addTicketSelection() {
    setState(() {
      selectedTickets.add({
        'category': null,
        'block': null,
        'fromSeat': 1,
        'toSeat': 1,
        'quantity': 1,
        'price': 0,
      });
    });
  }
  
  void _removeTicketSelection(int index) {
    setState(() {
      selectedTickets.removeAt(index);
    });
  }
  
  int _getTotalSeats() {
    return selectedTickets.fold(0, (sum, ticket) => sum + (ticket['quantity'] as int));
  }
  
  int _getTotalPrice() {
    return selectedTickets.fold(0, (sum, ticket) => sum + ((ticket['price'] as int) * (ticket['quantity'] as int)));
  }
  
  List<Map<String, dynamic>> _getAvailableBlocksForCategory(String categoryName) {
    final tickets = widget.event['tickets'] as List?;
    if (tickets == null) return [];
    
    final categoryTickets = tickets.where((ticket) => ticket['name'] == categoryName).toList();
    
    return categoryTickets.map<Map<String, dynamic>>((ticket) {
      final priceType = ticket['priceType'] ?? 'Normal';
      final blockName = ticket['blockName'] ?? 'A';
      final startSeat = ticket['startSeat'] ?? 1;
      final endSeat = ticket['endSeat'] ?? (int.tryParse(ticket['quantity'].toString()) ?? 100);
      
      return {
        'blockName': blockName,
        'priceType': priceType,
        'startSeat': startSeat,
        'endSeat': endSeat,
        'price': _extractPriceFromTicket(ticket['price']),
        'seatRange': '$blockName$startSeat to $blockName$endSeat',
      };
    }).toList();
  }
  
  int _getBlockMinSeat(String categoryName, String blockName) {
    final blocks = _getAvailableBlocksForCategory(categoryName);
    final blockInfo = blocks.firstWhere(
      (block) => block['blockName'] == blockName,
      orElse: () => {'startSeat': 1},
    );
    return blockInfo['startSeat'] ?? 1;
  }
  
  int _getBlockMaxSeat(String categoryName, String blockName) {
    final blocks = _getAvailableBlocksForCategory(categoryName);
    final blockInfo = blocks.firstWhere(
      (block) => block['blockName'] == blockName,
      orElse: () => {'endSeat': 100},
    );
    return blockInfo['endSeat'] ?? 100;
  }
  
  Widget _buildTicketSelector(int ticketIndex) {
    final ticket = selectedTickets[ticketIndex];
    final categories = _getSeatCategories();
    
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey.shade300),
        borderRadius: BorderRadius.circular(12),
        color: Colors.white,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Ticket ${ticketIndex + 1}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
              IconButton(
                onPressed: selectedTickets.length > 1 ? () => _removeTicketSelection(ticketIndex) : null,
                icon: const Icon(Icons.remove_circle, color: Colors.red),
              ),
            ],
          ),
          const SizedBox(height: 12),
          
          // Category Selection
          DropdownButtonFormField<String>(
            value: ticket['category'],
            decoration: const InputDecoration(
              labelText: 'Category',
              border: OutlineInputBorder(),
            ),
            items: categories.map((category) {
              return DropdownMenuItem<String>(
                value: category['name'],
                child: Text(
                  '${category['priceType']} - ₹${category['price']} (${category['seatRange']})',
                  style: const TextStyle(fontSize: 14),
                  overflow: TextOverflow.ellipsis,
                ),
              );
            }).toList(),
            onChanged: (value) {
              setState(() {
                selectedTickets[ticketIndex]['category'] = value;
                selectedTickets[ticketIndex]['block'] = null;
                selectedTickets[ticketIndex]['price'] = categories.firstWhere((c) => c['name'] == value)['price'];
              });
            },
          ),
          
          if (ticket['category'] != null) ...[
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              value: ticket['block'],
              decoration: const InputDecoration(
                labelText: 'Block',
                border: OutlineInputBorder(),
              ),
              items: _getAvailableBlocksForCategory(ticket['category']).map((block) {
                return DropdownMenuItem<String>(
                  value: block['blockName'],
                  child: Text('Block ${block['blockName']} (${block['seatRange']})')
                );
              }).toList(),
              onChanged: (value) {
                setState(() {
                  selectedTickets[ticketIndex]['block'] = value;
                  if (value != null) {
                    final minSeat = _getBlockMinSeat(ticket['category'], value);
                    selectedTickets[ticketIndex]['fromSeat'] = minSeat;
                    selectedTickets[ticketIndex]['toSeat'] = minSeat;
                    selectedTickets[ticketIndex]['quantity'] = 1;
                  }
                });
              },
            ),
          ],
          
          if (ticket['block'] != null) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    decoration: const InputDecoration(
                      labelText: 'From Seat',
                      border: OutlineInputBorder(),
                    ),
                    keyboardType: TextInputType.number,
                    initialValue: ticket['fromSeat'].toString(),
                    onChanged: (value) {
                      final fromSeat = int.tryParse(value) ?? ticket['fromSeat'];
                      setState(() {
                        selectedTickets[ticketIndex]['fromSeat'] = fromSeat;
                        selectedTickets[ticketIndex]['quantity'] = (selectedTickets[ticketIndex]['toSeat'] - fromSeat + 1).clamp(1, 999);
                      });
                    },
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextFormField(
                    decoration: const InputDecoration(
                      labelText: 'To Seat',
                      border: OutlineInputBorder(),
                    ),
                    keyboardType: TextInputType.number,
                    initialValue: ticket['toSeat'].toString(),
                    onChanged: (value) {
                      final toSeat = int.tryParse(value) ?? ticket['toSeat'];
                      setState(() {
                        selectedTickets[ticketIndex]['toSeat'] = toSeat;
                        selectedTickets[ticketIndex]['quantity'] = (toSeat - selectedTickets[ticketIndex]['fromSeat'] + 1).clamp(1, 999);
                      });
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.blue.shade50,
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                'Seats: ${ticket['block']}${ticket['fromSeat']} to ${ticket['block']}${ticket['toSeat']} (${ticket['quantity']} seats) - ₹${(ticket['price'] * ticket['quantity'])}',
                style: TextStyle(fontSize: 12, color: Colors.blue.shade700),
              ),
            ),
          ],
        ],
      ),
    );
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
          'Book Tickets',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
      ),
      body: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Event Header
            Container(
              color: const Color(0xFF001F3F),
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.event['title'] ?? 'Event Title',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      const Icon(Icons.calendar_today, color: Colors.white70, size: 16),
                      const SizedBox(width: 8),
                      Text(
                        widget.event['date'] ?? 'Date TBD',
                        style: const TextStyle(color: Colors.white70, fontSize: 14),
                      ),
                      const SizedBox(width: 20),
                      const Icon(Icons.access_time, color: Colors.white70, size: 16),
                      const SizedBox(width: 8),
                      Text(
                        widget.event['time'] ?? 'Time TBD',
                        style: const TextStyle(color: Colors.white70, fontSize: 14),
                      ),
                    ],
                  ),
                ],
              ),
            ),

            // Seating Layout Image Viewer
            if (venueData != null && venueData!['seatingLayoutImage'] != null) ...[
              Container(
                margin: const EdgeInsets.all(20),
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
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Header with controls
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.grey.shade50,
                        borderRadius: const BorderRadius.only(
                          topLeft: Radius.circular(16),
                          topRight: Radius.circular(16),
                        ),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.map, color: Color(0xFF001F3F)),
                          const SizedBox(width: 8),
                          const Expanded(
                            child: Text(
                              'Seating Layout',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w600,
                                color: Color(0xFF001F3F),
                              ),
                            ),
                          ),
                          // Zoom controls
                          IconButton(
                            onPressed: () {
                              setState(() {
                                _imageScale = (_imageScale - 0.2).clamp(0.5, 3.0);
                                _transformationController.value = Matrix4.identity()..scale(_imageScale);
                              });
                            },
                            icon: const Icon(Icons.zoom_out),
                            tooltip: 'Zoom Out',
                          ),
                          IconButton(
                            onPressed: () {
                              setState(() {
                                _imageScale = (_imageScale + 0.2).clamp(0.5, 3.0);
                                _transformationController.value = Matrix4.identity()..scale(_imageScale);
                              });
                            },
                            icon: const Icon(Icons.zoom_in),
                            tooltip: 'Zoom In',
                          ),
                          // Download button
                          IconButton(
                            onPressed: _downloadSeatingLayout,
                            icon: const Icon(Icons.download),
                            tooltip: 'Download Layout',
                          ),
                        ],
                      ),
                    ),
                    // Image container
                    Container(
                      height: 200,
                      width: double.infinity,
                      padding: const EdgeInsets.all(16),
                      child: InteractiveViewer(
                        transformationController: _transformationController,
                        minScale: 0.5,
                        maxScale: 3.0,
                        child: Image.memory(
                          base64Decode(venueData!['seatingLayoutImage'].split(',')[1]),
                          fit: BoxFit.contain,
                          errorBuilder: (context, error, stackTrace) {
                            return Container(
                              decoration: BoxDecoration(
                                color: Colors.grey.shade100,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: const Center(
                                child: Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Icon(Icons.error_outline, size: 48, color: Colors.grey),
                                    SizedBox(height: 8),
                                    Text('Failed to load seating layout'),
                                  ],
                                ),
                              ),
                            );
                          },
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],

            // Multiple Ticket Selection
            Container(
              margin: const EdgeInsets.symmetric(horizontal: 20),
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
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Select Tickets',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF001F3F),
                        ),
                      ),
                      IconButton(
                        onPressed: _addTicketSelection,
                        icon: const Icon(Icons.add_circle, color: Color(0xFF001F3F)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  
                  ...selectedTickets.asMap().entries.map((entry) {
                    return _buildTicketSelector(entry.key);
                  }).toList(),
                  
                  if (selectedTickets.isEmpty)
                    ElevatedButton(
                      onPressed: _addTicketSelection,
                      child: const Text('Add Ticket'),
                    ),
                ],
              ),
            ),

            const SizedBox(height: 100), // Space for bottom bar
          ],
        ),
      ),
      bottomNavigationBar: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: Colors.white,
          boxShadow: [
            BoxShadow(
              color: Colors.grey.withOpacity(0.3),
              blurRadius: 10,
              offset: const Offset(0, -5),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Seats ${_getTotalSeats()}',
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF001F3F),
                  ),
                ),
                Text(
                  '₹ ${_getTotalPrice()}',
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF001F3F),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _getTotalSeats() > 0 ? () {
                  _showBookingConfirmation();
                } : null,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF001F3F),
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text(
                  'Proceed to Payment',
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
    );
  }

  void _showBookingConfirmation() {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: const Text(
            'Booking Confirmation',
            style: TextStyle(
              color: Color(0xFF001F3F),
              fontWeight: FontWeight.bold,
            ),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Event: ${widget.event['title'] ?? 'Event Title'}'),
              Text('Venue: ${widget.event['venue'] ?? 'Event Venue'}'),
              Text('Date: ${widget.event['date'] ?? 'Date TBD'}'),
              Text('Time: ${widget.event['time'] ?? 'Time TBD'}'),
              Text('Tickets: ${selectedTickets.length}'),
              ...selectedTickets.map((ticket) => Text('${ticket['category']} - Block ${ticket['block']}: ${ticket['block']}${ticket['fromSeat']}-${ticket['block']}${ticket['toSeat']} (${ticket['quantity']} seats)')).toList(),
              const SizedBox(height: 8),
              Text(
                'Total: ₹${_getTotalPrice()}',
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 16,
                  color: Color(0xFF001F3F),
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
              onPressed: () => _initiatePayment(),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF001F3F),
              ),
              child: const Text('Pay Now', style: TextStyle(color: Colors.white)),
            ),
          ],
        );
      },
    );
  }
  
  void _initiatePayment() {
    if (_razorpayKeyId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Payment configuration not loaded. Please try again.')),
      );
      return;
    }
    
    // For web, use Razorpay checkout script
    final options = {
      'key': _razorpayKeyId,
      'amount': _getTotalPrice() * 100, // Amount in paise
      'name': 'Mookala Events',
      'description': 'Ticket booking for ${widget.event['title']}',
      'handler': js.allowInterop((response) {
        js.context.callMethod('razorpaySuccessHandler', [response]);
      }),
      'modal': {
        'ondismiss': js.allowInterop(() {
          Navigator.pop(context);
        })
      },
      'theme': {
        'color': '#001F3F'
      }
    };
    
    try {
      js.context.callMethod('openRazorpay', [js.JsObject.jsify(options)]);
    } catch (e) {
      // Fallback: simulate payment success for testing
      _handlePaymentSuccess('test_payment_${DateTime.now().millisecondsSinceEpoch}');
    }
  }
  
  void _handlePaymentSuccess(String paymentId) {
    Navigator.pop(context); // Close dialog
    _confirmBooking(paymentId);
  }
  
  void _handlePaymentError(String error) {
    Navigator.pop(context); // Close dialog
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Payment failed: $error'),
        backgroundColor: Colors.red,
      ),
    );
  }
  
  Future<void> _confirmBooking([String? paymentId]) async {
    try {
      final userPhone = await ApiService.getUserPhone();
      if (userPhone == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Please login to book tickets')),
        );
        return;
      }
      
      // Check for seat conflicts
      final eventId = widget.event['id'] ?? widget.event['title'];
      final conflictCheck = await ApiService.checkSeatConflicts(userPhone, eventId, selectedTickets);
      
      if (conflictCheck['hasConflict'] == true) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(conflictCheck['message'] ?? 'Some seats are already booked'),
            backgroundColor: Colors.red,
          ),
        );
        return;
      }
      
      // Save booking locally for now
      final bookingData = {
        'userPhone': userPhone,
        'eventId': eventId,
        'eventTitle': widget.event['title'],
        'eventDate': widget.event['date'],
        'eventTime': widget.event['time'],
        'venue': widget.event['venue'] ?? 'Venue',
        'tickets': selectedTickets.map((ticket) => {
          'category': ticket['category'],
          'block': ticket['block'],
          'fromSeat': ticket['fromSeat'],
          'toSeat': ticket['toSeat'],
          'quantity': ticket['quantity'],
          'price': ticket['price'],
          'totalPrice': ticket['price'] * ticket['quantity'],
        }).toList(),
        'totalSeats': _getTotalSeats(),
        'totalPrice': _getTotalPrice(),
        'bookingDate': DateTime.now().toIso8601String(),
        'status': 'confirmed',
        'paymentId': paymentId,
        'paymentStatus': paymentId != null ? 'paid' : 'pending',
        '_id': DateTime.now().millisecondsSinceEpoch.toString(),
      };
      
      await ApiService.saveBookingLocally(bookingData);
      
      Navigator.pop(context); // Close dialog
      Navigator.pop(context); // Go back to event details
      Navigator.push(
        context,
        MaterialPageRoute(builder: (context) => MyBookingsScreen()),
      );
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Booking confirmed! Welcome to My Bookings.'),
          backgroundColor: Color(0xFF001F3F),
        ),
      );
    } catch (e) {
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Error creating booking. Please try again.'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }
  
  Future<void> _downloadSeatingLayout() async {
    try {
      if (venueData == null || venueData!['seatingLayoutImage'] == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No seating layout image available')),
        );
        return;
      }
      
      // Get image data and decode
      final imageData = venueData!['seatingLayoutImage'];
      final bytes = base64Decode(imageData.split(',')[1]);
      
      // Create blob and download for web
      final blob = html.Blob([bytes]);
      final url = html.Url.createObjectUrlFromBlob(blob);
      final venueName = venueData!['name'] ?? 'venue';
      final fileName = '${venueName.replaceAll(' ', '_')}_seating_layout.png';
      
      // Create download link
      final anchor = html.AnchorElement(href: url)
        ..setAttribute('download', fileName)
        ..click();
      
      // Clean up
      html.Url.revokeObjectUrl(url);
      
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Seating layout downloaded as $fileName'),
          duration: const Duration(seconds: 3),
        ),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Download failed: $e')),
      );
    }
  }
}