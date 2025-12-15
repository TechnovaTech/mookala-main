import 'package:flutter/material.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../services/auth_service.dart';

class EventAnalyticsScreen extends StatefulWidget {
  final String eventTitle;
  
  const EventAnalyticsScreen({super.key, required this.eventTitle});
  
  @override
  State<EventAnalyticsScreen> createState() => _EventAnalyticsScreenState();
}

class _EventAnalyticsScreenState extends State<EventAnalyticsScreen> {
  bool _isLoading = true;
  int _totalTicketsSold = 0;
  double _totalRevenue = 0.0;
  int _totalCheckIns = 0;
  List<Map<String, dynamic>> _bookingData = [];
  
  @override
  void initState() {
    super.initState();
    _fetchAnalyticsData();
  }
  
  Future<void> _fetchAnalyticsData() async {
    try {
      final userData = await AuthService.getUserData();
      final userPhone = userData['phone'];
      
      if (userPhone != null) {
        // Fetch bookings for this event
        final response = await http.get(
          Uri.parse('http://localhost:3000/api/bookings?organizerPhone=$userPhone&eventTitle=${Uri.encodeComponent(widget.eventTitle)}'),
          headers: {'Content-Type': 'application/json'},
        );
        
        if (response.statusCode == 200) {
          final data = json.decode(response.body);
          if (data['success'] == true && data['bookings'] != null) {
            final bookings = List<Map<String, dynamic>>.from(data['bookings']);
            _calculateAnalytics(bookings);
          }
        }
      }
    } catch (e) {
      print('Error fetching analytics: $e');
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }
  
  void _calculateAnalytics(List<Map<String, dynamic>> bookings) {
    int totalTickets = 0;
    double totalRevenue = 0.0;
    int checkIns = 0;
    
    for (var booking in bookings) {
      if (booking['eventTitle'] == widget.eventTitle) {
        // Count tickets
        if (booking['tickets'] != null) {
          for (var ticket in booking['tickets']) {
            totalTickets += (ticket['quantity'] as int? ?? 0);
            totalRevenue += ((ticket['totalPrice'] as num? ?? 0).toDouble());
          }
        } else {
          totalTickets += (booking['totalSeats'] as int? ?? 0);
          totalRevenue += ((booking['totalPrice'] as num? ?? 0).toDouble());
        }
        
        // Count check-ins (assuming checked-in status exists)
        if (booking['status'] == 'checked-in') {
          checkIns++;
        }
      }
    }
    
    setState(() {
      _totalTicketsSold = totalTickets;
      _totalRevenue = totalRevenue;
      _totalCheckIns = checkIns;
      _bookingData = bookings;
    });
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
        title: Text(
          'Analytics - ${widget.eventTitle}',
          style: const TextStyle(
            color: Colors.white,
            fontSize: 18,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Dashboard Header
            const Text(
              'Dashboard',
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
                color: Colors.black87,
              ),
            ),
            const SizedBox(height: 20),
            

            
            // Performance Metrics
            if (_isLoading)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(40),
                  child: CircularProgressIndicator(),
                ),
              )
            else ...[
              _buildPerformanceCard(
                'Total Tickets Sold',
                _totalTicketsSold.toString(),
                _totalTicketsSold == 0 ? 'No tickets sold yet' : 'Tickets sold successfully',
                Icons.confirmation_number,
                Colors.blue,
              ),
              const SizedBox(height: 12),
              _buildPerformanceCard(
                'Revenue Generated',
                '₹${_totalRevenue.toStringAsFixed(2)}',
                'Total earnings from ticket sales',
                Icons.currency_rupee,
                Colors.green,
              ),
              const SizedBox(height: 12),
              _buildPerformanceCard(
                'Check-in Count',
                _totalCheckIns.toString(),
                'Attendees who checked in',
                Icons.check_circle,
                Colors.orange,
              ),
            ],
            
            const SizedBox(height: 32),
            
            // Refresh Button
            Center(
              child: ElevatedButton.icon(
                onPressed: () {
                  setState(() {
                    _isLoading = true;
                  });
                  _fetchAnalyticsData();
                },
                icon: const Icon(Icons.refresh, color: Colors.white),
                label: const Text('Refresh Data', style: TextStyle(color: Colors.white)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF001F3F),
                  padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
              ),
            ),
            
            const SizedBox(height: 32),
            
            // Payouts Section
            const Text(
              'Payouts',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: Colors.black87,
              ),
            ),
            const SizedBox(height: 16),
            
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                boxShadow: [
                  BoxShadow(
                    color: Colors.grey.withOpacity(0.1),
                    spreadRadius: 1,
                    blurRadius: 4,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        Icons.account_balance_wallet,
                        color: Colors.purple.shade600,
                        size: 24,
                      ),
                      const SizedBox(width: 12),
                      const Text(
                        'Settlement History',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: Colors.black87,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'No settlements processed yet',
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.grey.shade600,
                    ),
                  ),
                  const SizedBox(height: 20),
                  
                  Row(
                    children: [
                      Icon(
                        Icons.pending_actions,
                        color: Colors.amber.shade600,
                        size: 24,
                      ),
                      const SizedBox(width: 12),
                      const Text(
                        'Pending Earnings',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: Colors.black87,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Amount pending for payout',
                        style: TextStyle(
                          fontSize: 14,
                          color: Colors.grey.shade600,
                        ),
                      ),
                      Text(
                        '₹${_totalRevenue.toStringAsFixed(2)}',
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: Colors.black87,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAnalyticsCard(String title, String value, Color color) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.grey.withOpacity(0.1),
            spreadRadius: 1,
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            title,
            style: TextStyle(
              fontSize: 12,
              color: Colors.grey.shade600,
              fontWeight: FontWeight.w500,
            ),
          ),
          Text(
            value,
            style: TextStyle(
              fontSize: 28,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPerformanceCard(String title, String value, String subtitle, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.grey.withOpacity(0.1),
            spreadRadius: 1,
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: color.withOpacity(0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              icon,
              color: color,
              size: 24,
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: Colors.black87,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  subtitle,
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey.shade600,
                  ),
                ),
              ],
            ),
          ),
          Text(
            value,
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}