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
                        _buildDetailRow(Icons.calendar_today, _getEventDate(event)),
                        _buildDetailRow(Icons.access_time, _getEventDuration(event)),
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

  String _getEventDate(Map<String, dynamic> event) {
    return (event['date'] ?? event['eventDate'] ?? 'Date not available').toString();
  }

  String _getEventDuration(Map<String, dynamic> event) {
    return (event['duration'] ?? event['eventDuration'] ?? '2 Hours').toString();
  }

  String _getEventLanguage(Map<String, dynamic> event) {
    if (event['languages'] != null && event['languages'] is List) {
      final languages = event['languages'] as List;
      if (languages.isNotEmpty) {
        return languages.join(', ');
      }
    }
    return (event['language'] ?? event['eventLanguage'] ?? 'Language not specified').toString();
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
}