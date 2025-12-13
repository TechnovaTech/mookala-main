import 'package:flutter/material.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;

class CreateTicketScreen extends StatefulWidget {
  final Map<String, dynamic>? venueData;
  
  const CreateTicketScreen({super.key, this.venueData});

  @override
  State<CreateTicketScreen> createState() => _CreateTicketScreenState();
}

class _CreateTicketScreenState extends State<CreateTicketScreen> {
  List<Map<String, dynamic>> _availableVenues = [];
  Map<String, dynamic>? _selectedVenueData;
  String? _selectedVenueId;
  Map<String, List<Map<String, dynamic>>> _blockPricingCategories = {};
  List<String> _priceTypes = ['VIP', 'Premium', 'Normal', 'Balcony'];

  @override
  void initState() {
    super.initState();
    _loadVenues();
    if (widget.venueData != null) {
      _selectedVenueData = widget.venueData;
      _loadVenueBlocks();
    }
  }

  Future<void> _loadVenues() async {
    try {
      final response = await http.get(
        Uri.parse('http://localhost:3000/api/venues'),
        headers: {'Content-Type': 'application/json'},
      );
      
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        if (data['success'] && data['venues'] != null) {
          setState(() {
            _availableVenues = List<Map<String, dynamic>>.from(data['venues']);
          });
        }
      }
    } catch (e) {
      print('Error loading venues: $e');
    }
  }

  void _loadVenueBlocks() {
    if (_selectedVenueData != null && _selectedVenueData!['seatConfig'] != null) {
      final seatConfig = _selectedVenueData!['seatConfig'];
      if (seatConfig['blocks'] != null) {
        setState(() {
          _blockPricingCategories = {};
          for (var block in seatConfig['blocks']) {
            final blockName = block['name'] ?? 'A';
            final totalSeats = block['totalSeats'] ?? 100;
            _blockPricingCategories[blockName] = [
              {
                'priceType': 'Normal',
                'customCategory': '',
                'startSeat': 1,
                'endSeat': totalSeats,
                'price': '',
                'totalSeats': totalSeats,
              }
            ];
          }
        });
      }
    }
  }

  void _addPricingCategory(String blockName) {
    final blockCategories = _blockPricingCategories[blockName] ?? [];
    final totalSeats = blockCategories.isNotEmpty ? blockCategories[0]['totalSeats'] : 100;
    
    // Find the next available seat number
    int nextStartSeat = 1;
    for (var category in blockCategories) {
      if (category['endSeat'] >= nextStartSeat) {
        nextStartSeat = category['endSeat'] + 1;
      }
    }
    
    if (nextStartSeat <= totalSeats) {
      setState(() {
        _blockPricingCategories[blockName]!.add({
          'priceType': 'Normal',
          'customCategory': '',
          'startSeat': nextStartSeat,
          'endSeat': totalSeats,
          'price': '',
          'totalSeats': totalSeats,
        });
      });
    }
  }

  void _removePricingCategory(String blockName, int index) {
    if (_blockPricingCategories[blockName]!.length > 1) {
      setState(() {
        _blockPricingCategories[blockName]!.removeAt(index);
      });
    }
  }

  bool get _isFormValid {
    for (var blockCategories in _blockPricingCategories.values) {
      for (var category in blockCategories) {
        if (category['price'].toString().isNotEmpty) {
          return true;
        }
      }
    }
    return false;
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
          'Manage tickets',
          style: TextStyle(
            color: Colors.white,
            fontSize: 18,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Venue Selection
            if (_selectedVenueData == null) ...[
              const Text(
                'Select Venue',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: Colors.black87,
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
                    value: _selectedVenueId,
                    isExpanded: true,
                    hint: const Text('Choose venue to configure tickets'),
                    items: _availableVenues.map((venue) {
                      return DropdownMenuItem<String>(
                        value: venue['_id'],
                        child: Text(venue['name'] ?? 'Unknown Venue'),
                      );
                    }).toList(),
                    onChanged: (value) {
                      if (value != null) {
                        final selectedVenue = _availableVenues.firstWhere(
                          (venue) => venue['_id'] == value,
                        );
                        setState(() {
                          _selectedVenueId = value;
                          _selectedVenueData = selectedVenue;
                        });
                        _loadVenueBlocks();
                      }
                    },
                  ),
                ),
              ),
              const SizedBox(height: 24),
            ],

            if (_blockPricingCategories.isEmpty) ...[
              const Text(
                'No venue blocks found. Please select a venue with seat configuration.',
                style: TextStyle(
                  fontSize: 16,
                  color: Colors.red,
                ),
              ),
            ] else ...[
              const Text(
                'Configure ticket pricing for seat blocks',
                style: TextStyle(
                  fontSize: 16,
                  color: Colors.grey,
                ),
              ),
              const SizedBox(height: 24),
              
              ..._blockPricingCategories.entries.map((blockEntry) {
                final blockName = blockEntry.key;
                final categories = blockEntry.value;
                
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Block Header
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: const Color(0xFF001F3F).withOpacity(0.1),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: const Color(0xFF001F3F).withOpacity(0.3)),
                      ),
                      child: Row(
                        children: [
                          const Icon(
                            Icons.event_seat,
                            color: Color(0xFF001F3F),
                            size: 24,
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              'Block $blockName (${categories.isNotEmpty ? categories[0]['totalSeats'] : 0} seats)',
                              style: const TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                                color: Color(0xFF001F3F),
                              ),
                            ),
                          ),
                          IconButton(
                            onPressed: () => _addPricingCategory(blockName),
                            icon: const Icon(Icons.add_circle, color: Color(0xFF001F3F)),
                            tooltip: 'Add pricing category',
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    
                    // Pricing Categories for this block
                    ...categories.asMap().entries.map((categoryEntry) {
                      final categoryIndex = categoryEntry.key;
                      final category = categoryEntry.value;
                      
                      return Container(
                        margin: const EdgeInsets.only(bottom: 12),
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: Colors.grey.shade50,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: Colors.grey.shade300),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            // Category Header with Remove Button
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    'Pricing Category ${categoryIndex + 1}',
                                    style: const TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                                if (categories.length > 1)
                                  IconButton(
                                    onPressed: () => _removePricingCategory(blockName, categoryIndex),
                                    icon: const Icon(Icons.remove_circle, color: Colors.red),
                                    tooltip: 'Remove category',
                                  ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            
                            // Price Type Selection
                            Row(
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      const Text(
                                        'Price Category',
                                        style: TextStyle(
                                          fontSize: 14,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                      const SizedBox(height: 8),
                                      DropdownButtonFormField<String>(
                                        value: category['priceType'],
                                        decoration: InputDecoration(
                                          border: OutlineInputBorder(
                                            borderRadius: BorderRadius.circular(8),
                                          ),
                                          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                        ),
                                        items: [..._priceTypes, 'Custom'].map((type) {
                                          return DropdownMenuItem(
                                            value: type,
                                            child: Text(type),
                                          );
                                        }).toList(),
                                        onChanged: (value) {
                                          setState(() {
                                            _blockPricingCategories[blockName]![categoryIndex]['priceType'] = value;
                                          });
                                        },
                                      ),
                                    ],
                                  ),
                                ),
                                const SizedBox(width: 12),
                                if (category['priceType'] == 'Custom')
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        const Text(
                                          'Custom Category',
                                          style: TextStyle(
                                            fontSize: 14,
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                        const SizedBox(height: 8),
                                        TextField(
                                          decoration: InputDecoration(
                                            hintText: 'Enter category name',
                                            border: OutlineInputBorder(
                                              borderRadius: BorderRadius.circular(8),
                                            ),
                                            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                          ),
                                          onChanged: (value) {
                                            _blockPricingCategories[blockName]![categoryIndex]['customCategory'] = value;
                                          },
                                        ),
                                      ],
                                    ),
                                  ),
                              ],
                            ),
                            const SizedBox(height: 16),
                            
                            // Seat Range Selection
                            Row(
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      const Text(
                                        'Start Seat',
                                        style: TextStyle(
                                          fontSize: 14,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                      const SizedBox(height: 8),
                                      TextField(
                                        decoration: InputDecoration(
                                          hintText: '${category['startSeat']}',
                                          border: OutlineInputBorder(
                                            borderRadius: BorderRadius.circular(8),
                                          ),
                                          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                        ),
                                        keyboardType: TextInputType.number,
                                        onChanged: (value) {
                                          setState(() {
                                            _blockPricingCategories[blockName]![categoryIndex]['startSeat'] = int.tryParse(value) ?? category['startSeat'];
                                          });
                                        },
                                      ),
                                    ],
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      const Text(
                                        'End Seat',
                                        style: TextStyle(
                                          fontSize: 14,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                      const SizedBox(height: 8),
                                      TextField(
                                        decoration: InputDecoration(
                                          hintText: '${category['endSeat']}',
                                          border: OutlineInputBorder(
                                            borderRadius: BorderRadius.circular(8),
                                          ),
                                          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                        ),
                                        keyboardType: TextInputType.number,
                                        onChanged: (value) {
                                          setState(() {
                                            _blockPricingCategories[blockName]![categoryIndex]['endSeat'] = int.tryParse(value) ?? category['endSeat'];
                                          });
                                        },
                                      ),
                                    ],
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      const Text(
                                        'Price (₹)',
                                        style: TextStyle(
                                          fontSize: 14,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                      const SizedBox(height: 8),
                                      TextField(
                                        decoration: InputDecoration(
                                          hintText: 'Enter price',
                                          prefixText: '₹ ',
                                          border: OutlineInputBorder(
                                            borderRadius: BorderRadius.circular(8),
                                          ),
                                          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                        ),
                                        keyboardType: TextInputType.number,
                                        onChanged: (value) {
                                          setState(() {
                                            _blockPricingCategories[blockName]![categoryIndex]['price'] = value;
                                          });
                                        },
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            
                            // Seat Range Preview
                            Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: Colors.blue.shade50,
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(color: Colors.blue.shade200),
                              ),
                              child: Text(
                                'Seats: $blockName${category['startSeat']} to $blockName${category['endSeat']} (${(category['endSeat'] - category['startSeat'] + 1)} seats)',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: Colors.blue.shade700,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ),
                          ],
                        ),
                      );
                    }).toList(),
                    
                    const SizedBox(height: 24),
                  ],
                );
              }).toList(),
            ],
            
            const SizedBox(height: 24),
            
            // Action buttons
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () {
                      Navigator.pop(context);
                    },
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      side: const BorderSide(color: Colors.grey),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                    child: const Text(
                      'Cancel',
                      style: TextStyle(
                        fontSize: 16,
                        color: Colors.black87,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: ElevatedButton(
                    onPressed: _isFormValid ? () {
                      final tickets = <Map<String, dynamic>>[];
                      
                      _blockPricingCategories.forEach((blockName, categories) {
                        for (var category in categories) {
                          if (category['price'].toString().isNotEmpty) {
                            final categoryName = category['priceType'] == 'Custom' 
                                ? category['customCategory'] 
                                : category['priceType'];
                            final seatCount = category['endSeat'] - category['startSeat'] + 1;
                            
                            tickets.add({
                              'name': '$categoryName - Block $blockName',
                              'quantity': seatCount.toString(),
                              'price': category['price'],
                              'currency': 'INR (₹)',
                              'blockName': blockName,
                              'startSeat': category['startSeat'],
                              'endSeat': category['endSeat'],
                              'priceType': categoryName,
                            });
                          }
                        }
                      });
                      
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Tickets created successfully!')),
                      );
                      Navigator.pop(context, tickets);
                    } : null,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: _isFormValid ? const Color(0xFF001F3F) : Colors.grey,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                    child: const Text(
                      'Save Tickets',
                      style: TextStyle(
                        fontSize: 16,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}