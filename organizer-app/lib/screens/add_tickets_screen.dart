import 'package:flutter/material.dart';
import 'create_ticket_screen.dart';
import 'dashboard_screen.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../services/auth_service.dart';

class AddTicketsScreen extends StatefulWidget {
  final Map<String, dynamic> eventData;
  
  const AddTicketsScreen({super.key, required this.eventData});

  @override
  State<AddTicketsScreen> createState() => _AddTicketsScreenState();
}

class _AddTicketsScreenState extends State<AddTicketsScreen> {
  List<Map<String, dynamic>> _tickets = [];
  bool _isLoading = false;

  void _addTicket() async {
    final result = await Navigator.push(
      context,
      MaterialPageRoute(builder: (context) => const CreateTicketScreen()),
    );
    
    if (result != null) {
      setState(() {
        _tickets.add({
          'id': '1211${4225 + _tickets.length}',
          'name': result['name'],
          'price': '₹${result['price']}.00',
          'quantity': result['quantity'],
          'sold': '0',
        });
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
          onPressed: () {
            Navigator.pushReplacement(
              context,
              MaterialPageRoute(builder: (context) => const DashboardScreen()),
            );
          },
        ),
        title: const Text(
          'Add Tickets',
          style: TextStyle(
            color: Colors.white,
            fontSize: 18,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Add Tickets',
              style: TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.bold,
                color: Colors.black87,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              'Adding tickets to your event increases its visibility in AllEvents marketing campaigns.',
              style: TextStyle(
                fontSize: 16,
                color: Colors.grey.shade600,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 32),
            
            // Add tickets button
            Container(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _addTicket,
                icon: const Icon(Icons.confirmation_number, color: Colors.white),
                label: const Text(
                  'Add tickets',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF001F3F),
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
              ),
            ),
            
            const SizedBox(height: 40),
            
            // Benefits list
            _buildBenefitItem(
              Icons.star_outline,
              'Top rankings & better visibility on search engines',
              const Color(0xFF52B6E8),
            ),
            const SizedBox(height: 24),
            
            _buildBenefitItem(
              Icons.flash_on_outlined,
              'Instant & direct payments to your account',
              const Color(0xFFFFA726),
            ),
            const SizedBox(height: 24),
            
            _buildBenefitItem(
              Icons.notifications_outlined,
              'Booking reminders for incomplete transactions',
              const Color(0xFFFF7043),
            ),
            
            // Display created tickets
            if (_tickets.isNotEmpty) ...[
              const SizedBox(height: 32),
              const Text(
                'Created Tickets',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                  color: Colors.black87,
                ),
              ),
              const SizedBox(height: 16),
              
              ..._tickets.map((ticket) => Container(
                margin: const EdgeInsets.only(bottom: 16),
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.grey.shade300),
                ),
                child: Column(
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.drag_indicator, color: Colors.grey),
                        const SizedBox(width: 12),
                        Text(
                          ticket['name'],
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const Spacer(),
                        const Icon(Icons.more_vert, color: Colors.grey),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        const SizedBox(width: 36),
                        Expanded(
                          child: Column(
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  const Text('Ticket ID', style: TextStyle(color: Colors.grey)),
                                  Text(ticket['id']),
                                ],
                              ),
                              const SizedBox(height: 8),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  const Text('Price', style: TextStyle(color: Colors.grey)),
                                  Text(ticket['price']),
                                ],
                              ),
                              const SizedBox(height: 8),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  const Text('Sold/Qty', style: TextStyle(color: Colors.grey)),
                                  Text('${ticket['sold']}/${ticket['quantity']}'),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        const SizedBox(width: 36),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                          decoration: BoxDecoration(
                            color: Colors.green.shade100,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: Colors.green.shade300),
                          ),
                          child: const Text(
                            'ON SALE',
                            style: TextStyle(
                              color: Colors.green,
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              )).toList(),
            ],
            
            const SizedBox(height: 40),
            
            // Create Event Button
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _isLoading ? null : _createCompleteEvent,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF001F3F),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
                child: _isLoading
                    ? const CircularProgressIndicator(color: Colors.white)
                    : const Text(
                        'Create Event',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                      ),
              ),
            ),

          ],
        ),
      ),
    );
  }

  Widget _buildBenefitItem(IconData icon, String text, Color iconColor) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: iconColor.withOpacity(0.1),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(
            icon,
            color: iconColor,
            size: 24,
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              text,
              style: TextStyle(
                fontSize: 16,
                color: Colors.grey.shade700,
                height: 1.4,
              ),
            ),
          ),
        ),
      ],
    );
  }

  Future<void> _createCompleteEvent() async {
    setState(() {
      _isLoading = true;
    });

    try {
      final userData = await AuthService.getUserData();
      final userPhone = userData['phone'];
      final userRole = userData['role'];

      if (userPhone == null || userRole == null) {
        throw Exception('User not logged in');
      }

      // Clean and simplify event data
      final completeEventData = {
        'name': widget.eventData['name'] ?? 'Untitled Event',
        'category': widget.eventData['category'],
        'language': widget.eventData['language'],
        'locationType': widget.eventData['locationType'] ?? 'venue',
        'startDate': widget.eventData['startDate'] ?? '',
        'startTime': widget.eventData['startTime'] ?? '',
        'endDate': widget.eventData['endDate'] ?? '',
        'endTime': widget.eventData['endTime'] ?? '',
        'organizerPhone': userPhone,
        'organizerRole': userRole,
        'tickets': _tickets,
        'status': 'pending',
      };

      // Add location data based on type
      if (widget.eventData['location'] != null) {
        completeEventData['location'] = widget.eventData['location'];
      }
      if (widget.eventData['recordedDetails'] != null) {
        completeEventData['recordedDetails'] = widget.eventData['recordedDetails'];
      }
      if (widget.eventData['media'] != null) {
        completeEventData['media'] = widget.eventData['media'];
      }
      if (widget.eventData['artists'] != null) {
        completeEventData['artists'] = (widget.eventData['artists'] as List).map((artist) => artist['_id']).toList();
      }

      print('Sending event data: $completeEventData');

      final response = await http.post(
        Uri.parse('http://localhost:3000/api/events'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode(completeEventData),
      );

      if (response.statusCode == 201) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Event created successfully! Waiting for admin approval.')),
        );
        Navigator.pushAndRemoveUntil(
          context,
          MaterialPageRoute(builder: (context) => const DashboardScreen()),
          (route) => false,
        );
      } else {
        throw Exception('Failed to create event');
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error creating event: $e')),
      );
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }
}