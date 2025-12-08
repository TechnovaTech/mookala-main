import 'package:flutter/material.dart';

class ArtistPaymentsScreen extends StatefulWidget {
  const ArtistPaymentsScreen({super.key});

  @override
  State<ArtistPaymentsScreen> createState() => _ArtistPaymentsScreenState();
}

class _ArtistPaymentsScreenState extends State<ArtistPaymentsScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Header with Stats
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [Color(0xFF001F3F), Color(0xFF003366)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
          ),
          child: Column(
            children: [
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Earnings Overview',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            color: Colors.white,
                          ),
                        ),
                        Text(
                          'Track your payments and history',
                          style: TextStyle(
                            fontSize: 14,
                            color: Colors.white70,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: () {},
                    icon: Icon(Icons.download, color: Colors.white),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              Row(
                children: [
                  Expanded(
                    child: _buildStatCard('Total Earnings', '₹1,25,000', Icons.currency_rupee),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: _buildStatCard('This Month', '₹25,000', Icons.trending_up),
                  ),
                ],
              ),
            ],
          ),
        ),
        
        // Tabs
        Container(
          color: Colors.white,
          child: TabBar(
            controller: _tabController,
            labelColor: Color(0xFF001F3F),
            unselectedLabelColor: Colors.grey.shade600,
            indicatorColor: Color(0xFF001F3F),
            tabs: [
              Tab(text: 'Payments'),
              Tab(text: 'Booking History'),
            ],
          ),
        ),
        
        // Tab Content
        Expanded(
          child: TabBarView(
            controller: _tabController,
            children: [
              _buildPaymentsTab(),
              _buildBookingHistoryTab(),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildStatCard(String title, String amount, IconData icon) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withOpacity(0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: Colors.white, size: 20),
              const Spacer(),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            amount,
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: Colors.white,
            ),
          ),
          Text(
            title,
            style: TextStyle(
              fontSize: 12,
              color: Colors.white70,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPaymentsTab() {
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: 6,
      itemBuilder: (context, index) {
        final payments = [
          {'title': 'Wedding Performance', 'amount': '₹15,000', 'date': 'Dec 10, 2024', 'status': 'Completed', 'color': Colors.green},
          {'title': 'Corporate Event', 'amount': '₹8,000', 'date': 'Dec 8, 2024', 'status': 'Pending', 'color': Colors.orange},
          {'title': 'Birthday Party', 'amount': '₹5,000', 'date': 'Dec 5, 2024', 'status': 'Completed', 'color': Colors.green},
          {'title': 'Concert Performance', 'amount': '₹25,000', 'date': 'Nov 28, 2024', 'status': 'Completed', 'color': Colors.green},
          {'title': 'Festival Event', 'amount': '₹12,000', 'date': 'Nov 25, 2024', 'status': 'Failed', 'color': Colors.red},
          {'title': 'Private Event', 'amount': '₹7,000', 'date': 'Nov 20, 2024', 'status': 'Completed', 'color': Colors.green},
        ];
        
        final payment = payments[index];
        return _buildPaymentCard(
          title: payment['title'] as String,
          amount: payment['amount'] as String,
          date: payment['date'] as String,
          status: payment['status'] as String,
          statusColor: payment['color'] as Color,
        );
      },
    );
  }

  Widget _buildBookingHistoryTab() {
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: 5,
      itemBuilder: (context, index) {
        final bookings = [
          {'title': 'Wedding Ceremony', 'organizer': 'Sharma Events', 'date': 'Dec 10, 2024', 'location': 'Mumbai', 'rating': 5},
          {'title': 'Corporate Annual Meet', 'organizer': 'Tech Corp', 'date': 'Dec 8, 2024', 'location': 'Delhi', 'rating': 4},
          {'title': 'Birthday Celebration', 'organizer': 'Priya Gupta', 'date': 'Dec 5, 2024', 'location': 'Bangalore', 'rating': 5},
          {'title': 'Music Concert', 'organizer': 'Live Events', 'date': 'Nov 28, 2024', 'location': 'Chennai', 'rating': 4},
          {'title': 'Cultural Festival', 'organizer': 'City Council', 'date': 'Nov 25, 2024', 'location': 'Pune', 'rating': 5},
        ];
        
        final booking = bookings[index];
        return _buildBookingHistoryCard(
          title: booking['title'] as String,
          organizer: booking['organizer'] as String,
          date: booking['date'] as String,
          location: booking['location'] as String,
          rating: booking['rating'] as int,
        );
      },
    );
  }

  Widget _buildPaymentCard({
    required String title,
    required String amount,
    required String date,
    required String status,
    required Color statusColor,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
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
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: statusColor.withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(Icons.payment, color: statusColor, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: Colors.black87,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  date,
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey.shade600,
                  ),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                amount,
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: Colors.black87,
                ),
              ),
              const SizedBox(height: 4),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: statusColor.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  status,
                  style: TextStyle(
                    fontSize: 10,
                    color: statusColor,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(width: 8),
          IconButton(
            onPressed: () {},
            icon: Icon(Icons.download_outlined, size: 20),
          ),
        ],
      ),
    );
  }

  Widget _buildBookingHistoryCard({
    required String title,
    required String organizer,
    required String date,
    required String location,
    required int rating,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
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
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: Colors.black87,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'by $organizer',
                      style: TextStyle(
                        fontSize: 14,
                        color: Colors.grey.shade600,
                      ),
                    ),
                  ],
                ),
              ),
              Row(
                children: List.generate(5, (index) => Icon(
                  index < rating ? Icons.star : Icons.star_border,
                  color: Colors.amber,
                  size: 16,
                )),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Icon(Icons.calendar_today, size: 14, color: Colors.grey.shade600),
              const SizedBox(width: 4),
              Text(date, style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
              const SizedBox(width: 16),
              Icon(Icons.location_on, size: 14, color: Colors.grey.shade600),
              const SizedBox(width: 4),
              Text(location, style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
            ],
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