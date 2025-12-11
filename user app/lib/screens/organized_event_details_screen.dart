import 'package:flutter/material.dart';
import 'dart:convert';
import '../services/api_service.dart';
import 'artist_detail_screen.dart';
import 'booking_screen.dart';

class OrganizedEventDetailsScreen extends StatefulWidget {
  final Map<String, dynamic> event;

  const OrganizedEventDetailsScreen({super.key, required this.event});

  @override
  State<OrganizedEventDetailsScreen> createState() => _OrganizedEventDetailsScreenState();
}

class _OrganizedEventDetailsScreenState extends State<OrganizedEventDetailsScreen> {
  Map<String, dynamic>? _fullEventData;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadEventDetails();
  }

  Future<void> _loadEventDetails() async {
    try {
      final response = await ApiService.getEventDetails(widget.event['id']);
      if (response['success'] == true) {
        setState(() {
          _fullEventData = {
            ...widget.event,
            ...response['event'],
          };
          _isLoading = false;
        });
      } else {
        setState(() {
          _isLoading = false;
        });
      }
    } catch (e) {
      setState(() {
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final event = _fullEventData ?? widget.event;
    
    if (_isLoading) {
      return Scaffold(
        backgroundColor: Colors.white,
        appBar: AppBar(
          backgroundColor: Colors.white,
          elevation: 0,
          leading: IconButton(
            icon: const Icon(Icons.arrow_back, color: Colors.black),
            onPressed: () => Navigator.pop(context),
          ),
          title: Text(
            (event['title'] ?? 'Event Details').toString(),
            style: const TextStyle(color: Colors.black, fontSize: 18, fontWeight: FontWeight.bold),
          ),
          actions: [
            IconButton(
              icon: const Icon(Icons.share, color: Colors.black),
              onPressed: () {},
            ),
          ],
        ),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.black),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text(
          event['title'] ?? 'Event Details',
          style: const TextStyle(color: Colors.black, fontSize: 18, fontWeight: FontWeight.bold),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.share, color: Colors.black),
            onPressed: () {},
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Event Image
                  Container(
                    width: double.infinity,
                    height: 200,
                    margin: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.1),
                          blurRadius: 8,
                          offset: const Offset(0, 2),
                        ),
                      ],
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: event['image'].toString().startsWith('http')
                        ? Image.network(
                            event['image'],
                            width: double.infinity,
                            height: double.infinity,
                            fit: BoxFit.cover,
                            errorBuilder: (context, error, stackTrace) {
                              return Image.asset(
                                'assets/images/concert.jpg',
                                fit: BoxFit.cover,
                              );
                            },
                          )
                        : event['image'].toString().startsWith('data:image')
                          ? Image.memory(
                              base64Decode(event['image'].toString().split(',')[1]),
                              width: double.infinity,
                              height: double.infinity,
                              fit: BoxFit.cover,
                              errorBuilder: (context, error, stackTrace) {
                                return Image.asset(
                                  'assets/images/concert.jpg',
                                  fit: BoxFit.cover,
                                );
                              },
                            )
                          : Image.asset(
                              event['image'] ?? 'assets/images/concert.jpg',
                              fit: BoxFit.cover,
                            ),
                    ),
                  ),

                  // Category Tags
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Wrap(
                      spacing: 8,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          decoration: BoxDecoration(
                            color: Colors.grey.shade800,
                            borderRadius: BorderRadius.circular(16),
                          ),
                          child: Text(
                            (event['category'] ?? 'Event').toString(),
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                        if (event['subcategory'] != null)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                            decoration: BoxDecoration(
                              color: Colors.grey.shade800,
                              borderRadius: BorderRadius.circular(16),
                            ),
                            child: Text(
                              event['subcategory'].toString(),
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 12,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 24),

                  // Event Details
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Column(
                      children: [
                        _buildDetailRow(Icons.calendar_today, _getEventDateTime(event)),
                        _buildDetailRow(Icons.access_time, _getEventDuration(event)),
                        _buildDetailRow(Icons.person, _getArtistName(event)),
                        _buildDetailRow(Icons.language, _getEventLanguage(event)),
                        _buildDetailRow(Icons.category, _getEventCategory(event)),
                        _buildDetailRow(Icons.location_on, _getEventVenue(event)),
                      ],
                    ),
                  ),

                  const SizedBox(height: 24),

                  // You Should Know Section
                  Container(
                    margin: const EdgeInsets.symmetric(horizontal: 16),
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.grey.shade50,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'You should know',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 12),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Container(
                              margin: const EdgeInsets.only(top: 4),
                              child: Icon(
                                Icons.lightbulb_outline,
                                size: 20,
                                color: Colors.grey.shade600,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                (event['additional_info'] ?? event['description'] ?? 'Additional event information will be displayed here.').toString(),
                                style: TextStyle(
                                  color: Colors.grey.shade700,
                                  fontSize: 14,
                                  height: 1.4,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 16),

                  // Terms and Conditions Section (only show if terms exist)
                  if (_hasTermsAndConditions())
                    Container(
                      margin: const EdgeInsets.symmetric(horizontal: 16),
                      child: GestureDetector(
                        onTap: () => _showTermsAndConditions(),
                        child: Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: Colors.grey.shade300),
                          ),
                          child: Row(
                            children: [
                              Icon(
                                Icons.description_outlined,
                                color: Colors.grey.shade600,
                                size: 20,
                              ),
                              const SizedBox(width: 12),
                              const Expanded(
                                child: Text(
                                  'Terms and Conditions',
                                  style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w500,
                                    color: Colors.black87,
                                  ),
                                ),
                              ),
                              Icon(
                                Icons.arrow_forward_ios,
                                color: Colors.grey.shade400,
                                size: 16,
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),

                  const SizedBox(height: 100), // Space for bottom button
                ],
              ),
            ),
          ),

          // Bottom Book Now Section
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.1),
                  blurRadius: 8,
                  offset: const Offset(0, -2),
                ),
              ],
            ),
            child: SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (context) => BookingScreen(event: event),
                    ),
                  );
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF001F3F),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
                child: const Text(
                  'Book Now',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _getEventDateTime(Map<String, dynamic> event) {
    final startDate = event['startDate']?.toString() ?? '';
    final endDate = event['endDate']?.toString() ?? '';
    final startTime = event['startTime']?.toString() ?? '';
    final endTime = event['endTime']?.toString() ?? '';
    
    if (startDate.isNotEmpty && endDate.isNotEmpty) {
      if (startDate == endDate) {
        return '$startDate ${startTime.isNotEmpty ? "• $startTime" : ""}';
      } else {
        return '$startDate - $endDate';
      }
    } else if (startDate.isNotEmpty) {
      return '$startDate ${startTime.isNotEmpty ? "• $startTime" : ""}';
    }
    
    return (event['date'] ?? event['eventDate'] ?? 'Date not available').toString();
  }

  String _getEventDuration(Map<String, dynamic> event) {
    final startDate = event['startDate']?.toString() ?? '';
    final endDate = event['endDate']?.toString() ?? '';
    final startTime = event['startTime']?.toString() ?? '';
    final endTime = event['endTime']?.toString() ?? '';
    
    if (startDate.isNotEmpty && startTime.isNotEmpty && endDate.isNotEmpty && endTime.isNotEmpty) {
      try {
        final startDateTime = _parseDateTime(startDate, startTime);
        final endDateTime = _parseDateTime(endDate, endTime);
        
        if (startDateTime != null && endDateTime != null) {
          final duration = endDateTime.difference(startDateTime);
          final days = duration.inDays;
          final hours = duration.inHours % 24;
          final minutes = duration.inMinutes % 60;
          
          if (days > 0) {
            return '${days}d ${hours}h';
          } else if (hours > 0 && minutes > 0) {
            return '${hours}h ${minutes}m';
          } else if (hours > 0) {
            return '${hours}h';
          } else if (minutes > 0) {
            return '${minutes}m';
          }
        }
      } catch (e) {
        return '$startTime - $endTime';
      }
    } else if (startTime.isNotEmpty && endTime.isNotEmpty) {
      try {
        final start = _parseTime(startTime);
        final end = _parseTime(endTime);
        
        if (start != null && end != null) {
          final duration = end.difference(start);
          final hours = duration.inHours;
          final minutes = duration.inMinutes % 60;
          
          if (hours > 0 && minutes > 0) {
            return '${hours}h ${minutes}m';
          } else if (hours > 0) {
            return '${hours}h';
          } else if (minutes > 0) {
            return '${minutes}m';
          }
        }
      } catch (e) {
        return '$startTime - $endTime';
      }
    }
    
    return (event['duration'] ?? event['eventDuration'] ?? '2 Hours').toString();
  }
  
  DateTime? _parseDateTime(String dateStr, String timeStr) {
    try {
      final dateParts = dateStr.split('-');
      if (dateParts.length != 3) return null;
      
      final year = int.tryParse(dateParts[0]) ?? 0;
      final month = int.tryParse(dateParts[1]) ?? 0;
      final day = int.tryParse(dateParts[2]) ?? 0;
      
      final timeParts = timeStr.split(':');
      if (timeParts.length < 2) return null;
      
      final hour = int.tryParse(timeParts[0]) ?? 0;
      final minute = int.tryParse(timeParts[1].split(' ')[0]) ?? 0;
      
      return DateTime(year, month, day, hour, minute);
    } catch (e) {
      return null;
    }
  }
  
  DateTime? _parseTime(String timeStr) {
    try {
      // Handle different time formats
      final now = DateTime.now();
      
      // Try parsing "HH:mm" format
      if (timeStr.contains(':')) {
        final parts = timeStr.split(':');
        if (parts.length >= 2) {
          final hour = int.tryParse(parts[0]) ?? 0;
          final minute = int.tryParse(parts[1].split(' ')[0]) ?? 0;
          return DateTime(now.year, now.month, now.day, hour, minute);
        }
      }
    } catch (e) {
      return null;
    }
    return null;
  }
  
  String _getArtistName(Map<String, dynamic> event) {
    // Check for artistDetails from aggregation
    if (event['artistDetails'] != null && event['artistDetails'] is List) {
      final artistDetails = event['artistDetails'] as List;
      if (artistDetails.isNotEmpty) {
        final artists = artistDetails.map((artist) => artist['name']?.toString() ?? 'Artist').toList();
        return artists.join(', ');
      }
    }
    
    // Check for organizer field from aggregation
    if (event['organizer'] != null && event['organizer'] is Map) {
      final organizer = event['organizer'] as Map;
      if (organizer['name'] != null) {
        return organizer['name'].toString();
      }
    }
    
    // Check for direct artist field
    if (event['artist'] != null) {
      if (event['artist'] is String) {
        return event['artist'].toString();
      } else if (event['artist'] is Map && event['artist']['name'] != null) {
        return event['artist']['name'].toString();
      }
    }
    
    // Check for artistName field
    if (event['artistName'] != null) {
      return event['artistName'].toString();
    }
    
    return 'Artist not specified';
  }

  String _getEventLanguage(Map<String, dynamic> event) {
    // Check for languages array (multiple languages)
    if (event['languages'] != null) {
      if (event['languages'] is List) {
        final languages = event['languages'] as List;
        if (languages.isNotEmpty) {
          return languages.map((lang) => lang.toString()).join(', ');
        }
      } else if (event['languages'] is String && event['languages'].toString().isNotEmpty) {
        return event['languages'].toString();
      }
    }
    
    // Check for single language field
    if (event['language'] != null && event['language'].toString().trim().isNotEmpty && event['language'].toString() != 'null') {
      return event['language'].toString();
    }
    
    // Check for eventLanguage field
    if (event['eventLanguage'] != null && event['eventLanguage'].toString().trim().isNotEmpty && event['eventLanguage'].toString() != 'null') {
      return event['eventLanguage'].toString();
    }
    
    return 'Language not specified';
  }

  String _getEventCategory(Map<String, dynamic> event) {
    return (event['category'] ?? event['eventCategory'] ?? 'Category not specified').toString();
  }

  String _getEventVenue(Map<String, dynamic> event) {
    // Handle venue object structure
    if (event['venue'] != null) {
      if (event['venue'] is String) {
        return event['venue'].toString();
      } else if (event['venue'] is Map) {
        final venue = event['venue'] as Map;
        final name = venue['name']?.toString() ?? '';
        final city = venue['city']?.toString() ?? '';
        if (name.isNotEmpty && city.isNotEmpty) {
          return '$name, $city';
        } else if (name.isNotEmpty) {
          return name;
        }
      }
    }
    
    // Handle location object structure
    if (event['location'] != null) {
      if (event['location'] is String) {
        return event['location'].toString();
      } else if (event['location'] is Map) {
        final location = event['location'] as Map;
        final name = location['name']?.toString() ?? '';
        final city = location['city']?.toString() ?? '';
        if (name.isNotEmpty && city.isNotEmpty) {
          return '$name, $city';
        } else if (name.isNotEmpty) {
          return name;
        }
      }
    }
    
    return (event['address'] ?? event['eventVenue'] ?? 'Venue not specified').toString();
  }

  Widget _buildDetailRow(IconData icon, String text) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Icon(icon, size: 20, color: Colors.grey.shade600),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(
                fontSize: 16,
                color: Colors.black87,
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _showTermsAndConditions() {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return Dialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          child: Container(
            constraints: BoxConstraints(
              maxHeight: MediaQuery.of(context).size.height * 0.8,
              maxWidth: MediaQuery.of(context).size.width * 0.9,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Header
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: const Color(0xFF001F3F),
                    borderRadius: const BorderRadius.only(
                      topLeft: Radius.circular(16),
                      topRight: Radius.circular(16),
                    ),
                  ),
                  child: Row(
                    children: [
                      const Expanded(
                        child: Text(
                          'Terms and Conditions',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      IconButton(
                        onPressed: () => Navigator.pop(context),
                        icon: const Icon(Icons.close, color: Colors.white),
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                      ),
                    ],
                  ),
                ),
                // Content
                Flexible(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.all(20),
                    child: Text(
                      _getTermsAndConditions(),
                      style: const TextStyle(
                        fontSize: 14,
                        height: 1.5,
                        color: Colors.black87,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  bool _hasTermsAndConditions() {
    final event = _fullEventData ?? widget.event;
    return (event['terms_and_conditions'] != null && event['terms_and_conditions'].toString().trim().isNotEmpty) ||
           (event['termsAndConditions'] != null && event['termsAndConditions'].toString().trim().isNotEmpty) ||
           (event['terms'] != null && event['terms'].toString().trim().isNotEmpty);
  }

  String _getTermsAndConditions() {
    final event = _fullEventData ?? widget.event;
    
    // Check for terms and conditions in event data
    if (event['terms_and_conditions'] != null && event['terms_and_conditions'].toString().trim().isNotEmpty) {
      return event['terms_and_conditions'].toString();
    }
    
    // Check for termsAndConditions field
    if (event['termsAndConditions'] != null && event['termsAndConditions'].toString().trim().isNotEmpty) {
      return event['termsAndConditions'].toString();
    }
    
    // Check for terms field
    if (event['terms'] != null && event['terms'].toString().trim().isNotEmpty) {
      return event['terms'].toString();
    }
    
    // Default terms if organizer hasn't provided any
    return '''
TERMS AND CONDITIONS

1. TICKET PURCHASE
• All sales are final and non-refundable unless event is cancelled.
• Tickets subject to availability and pricing may change.

2. EVENT ENTRY
• Valid ticket and ID required for entry.
• Entry subject to security checks and venue policies.

3. CONDUCT
• Disruptive behavior may result in removal without refund.
• Follow all venue rules and staff instructions.

4. LIABILITY
• Attend at your own risk.
• Event details subject to change without notice.

5. CONTACT
• For queries, contact event organizer through official channels.

By purchasing tickets, you agree to these terms.''';
  }
}