import 'package:flutter/material.dart';
import 'create_ticket_screen.dart';
import 'dashboard_screen.dart';

class AddTicketsScreen extends StatefulWidget {
  const AddTicketsScreen({super.key});

  @override
  State<AddTicketsScreen> createState() => _AddTicketsScreenState();
}

class _AddTicketsScreenState extends State<AddTicketsScreen> {
  List<Map<String, dynamic>> _tickets = [];

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
}