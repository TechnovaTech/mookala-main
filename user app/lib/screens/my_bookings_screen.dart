import 'package:flutter/material.dart';

class MyBookingsScreen extends StatefulWidget {
  const MyBookingsScreen({super.key});

  @override
  State<MyBookingsScreen> createState() => _MyBookingsScreenState();
}

class _MyBookingsScreenState extends State<MyBookingsScreen> with TickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  final List<Map<String, dynamic>> upcomingBookings = [
    {
      'id': 'TKT001234',
      'title': 'AR Rahman Live Concert',
      'artist': 'A.R. Rahman',
      'date': 'Dec 25, 2024',
      'time': '7:00 PM',
      'venue': 'NSCI Dome, Mumbai',
      'seats': 'A12, A13',
      'quantity': 2,
      'price': '₹5,000',
      'image': 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&h=200&fit=crop',
      'status': 'confirmed',
      'qrCode': 'QR123456789',
    },
    {
      'id': 'TKT001235',
      'title': 'Shakespeare Drama',
      'artist': 'Mumbai Theatre Group',
      'date': 'Jan 2, 2025',
      'time': '8:00 PM',
      'venue': 'Prithvi Theatre',
      'seats': 'B5',
      'quantity': 1,
      'price': '₹800',
      'image': 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&h=200&fit=crop',
      'status': 'confirmed',
      'qrCode': 'QR987654321',
    },
  ];

  final List<Map<String, dynamic>> pastBookings = [
    {
      'id': 'TKT001230',
      'title': 'Classical Music Evening',
      'artist': 'Pandit Jasraj',
      'date': 'Nov 15, 2024',
      'venue': 'Tata Theatre',
      'price': '₹1,200',
      'image': 'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=300&h=200&fit=crop',
      'status': 'attended',
      'rating': 5,
    },
    {
      'id': 'TKT001228',
      'title': 'Folk Dance Festival',
      'artist': 'Gujarat Folk Artists',
      'date': 'Oct 20, 2024',
      'venue': 'Shanmukhananda Hall',
      'price': '₹600',
      'image': 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=300&h=200&fit=crop',
      'status': 'attended',
      'rating': 4,
    },
  ];

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
    if (upcomingBookings.isEmpty) {
      return _buildEmptyState('No upcoming bookings', 'Book your first event now!');
    }

    return ListView.builder(
      padding: const EdgeInsets.all(20),
      itemCount: upcomingBookings.length,
      itemBuilder: (context, index) {
        final booking = upcomingBookings[index];
        return _buildBookingCard(booking, true);
      },
    );
  }

  Widget _buildPastTab() {
    if (pastBookings.isEmpty) {
      return _buildEmptyState('No past bookings', 'Your event history will appear here');
    }

    return ListView.builder(
      padding: const EdgeInsets.all(20),
      itemCount: pastBookings.length,
      itemBuilder: (context, index) {
        final booking = pastBookings[index];
        return _buildBookingCard(booking, false);
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

  Widget _buildBookingCard(Map<String, dynamic> booking, bool isUpcoming) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
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
        children: [
          Container(
            height: 140,
            decoration: BoxDecoration(
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(16),
                topRight: Radius.circular(16),
              ),
              image: DecorationImage(
                image: NetworkImage(booking['image']),
                fit: BoxFit.cover,
              ),
            ),
            child: Container(
              decoration: BoxDecoration(
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(16),
                  topRight: Radius.circular(16),
                ),
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.transparent,
                    Colors.black.withOpacity(0.7),
                  ],
                ),
              ),
              child: Stack(
                children: [
                  Positioned(
                    top: 12,
                    right: 12,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: isUpcoming ? Colors.green : Colors.grey,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        isUpcoming ? 'UPCOMING' : 'ATTENDED',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ),
                  Positioned(
                    bottom: 12,
                    left: 12,
                    right: 12,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          booking['title'],
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        Text(
                          booking['artist'],
                          style: const TextStyle(
                            color: Colors.white70,
                            fontSize: 14,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                Row(
                  children: [
                    const Icon(Icons.calendar_today, color: Color(0xFF001F3F), size: 16),
                    const SizedBox(width: 8),
                    Text(booking['date'], style: const TextStyle(fontWeight: FontWeight.w600)),
                    if (isUpcoming) ...[ 
                      const SizedBox(width: 16),
                      const Icon(Icons.access_time, color: Color(0xFF001F3F), size: 16),
                      const SizedBox(width: 8),
                      Text(booking['time'], style: const TextStyle(fontWeight: FontWeight.w600)),
                    ],
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    const Icon(Icons.location_on, color: Color(0xFF001F3F), size: 16),
                    const SizedBox(width: 8),
                    Expanded(child: Text(booking['venue'])),
                  ],
                ),
                if (isUpcoming) ...[ 
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      const Icon(Icons.confirmation_number, color: Color(0xFF001F3F), size: 16),
                      const SizedBox(width: 8),
                      Text('${booking['quantity']} Tickets - ${booking['seats']}'),
                    ],
                  ),
                ],
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Ticket ID: ${booking['id']}',
                          style: TextStyle(
                            color: Colors.grey.shade600,
                            fontSize: 12,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          booking['price'],
                          style: const TextStyle(
                            color: Color(0xFF001F3F),
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                    if (!isUpcoming && booking['rating'] != null)
                      Row(
                        children: List.generate(5, (i) => Icon(
                          Icons.star,
                          size: 16,
                          color: i < booking['rating'] ? Colors.orange : Colors.grey.shade300,
                        )),
                      ),
                  ],
                ),
                if (isUpcoming) ...[ 
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () => _downloadTicket(booking),
                          icon: const Icon(Icons.download, size: 16),
                          label: const Text('Download'),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: const Color(0xFF001F3F),
                            side: const BorderSide(color: Color(0xFF001F3F)),
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: ElevatedButton.icon(
                          onPressed: () => _showQRCode(booking),
                          icon: const Icon(Icons.qr_code, size: 16),
                          label: const Text('Show QR'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF001F3F),
                            foregroundColor: Colors.white,
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
    );
  }

  void _downloadTicket(Map<String, dynamic> booking) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Downloading ticket for ${booking['title']}')),
    );
  }

  void _showQRCode(Map<String, dynamic> booking) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('QR Code - ${booking['title']}'),
        content: Container(
          width: 200,
          height: 200,
          decoration: BoxDecoration(
            border: Border.all(color: Colors.grey),
            borderRadius: BorderRadius.circular(8),
          ),
          child: const Center(
            child: Icon(Icons.qr_code, size: 150, color: Color(0xFF001F3F)),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }
}