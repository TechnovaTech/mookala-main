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
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'dart:typed_data';
import 'package:flutter/foundation.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  int _selectedIndex = 0;
  int _selectedTab = 0; // 0 for Live, 1 for Upcoming, 2 for Past, 3 for All
  String _kycStatus = 'pending';
  String _rejectionNotes = '';
  String _userPhone = '';
  bool _isLoading = true;
  List<Map<String, dynamic>> _allEvents = [];

  final List<String> _menuItems = ['Home', 'Events', 'Jatra', 'Scan'];
  final List<IconData> _menuIcons = [Icons.home, Icons.event, Icons.festival, Icons.qr_code_scanner];
  
  final List<String> _eventImages = [
    'assets/images/concert.jpg',
    'assets/images/theatre.jpg', 
    'assets/images/folk.jpg',
  ];
  


  @override
  void initState() {
    super.initState();
    _checkKYCStatus();
    _fetchUserEvents();
  }

  Future<void> _fetchUserEvents() async {
    final userData = await AuthService.getUserData();
    final phone = userData['phone'];
    
    if (phone != null) {
      try {
        final response = await http.get(
          Uri.parse('http://localhost:3000/api/events/user/$phone'),
          headers: {'Content-Type': 'application/json'},
        );
        
        if (response.statusCode == 200) {
          final data = json.decode(response.body);
          setState(() {
            _allEvents = List<Map<String, dynamic>>.from(data['events'] ?? []);
          });
        }
      } catch (e) {
        print('Error fetching user events: $e');
      }
    }
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
                          _buildTabButton('Live', 0, _getLiveEvents().length),
                          _buildTabButton('Upcoming', 1, _getUpcomingEvents().length),
                          _buildTabButton('Past', 2, _getPastEvents().length),
                          _buildTabButton('All', 3, _allEvents.length),
                        ],
                      ),
                    ),
          
                    // Events List
                    Expanded(
                      child: ListView(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        children: _getFilteredEvents().asMap().entries.map((entry) {
                          int index = entry.key;
                          var event = entry.value;
                          return Column(
                            children: [
                              _buildEventCard(
                                event['name'] ?? event['title'] ?? 'Untitled Event',
                                '${event['startDate'] ?? ''} at ${event['startTime'] ?? ''}',
                                event['location']?['city'] ?? event['location'] ?? 'Unknown Location',
                                _getEventStatus(event),
                                _eventImages[index % _eventImages.length],
                                index,
                                event,
                              ),
                              if (index < _getFilteredEvents().length - 1) const SizedBox(height: 16),
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

  Widget _buildTabButton(String title, int tabIndex, int count) {
    return Expanded(
      child: GestureDetector(
        onTap: () {
          setState(() {
            _selectedTab = tabIndex;
          });
        },
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: _selectedTab == tabIndex ? const Color(0xFF001F3F) : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(
            '$title ($count)',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: _selectedTab == tabIndex ? Colors.white : Colors.grey.shade600,
              fontWeight: FontWeight.w600,
              fontSize: 12,
            ),
          ),
        ),
      ),
    );
  }

  List<Map<String, dynamic>> _getFilteredEvents() {
    switch (_selectedTab) {
      case 0: return _getLiveEvents();
      case 1: return _getUpcomingEvents();
      case 2: return _getPastEvents();
      case 3: return _allEvents;
      default: return [];
    }
  }

  List<Map<String, dynamic>> _getLiveEvents() {
    final now = DateTime.now();
    return _allEvents.where((event) {
      if (event['status'] != 'approved') return false;
      final eventDate = DateTime.tryParse(event['startDate'] ?? '');
      if (eventDate == null) return false;
      final today = DateTime(now.year, now.month, now.day);
      final eventDay = DateTime(eventDate.year, eventDate.month, eventDate.day);
      return eventDay.isAtSameMomentAs(today);
    }).toList();
  }

  List<Map<String, dynamic>> _getUpcomingEvents() {
    final now = DateTime.now();
    return _allEvents.where((event) {
      if (event['status'] != 'approved') return false;
      final eventDate = DateTime.tryParse(event['startDate'] ?? '');
      if (eventDate == null) return false;
      return eventDate.isAfter(now);
    }).toList();
  }

  List<Map<String, dynamic>> _getPastEvents() {
    final now = DateTime.now();
    return _allEvents.where((event) {
      if (event['status'] != 'approved') return false;
      final eventDate = DateTime.tryParse(event['startDate'] ?? '');
      if (eventDate == null) return false;
      return eventDate.isBefore(now) && !_isToday(eventDate);
    }).toList();
  }

  bool _isToday(DateTime date) {
    final now = DateTime.now();
    return date.year == now.year && date.month == now.month && date.day == now.day;
  }

  String _getEventStatus(Map<String, dynamic> event) {
    final status = event['status'] ?? 'pending';
    final bookingStatus = event['bookingStatus'] ?? 'pending';
    
    if (status == 'pending') return 'Pending Approval';
    if (status == 'rejected') return 'Rejected';
    
    // Show booking status for approved events
    if (status == 'approved') {
      if (bookingStatus == 'artist_pending') return 'Artist Pending';
      if (bookingStatus == 'artist_declined') return 'Artist Declined';
      if (bookingStatus == 'confirmed') {
        final eventDate = DateTime.tryParse(event['startDate'] ?? '');
        if (eventDate != null) {
          final now = DateTime.now();
          if (_isToday(eventDate)) return 'Live';
          if (eventDate.isAfter(now)) return 'Upcoming';
          return 'Completed';
        }
        return 'Confirmed';
      }
    }
    
    return 'Approved';
  }

  IconData _getStatusIcon(String status) {
    switch (status) {
      case 'Live': return Icons.live_tv;
      case 'Upcoming': return Icons.schedule;
      case 'Completed': return Icons.check_circle;
      case 'Confirmed': return Icons.check_circle;
      case 'Pending Approval': return Icons.pending;
      case 'Artist Pending': return Icons.person_search;
      case 'Artist Declined': return Icons.person_off;
      case 'Approved': return Icons.verified;
      case 'Rejected': return Icons.cancel;
      default: return Icons.help;
    }
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'Live': return Colors.red;
      case 'Upcoming': return Colors.blue;
      case 'Completed': return Colors.green;
      case 'Confirmed': return Colors.green;
      case 'Pending Approval': return Colors.orange;
      case 'Artist Pending': return Colors.amber;
      case 'Artist Declined': return Colors.red;
      case 'Approved': return Colors.blue;
      case 'Rejected': return Colors.red;
      default: return Colors.grey;
    }
  }

  Widget _buildEventCard(String title, String dateTime, String location, String status, String imagePath, int index, Map<String, dynamic> eventData) {
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
                image: eventData['media']?['bannerImage'] != null
                    ? DecorationImage(
                        image: MemoryImage(
                          base64Decode(eventData['media']['bannerImage']),
                        ),
                        fit: BoxFit.cover,
                      )
                    : DecorationImage(
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
                                  _getStatusIcon(status),
                                  size: 16,
                                  color: _getStatusColor(status),
                                ),
                                const SizedBox(width: 4),
                                Text(
                                  status,
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                    color: _getStatusColor(status),
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
                      _fetchUserEvents();
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
              _fetchUserEvents();
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