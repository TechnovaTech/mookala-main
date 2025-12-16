import 'package:flutter/material.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'dart:typed_data';
import 'dart:html' as html;

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
  
  // Image viewer state
  bool _showImageViewer = false;
  double _imageScale = 1.0;
  final TransformationController _transformationController = TransformationController();
  
  // Ticket configuration mode
  bool _isSeatWise = true;
  
  // Without seat-wise configuration
  List<Map<String, dynamic>> _generalTickets = [];

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
          _imageScale = 1.0;
          _transformationController.value = Matrix4.identity();
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
    if (_isSeatWise) {
      for (var blockCategories in _blockPricingCategories.values) {
        for (var category in blockCategories) {
          if (category['price'].toString().isNotEmpty) {
            return true;
          }
        }
      }
      return false;
    } else {
      for (var ticket in _generalTickets) {
        if (ticket['quantity'].toString().isNotEmpty && 
            ticket['price'].toString().isNotEmpty) {
          return true;
        }
      }
      return false;
    }
  }
  
  int _getTotalSeats() {
    if (_selectedVenueData == null || _selectedVenueData!['seatConfig'] == null) {
      return 0;
    }
    
    final seatConfig = _selectedVenueData!['seatConfig'];
    if (seatConfig['blocks'] != null) {
      int total = 0;
      for (var block in seatConfig['blocks']) {
        total += (block['totalSeats'] ?? 0) as int;
      }
      return total;
    }
    return 0;
  }
  
  void _initializeGeneralTickets() {
    if (_generalTickets.isEmpty) {
      setState(() {
        _generalTickets = [
          {'name': 'Normal', 'quantity': '', 'price': '', 'priceType': 'Normal', 'customCategory': ''}
        ];
      });
    }
  }
  
  void _addGeneralTicket() {
    setState(() {
      _generalTickets.add({'name': 'Normal', 'quantity': '', 'price': '', 'priceType': 'Normal', 'customCategory': ''});
    });
  }
  
  void _removeGeneralTicket(int index) {
    if (_generalTickets.length > 1) {
      setState(() {
        _generalTickets.removeAt(index);
      });
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

            // Venue Total Seating Info
            if (_selectedVenueData != null) ...[
              Container(
                margin: const EdgeInsets.only(bottom: 16),
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFF001F3F).withOpacity(0.1),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFF001F3F).withOpacity(0.3)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.event_seat, color: Color(0xFF001F3F), size: 24),
                    const SizedBox(width: 12),
                    Text(
                      'Total Venue Capacity: ${_getTotalSeats()} seats',
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF001F3F),
                      ),
                    ),
                  ],
                ),
              ),
            ],

            // Seating Layout Image Viewer
            if (_selectedVenueData != null && _selectedVenueData!['seatingLayoutImage'] != null) ...[
              Container(
                margin: const EdgeInsets.only(bottom: 24),
                decoration: BoxDecoration(
                  border: Border.all(color: Colors.grey.shade300),
                  borderRadius: BorderRadius.circular(12),
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
                          topLeft: Radius.circular(12),
                          topRight: Radius.circular(12),
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
                          base64Decode(_selectedVenueData!['seatingLayoutImage'].split(',')[1]),
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
              
              // Ticket Configuration Mode Toggle
              Container(
                margin: const EdgeInsets.only(bottom: 24),
                child: Row(
                  children: [
                    Expanded(
                      child: ElevatedButton(
                        onPressed: () {
                          setState(() {
                            _isSeatWise = true;
                          });
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: _isSeatWise ? const Color(0xFF001F3F) : Colors.grey.shade300,
                          foregroundColor: _isSeatWise ? Colors.white : Colors.black87,
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        child: const Text('Seat Wise'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ElevatedButton(
                        onPressed: () {
                          setState(() {
                            _isSeatWise = false;
                            _initializeGeneralTickets();
                          });
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: !_isSeatWise ? const Color(0xFF001F3F) : Colors.grey.shade300,
                          foregroundColor: !_isSeatWise ? Colors.white : Colors.black87,
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        child: const Text('Without Seat Wise'),
                      ),
                    ),
                  ],
                ),
              ),
            ],
            
            if (_isSeatWise) ...[
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
            ] else ...[
              // Without Seat Wise Configuration
              const Text(
                'Configure general ticket categories',
                style: TextStyle(
                  fontSize: 16,
                  color: Colors.grey,
                ),
              ),
              const SizedBox(height: 16),
              
              ..._generalTickets.asMap().entries.map((entry) {
                final index = entry.key;
                final ticket = entry.value;
                
                return Container(
                  margin: const EdgeInsets.only(bottom: 16),
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.grey.shade50,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.grey.shade300),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              'Ticket Category ${index + 1}',
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          if (_generalTickets.length > 1)
                            IconButton(
                              onPressed: () => _removeGeneralTicket(index),
                              icon: const Icon(Icons.remove_circle, color: Colors.red),
                            ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      
                      // Price Category Selection
                      Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text('Price Category', style: TextStyle(fontWeight: FontWeight.w600)),
                                const SizedBox(height: 8),
                                DropdownButtonFormField<String>(
                                  value: ticket['priceType'] ?? 'Normal',
                                  decoration: InputDecoration(
                                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
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
                                      _generalTickets[index]['priceType'] = value;
                                      if (value != 'Custom') {
                                        _generalTickets[index]['name'] = value;
                                      }
                                    });
                                  },
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 12),
                          if (ticket['priceType'] == 'Custom')
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text('Custom Category', style: TextStyle(fontWeight: FontWeight.w600)),
                                  const SizedBox(height: 8),
                                  TextField(
                                    decoration: InputDecoration(
                                      hintText: 'Enter category name',
                                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                                      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                    ),
                                    onChanged: (value) {
                                      setState(() {
                                        _generalTickets[index]['customCategory'] = value;
                                        _generalTickets[index]['name'] = value;
                                      });
                                    },
                                  ),
                                ],
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      
                      Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text('Quantity', style: TextStyle(fontWeight: FontWeight.w600)),
                                const SizedBox(height: 8),
                                TextField(
                                  decoration: InputDecoration(
                                    hintText: 'Enter quantity',
                                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                                    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                  ),
                                  keyboardType: TextInputType.number,
                                  onChanged: (value) {
                                    setState(() {
                                      _generalTickets[index]['quantity'] = value;
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
                                const Text('Price (₹)', style: TextStyle(fontWeight: FontWeight.w600)),
                                const SizedBox(height: 8),
                                TextField(
                                  decoration: InputDecoration(
                                    hintText: 'Enter price',
                                    prefixText: '₹ ',
                                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                                    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                  ),
                                  keyboardType: TextInputType.number,
                                  onChanged: (value) {
                                    setState(() {
                                      _generalTickets[index]['price'] = value;
                                    });
                                  },
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                );
              }).toList(),
              
              const SizedBox(height: 16),
              ElevatedButton.icon(
                onPressed: _addGeneralTicket,
                icon: const Icon(Icons.add, color: Colors.white),
                label: const Text('Add Category', style: TextStyle(color: Colors.white)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF001F3F),
                  padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
                ),
              ),
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
                      
                      if (_isSeatWise) {
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
                                'isSeatWise': true,
                              });
                            }
                          }
                        });
                      } else {
                        for (var ticket in _generalTickets) {
                          if (ticket['quantity'].toString().isNotEmpty && 
                              ticket['price'].toString().isNotEmpty) {
                            final categoryName = ticket['priceType'] == 'Custom' 
                                ? ticket['customCategory'] 
                                : ticket['priceType'];
                            tickets.add({
                              'name': categoryName,
                              'quantity': ticket['quantity'],
                              'price': ticket['price'],
                              'currency': 'INR (₹)',
                              'priceType': categoryName,
                              'isSeatWise': false,
                            });
                          }
                        }
                      }
                      
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
  
  Future<void> _downloadSeatingLayout() async {
    try {
      if (_selectedVenueData == null || _selectedVenueData!['seatingLayoutImage'] == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No seating layout image available')),
        );
        return;
      }
      
      // Get image data and decode
      final imageData = _selectedVenueData!['seatingLayoutImage'];
      final bytes = base64Decode(imageData.split(',')[1]);
      
      // Create blob and download for web
      final blob = html.Blob([bytes]);
      final url = html.Url.createObjectUrlFromBlob(blob);
      final venueName = _selectedVenueData!['name'] ?? 'venue';
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