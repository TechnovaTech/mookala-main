import 'package:flutter/material.dart';
import 'event_management_screen.dart';
import 'jatra_registration_screen.dart' as jatra;
import 'qr_scanner_screen.dart';
import 'event_analytics_screen.dart';
import 'edit_event_screen.dart';
import 'view_event_screen.dart';
import 'add_tickets_screen.dart';
import 'user_profile_screen.dart';
import 'kyc_verification_screen.dart';
import '../services/auth_service.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  int _selectedIndex = 0;
  int _selectedTab = 0; // 0 for Upcoming, 1 for Past
  String _kycStatus = 'pending';
  String _rejectionNotes = '';
  String _userPhone = '';
  bool _isLoading = true;

  final List<String> _menuItems = ['Home', 'Events', 'Jatra', 'Scan'];
  final List<IconData> _menuIcons = [Icons.home, Icons.event, Icons.festival, Icons.qr_code_scanner];
  
  final List<String> _eventImages = [
    'assets/images/concert.jpg',
    'assets/images/theatre.jpg', 
    'assets/images/folk.jpg',
  ];
  
  List<Map<String, dynamic>> _upcomingEvents = [
    {
      'title': 'Music constant tyu',
      'dateTime': 'Tue, 02 Dec, 2025 at 12:00 am',
      'location': 'Rajkot',
      'status': 'Upcoming',
    },
    {
      'title': 'Dance constant ttt',
      'dateTime': 'Wed, 03 Dec, 2025 at 12:00 am',
      'location': 'Beirut',
      'status': 'Upcoming',
    },
    {
      'title': 'Cultural Festival',
      'dateTime': 'Thu, 04 Dec, 2025 at 6:00 pm',
      'location': 'Mumbai',
      'status': 'Upcoming',
    },
  ];
  
  final List<Map<String, dynamic>> _pastEvents = [
    {
      'title': 'Garba Night 2024',
      'dateTime': 'Mon, 15 Oct, 2024 at 7:00 pm',
      'location': 'Ahmedabad',
      'status': 'Completed',
    },
    {
      'title': 'Diwali Celebration',
      'dateTime': 'Fri, 01 Nov, 2024 at 6:00 pm',
      'location': 'Surat',
      'status': 'Completed',
    },
  ];

  @override
  void initState() {
    super.initState();
    _checkKYCStatus();
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      appBar: AppBar(
        backgroundColor: const Color(0xFF001F3F),
        elevation: 0,
        automaticallyImplyLeading: false,
        title: Text(
          _menuItems[_selectedIndex],
          style: const TextStyle(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.w600,
          ),
        ),
        actions: [
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
              : Column(
                  children: [
                    // Search Box
                    Container(
                      margin: const EdgeInsets.all(16),
                      child: TextField(
                        decoration: InputDecoration(
                          hintText: 'Search events...',
                          prefixIcon: const Icon(Icons.search),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(25),
                            borderSide: BorderSide.none,
                          ),
                          filled: true,
                          fillColor: Colors.grey.shade100,
                          contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                        ),
                      ),
                    ),
          
                    // Tab Bar
                    Container(
                      margin: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.grey.shade200,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: GestureDetector(
                              onTap: () {
                                setState(() {
                                  _selectedTab = 0;
                                });
                              },
                              child: Container(
                                padding: const EdgeInsets.symmetric(vertical: 12),
                                decoration: BoxDecoration(
                                  color: _selectedTab == 0 ? const Color(0xFF001F3F) : Colors.transparent,
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Text(
                                  'Upcoming Events (3)',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    color: _selectedTab == 0 ? Colors.white : Colors.grey.shade600,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ),
                          ),
                          Expanded(
                            child: GestureDetector(
                              onTap: () {
                                setState(() {
                                  _selectedTab = 1;
                                });
                              },
                              child: Container(
                                padding: const EdgeInsets.symmetric(vertical: 12),
                                decoration: BoxDecoration(
                                  color: _selectedTab == 1 ? const Color(0xFF001F3F) : Colors.transparent,
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Text(
                                  'Past Events (2)',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    color: _selectedTab == 1 ? Colors.white : Colors.grey.shade600,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
          
                    // Events List
                    Expanded(
                      child: ListView(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        children: _selectedTab == 0 
                          ? _upcomingEvents.asMap().entries.map((entry) {
                              int index = entry.key;
                              var event = entry.value;
                              return Column(
                                children: [
                                  _buildEventCard(
                                    event['title'],
                                    event['dateTime'],
                                    event['location'],
                                    event['status'],
                                    _eventImages[index % _eventImages.length],
                                    index,
                                  ),
                                  if (index < _upcomingEvents.length - 1) const SizedBox(height: 16),
                                ],
                              );
                            }).toList()
                          : _pastEvents.asMap().entries.map((entry) {
                              int index = entry.key;
                              var event = entry.value;
                              return Column(
                                children: [
                                  _buildEventCard(
                                    event['title'],
                                    event['dateTime'],
                                    event['location'],
                                    event['status'],
                                    _eventImages[index % _eventImages.length],
                                    index,
                                  ),
                                  if (index < _pastEvents.length - 1) const SizedBox(height: 16),
                                ],
                              );
                            }).toList(),
                      ),
                    ),
                  ],
                ),
      bottomNavigationBar: _kycStatus == 'approved'
          ? BottomNavigationBar(
              type: BottomNavigationBarType.fixed,
              backgroundColor: Colors.white,
              selectedItemColor: const Color(0xFF001F3F),
              unselectedItemColor: Colors.grey.shade600,
              currentIndex: _selectedIndex,
              onTap: (index) {
                if (index == 1) { // Events tab
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (context) => const EventManagementScreen()),
                  ).then((_) {
                    setState(() {
                      _selectedIndex = 0; // Reset to Home when returning
                    });
                  });
                } else if (index == 2) { // Jatra tab
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (context) => const jatra.JatraRegistrationScreen()),
                  ).then((_) {
                    setState(() {
                      _selectedIndex = 0; // Reset to Home when returning
                    });
                  });
                } else if (index == 3) { // Scan tab
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (context) => const QRScannerScreen()),
                  ).then((_) {
                    setState(() {
                      _selectedIndex = 0; // Reset to Home when returning
                    });
                  });
                } else {
                  setState(() {
                    _selectedIndex = index;
                  });
                }
              },
              items: const [
                BottomNavigationBarItem(
                  icon: Icon(Icons.home),
                  label: 'Home',
                ),
                BottomNavigationBarItem(
                  icon: Icon(Icons.event),
                  label: 'Events',
                ),
                BottomNavigationBarItem(
                  icon: Icon(Icons.festival),
                  label: 'Jatra',
                ),
                BottomNavigationBarItem(
                  icon: Icon(Icons.qr_code_scanner),
                  label: 'Scan',
                ),
              ],
            )
          : null,
    );
  }

  Widget _buildEventCard(String title, String dateTime, String location, String status, String imagePath, int index) {
    return GestureDetector(
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (context) => ViewEventScreen(
              eventTitle: title,
              eventDate: dateTime,
              eventLocation: location,
              eventStatus: status,
              eventImage: imagePath,
            ),
          ),
        );
      },
      child: Container(
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
          children: [
            // Event Image with overlay
            Container(
              height: 150,
              decoration: BoxDecoration(
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(12),
                  topRight: Radius.circular(12),
                ),
                image: DecorationImage(
                  image: AssetImage(imagePath),
                  fit: BoxFit.cover,
                ),
              ),
              child: Container(
                decoration: BoxDecoration(
                  borderRadius: const BorderRadius.only(
                    topLeft: Radius.circular(12),
                    topRight: Radius.circular(12),
                  ),
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.black.withOpacity(0.3),
                      Colors.black.withOpacity(0.7),
                    ],
                  ),
                ),
                child: Stack(
                  children: [
                    Positioned(
                      top: 12,
                      right: 12,
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  status == 'Completed' ? Icons.check_circle : Icons.schedule,
                                  size: 16,
                                  color: status == 'Completed' ? Colors.green : Colors.orange,
                                ),
                                const SizedBox(width: 4),
                                Text(
                                  status,
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                    color: status == 'Completed' ? Colors.green : Colors.orange,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: const Icon(Icons.share, size: 16),
                          ),
                        ],
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
                            title,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 20,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                dateTime,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 14,
                                ),
                              ),
                              Text(
                                location,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 14,
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
            ),
            
            // Enable Ticketing
            Container(
              padding: const EdgeInsets.all(16),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'Enable Ticketing',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  Icon(
                    Icons.arrow_forward_ios,
                    size: 16,
                    color: Colors.grey.shade600,
                  ),
                ],
              ),
            ),
            
            const Divider(height: 1),
            
            // Action buttons
            Container(
              padding: const EdgeInsets.all(16),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  _buildActionButton(Icons.analytics, 'Analytics', () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (context) => EventAnalyticsScreen(eventTitle: title),
                      ),
                    );
                  }),
                  _buildActionButton(Icons.confirmation_number, 'Issue Ticket', () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (context) => AddTicketsScreen(
                      eventData: {
                        'name': title,
                        'dateTime': dateTime,
                        'location': location,
                      },
                    )),
                  );
                }),
                  _buildActionButton(Icons.edit, 'Edit', () async {
                    final result = await Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (context) => EditEventScreen(
                          eventTitle: title,
                          eventDate: dateTime,
                          eventLocation: location,
                        ),
                      ),
                    );
                    
                    if (result != null) {
                      setState(() {
                        if (_selectedTab == 0) {
                          _upcomingEvents[index] = {
                            'title': result['title'],
                            'dateTime': result['dateTime'],
                            'location': result['location'],
                            'status': _upcomingEvents[index]['status'],
                          };
                        }
                      });
                    }
                  }),
                  _buildActionButton(Icons.visibility, 'More', () {
                    _showMoreOptions(context, title, dateTime, location, status, imagePath, index);
                  }),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
  
  Widget _buildActionButton(IconData icon, String label, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        children: [
          Icon(
            icon,
            size: 24,
            color: Colors.grey.shade600,
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: TextStyle(
              fontSize: 12,
              color: Colors.grey.shade600,
            ),
          ),
        ],
      ),
    );
  }

  void _showMoreOptions(BuildContext context, String title, String dateTime, String location, String status, String imagePath, int index) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Event Options'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.visibility, color: Color(0xFF001F3F)),
              title: const Text('View Event'),
              onTap: () {
                Navigator.pop(context);
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (context) => ViewEventScreen(
                      eventTitle: title,
                      eventDate: dateTime,
                      eventLocation: location,
                      eventStatus: status,
                      eventImage: imagePath,
                    ),
                  ),
                );
              },
            ),
            ListTile(
              leading: const Icon(Icons.delete, color: Colors.red),
              title: const Text('Delete Event'),
              onTap: () {
                Navigator.pop(context);
                _deleteEvent(index);
              },
            ),
          ],
        ),
      ),
    );
  }

  void _deleteEvent(int index) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Event'),
        content: const Text('Are you sure you want to delete this event?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              setState(() {
                if (_selectedTab == 0) {
                  _upcomingEvents.removeAt(index);
                } else {
                  _pastEvents.removeAt(index);
                }
              });
              Navigator.pop(context);
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Event deleted successfully')),
              );
            },
            child: const Text('Delete', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
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

  Widget _buildKPITile(String title, String value, IconData icon, Color color) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(12),
      elevation: 2,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () {
          // Handle KPI tile tap for deeper insights
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Viewing $title details')),
          );
        },
        child: Container(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: color.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Icon(
                      icon,
                      color: color,
                      size: 24,
                    ),
                  ),
                  const Spacer(),
                  Icon(
                    Icons.arrow_forward_ios,
                    size: 16,
                    color: Colors.grey.shade400,
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Text(
                title,
                style: TextStyle(
                  fontSize: 14,
                  color: Colors.grey.shade600,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                value,
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                  color: Colors.black87,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}