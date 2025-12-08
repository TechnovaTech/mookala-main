import 'package:flutter/material.dart';

class CategoryEventsScreen extends StatefulWidget {
  final String categoryName;
  final List<Map<String, dynamic>> events;

  const CategoryEventsScreen({
    super.key,
    required this.categoryName,
    required this.events,
  });

  @override
  State<CategoryEventsScreen> createState() => _CategoryEventsScreenState();
}

class _CategoryEventsScreenState extends State<CategoryEventsScreen> {
  String selectedLocation = 'Mumbai';
  String selectedDate = 'Date';
  String selectedTime = 'Time';

  @override
  Widget build(BuildContext context) {
    final Map<String, List<Map<String, dynamic>>> allCategoryEvents = {
      'Music': [
        {
          'title': 'A.R. Rahman Live Concert',
          'date': 'Sat, 29 Nov, 2025',
          'image': 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=200&fit=crop',
          'interested': '110+ Interested'
        },
        {
          'title': 'Classical Music Evening',
          'date': 'Sun, 30 Nov, 2025',
          'image': 'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=400&h=200&fit=crop',
          'interested': '85+ Interested'
        },
      ],
      'Theatre': [
        {
          'title': 'Shakespeare Drama Performance',
          'date': 'Mon, 01 Dec, 2025',
          'image': 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=200&fit=crop',
          'interested': '65+ Interested'
        },
        {
          'title': 'Modern Theatre Workshop',
          'date': 'Tue, 02 Dec, 2025',
          'image': 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=200&fit=crop',
          'interested': '45+ Interested'
        },
      ],
      'Concert': [
        {
          'title': 'Live Rock Concert',
          'date': 'Wed, 03 Dec, 2025',
          'image': 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=200&fit=crop',
          'interested': '120+ Interested'
        },
        {
          'title': 'Pop Music Concert',
          'date': 'Thu, 04 Dec, 2025',
          'image': 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=200&fit=crop',
          'interested': '95+ Interested'
        },
      ],
      'Jatra': [
        {
          'title': 'Folk Dance Festival',
          'date': 'Fri, 05 Dec, 2025',
          'image': 'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=400&h=200&fit=crop',
          'interested': '75+ Interested'
        },
        {
          'title': 'Traditional Folk Performance',
          'date': 'Sat, 06 Dec, 2025',
          'image': 'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=400&h=200&fit=crop',
          'interested': '60+ Interested'
        },
      ],
    };
    
    final filteredEvents = allCategoryEvents[widget.categoryName] ?? [];

    return Scaffold(
      body: Column(
        children: [
          // Header with category image background
          Container(
            height: 280,
            decoration: BoxDecoration(
              image: DecorationImage(
                image: NetworkImage(_getCategoryImage()),
                fit: BoxFit.cover,
              ),
            ),
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Colors.black.withOpacity(0.3), const Color(0xFF001F3F).withOpacity(0.8)],
                ),
              ),
            child: SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        GestureDetector(
                          onTap: () => Navigator.pop(context),
                          child: Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: Colors.white.withOpacity(0.2),
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(
                              Icons.arrow_back,
                              color: Colors.white,
                              size: 24,
                            ),
                          ),
                        ),
                        const Spacer(),
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: Colors.white.withOpacity(0.2),
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(
                            Icons.share,
                            color: Colors.white,
                            size: 24,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 40),
                    Text(
                      widget.categoryName,
                      style: const TextStyle(
                        fontSize: 36,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Events near you',
                      style: TextStyle(
                        fontSize: 18,
                        color: Colors.white70,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            ),
          ),
          
          // Filter buttons
          Container(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                _buildFilterButton(Icons.location_on, selectedLocation),
                const SizedBox(width: 12),
                _buildFilterButton(Icons.calendar_today, selectedDate),
                const SizedBox(width: 12),
                _buildFilterButton(Icons.access_time, selectedTime),
              ],
            ),
          ),
          
          // Events list
          Expanded(
            child: filteredEvents.isEmpty
                ? const Center(
                    child: Text(
                      'No events found in this category',
                      style: TextStyle(fontSize: 16, color: Colors.grey),
                    ),
                  )
                : GridView.builder(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2,
                      crossAxisSpacing: 12,
                      mainAxisSpacing: 16,
                      childAspectRatio: 0.6,
                    ),
                    itemCount: filteredEvents.length,
                    itemBuilder: (context, index) {
                      final event = filteredEvents[index];
                      return Container(
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(16),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.grey.withOpacity(0.1),
                              blurRadius: 8,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            // Event image
                            Expanded(
                              flex: 3,
                              child: Container(
                                decoration: BoxDecoration(
                                  borderRadius: const BorderRadius.only(
                                    topLeft: Radius.circular(16),
                                    topRight: Radius.circular(16),
                                  ),
                                  image: DecorationImage(
                                    image: NetworkImage(event['image']),
                                    fit: BoxFit.cover,
                                  ),
                                ),
                                child: Stack(
                                  children: [
                                    Positioned(
                                      top: 8,
                                      right: 8,
                                      child: Container(
                                        padding: const EdgeInsets.all(6),
                                        decoration: const BoxDecoration(
                                          color: Colors.white,
                                          shape: BoxShape.circle,
                                        ),
                                        child: const Icon(
                                          Icons.star_border,
                                          color: Colors.grey,
                                          size: 16,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            
                            // Event details
                            Expanded(
                              flex: 2,
                              child: Container(
                                padding: const EdgeInsets.all(12),
                                decoration: const BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.only(
                                    bottomLeft: Radius.circular(16),
                                    bottomRight: Radius.circular(16),
                                  ),
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Text(
                                      event['date'],
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: Colors.grey.shade600,
                                      ),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      event['title'],
                                      style: const TextStyle(
                                        fontSize: 14,
                                        fontWeight: FontWeight.bold,
                                        color: Colors.black87,
                                      ),
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                    const SizedBox(height: 8),
                                    Row(
                                      children: [
                                        // Profile images
                                        SizedBox(
                                          width: 50,
                                          height: 20,
                                          child: Stack(
                                            children: [
                                              Positioned(
                                                left: 0,
                                                child: Container(
                                                  width: 20,
                                                  height: 20,
                                                  decoration: BoxDecoration(
                                                    shape: BoxShape.circle,
                                                    border: Border.all(color: Colors.white, width: 1),
                                                    image: const DecorationImage(
                                                      image: NetworkImage('https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=40&h=40&fit=crop'),
                                                      fit: BoxFit.cover,
                                                    ),
                                                  ),
                                                ),
                                              ),
                                              Positioned(
                                                left: 15,
                                                child: Container(
                                                  width: 20,
                                                  height: 20,
                                                  decoration: BoxDecoration(
                                                    shape: BoxShape.circle,
                                                    border: Border.all(color: Colors.white, width: 1),
                                                    image: const DecorationImage(
                                                      image: NetworkImage('https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=40&h=40&fit=crop'),
                                                      fit: BoxFit.cover,
                                                    ),
                                                  ),
                                                ),
                                              ),
                                              Positioned(
                                                left: 30,
                                                child: Container(
                                                  width: 20,
                                                  height: 20,
                                                  decoration: BoxDecoration(
                                                    shape: BoxShape.circle,
                                                    border: Border.all(color: Colors.white, width: 1),
                                                    image: const DecorationImage(
                                                      image: NetworkImage('https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=40&h=40&fit=crop'),
                                                      fit: BoxFit.cover,
                                                    ),
                                                  ),
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                        const SizedBox(width: 8),
                                        Expanded(
                                          child: Text(
                                            event['interested'],
                                            style: TextStyle(
                                              fontSize: 10,
                                              color: Colors.grey.shade600,
                                            ),
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  String _getCategoryImage() {
    switch (widget.categoryName.toLowerCase()) {
      case 'music':
        return 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=280&fit=crop';
      case 'theatre':
        return 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=280&fit=crop';
      case 'concert':
        return 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=280&fit=crop';
      case 'jatra':
        return 'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=400&h=280&fit=crop';
      default:
        return 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=280&fit=crop';
    }
  }

  Widget _buildFilterButton(IconData icon, String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.grey.shade200,
        borderRadius: BorderRadius.circular(25),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 18, color: Colors.grey.shade700),
          const SizedBox(width: 8),
          Text(
            text,
            style: TextStyle(
              fontSize: 14,
              color: Colors.grey.shade700,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(width: 4),
          Icon(Icons.keyboard_arrow_down, size: 18, color: Colors.grey.shade700),
        ],
      ),
    );
  }
}