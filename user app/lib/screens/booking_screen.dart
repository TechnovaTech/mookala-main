import 'package:flutter/material.dart';
import 'dart:convert';
import '../services/api_service.dart';

class BookingScreen extends StatefulWidget {
  final Map<String, dynamic> event;

  const BookingScreen({Key? key, required this.event}) : super(key: key);

  @override
  State<BookingScreen> createState() => _BookingScreenState();
}

class _BookingScreenState extends State<BookingScreen> {
  int selectedTickets = 1;
  String? selectedCategory;
  Map<String, dynamic>? venueData;
  bool isLoadingVenue = true;
  
  @override
  void initState() {
    super.initState();
    _loadVenueData();
  }
  
  Future<void> _loadVenueData() async {
    print('Event data: ${widget.event}');
    
    // Check if event has venue ID (from organized events) or venue name (from static events)
    String? venueId;
    if (widget.event['venue'] != null) {
      // Check if venue is an ObjectId (24 character hex string) or venue name
      final venueValue = widget.event['venue'].toString();
      if (venueValue.length == 24 && RegExp(r'^[0-9a-fA-F]{24}$').hasMatch(venueValue)) {
        venueId = venueValue;
      }
    }
    
    if (venueId != null) {
      print('Loading venue data for ID: $venueId');
      final result = await ApiService.getVenueDetails(venueId);
      print('Venue API result: $result');
      
      if (result['success'] == true && result['venue'] != null) {
        setState(() {
          venueData = result['venue'];
          isLoadingVenue = false;
          // Set first seat category as default if available
          final seatCategories = _getSeatCategories();
          if (seatCategories.isNotEmpty) {
            selectedCategory = seatCategories.first['name'];
          }
        });
      } else {
        print('Failed to load venue data: ${result['error']}');
        setState(() {
          isLoadingVenue = false;
        });
      }
    } else {
      print('No valid venue ID found, using static data');
      setState(() {
        isLoadingVenue = false;
        // Set first seat category as default for static events
        final seatCategories = _getSeatCategories();
        if (seatCategories.isNotEmpty) {
          selectedCategory = seatCategories.first['name'];
        }
      });
    }
  }
  
  List<Map<String, dynamic>> _getSeatCategories() {
    // Only use tickets from event data
    if (widget.event['tickets'] != null && widget.event['tickets'] is List) {
      final tickets = widget.event['tickets'] as List;
      if (tickets.isNotEmpty) {
        return tickets.map((ticket) => {
          'name': ticket['name'] ?? 'Ticket',
          'price': _extractPriceFromTicket(ticket['price']),
        }).toList();
      }
    }
    
    // Return empty list if no tickets
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
  

  
  String _getVenueImage() {
    if (venueData != null && venueData!['image'] != null) {
      final image = venueData!['image'];
      if (image.toString().startsWith('data:image')) {
        return image;
      } else if (image.toString().startsWith('http')) {
        return image;
      } else {
        // Base64 image without data URL prefix
        return 'data:image/jpeg;base64,$image';
      }
    }
    return 'https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=800&h=400&fit=crop';
  }
  

  
  int _getCategoryPrice(String category) {
    final categories = _getSeatCategories();
    final found = categories.firstWhere(
      (cat) => cat['name'] == category,
      orElse: () => {'price': 500},
    );
    return found['price'] ?? 500;
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

            // Venue Image
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
              child: ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: Container(
                  height: 200,
                  width: double.infinity,
                  child: isLoadingVenue
                    ? Container(
                        color: Colors.grey.shade200,
                        child: const Center(
                          child: CircularProgressIndicator(),
                        ),
                      )
                    : _getVenueImage().startsWith('data:image')
                      ? Image.memory(
                          base64Decode(_getVenueImage().split(',')[1]),
                          fit: BoxFit.cover,
                          errorBuilder: (context, error, stackTrace) {
                            return Container(
                              color: Colors.grey.shade300,
                              child: const Center(
                                child: Icon(Icons.image, size: 50, color: Colors.grey),
                              ),
                            );
                          },
                        )
                      : Image.network(
                          _getVenueImage(),
                          fit: BoxFit.cover,
                          errorBuilder: (context, error, stackTrace) {
                            return Container(
                              color: Colors.grey.shade300,
                              child: const Center(
                                child: Icon(Icons.image, size: 50, color: Colors.grey),
                              ),
                            );
                          },
                        ),
                ),
              ),
            ),

            // Seat Category Selection
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
                  const Text(
                    'Select Seat Category',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF001F3F),
                    ),
                  ),
                  const SizedBox(height: 16),
                  
                  // Seat Category Dropdown
                  isLoadingVenue
                    ? Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                        decoration: BoxDecoration(
                          border: Border.all(color: Colors.grey.shade300),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Center(
                          child: CircularProgressIndicator(),
                        ),
                      )
                    : Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                        decoration: BoxDecoration(
                          border: Border.all(color: Colors.grey.shade300),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: DropdownButtonHideUnderline(
                          child: DropdownButton<String>(
                            value: selectedCategory,
                            hint: const Text('Select Category'),
                            isExpanded: true,
                            items: _getSeatCategories().map((category) {
                              return DropdownMenuItem<String>(
                                value: category['name'],
                                child: Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Text(
                                      category['name'],
                                      style: const TextStyle(
                                        fontSize: 16,
                                        fontWeight: FontWeight.w500,
                                      ),
                                    ),
                                    Text(
                                      '₹${category['price']}',
                                      style: TextStyle(
                                        fontSize: 14,
                                        color: Colors.grey.shade600,
                                      ),
                                    ),
                                  ],
                                ),
                              );
                            }).toList(),
                            onChanged: (value) {
                              setState(() {
                                selectedCategory = value;
                              });
                            },
                          ),
                        ),
                      ),
                  

                  
                  // Ticket Quantity Selector
                  const SizedBox(height: 24),
                  const Text(
                    'Number of Tickets',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF001F3F),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Container(
                        decoration: BoxDecoration(
                          border: Border.all(color: Colors.grey.shade300),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(
                          children: [
                            IconButton(
                              onPressed: selectedTickets > 1
                                  ? () {
                                      setState(() {
                                        selectedTickets--;
                                      });
                                    }
                                  : null,
                              icon: const Icon(Icons.remove),
                              color: const Color(0xFF001F3F),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 16),
                              child: Text(
                                selectedTickets.toString(),
                                style: const TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.bold,
                                  color: Color(0xFF001F3F),
                                ),
                              ),
                            ),
                            IconButton(
                              onPressed: selectedTickets < 10
                                  ? () {
                                      setState(() {
                                        selectedTickets++;
                                      });
                                    }
                                  : null,
                              icon: const Icon(Icons.add),
                              color: const Color(0xFF001F3F),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Text(
                          'Max 10 tickets per booking',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey.shade600,
                          ),
                        ),
                      ),
                    ],
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
                  'Tickets $selectedTickets',
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF001F3F),
                  ),
                ),
                Text(
                  selectedCategory != null 
                    ? '₹ ${(_getCategoryPrice(selectedCategory!) * selectedTickets).toString()}'
                    : '₹ 0',
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
                onPressed: () {
                  // Show booking confirmation
                  _showBookingConfirmation();
                },
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
              Text('Category: ${selectedCategory ?? 'None'}'),
              Text('Tickets: $selectedTickets'),
              const SizedBox(height: 8),
              Text(
                selectedCategory != null 
                  ? 'Total: ₹${(_getCategoryPrice(selectedCategory!) * selectedTickets).toString()}'
                  : 'Total: ₹0',
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
              onPressed: () {
                Navigator.pop(context);
                Navigator.pop(context); // Go back to event details
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Booking confirmed! Check My Bookings for details.'),
                    backgroundColor: Color(0xFF001F3F),
                  ),
                );
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF001F3F),
              ),
              child: const Text('Confirm Booking', style: TextStyle(color: Colors.white)),
            ),
          ],
        );
      },
    );
  }
}