import 'package:flutter/material.dart';

class FilterScreen extends StatefulWidget {
  final Function(Map<String, List<String>>) onFiltersApplied;
  
  const FilterScreen({super.key, required this.onFiltersApplied});

  @override
  State<FilterScreen> createState() => _FilterScreenState();
}

class _FilterScreenState extends State<FilterScreen> {
  int selectedCategoryIndex = 0;
  String searchQuery = '';
  
  final List<String> filterCategories = [
    'Artist Name',
    'Event Title', 
    'Venue',
    'Date',
    'Price Range'
  ];

  final List<Map<String, dynamic>> allItems = [
    // Artists
    {'name': 'Alok Katdare', 'count': 11, 'selected': false, 'type': 'artist'},
    {'name': 'Gul Saxena', 'count': 9, 'selected': false, 'type': 'artist'},
    {'name': 'Sarvesh Mishra', 'count': 5, 'selected': false, 'type': 'artist'},
    {'name': 'Shailaja Subramanian', 'count': 4, 'selected': false, 'type': 'artist'},
    {'name': 'Shrikant Narayan', 'count': 4, 'selected': false, 'type': 'artist'},
    {'name': 'Sampada Goswami', 'count': 3, 'selected': false, 'type': 'artist'},
    {'name': 'Mona Kamat Prabhugaonkar', 'count': 3, 'selected': false, 'type': 'artist'},
    {'name': 'Dhanashri Deshpande', 'count': 3, 'selected': false, 'type': 'artist'},
    {'name': 'Payal Agarwal', 'count': 3, 'selected': false, 'type': 'artist'},
    {'name': 'Ravindra Shinde', 'count': 3, 'selected': false, 'type': 'artist'},
    {'name': 'Ajay Madan', 'count': 3, 'selected': false, 'type': 'artist'},
    {'name': 'Taylor Swift', 'count': 2, 'selected': false, 'type': 'artist'},
    {'name': 'Rahul Deshpande', 'count': 2, 'selected': false, 'type': 'artist'},
    {'name': 'Mukhtar Shah', 'count': 2, 'selected': false, 'type': 'artist'},
    {'name': 'Prajakta Satardekar', 'count': 2, 'selected': false, 'type': 'artist'},
    {'name': 'Govind Mishra', 'count': 2, 'selected': false, 'type': 'artist'},
    
    // Event Titles
    {'name': 'Classical Music Evening', 'count': 5, 'selected': false, 'type': 'event'},
    {'name': 'Shakespeare Drama', 'count': 3, 'selected': false, 'type': 'event'},
    {'name': 'Folk Dance Festival', 'count': 4, 'selected': false, 'type': 'event'},
    {'name': 'Rock Concert', 'count': 6, 'selected': false, 'type': 'event'},
    {'name': 'Jazz Night', 'count': 2, 'selected': false, 'type': 'event'},
    
    // Venues
    {'name': 'Tata Theatre', 'count': 8, 'selected': false, 'type': 'venue'},
    {'name': 'Prithvi Theatre', 'count': 6, 'selected': false, 'type': 'venue'},
    {'name': 'NSCI Dome', 'count': 4, 'selected': false, 'type': 'venue'},
    {'name': 'Phoenix Mills', 'count': 3, 'selected': false, 'type': 'venue'},
    {'name': 'Hard Rock Cafe', 'count': 2, 'selected': false, 'type': 'venue'},
  ];

  List<Map<String, dynamic>> getFilteredItems() {
    String currentType = '';
    switch (selectedCategoryIndex) {
      case 0: currentType = 'artist'; break;
      case 1: currentType = 'event'; break;
      case 2: currentType = 'venue'; break;
      case 3: return []; // Date - no items to show
      case 4: return []; // Price Range - no items to show
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
          Container(
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
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Start Date', style: TextStyle(fontSize: 12, color: Colors.grey)),
                      Text('Dec 25, 2024', style: TextStyle(fontSize: 16)),
                    ],
                  ),
                ),
                const Icon(Icons.arrow_forward_ios, size: 16),
              ],
            ),
          ),
          // End Date
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              border: Border.all(color: Colors.grey.shade300),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                const Icon(Icons.calendar_today, color: Color(0xFF001F3F)),
                const SizedBox(width: 12),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('End Date', style: TextStyle(fontSize: 12, color: Colors.grey)),
                      Text('Jan 10, 2025', style: TextStyle(fontSize: 16)),
                    ],
                  ),
                ),
                const Icon(Icons.arrow_forward_ios, size: 16),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget buildPriceContent() {
    final List<Map<String, dynamic>> priceRanges = [
      {'range': '₹1 - ₹500 (147)', 'selected': false},
      {'range': '₹501 - ₹1000 (55)', 'selected': false},
      {'range': '₹1001 - ₹1500 (23)', 'selected': false},
      {'range': 'Above ₹1500 (32)', 'selected': false},
      {'range': 'Free', 'selected': false},
    ];
    
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
                    priceRange['range'],
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

                Expanded(
                  child: selectedCategoryIndex == 3 
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
                  child: Row(
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
                            Map<String, List<String>> selectedFilters = {
                              'artists': allItems.where((item) => item['type'] == 'artist' && item['selected']).map((item) => item['name'] as String).toList(),
                              'events': allItems.where((item) => item['type'] == 'event' && item['selected']).map((item) => item['name'] as String).toList(),
                              'venues': allItems.where((item) => item['type'] == 'venue' && item['selected']).map((item) => item['name'] as String).toList(),
                            };
                            
                            widget.onFiltersApplied(selectedFilters);
                            Navigator.pop(context);
                          },
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF001F3F),
                            padding: const EdgeInsets.symmetric(vertical: 16),
                          ),
                          child: const Text(
                            'Apply All',
                            style: TextStyle(color: Colors.white),
                          ),
                        ),
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