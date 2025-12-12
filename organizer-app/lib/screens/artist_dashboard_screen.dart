import 'package:flutter/material.dart';
import 'artist_profile_screen.dart';
import 'artist_followers_screen.dart';
import 'artist_tiers_screen.dart';
import 'artist_calendar_screen.dart';
import 'artist_bookings_screen.dart';
import 'artist_payments_screen.dart';
import 'kyc_verification_screen.dart';
import 'user_profile_screen.dart';
import '../services/auth_service.dart';

class ArtistDashboardScreen extends StatefulWidget {
  const ArtistDashboardScreen({super.key});

  @override
  State<ArtistDashboardScreen> createState() => _ArtistDashboardScreenState();
}

class _ArtistDashboardScreenState extends State<ArtistDashboardScreen> {
  int _currentIndex = 0;
  String _kycStatus = 'pending';
  String _rejectionNotes = '';
  String _userPhone = '';
  bool _isLoading = true;
  Map<String, dynamic> _dashboardStats = {
    'followers': 0,
    'bookingRequests': 0,
    'upcomingEvents': 0,
    'totalEarnings': 0,
  };

  @override
  void initState() {
    super.initState();
    _checkKYCStatus();
    _fetchDashboardStats();
  }

  Future<void> _checkKYCStatus() async {
    final userData = await AuthService.getUserData();
    final phone = userData['phone'];
    
    if (phone != null) {
      setState(() {
        _userPhone = phone;
      });
      
      final result = await AuthService.getKYCStatus(phone);
      
      if (result['success'] == true) {
        setState(() {
          _kycStatus = result['kycStatus'] ?? 'pending';
          _rejectionNotes = result['rejectionNotes'] ?? '';
          _isLoading = false;
        });
      } else {
        setState(() {
          _isLoading = false;
        });
      }
    } else {
      setState(() {
        _isLoading = false;
      });
    }
  }
  
  Future<void> _fetchDashboardStats() async {
    try {
      final userData = await AuthService.getUserData();
      final phone = userData['phone'];
      
      if (phone != null) {
        final result = await AuthService.getDashboardStats(phone);
        
        if (result['success'] == true) {
          setState(() {
            _dashboardStats = result['stats'] ?? _dashboardStats;
          });
        }
      }
    } catch (error) {
      print('Error fetching dashboard stats: $error');
    }
  }

  List<Widget> get _screens => [
    DashboardHomeScreen(stats: _dashboardStats, onRefresh: _fetchDashboardStats),
    const ArtistProfileScreen(),
    const ArtistCalendarScreen(),
    const ArtistBookingsScreen(),
    const ArtistPaymentsScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      appBar: AppBar(
        backgroundColor: const Color(0xFF001F3F),
        elevation: 0,
        automaticallyImplyLeading: false,
        title: Text(
          _getAppBarTitle(),
          style: const TextStyle(
            color: Colors.white,
            fontSize: 18,
            fontWeight: FontWeight.w600,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications, color: Colors.white),
            onPressed: () {},
          ),
          IconButton(
            icon: const Icon(Icons.person, color: Colors.white),
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (context) => const UserProfileScreen()),
              );
            },
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _kycStatus != 'approved'
              ? _buildKYCStatusWidget()
              : _screens[_currentIndex],
      bottomNavigationBar: _kycStatus == 'approved'
          ? BottomNavigationBar(
              currentIndex: _currentIndex,
              onTap: (index) => setState(() => _currentIndex = index),
              type: BottomNavigationBarType.fixed,
              selectedItemColor: const Color(0xFF001F3F),
              unselectedItemColor: Colors.grey.shade600,
              items: const [
                BottomNavigationBarItem(
                  icon: Icon(Icons.dashboard),
                  label: 'Dashboard',
                ),
                BottomNavigationBarItem(
                  icon: Icon(Icons.person),
                  label: 'Profile',
                ),
                BottomNavigationBarItem(
                  icon: Icon(Icons.calendar_today),
                  label: 'Calendar',
                ),
                BottomNavigationBarItem(
                  icon: Icon(Icons.event_note),
                  label: 'Bookings',
                ),
                BottomNavigationBarItem(
                  icon: Icon(Icons.payment),
                  label: 'Payments',
                ),
              ],
            )
          : null,
    );
  }
  
  String _getAppBarTitle() {
    switch (_currentIndex) {
      case 0: return 'Artist Dashboard';
      case 1: return 'Profile';
      case 2: return 'Calendar';
      case 3: return 'Booking Requests';
      case 4: return 'Payments & History';
      default: return 'Artist Dashboard';
    }
  }

  Widget _buildKYCStatusWidget() {
    return Padding(
      padding: const EdgeInsets.all(24.0),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            _kycStatus == 'rejected' ? Icons.cancel : Icons.pending,
            size: 80,
            color: _kycStatus == 'rejected' ? Colors.red : Colors.orange,
          ),
          const SizedBox(height: 24),
          Text(
            _kycStatus == 'rejected' ? 'KYC Rejected' : 'KYC Pending',
            style: const TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 16),
          Text(
            _kycStatus == 'rejected'
                ? 'Your KYC documents have been rejected. Please resubmit with correct information.'
                : 'Your KYC documents are under review. You will be able to access all features once approved.',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 16,
              color: Colors.grey.shade600,
            ),
          ),
          if (_kycStatus == 'rejected' && _rejectionNotes.isNotEmpty) ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.red.shade50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.red.shade200),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Rejection Reason:',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      color: Colors.red,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    _rejectionNotes,
                    style: const TextStyle(color: Colors.red),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 32),
          if (_kycStatus == 'rejected')
            ElevatedButton(
              onPressed: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (context) => KYCVerificationScreen(
                      phone: _userPhone, 
                      isResubmission: true,
                    ),
                  ),
                ).then((_) {
                  _checkKYCStatus();
                });
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF001F3F),
                padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
              ),
              child: const Text(
                'Resubmit KYC Documents',
                style: TextStyle(color: Colors.white),
              ),
            ),
          const SizedBox(height: 16),
          TextButton(
            onPressed: () {
              _checkKYCStatus();
            },
            child: const Text(
              'Refresh Status',
              style: TextStyle(color: Color(0xFF001F3F)),
            ),
          ),
        ],
      ),
    );
  }
}

class DashboardHomeScreen extends StatelessWidget {
  final Map<String, dynamic> stats;
  final Future<void> Function() onRefresh;
  
  const DashboardHomeScreen({super.key, required this.stats, required this.onRefresh});

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        physics: const AlwaysScrollableScrollPhysics(),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
          // Welcome Section
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF001F3F), Color(0xFF003366)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Welcome back!',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                SizedBox(height: 8),
                Text(
                  'Ready to showcase your talent?',
                  style: TextStyle(
                    color: Colors.white70,
                    fontSize: 16,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Stats Overview
          const Text(
            'Profile Stats',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: Colors.black87,
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(child: _buildStatCard('Followers', '${stats['followers'] ?? 0}', Icons.people, Colors.blue, context)),
              const SizedBox(width: 12),
              Expanded(child: _buildStatCard('Booking Requests', '${stats['bookingRequests'] ?? 0}', Icons.event, Colors.orange, context)),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: _buildStatCard('Upcoming Events', '${stats['upcomingEvents'] ?? 0}', Icons.calendar_today, Colors.green, context)),
              const SizedBox(width: 12),
              Expanded(child: _buildStatCard('Total Earnings', '₹${stats['totalEarnings'] ?? 0}', Icons.currency_rupee, Colors.purple, context)),
            ],
          ),
          const SizedBox(height: 24),

          // Notifications Section
          const Text(
            'Recent Notifications',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: Colors.black87,
            ),
          ),
          const SizedBox(height: 16),
          _buildNotificationCard(
            'New Booking Request',
            'Wedding event on Dec 25th',
            Icons.event_note,
            Colors.blue,
          ),
          const SizedBox(height: 8),
          _buildNotificationCard(
            'Payment Received',
            '₹5,000 for last performance',
            Icons.payment,
            Colors.green,
          ),
          const SizedBox(height: 8),
          _buildNotificationCard(
            'New Message',
            'Client inquiry about availability',
            Icons.message,
            Colors.orange,
          ),
          const SizedBox(height: 24),
          
          // Tiers Section
          GestureDetector(
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (context) => const ArtistTiersScreen()),
            ),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [Colors.purple.shade400, Colors.purple.shade600],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Upgrade Your Plan',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Get more visibility and features',
                          style: TextStyle(
                            color: Colors.white70,
                            fontSize: 14,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Icon(Icons.arrow_forward, color: Colors.white),
                ],
              ),
            ),
          ),
        ],
        ),
      ),
    );
  }

  Widget _buildStatCard(String title, String value, IconData icon, Color color, BuildContext context) {
    return GestureDetector(
      onTap: () {
        if (title == 'Followers') {
          Navigator.push(
            context,
            MaterialPageRoute(builder: (context) => const ArtistFollowersScreen()),
          );
        } else if (title == 'Booking Requests') {
          Navigator.push(
            context,
            MaterialPageRoute(builder: (context) => const ArtistBookingsScreen()),
          );
        } else if (title == 'Upcoming Events') {
          Navigator.push(
            context,
            MaterialPageRoute(builder: (context) => const ArtistCalendarScreen()),
          );
        }
        onRefresh();
      },
      child: Container(
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
                Icon(icon, color: color, size: 24),
                const Spacer(),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              value,
              style: const TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
                color: Colors.black87,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              title,
              style: TextStyle(
                fontSize: 12,
                color: Colors.grey.shade600,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildNotificationCard(String title, String subtitle, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        boxShadow: [
          BoxShadow(
            color: Colors.grey.withOpacity(0.1),
            spreadRadius: 1,
            blurRadius: 2,
            offset: const Offset(0, 1),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: color.withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: Colors.black87,
                  ),
                ),
                const SizedBox(height: 2),
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
          Icon(Icons.chevron_right, color: Colors.grey.shade400),
        ],
      ),
    );
  }
}