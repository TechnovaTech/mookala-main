import 'package:flutter/material.dart';

class CreateTicketScreen extends StatefulWidget {
  final Map<String, dynamic>? venueData;
  
  const CreateTicketScreen({super.key, this.venueData});

  @override
  State<CreateTicketScreen> createState() => _CreateTicketScreenState();
}

class _CreateTicketScreenState extends State<CreateTicketScreen> {
  Map<String, TextEditingController> _categoryPriceControllers = {};
  Map<String, int> _categorySeatCounts = {};
  String _selectedCurrency = 'INR (₹)';

  @override
  void initState() {
    super.initState();
    if (widget.venueData != null && widget.venueData!['seatCategories'] != null) {
      final seatCategories = widget.venueData!['seatCategories'] as Map<String, dynamic>;
      seatCategories.forEach((category, seats) {
        _categoryPriceControllers[category] = TextEditingController();
        _categorySeatCounts[category] = _parseSeatCount(seats.toString());
      });
    }
  }

  int _parseSeatCount(String seatString) {
    int count = 0;
    final parts = seatString.split(',').map((p) => p.trim());
    for (var part in parts) {
      if (part.contains('-')) {
        final range = part.split('-');
        if (range.length == 2) {
          final start = int.tryParse(range[0].trim()) ?? 0;
          final end = int.tryParse(range[1].trim()) ?? 0;
          count += (end - start + 1);
        }
      } else {
        if (int.tryParse(part) != null) count++;
      }
    }
    return count;
  }

  bool get _isFormValid {
    return _categoryPriceControllers.values.any((controller) => controller.text.isNotEmpty);
  }

  @override
  void dispose() {
    _categoryPriceControllers.values.forEach((controller) => controller.dispose());
    super.dispose();
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
            if (widget.venueData == null || _categoryPriceControllers.isEmpty) ...[
              const Text(
                'No venue seat categories found. Please select a venue with seat categories.',
                style: TextStyle(
                  fontSize: 16,
                  color: Colors.red,
                ),
              ),
            ] else ...[
              const Text(
                'Set prices for seat categories',
                style: TextStyle(
                  fontSize: 16,
                  color: Colors.grey,
                ),
              ),
              const SizedBox(height: 24),
              
              ..._categoryPriceControllers.keys.map((category) => Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
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
                            Container(
                              padding: const EdgeInsets.all(8),
                              decoration: BoxDecoration(
                                color: const Color(0xFF001F3F).withOpacity(0.1),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: const Icon(
                                Icons.event_seat,
                                color: Color(0xFF001F3F),
                                size: 20,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    category,
                                    style: const TextStyle(
                                      fontSize: 18,
                                      fontWeight: FontWeight.bold,
                                      color: Colors.black87,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    'Total Seats: ${_categorySeatCounts[category]}',
                                    style: TextStyle(
                                      fontSize: 14,
                                      color: Colors.grey.shade600,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        Row(
                          children: [
                            Container(
                              width: 120,
                              height: 50,
                              decoration: BoxDecoration(
                                border: Border.all(color: Colors.grey),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: DropdownButtonHideUnderline(
                                child: DropdownButton<String>(
                                  value: _selectedCurrency,
                                  padding: const EdgeInsets.symmetric(horizontal: 12),
                                  items: ['INR (₹)', 'USD (\$)', 'EUR (€)', 'GBP (£)']
                                      .map((currency) => DropdownMenuItem(
                                            value: currency,
                                            child: Text(currency),
                                          ))
                                      .toList(),
                                  onChanged: (value) {
                                    setState(() {
                                      _selectedCurrency = value!;
                                    });
                                  },
                                ),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: TextField(
                                controller: _categoryPriceControllers[category],
                                decoration: InputDecoration(
                                  hintText: 'Enter price',
                                  hintStyle: const TextStyle(color: Colors.grey),
                                  border: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(8),
                                    borderSide: const BorderSide(color: Colors.grey),
                                  ),
                                ),
                                keyboardType: TextInputType.number,
                                onChanged: (_) => setState(() {}),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                ],
              )).toList(),
            ],
            
            const SizedBox(height: 24),
            
            // Old ticket name field - REMOVE THIS SECTION
            const SizedBox(height: 16),
            
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
                      'Reset',
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
                      _categoryPriceControllers.forEach((category, controller) {
                        if (controller.text.isNotEmpty) {
                          tickets.add({
                            'name': category,
                            'quantity': _categorySeatCounts[category].toString(),
                            'price': controller.text,
                            'currency': _selectedCurrency,
                          });
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
                      'Save',
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