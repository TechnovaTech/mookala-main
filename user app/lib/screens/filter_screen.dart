import 'package:flutter/material.dart';
import '../services/api_service.dart';

class FilterScreen extends StatefulWidget {
  final Function(Map<String, dynamic>) onFiltersApplied;
  
  const FilterScreen({super.key, required this.onFiltersApplied});

  @override
  State<FilterScreen> createState() => _FilterScreenState();
}

class _FilterScreenState extends State<FilterScreen> {
  int selectedCategoryIndex = 0;
  String searchQuery = '';
  bool isLoading = false;
  DateTime? startDate;
  DateTime? endDate;
  
  final List<String> filterCategories = [
    'Artist Name',
    'Event Title', 
    'Venue',
    'Date',
    'Price Range'
  ];

  List<Map<String, dynamic>> allItems = [];
  List<Map<String, dynamic>> priceRanges = [
    {'range': '₹1 - ₹500', 'min': 1, 'max': 500, 'selected': false, 'count': 0},
    {'range': '₹501 - ₹1000', 'min': 501, 'max': 1000, 'selected': false, 'count': 0},
    {'range': '₹1001 - ₹1500', 'min': 1001, 'max': 1500, 'selected': false, 'count': 0},
    {'range': 'Above ₹1500', 'min': 1501, 'max': 999999, 'selected': false, 'count': 0},
    {'range': 'Free', 'min': 0, 'max': 0, 'selected': false, 'count': 0},
  ];

  @override
  void initState() {
    super.initState();
    _loadFilterData();
  }

  Future<void> _loadFilterData() async {
    setState(() { isLoading = true; });
    
    try {
      // Load artists
      final artistsResult = await ApiService.getArtists();
      List<Map<String, dynamic>> artists = [];
      if (artistsResult['success'] == true && artistsResult['artists'] != null) {
        artists = (artistsResult['artists'] as List).map((artist) => {
          'name': artist['name'] ?? 'Unknown Artist',
          'count': 1, // Will be updated with real event count
          'selected': false,
          'type': 'artist',
          'id': artist['_id']
        }).toList();
      }

      // Load venues
      final venuesResult = await ApiService.getVenues();
      List<Map<String, dynamic>> venues = [];
      if (venuesResult['success'] == true && venuesResult['venues'] != null) {
        venues = (venuesResult['venues'] as List).map((venue) => {
          'name': venue['name'] ?? 'Unknown Venue',
          'count': 0, // Will be updated with event count
          'selected': false,
          'type': 'venue',
          'id': venue['_id']
        }).toList();
      }

      // Load events and count occurrences
      final eventsResult = await ApiService.getApprovedEvents();
      List<Map<String, dynamic>> events = [];
      Map<String, int> venueCounts = {};
      
      if (eventsResult['success'] == true && eventsResult['events'] != null) {
        final eventsList = eventsResult['events'] as List;
        
        // Count events by title
        Map<String, int> eventCounts = {};
        for (var event in eventsList) {
          final title = event['name'] ?? event['title'] ?? 'Unknown Event';
          eventCounts[title] = (eventCounts[title] ?? 0) + 1;
          
          // Count venues by name
          if (event['venue'] != null) {
            String venueName = '';
            if (event['venue'] is Map) {
              venueName = event['venue']['name'] ?? 'Unknown Venue';
            } else if (event['venueDetails'] != null && event['venueDetails'] is Map) {
              venueName = event['venueDetails']['name'] ?? 'Unknown Venue';
            } else {
              // Find venue by ID from loaded venues
              final venueId = event['venue'].toString();
              final venue = venues.firstWhere(
                (v) => v['id'] == venueId,
                orElse: () => {'name': 'Unknown Venue'}
              );
              venueName = venue['name'];
            }
            if (venueName.isNotEmpty && venueName != 'Unknown Venue') {
              venueCounts[venueName] = (venueCounts[venueName] ?? 0) + 1;
            }
          }
          
          // Update price range counts
          final price = _extractPrice(event);
          for (var range in priceRanges) {
            if (price >= range['min'] && price <= range['max']) {
              range['count'] = (range['count'] ?? 0) + 1;
              break;
            }
          }
        }
        
        events = eventCounts.entries.map((entry) => {
          'name': entry.key,
          'count': entry.value,
          'selected': false,
          'type': 'event'
        }).toList();
        
        // Create venue list from counts (real venues with events)
        venues = venueCounts.entries.map((entry) => {
          'name': entry.key,
          'count': entry.value,
          'selected': false,
          'type': 'venue'
        }).toList();
      }

      setState(() {
        allItems = [...artists, ...events, ...venues];
        isLoading = false;
      });
    } catch (e) {
      print('Error loading filter data: $e');
      setState(() { isLoading = false; });
    }
  }

  int _extractPrice(Map<String, dynamic> event) {
    if (event['tickets'] != null && event['tickets'] is List && (event['tickets'] as List).isNotEmpty) {
      final tickets = event['tickets'] as List;
      final firstTicket = tickets[0];
      if (firstTicket is Map && firstTicket['price'] != null) {
        return int.tryParse(firstTicket['price'].toString().replaceAll(RegExp(r'[^0-9]'), '')) ?? 0;
      }
    }
    return int.tryParse(event['price']?.toString()?.replaceAll(RegExp(r'[^0-9]'), '') ?? '0') ?? 0;
  }

  List<Map<String, dynamic>> getFilteredItems() {
    String currentType = '';
    switch (selectedCategoryIndex) {
      case 0: currentType = 'artist'; break;
      case 1: currentType = 'event'; break;
      case 2: currentType = 'venue'; break;
      case 3: return [];
      case 4: return [];
    }
    
    var filtered = allItems.where((item) => item['type'] == currentType).toList();
    
    if (searchQuery.isNotEmpty) {
      filtered = filtered.where((item) => 
        item['name'].toLowerCase().contains(searchQuery.toLowerCase())
      ).toList();
    }
    
    return filtered;
  }

  Widget buildDateContent() {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Start Date
          GestureDetector(
            onTap: () async {
              final date = await showDatePicker(
                context: context,
                initialDate: startDate ?? DateTime.now(),
                firstDate: DateTime.now(),
                lastDate: DateTime.now().add(const Duration(days: 365)),
              );
              if (date != null) {
                setState(() { startDate = date; });
              }
            },
            child: Container(
              margin: const EdgeInsets.only(bottom: 16),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                border: Border.all(color: Colors.grey.shade300),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  const Icon(Icons.calendar_today, color: Color(0xFF001F3F)),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Start Date', style: TextStyle(fontSize: 12, color: Colors.grey)),
                        Text(
                          startDate != null 
                            ? '${startDate!.day}/${startDate!.month}/${startDate!.year}'
                            : 'Select start date',
                          style: const TextStyle(fontSize: 16)
                        ),
                      ],
                    ),
                  ),
                  const Icon(Icons.arrow_forward_ios, size: 16),
                ],
              ),
            ),
          ),
          // End Date
          GestureDetector(
            onTap: () async {
              final date = await showDatePicker(
                context: context,
                initialDate: endDate ?? startDate ?? DateTime.now(),
                firstDate: startDate ?? DateTime.now(),
                lastDate: DateTime.now().add(const Duration(days: 365)),
              );
              if (date != null) {
                setState(() { endDate = date; });
              }
            },
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                border: Border.all(color: Colors.grey.shade300),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  const Icon(Icons.calendar_today, color: Color(0xFF001F3F)),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('End Date', style: TextStyle(fontSize: 12, color: Colors.grey)),
                        Text(
                          endDate != null 
                            ? '${endDate!.day}/${endDate!.month}/${endDate!.year}'
                            : 'Select end date',
                          style: const TextStyle(fontSize: 16)
                        ),
                      ],
                    ),
                  ),
                  const Icon(Icons.arrow_forward_ios, size: 16),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget buildPriceContent() {
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: priceRanges.length,
      itemBuilder: (context, index) {
        final priceRange = priceRanges[index];
        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          child: Padding(
            padding: const EdgeInsets.only(right: 8),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    '${priceRange['range']} (${priceRange['count']})',
                    style: const TextStyle(
                      fontSize: 13,
                      color: Colors.black87,
                    ),
                    overflow: TextOverflow.ellipsis,
                    maxLines: 1,
                  ),
                ),
                Transform.scale(
                  scale: 0.8,
                  child: Checkbox(
                    value: priceRange['selected'],
                    onChanged: (value) {
                      setState(() {
                        priceRange['selected'] = value ?? false;
                      });
                    },
                    activeColor: const Color(0xFF001F3F),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final filteredItems = getFilteredItems();
    
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: const Color(0xFF001F3F),
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Text(
          'Filter',
          style: TextStyle(
            color: Colors.white,
            fontSize: 18,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      body: Row(
        children: [
          // Left sidebar
          Container(
            width: 120,
            color: Colors.grey.shade300,
            child: ListView.builder(
              itemCount: filterCategories.length,
              itemBuilder: (context, index) {
                final isSelected = selectedCategoryIndex == index;
                return Container(
                  color: isSelected ? Colors.white : Colors.transparent,
                  child: ListTile(
                    title: Text(
                      filterCategories[index],
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
                        color: Colors.black87,
                      ),
                    ),
                    onTap: () {
                      setState(() {
                        selectedCategoryIndex = index;
                        searchQuery = '';
                      });
                    },
                  ),
                );
              },
            ),
          ),
          // Right content
          Expanded(
            child: Column(
              children: [
                // Search bar for filterable categories
                if (selectedCategoryIndex < 3)
                  Container(
                    padding: const EdgeInsets.all(16),
                    child: TextField(
                      onChanged: (value) {
                        setState(() { searchQuery = value; });
                      },
                      decoration: InputDecoration(
                        hintText: 'Search ${filterCategories[selectedCategoryIndex].toLowerCase()}...',
                        prefixIcon: const Icon(Icons.search),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      ),
                    ),
                  ),
                Expanded(
                  child: isLoading
                    ? const Center(child: CircularProgressIndicator())
                    : selectedCategoryIndex == 3 
                      ? buildDateContent()
                      : selectedCategoryIndex == 4
                        ? buildPriceContent()
                        : ListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: filteredItems.length,
                          itemBuilder: (context, index) {
                            final item = filteredItems[index];
                            return Container(
                              margin: const EdgeInsets.only(bottom: 8),
                              child: Padding(
                                padding: const EdgeInsets.only(right: 8),
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        '${item['name']} (${item['count']})',
                                        style: const TextStyle(
                                          fontSize: 13,
                                          color: Colors.black87,
                                        ),
                                        overflow: TextOverflow.ellipsis,
                                        maxLines: 1,
                                      ),
                                    ),
                                    Transform.scale(
                                      scale: 0.8,
                                      child: Checkbox(
                                        value: item['selected'],
                                        onChanged: (value) {
                                          setState(() {
                                            item['selected'] = value ?? false;
                                          });
                                        },
                                        activeColor: const Color(0xFF001F3F),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            );
                          },
                        ),
                ),
                // Bottom buttons
                Container(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      // Clear filters button
                      SizedBox(
                        width: double.infinity,
                        child: TextButton(
                          onPressed: () {
                            setState(() {
                              for (var item in allItems) {
                                item['selected'] = false;
                              }
                              for (var range in priceRanges) {
                                range['selected'] = false;
                              }
                              startDate = null;
                              endDate = null;
                              searchQuery = '';
                            });
                          },
                          child: const Text(
                            'Clear All Filters',
                            style: TextStyle(color: Colors.grey),
                          ),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              onPressed: () => Navigator.pop(context),
                              style: OutlinedButton.styleFrom(
                                foregroundColor: const Color(0xFF001F3F),
                                side: const BorderSide(color: Color(0xFF001F3F)),
                                padding: const EdgeInsets.symmetric(vertical: 16),
                              ),
                              child: const Text('Close'),
                            ),
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: ElevatedButton(
                              onPressed: () {
                                // Collect selected filters
                                Map<String, dynamic> selectedFilters = {
                                  'artists': allItems.where((item) => item['type'] == 'artist' && item['selected']).map((item) => item['name'] as String).toList(),
                                  'events': allItems.where((item) => item['type'] == 'event' && item['selected']).map((item) => item['name'] as String).toList(),
                                  'venues': allItems.where((item) => item['type'] == 'venue' && item['selected']).map((item) => item['name'] as String).toList(),
                                  'priceRanges': priceRanges.where((range) => range['selected']).toList(),
                                  'startDate': startDate,
                                  'endDate': endDate,
                                };
                                
                                widget.onFiltersApplied(selectedFilters);
                                Navigator.pop(context);
                              },
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFF001F3F),
                                padding: const EdgeInsets.symmetric(vertical: 16),
                              ),
                              child: const Text(
                                'Apply Filters',
                                style: TextStyle(color: Colors.white),
                              ),
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
        ],
      ),
    );
  }
}