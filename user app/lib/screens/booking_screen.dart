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
  String? selectedCategory;
  String? selectedBlock;
  List<Map<String, dynamic>> seatRanges = [];
  List<Map<String, dynamic>> availableBlocks = [];
  
  @override
  void initState() {
    super.initState();
    _loadVenueBlocks();
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
        if (venue['seatConfig'] != null && venue['seatConfig']['blocks'] != null) {
          setState(() {
            availableBlocks = List<Map<String, dynamic>>.from(venue['seatConfig']['blocks']);
            final seatCategories = _getSeatCategories();
            if (seatCategories.isNotEmpty) {
              selectedCategory = seatCategories.first['name'];
            }
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
  

  

  

  
  int _getCategoryPrice(String category) {
    final categories = _getSeatCategories();
    final found = categories.firstWhere(
      (cat) => cat['name'] == category,
      orElse: () => {'price': 500},
    );
    return found['price'] ?? 500;
  }
  
  void _addSeatRange() {
    final minSeat = _getBlockMinSeat();
    final maxSeat = _getBlockMaxSeat();
    setState(() {
      seatRanges.add({
        'fromSeat': minSeat,
        'toSeat': minSeat,
        'quantity': 1,
      });
    });
  }
  
  void _removeSeatRange(int index) {
    setState(() {
      seatRanges.removeAt(index);
    });
  }
  
  int _getTotalSeats() {
    return seatRanges.fold(0, (sum, range) => sum + (range['quantity'] as int));
  }
  
  int _getTotalPrice() {
    if (selectedCategory == null) return 0;
    final price = _getCategoryPrice(selectedCategory!);
    return price * _getTotalSeats();
  }
  
  List<Map<String, dynamic>> _getAvailableBlocksForCategory() {
    if (selectedCategory == null) return [];
    
    final tickets = widget.event['tickets'] as List?;
    if (tickets == null) return [];
    
    final categoryTickets = tickets.where((ticket) => ticket['name'] == selectedCategory).toList();
    
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
  
  int _getBlockMinSeat() {
    if (selectedCategory == null || selectedBlock == null) return 1;
    final blockInfo = _getAvailableBlocksForCategory().firstWhere(
      (block) => block['blockName'] == selectedBlock,
      orElse: () => {'startSeat': 1},
    );
    return blockInfo['startSeat'] ?? 1;
  }
  
  int _getBlockMaxSeat() {
    if (selectedCategory == null || selectedBlock == null) return 100;
    final blockInfo = _getAvailableBlocksForCategory().firstWhere(
      (block) => block['blockName'] == selectedBlock,
      orElse: () => {'endSeat': 100},
    );
    return blockInfo['endSeat'] ?? 100;
  }
  
  Widget _buildSeatRangeSelector() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              'Select Seats',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: Color(0xFF001F3F),
              ),
            ),
            IconButton(
              onPressed: _addSeatRange,
              icon: const Icon(Icons.add_circle, color: Color(0xFF001F3F)),
            ),
          ],
        ),
        const SizedBox(height: 16),
        ...seatRanges.asMap().entries.map((entry) {
          final index = entry.key;
          final range = entry.value;
          return Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              border: Border.all(color: Colors.grey.shade300),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        decoration: const InputDecoration(
                          labelText: 'From Seat',
                          border: OutlineInputBorder(),
                        ),
                        keyboardType: TextInputType.number,
                        onChanged: (value) {
                          final fromSeat = int.tryParse(value) ?? _getBlockMinSeat();
                          final maxSeat = _getBlockMaxSeat();
                          setState(() {
                            seatRanges[index]['fromSeat'] = fromSeat.clamp(_getBlockMinSeat(), maxSeat);
                            seatRanges[index]['quantity'] = (seatRanges[index]['toSeat'] - seatRanges[index]['fromSeat'] + 1).clamp(1, 999);
                          });
                        },
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextField(
                        decoration: const InputDecoration(
                          labelText: 'To Seat',
                          border: OutlineInputBorder(),
                        ),
                        keyboardType: TextInputType.number,
                        onChanged: (value) {
                          final toSeat = int.tryParse(value) ?? _getBlockMaxSeat();
                          final maxSeat = _getBlockMaxSeat();
                          setState(() {
                            seatRanges[index]['toSeat'] = toSeat.clamp(_getBlockMinSeat(), maxSeat);
                            seatRanges[index]['quantity'] = (seatRanges[index]['toSeat'] - seatRanges[index]['fromSeat'] + 1).clamp(1, 999);
                          });
                        },
                      ),
                    ),
                    const SizedBox(width: 12),
                    IconButton(
                      onPressed: seatRanges.length > 1 ? () => _removeSeatRange(index) : null,
                      icon: const Icon(Icons.remove_circle, color: Colors.red),
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
                    'Seats: ${selectedBlock ?? 'A'}${range['fromSeat']} to ${selectedBlock ?? 'A'}${range['toSeat']} (${range['quantity']} seats)',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.blue.shade700,
                    ),
                  ),
                ),
              ],
            ),
          );
        }).toList(),
        if (seatRanges.isEmpty)
          ElevatedButton(
            onPressed: _addSeatRange,
            child: const Text('Add Seat Range'),
          ),
      ],
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
                  
                  // Category Dropdown
                  Container(
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
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Text(
                                      category['priceType'] ?? 'Normal',
                                      style: const TextStyle(
                                        fontSize: 16,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                    Text(
                                      '₹${category['price']}',
                                      style: const TextStyle(
                                        fontSize: 16,
                                        fontWeight: FontWeight.bold,
                                        color: Color(0xFF001F3F),
                                      ),
                                    ),
                                  ],
                                ),
                                Text(
                                  'Block ${category['blockName']} (${category['seatRange']})',
                                  style: TextStyle(
                                    fontSize: 12,
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
                            selectedBlock = null;
                            seatRanges.clear();
                          });
                        },
                      ),
                    ),
                  ),
                  
                  const SizedBox(height: 24),
                  
                  // Block Selection
                  const Text(
                    'Select Block',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.grey.shade300),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: DropdownButtonHideUnderline(
                      child: DropdownButton<String>(
                        value: selectedBlock,
                        hint: const Text('Select Block'),
                        isExpanded: true,
                        items: _getAvailableBlocksForCategory().map((blockInfo) {
                          return DropdownMenuItem<String>(
                            value: blockInfo['blockName'],
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  'Block ${blockInfo['blockName']}',
                                  style: const TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                Text(
                                  '${blockInfo['priceType']} - ${blockInfo['seatRange']} (₹${blockInfo['price']})',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: Colors.grey.shade600,
                                  ),
                                ),
                              ],
                            ),
                          );
                        }).toList(),
                        onChanged: (value) {
                          setState(() {
                            selectedBlock = value;
                            seatRanges.clear();
                          });
                        },
                      ),
                    ),
                  ),
                  

                  
                  // Seat Range Selection
                  if (selectedCategory != null && selectedBlock != null) ...[
                    const SizedBox(height: 24),
                    _buildSeatRangeSelector(),
                  ],

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
              Text('Category: ${selectedCategory ?? 'None'}'),
              Text('Seats: ${seatRanges.map((r) => '${selectedBlock ?? 'A'}${r['fromSeat']}-${selectedBlock ?? 'A'}${r['toSeat']}').join(', ')}'),
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