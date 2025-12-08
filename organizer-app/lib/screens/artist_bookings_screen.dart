import 'package:flutter/material.dart';
import '../services/auth_service.dart';

class ArtistBookingsScreen extends StatefulWidget {
  const ArtistBookingsScreen({super.key});

  @override
  State<ArtistBookingsScreen> createState() => _ArtistBookingsScreenState();
}

class _ArtistBookingsScreenState extends State<ArtistBookingsScreen> {
  List<Map<String, dynamic>> _bookingRequests = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadBookingRequests();
  }

  Future<void> _loadBookingRequests() async {
    final userData = await AuthService.getUserData();
    final phone = userData['phone'];
    
    if (phone != null) {
      final result = await AuthService.getArtistBookingRequests(phone);
      
      if (result['success'] == true) {
        setState(() {
          _bookingRequests = List<Map<String, dynamic>>.from(result['requests'] ?? []);
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
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    return Column(
      children: [
        // Header
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: Colors.white,
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
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'New Requests',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: Colors.black87,
                      ),
                    ),
                    Text(
                      '${_bookingRequests.length} pending requests',
                      style: TextStyle(
                        fontSize: 14,
                        color: Colors.grey.shade600,
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.orange.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  '${_bookingRequests.length} Pending',
                  style: TextStyle(
                    color: Colors.orange.shade700,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),
        
        // Booking Requests List
        Expanded(
          child: _bookingRequests.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.event_busy, size: 64, color: Colors.grey.shade400),
                      const SizedBox(height: 16),
                      Text(
                        'No booking requests yet',
                        style: TextStyle(
                          fontSize: 16,
                          color: Colors.grey.shade600,
                        ),
                      ),
                    ],
                  ),
                )
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: _bookingRequests.length,
                  itemBuilder: (context, index) {
                    final request = _bookingRequests[index];
                    return _buildBookingRequestCard(
                      request: request,
                      organizerName: request['organizerName'] ?? 'Unknown Organizer',
                      eventType: request['eventType'] ?? 'Event',
                      eventTitle: request['eventTitle'] ?? '',
                      date: request['eventDate'] ?? '',
                      time: request['eventTime'] ?? '',
                      location: request['city'] ?? '',
                      venue: request['venue'] ?? '',
                      budget: request['budget'] ?? '',
                      description: request['description'] ?? '',
                      isUrgent: request['isUrgent'] ?? false,
                    );
                  },
                ),
        ),
      ],
    );
  }

  Future<void> _respondToBooking(String eventId, String response) async {
    final userData = await AuthService.getUserData();
    final phone = userData['phone'];
    
    if (phone != null) {
      final result = await AuthService.respondToBooking(eventId, phone, response);
      
      if (result['success'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Booking ${response == 'accepted' ? 'accepted' : 'declined'} successfully!')),
        );
        _loadBookingRequests(); // Reload the list
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to respond to booking')),
        );
      }
    }
  }

  Widget _buildBookingRequestCard({
    required Map<String, dynamic> request,
    required String organizerName,
    required String eventType,
    required String eventTitle,
    required String date,
    required String time,
    required String location,
    required String venue,
    required String budget,
    required String description,
    bool isUrgent = false,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: isUrgent ? Border.all(color: Colors.orange, width: 1) : null,
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
          if (isUrgent)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 6),
              decoration: BoxDecoration(
                color: Colors.orange,
                borderRadius: BorderRadius.only(
                  topLeft: Radius.circular(12),
                  topRight: Radius.circular(12),
                ),
              ),
              child: Text(
                'URGENT REQUEST',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                  fontSize: 12,
                ),
              ),
            ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Header
                Row(
                  children: [
                    CircleAvatar(
                      backgroundColor: Color(0xFF001F3F).withOpacity(0.1),
                      child: Icon(Icons.person, color: Color(0xFF001F3F)),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            eventTitle.isNotEmpty ? eventTitle : 'Untitled Event',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                              color: Colors.black87,
                            ),
                          ),
                          Text(
                            '$organizerName • $eventType',
                            style: TextStyle(
                              fontSize: 14,
                              color: Colors.grey.shade600,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.green.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        budget,
                        style: TextStyle(
                          color: Colors.green.shade700,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                
                // Event Details
                Row(
                  children: [
                    Expanded(
                      child: _buildDetailItem(Icons.calendar_today, 'Date', '$date ${time.isNotEmpty ? time : ''}'),
                    ),
                    Expanded(
                      child: _buildDetailItem(Icons.location_on, 'Location', venue.isNotEmpty ? '$venue, $location' : location),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                
                // Description
                Text(
                  'Description:',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: Colors.black87,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  description,
                  style: TextStyle(
                    fontSize: 13,
                    color: Colors.grey.shade700,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 16),
                
                // Action Buttons
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => _respondToBooking(request['_id'], 'rejected'),
                        style: OutlinedButton.styleFrom(
                          side: BorderSide(color: Colors.red),
                          foregroundColor: Colors.red,
                        ),
                        child: Text('Decline'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ElevatedButton(
                        onPressed: () => _respondToBooking(request['_id'], 'accepted'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Color(0xFF001F3F),
                          foregroundColor: Colors.white,
                        ),
                        child: Text('Accept'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDetailItem(IconData icon, String label, String value) {
    return Row(
      children: [
        Icon(icon, size: 16, color: Colors.grey.shade600),
        const SizedBox(width: 6),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: TextStyle(
                  fontSize: 11,
                  color: Colors.grey.shade500,
                ),
              ),
              Text(
                value,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: Colors.black87,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}