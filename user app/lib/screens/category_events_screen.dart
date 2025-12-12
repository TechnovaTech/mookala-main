import 'package:flutter/material.dart';
import 'organized_event_details_screen.dart';
import '../services/api_service.dart';
import 'dart:convert';
import 'dart:typed_data';
import 'package:http/http.dart' as http;

class CategoryEventsScreen extends StatefulWidget {
  final String categoryName;
  final String categoryImage;
  final List<Map<String, dynamic>>? subcategories;

  const CategoryEventsScreen({
    super.key,
    required this.categoryName,
    required this.categoryImage,
    this.subcategories,
  });

  @override
  State<CategoryEventsScreen> createState() => _CategoryEventsScreenState();
}

class _CategoryEventsScreenState extends State<CategoryEventsScreen> {
  String selectedLocation = 'Mumbai';
  String selectedDate = 'Date';
  DateTime? selectedDateTime;
  List<String> selectedSubcategories = [];
  List<String> availableSubcategories = [];
  bool showLocationDropdown = false;
  bool showSubcategoryModal = false;
  bool loadingSubcategories = false;
  List<Map<String, dynamic>> categoryEvents = [];
  bool loadingEvents = false;
  
  final List<String> locations = ['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Kolkata', 'Pune'];
  
  @override
  void initState() {
    super.initState();
    fetchSubcategories();
    fetchCategoryEvents();
  }
  
  Future<void> fetchSubcategories() async {
    setState(() {
      loadingSubcategories = true;
    });
    
    try {
      if (widget.subcategories != null) {
        setState(() {
          availableSubcategories = widget.subcategories!
              .map((sub) => sub['name'].toString())
              .toList();
        });
      } else {
        final response = await http.get(Uri.parse('http://localhost:3000/api/categories'));
        if (response.statusCode == 200) {
          final List<dynamic> categories = json.decode(response.body);
          final category = categories.firstWhere(
            (cat) => cat['name'] == widget.categoryName,
            orElse: () => null,
          );
          
          if (category != null && category['subCategories'] != null) {
            setState(() {
              availableSubcategories = (category['subCategories'] as List)
                  .map((sub) => sub['name'].toString())
                  .toList();
            });
          }
        }
      }
    } catch (e) {
      print('Error fetching subcategories: $e');
    } finally {
      setState(() {
        loadingSubcategories = false;
      });
    }
  }
  
  Future<void> fetchCategoryEvents() async {
    setState(() {
      loadingEvents = true;
    });
    
    try {
      final result = await ApiService.getApprovedEvents(category: widget.categoryName);
      
      if (result['success'] == true && result['events'] != null) {
        final events = result['events'] as List;
        
        setState(() {
          categoryEvents = events.map((event) {
            final startDate = event['startDate'] ?? '';
            final startTime = event['startTime'] ?? '';
            final dateDisplay = startDate.isNotEmpty && startTime.isNotEmpty 
              ? '$startDate • $startTime' 
              : 'TBA';
            
            String imageUrl = 'assets/images/concert.jpg';
            if (event['media'] != null && event['media']['bannerImage'] != null && event['media']['bannerImage'].toString().isNotEmpty) {
              final bannerImage = event['media']['bannerImage'];
              if (bannerImage.toString().startsWith('http')) {
                imageUrl = bannerImage;
              } else {
                imageUrl = 'data:image/jpeg;base64,$bannerImage';
              }
            } else if (event['eventImage'] != null && event['eventImage'].toString().isNotEmpty) {
              imageUrl = event['eventImage'];
            } else if (event['image'] != null && event['image'].toString().isNotEmpty) {
              imageUrl = event['image'];
            }
            
            String price = '₹0';
            if (event['tickets'] != null && event['tickets'] is List && (event['tickets'] as List).isNotEmpty) {
              final tickets = event['tickets'] as List;
              final firstTicket = tickets[0];
              if (firstTicket is Map && firstTicket['price'] != null) {
                String rawPrice = firstTicket['price'].toString();
                rawPrice = rawPrice.replaceAll('₹', '').replaceAll('Rs.', '').replaceAll('Rs', '').trim();
                if (rawPrice.contains('.')) {
                  rawPrice = rawPrice.split('.')[0];
                }
                price = '₹$rawPrice';
              }
            } else if (event['ticketPrice'] != null) {
              price = '₹${event['ticketPrice']}';
            } else if (event['price'] != null) {
              price = '₹${event['price']}';
            }
            
            String venueName = 'Venue TBA';
            if (event['venue'] is Map) {
              venueName = event['venue']['name'] ?? 'Venue TBA';
            } else if (event['venueDetails'] is Map) {
              venueName = event['venueDetails']['name'] ?? 'Venue TBA';
            } else if (event['venue'] is String) {
              venueName = event['venue'];
            }
            
            return {
              'title': event['name'] ?? event['title'] ?? 'Event',
              'date': dateDisplay,
              'time': startTime,
              'venue': venueName,
              'address': event['address'] ?? 'Address TBA',
              'category': event['category'] ?? widget.categoryName,
              'price': price,
              'image': imageUrl,
              'interested': '${(event['interestedCount'] ?? 0)}+ Interested',
              'description': event['description'] ?? '',
              'id': event['_id'],
              'tickets': event['tickets'] ?? [],
              'type': event['type'] ?? 'event',
            };
          }).toList();
        });
      }
    } catch (e) {
      print('Error fetching category events: $e');
    } finally {
      setState(() {
        loadingEvents = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    // Filter events based on selected subcategories
    List<Map<String, dynamic>> filteredEvents = categoryEvents;
    if (selectedSubcategories.isNotEmpty) {
      filteredEvents = categoryEvents.where((event) {
        // Check if event matches any selected subcategory
        return selectedSubcategories.any((subcategory) => 
          event['category'].toString().toLowerCase().contains(subcategory.toLowerCase()) ||
          event['title'].toString().toLowerCase().contains(subcategory.toLowerCase())
        );
      }).toList();
    }

    return Scaffold(
      body: Stack(
        children: [
          Column(
            children: [
              // Header with category image background
              Container(
                height: 280,
                decoration: BoxDecoration(
                  image: DecorationImage(
                    image: _getCategoryImageProvider(),
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

                      ],
                    ),
                  ),
                ),
                ),
              ),
              
              // Filter buttons
              Container(
                padding: const EdgeInsets.all(16),
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _buildFilterButton(Icons.location_on, selectedLocation, 'location'),
                      const SizedBox(width: 12),
                      _buildFilterButton(Icons.calendar_today, selectedDate, 'date'),
                      const SizedBox(width: 12),
                      _buildSubcategoryFilter(),
                    ],
                  ),
                ),
              ),
              
              // Dropdown overlays
              if (showLocationDropdown) _buildDropdownOverlay('location'),
              
              // Events list
              Expanded(
                child: loadingEvents
                    ? const Center(child: CircularProgressIndicator())
                    : filteredEvents.isEmpty
                        ? Center(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.event_busy, size: 60, color: Colors.grey.shade400),
                                const SizedBox(height: 16),
                                Text(
                                  'No events found in ${widget.categoryName}',
                                  style: const TextStyle(fontSize: 16, color: Colors.grey),
                                ),
                                const SizedBox(height: 8),
                                const Text(
                                  'Try adjusting your filters or check back later',
                                  style: TextStyle(fontSize: 14, color: Colors.grey),
                                ),
                              ],
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
                                  child: GestureDetector(
                                    onTap: () {
                                      Navigator.push(
                                        context,
                                        MaterialPageRoute(
                                          builder: (context) => OrganizedEventDetailsScreen(event: event),
                                        ),
                                      );
                                    },
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
          
          // Subcategory Modal
          if (showSubcategoryModal)
            Container(
              color: Colors.black.withOpacity(0.5),
              child: Center(
                child: Container(
                  margin: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Padding(
                        padding: const EdgeInsets.all(20),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              'Select Subcategories',
                              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                            ),
                            GestureDetector(
                              onTap: () => setState(() => showSubcategoryModal = false),
                              child: Icon(Icons.close),
                            ),
                          ],
                        ),
                      ),
                      if (loadingSubcategories)
                        Padding(
                          padding: const EdgeInsets.all(20),
                          child: CircularProgressIndicator(),
                        )
                      else if (availableSubcategories.isEmpty)
                        Padding(
                          padding: const EdgeInsets.all(20),
                          child: Text('No subcategories available'),
                        )
                      else
                        Container(
                          constraints: BoxConstraints(maxHeight: 300),
                          child: SingleChildScrollView(
                            child: Column(
                              children: availableSubcategories.map((subcategory) => 
                                CheckboxListTile(
                                  title: Text(subcategory),
                                  value: selectedSubcategories.contains(subcategory),
                                  onChanged: (bool? value) {
                                    setState(() {
                                      if (value == true) {
                                        selectedSubcategories.add(subcategory);
                                      } else {
                                        selectedSubcategories.remove(subcategory);
                                      }
                                    });
                                  },
                                )
                              ).toList(),
                            ),
                          ),
                        ),
                      Padding(
                        padding: const EdgeInsets.all(20),
                        child: Row(
                          children: [
                            if (selectedSubcategories.isNotEmpty)
                              Expanded(
                                child: TextButton(
                                  onPressed: () {
                                    setState(() {
                                      selectedSubcategories.clear();
                                    });
                                  },
                                  child: Text('Clear All'),
                                ),
                              ),
                            Expanded(
                              child: ElevatedButton(
                                onPressed: () {
                                  setState(() {
                                    showSubcategoryModal = false;
                                  });
                                },
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: Colors.blue,
                                  foregroundColor: Colors.white,
                                ),
                                child: Text('Apply'),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  ImageProvider _getCategoryImageProvider() {
    if (widget.categoryImage.startsWith('http')) {
      return NetworkImage(widget.categoryImage);
    } else if (widget.categoryImage.startsWith('data:image')) {
      return MemoryImage(base64Decode(widget.categoryImage.split(',')[1]));
    } else {
      return AssetImage(widget.categoryImage);
    }
  }

  Widget _buildFilterButton(IconData icon, String text, String type) {
    return GestureDetector(
      onTap: () {
        if (type == 'location') {
          setState(() {
            showLocationDropdown = !showLocationDropdown;
          });
        } else if (type == 'date') {
          _showDatePicker();
        }
      },
      child: Container(
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
      ),
    );
  }
  
  Widget _buildSubcategoryFilter() {
    return GestureDetector(
      onTap: () {
        setState(() {
          showSubcategoryModal = true;
          showLocationDropdown = false;
        });
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: selectedSubcategories.isNotEmpty ? Colors.blue.shade100 : Colors.grey.shade200,
          borderRadius: BorderRadius.circular(25),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.filter_list, size: 18, color: Colors.grey.shade700),
            const SizedBox(width: 8),
            Text(
              selectedSubcategories.isEmpty ? 'Filter' : '${selectedSubcategories.length} selected',
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
      ),
    );
  }
  
  Future<void> _showDatePicker() async {
    final DateTime? picked = await showDatePicker(
      context: context,
      initialDate: selectedDateTime ?? DateTime.now(),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(Duration(days: 365)),
    );
    
    if (picked != null) {
      setState(() {
        selectedDateTime = picked;
        selectedDate = '${picked.day}/${picked.month}/${picked.year}';
      });
    }
  }
  
  Widget _buildDropdownOverlay(String type) {
    if (type != 'location') return Container();
    
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.1),
            blurRadius: 8,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: locations.map((item) => 
          ListTile(
            title: Text(item),
            trailing: selectedLocation == item ? const Icon(Icons.check, color: Colors.blue) : null,
            onTap: () {
              setState(() {
                selectedLocation = item;
                showLocationDropdown = false;
              });
            },
          )
        ).toList(),
      ),
    );
  }
}