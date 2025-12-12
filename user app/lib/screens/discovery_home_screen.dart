import 'package:flutter/material.dart';
import 'event_details_screen.dart';
import 'filter_screen.dart';
import 'user_profile_menu_screen.dart';
import 'category_events_screen.dart';
import 'organized_event_details_screen.dart';
import 'artist_detail_screen.dart';
import '../services/api_service.dart';
import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

class DiscoveryHomeScreen extends StatefulWidget {
  const DiscoveryHomeScreen({super.key});

  @override
  State<DiscoveryHomeScreen> createState() => _DiscoveryHomeScreenState();
}

class _DiscoveryHomeScreenState extends State<DiscoveryHomeScreen> {
  final TextEditingController _searchController = TextEditingController();

  int _currentBottomIndex = 0;
  List<Map<String, dynamic>> filteredEvents = [];

  @override
  void initState() {
    super.initState();
    filteredEvents = nearbyEvents;
    _searchController.addListener(_filterEvents);
    _checkUserSession();
    _loadArtists();
    _loadOrganizedEvents();
    _loadBanners();
    _loadCategories();
    _loadAds();
  }
  
  Future<void> _checkUserSession() async {
    final userPhone = await ApiService.getUserPhone();
    if (userPhone == null) {
      // User not logged in, redirect to login
      Navigator.pushReplacementNamed(context, '/login');
    }
  }
  
  Future<void> _loadFollowStatus(List<Map<String, dynamic>> artistsList) async {
    final prefs = await SharedPreferences.getInstance();
    for (var artist in artistsList) {
      final artistId = artist['id'];
      if (artistId != null) {
        artist['isFollowing'] = prefs.getBool('following_$artistId') ?? false;
      }
    }
  }
  
  Future<void> _saveFollowStatus(String artistId, bool isFollowing) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('following_$artistId', isFollowing);
  }
  
  Future<void> _loadArtists() async {
    setState(() {
      _isLoadingArtists = true;
    });
    
    final result = await ApiService.getArtists();
    
    if (result['success'] == true && result['artists'] != null) {
      final artistsList = (result['artists'] as List).map((artist) {
        String imageUrl = 'https://ui-avatars.com/api/?name=${Uri.encodeComponent(artist['name'] ?? 'Artist')}&size=200&background=001F3F&color=fff';
        
        if (artist['profileImage'] != null && artist['profileImage'].toString().isNotEmpty) {
          final profileImage = artist['profileImage'].toString();
          if (profileImage.startsWith('http')) {
            imageUrl = profileImage;
          } else {
            // Base64 image
            imageUrl = 'data:image/jpeg;base64,$profileImage';
          }
        }
        
        return {
          'name': artist['name'] ?? 'Unknown Artist',
          'image': imageUrl,
          'imageBytes': (artist['profileImage'] != null && 
                        !artist['profileImage'].toString().startsWith('http') &&
                        artist['profileImage'].toString().isNotEmpty)
              ? base64Decode(artist['profileImage'])
              : null,
          'bannerImage': artist['bannerImage'],
          'bio': artist['bio'],
          'genre': artist['genre'],
          'media': artist['media'],
          'followers': '0',
          'isFollowing': false,
          'id': artist['_id'],
        };
      }).toList();
      
      await _loadFollowStatus(artistsList);
      
      setState(() {
        artists = artistsList;
        _isLoadingArtists = false;
      });
    } else {
      setState(() {
        _isLoadingArtists = false;
      });
    }
  }
  
  Future<void> _loadBanners() async {
    print('Loading banners...');
    setState(() {
      _isLoadingBanners = true;
    });
    
    try {
      final bannersList = await ApiService.getBanners();
      print('Received ${bannersList.length} banners');
      
      setState(() {
        _banners = bannersList.map((banner) {
          String title = banner['title']?.toString() ?? 'Banner';
          String imageUrl = banner['image']?.toString() ?? '';
          String link = banner['link']?.toString() ?? '';
          
          print('Banner: $title - Image: ${imageUrl.isNotEmpty ? 'Available' : 'Missing'} - Link: $link');
          
          return {
            'title': title,
            'image': imageUrl,
            'link': link,
            'id': banner['_id']?.toString() ?? '',
          };
        }).toList();
        _isLoadingBanners = false;
      });
      if (_banners.isNotEmpty) {
        _startBannerAutoScroll();
      }
    } catch (e) {
      print('Error loading banners: $e');
      setState(() {
        _banners = [];
        _isLoadingBanners = false;
      });
    }
  }
  
  Future<void> _loadCategories() async {
    setState(() {
      _isLoadingCategories = true;
    });
    
    try {
      final categoriesList = await ApiService.getCategories();
      setState(() {
        _categories = categoriesList.map((category) {
          return {
            'name': category['name'] ?? 'Category',
            'type': category['type'] ?? 'Event',
            'image': category['image'] ?? 'assets/images/concert.jpg',
            'subCategories': category['subCategories'] ?? [],
            'id': category['_id'] ?? '',
          };
        }).toList();
        _isLoadingCategories = false;
      });
    } catch (e) {
      setState(() {
        _categories = [];
        _isLoadingCategories = false;
      });
    }
  }
  
  Future<void> _loadAds() async {
    setState(() {
      _isLoadingAds = true;
    });
    
    try {
      final adsList = await ApiService.getAds();
      setState(() {
        final now = DateTime.now();
        _ads = adsList.where((ad) {
          if (ad['status'] != 'active') return false;
          
          // Check if ad is within date range
          try {
            final startDate = DateTime.parse(ad['startDate']);
            final endDate = DateTime.parse(ad['endDate']);
            return now.isAfter(startDate) && now.isBefore(endDate.add(Duration(days: 1)));
          } catch (e) {
            return true; // If date parsing fails, include the ad
          }
        }).map((ad) {
          return {
            'title': ad['title'] ?? 'Ad',
            'image': ad['image'] ?? '',
            'link': ad['link'] ?? '',
            'sponsor': ad['sponsor'] ?? '',
            'duration': ad['duration'] ?? 5, // Default 5 seconds if missing
            'order': ad['order'] ?? 1,
            'mediaType': ad['mediaType'] ?? 'image',
            'id': ad['_id'] ?? '',
          };
        }).toList();
        
        // Sort ads by order
        _ads.sort((a, b) {
          final orderA = (a['order'] as int?) ?? 1;
          final orderB = (b['order'] as int?) ?? 1;
          return orderA.compareTo(orderB);
        });
        
        print('Loaded ${_ads.length} ads:');
        for (int i = 0; i < _ads.length; i++) {
          final ad = _ads[i];
          print('Ad $i: ${ad['title']} - Duration: ${ad['duration']}s - Order: ${ad['order']} - Link: ${ad['link']}');
        }
        
        if (_ads.length == 1) {
          print('WARNING: Only 1 ad found. Auto-rotation will still work but will show the same ad.');
        }
        _isLoadingAds = false;
      });
      if (_ads.isNotEmpty) {
        print('Starting ad auto-scroll with ${_ads.length} ads');
        _startAdAutoScroll();
      } else {
        print('No ads to display');
      }
    } catch (e) {
      setState(() {
        _ads = [];
        _isLoadingAds = false;
      });
    }
  }
  
  void _startAdAutoScroll() {
    if (_ads.isNotEmpty) {
      final currentAd = _ads[_currentAdIndex];
      final duration = (currentAd['duration'] as int?) ?? 5;
      
      // Use set duration, minimum 3 seconds
      final waitTime = duration > 0 ? duration : 5;
      
      print('Ad auto-scroll: Current ad $_currentAdIndex duration = $duration seconds, waiting $waitTime seconds');
      print('Total ads: ${_ads.length}');
      
      Future.delayed(Duration(seconds: waitTime), () {
        if (mounted && _ads.isNotEmpty) {
          final nextIndex = (_currentAdIndex + 1) % _ads.length;
          print('Switching from ad $_currentAdIndex to ad $nextIndex');
          
          setState(() {
            _currentAdIndex = nextIndex;
          });
          
          if (_adsController.hasClients) {
            _adsController.animateToPage(
              _currentAdIndex,
              duration: const Duration(milliseconds: 500),
              curve: Curves.easeInOut,
            );
          }
          
          _startAdAutoScroll();
        }
      });
    }
  }
  
  void _startBannerAutoScroll() {
    if (_banners.isNotEmpty) {
      Future.delayed(const Duration(seconds: 3), () {
        if (mounted && _banners.isNotEmpty) {
          final nextIndex = (_currentBannerIndex + 1) % _banners.length;
          _currentBannerIndex = nextIndex;
          if (_bannerController.hasClients) {
            _bannerController.animateToPage(
              _currentBannerIndex,
              duration: const Duration(milliseconds: 300),
              curve: Curves.easeInOut,
            );
          }
          _startBannerAutoScroll();
        }
      });
    }
  }
  
  Future<void> _loadOrganizedEvents() async {
    setState(() {
      _isLoadingEvents = true;
    });
    
    final result = await ApiService.getApprovedEvents();
    print('Approved Events Result: $result');
    
    if (result['success'] == true && result['events'] != null) {
      final events = result['events'] as List;
      print('Number of events: ${events.length}');
      
      setState(() {
        _organizedEvents = events.map((event) {
          print('Event data: $event');
          final startDate = event['startDate'] ?? '';
          final startTime = event['startTime'] ?? '';
          final dateDisplay = startDate.isNotEmpty && startTime.isNotEmpty 
            ? '$startDate • $startTime' 
            : 'TBA';
          
          String imageUrl = 'assets/images/concert.jpg';
          if (event['media'] != null && event['media']['bannerImage'] != null && event['media']['bannerImage'].toString().isNotEmpty) {
            final bannerImage = event['media']['bannerImage'];
            // Check if it's a base64 string or URL
            if (bannerImage.toString().startsWith('http')) {
              imageUrl = bannerImage;
            } else {
              // It's base64, convert to data URL
              imageUrl = 'data:image/jpeg;base64,$bannerImage';
            }
          } else if (event['eventImage'] != null && event['eventImage'].toString().isNotEmpty) {
            imageUrl = event['eventImage'];
          } else if (event['image'] != null && event['image'].toString().isNotEmpty) {
            imageUrl = event['image'];
          }
          
          // Get price from tickets array
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
          
          return {
            'title': event['name'] ?? event['title'] ?? 'Event',
            'date': dateDisplay,
            'time': startTime,
            'description': event['description'] ?? '',
            'price': price,
            'image': imageUrl,
            'id': event['_id'],
            'venue': event['venue'],
            'category': event['category'] ?? 'Event',
            'type': event['type'] ?? 'event',
            'tickets': event['tickets'] ?? [],
          };
        }).toList();
        _isLoadingEvents = false;
      });
    } else {
      print('Failed to load events: ${result['error']}');
      setState(() {
        _isLoadingEvents = false;
      });
    }
  }

  String _getArtistName(Map<String, dynamic> event) {
    if (event['organizer'] != null) {
      if (event['organizer'] is String) {
        return event['organizer'].toString();
      } else if (event['organizer'] is Map && event['organizer']['name'] != null) {
        return event['organizer']['name'].toString();
      }
    }
    if (event['artist'] != null) {
      if (event['artist'] is String) {
        return event['artist'].toString();
      } else if (event['artist'] is Map && event['artist']['name'] != null) {
        return event['artist']['name'].toString();
      }
    }
    return 'Artist';
  }

  void _filterEvents() {
    String query = _searchController.text.toLowerCase();
    setState(() {
      if (query.isEmpty) {
        filteredEvents = nearbyEvents;
      } else {
        filteredEvents = nearbyEvents.where((event) {
          return event['title'].toLowerCase().contains(query) ||
                 event['artist'].toLowerCase().contains(query) ||
                 event['venue'].toLowerCase().contains(query) ||
                 event['category'].toLowerCase().contains(query);
        }).toList();
      }
    });
  }
  

  


  final List<Map<String, dynamic>> nearbyEvents = [
    {
      'title': 'Classical Music Evening',
      'artist': 'Pandit Jasraj',
      'venue': '69381db0886654af332b8bfb', // Use the venue ID from database
      'date': 'Dec 30, 2024',
      'time': '7:00 PM',
      'price': '₹1,200',
      'distance': '2.5 km',
      'category': 'Concerts',
      'type': 'concert',
      'address': 'NCPA, Nariman Point, Mumbai 400021',
      'image': 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=200&h=120&fit=crop',
      'description': 'Experience the mesmerizing classical music performance by the legendary Pandit Jasraj.',
      'tickets': [
        {'name': 'VIP', 'price': '1000.00', 'quantity': '10'},
        {'name': 'Gold', 'price': '1500.00', 'quantity': '90'},
      ],
      'artists': [
        {'name': 'Pandit Jasraj', 'role': 'Main Artist', 'image': 'https://via.placeholder.com/100'},
      ],
    },
    {
      'title': 'Shakespeare Drama',
      'artist': 'Mumbai Theatre Group',
      'venue': 'Prithvi Theatre',
      'date': 'Jan 2, 2025',
      'time': '8:00 PM',
      'price': '₹800',
      'distance': '3.2 km',
      'category': 'Theatre',
      'type': 'theatre',
      'address': 'Janki Kutir, Juhu Church Road, Mumbai 400049',
      'image': 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=120&fit=crop',
      'description': 'A captivating adaptation of Shakespeare\'s timeless classic.',
      'artists': [
        {'name': 'Lead Actor', 'role': 'Protagonist', 'image': 'https://via.placeholder.com/100'},
      ],
    },
    {
      'title': 'Folk Dance Festival',
      'artist': 'Gujarat Folk Artists',
      'venue': 'Shanmukhananda Hall',
      'date': 'Jan 5, 2025',
      'time': '6:30 PM',
      'price': '₹600',
      'distance': '4.1 km',
      'category': 'Jatra',
      'type': 'jatra',
      'address': 'Sion East, Mumbai 400022',
      'image': 'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=200&h=120&fit=crop',
      'description': 'Celebrate the rich cultural heritage of Gujarat with traditional folk dances.',
      'committee': 'Gujarat Cultural Association Mumbai',
      'organizer': 'Folk Arts Society',
      'contact': '+91 98765-43210',
      'story': 'A traditional folk performance showcasing the vibrant culture of Gujarat.',
      'cast': [
        {'name': 'Meera Patel', 'role': 'Lead Dancer', 'character': 'Village Belle'},
        {'name': 'Ravi Shah', 'role': 'Male Lead', 'character': 'Folk Hero'},
      ],
      'artists': [
        {'name': 'Gujarat Folk Troupe', 'role': 'Main Performance', 'image': 'https://via.placeholder.com/100'},
      ],
    },
  ];

  final List<Map<String, String>> _dateOptions = [
    {'title': 'This Weekend', 'subtitle': 'Nov 29 - 30'},
    {'title': 'Today', 'subtitle': 'Nov 28'},
    {'title': 'Tomorrow', 'subtitle': 'Nov 29'},
    {'title': 'This Week', 'subtitle': 'Nov 25 - Dec 1'},
    {'title': 'Next Weekend', 'subtitle': 'Dec 6 - 7'},
    {'title': 'Next Week', 'subtitle': 'Dec 2 - 8'},
    {'title': 'This Month', 'subtitle': 'November'},
    {'title': 'Custom', 'subtitle': 'Pick dates'},
  ];

  List<Map<String, dynamic>> _organizedEvents = [];
  bool _isLoadingEvents = false;
  List<Map<String, dynamic>> _banners = [];
  bool _isLoadingBanners = false;
  PageController _bannerController = PageController();
  int _currentBannerIndex = 0;
  
  List<Map<String, dynamic>> _categories = [];
  bool _isLoadingCategories = false;
  PageController _categoryController = PageController();
  
  List<Map<String, dynamic>> _ads = [];
  bool _isLoadingAds = false;
  PageController _adsController = PageController();
  int _currentAdIndex = 0;

  Widget _buildCategoryCard(Map<String, dynamic> category) {
    return GestureDetector(
      onTap: () {
        final categoryEvents = nearbyEvents.where((event) => 
          event['category'].toLowerCase().contains(category['name'].toLowerCase())).toList();
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (context) => CategoryEventsScreen(
              categoryName: category['name'],
              categoryImage: category['image'],
              events: categoryEvents,
            ),
          ),
        );
      },
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
        ),
        child: Stack(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: category['image'].toString().startsWith('http')
                ? Image.network(
                    category['image'],
                    width: double.infinity,
                    height: double.infinity,
                    fit: BoxFit.cover,
                    errorBuilder: (context, error, stackTrace) {
                      return Container(
                        color: Colors.grey.shade300,
                        child: const Icon(Icons.image, color: Colors.grey),
                      );
                    },
                  )
                : category['image'].toString().startsWith('data:image')
                  ? Image.memory(
                      base64Decode(category['image'].toString().split(',')[1]),
                      width: double.infinity,
                      height: double.infinity,
                      fit: BoxFit.cover,
                    )
                  : Image.asset(
                      category['image'],
                      width: double.infinity,
                      height: double.infinity,
                      fit: BoxFit.cover,
                      errorBuilder: (context, error, stackTrace) {
                        return Container(
                          color: Colors.grey.shade300,
                          child: const Icon(Icons.image, color: Colors.grey),
                        );
                      },
                    ),
            ),
            Container(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                color: Colors.black.withOpacity(0.4),
              ),
            ),
            Center(
              child: Text(
                category['name'],
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  List<Map<String, dynamic>> artists = [];
  bool _isLoadingArtists = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      appBar: AppBar(
        backgroundColor: const Color(0xFF001F3F),
        elevation: 0,
        automaticallyImplyLeading: false,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Discovery & Home', style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
            Row(
              children: [
                Icon(Icons.location_on, color: Colors.white70, size: 14),
                const SizedBox(width: 4),
                const Text('Mumbai, India', style: TextStyle(color: Colors.white70, fontSize: 14)),
              ],
            ),
          ],
        ),
        actions: [
          IconButton(icon: const Icon(Icons.notifications_outlined, color: Colors.white), onPressed: () {}),
        ],
      ),
      body: Column(
        children: [
          // Fixed Search Section
          Container(
            color: const Color(0xFF001F3F),
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 20),
            child: Container(
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.1), blurRadius: 8, offset: const Offset(0, 2))],
              ),
              child: TextField(
                controller: _searchController,
                decoration: InputDecoration(
                  hintText: 'Search events, artists, venues...',
                  hintStyle: TextStyle(color: Colors.grey.shade500),
                  prefixIcon: Icon(Icons.search, color: Colors.grey.shade600),
                  suffixIcon: IconButton(
                    icon: Icon(Icons.tune, color: const Color(0xFF001F3F)),
                    onPressed: () {
                      Navigator.push(context, MaterialPageRoute(builder: (context) => FilterScreen(onFiltersApplied: (filters) {})));
                    },
                  ),
                  border: InputBorder.none,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                ),
              ),
            ),
          ),
          
          
          // Scrollable Content
          Expanded(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
            
            // Banner Carousel
            if (_banners.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 20),
                child: SizedBox(
                  height: 160,
                  child: _isLoadingBanners
                    ? const Center(child: CircularProgressIndicator())
                    : PageView.builder(
                        controller: _bannerController,
                        itemCount: _banners.length,
                        onPageChanged: (index) {
                          _currentBannerIndex = index;
                        },
                        itemBuilder: (context, index) {
                          final banner = _banners[index];
                          return GestureDetector(
                            onTap: () {
                              final link = banner['link']?.toString() ?? '';
                              if (link.isNotEmpty) {
                                // Copy link to clipboard and show message
                                Clipboard.setData(ClipboardData(text: link));
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(
                                    content: Text('Link copied to clipboard: $link'),
                                    duration: const Duration(seconds: 3),
                                    action: SnackBarAction(
                                      label: 'OK',
                                      onPressed: () {},
                                    ),
                                  ),
                                );
                              }
                            },
                            child: Container(
                              margin: const EdgeInsets.symmetric(horizontal: 20),
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(16),
                                boxShadow: [BoxShadow(color: const Color(0xFF001F3F).withOpacity(0.3), blurRadius: 12, offset: const Offset(0, 6))],
                              ),
                              child: Stack(
                                children: [
                                  ClipRRect(
                                    borderRadius: BorderRadius.circular(16),
                                    child: banner['image'].toString().startsWith('http')
                                      ? Image.network(
                                          banner['image'],
                                          width: double.infinity,
                                          height: double.infinity,
                                          fit: BoxFit.cover,
                                          errorBuilder: (context, error, stackTrace) {
                                            return Container(
                                              color: Colors.grey.shade300,
                                              child: const Icon(Icons.image, color: Colors.grey),
                                            );
                                          },
                                        )
                                      : banner['image'].toString().startsWith('data:image')
                                        ? Image.memory(
                                            base64Decode(banner['image'].toString().split(',')[1]),
                                            width: double.infinity,
                                            height: double.infinity,
                                            fit: BoxFit.cover,
                                          )
                                        : Container(
                                            color: Colors.grey.shade300,
                                            child: const Icon(Icons.image, color: Colors.grey),
                                          ),
                                  ),
                                  Container(
                                    decoration: BoxDecoration(
                                      borderRadius: BorderRadius.circular(16),
                                      gradient: LinearGradient(
                                        begin: Alignment.topCenter,
                                        end: Alignment.bottomCenter,
                                        colors: [Colors.transparent, const Color(0xFF001F3F).withOpacity(0.6)],
                                      ),
                                    ),
                                    child: Stack(
                                      children: [
                                        Center(
                                          child: Text(
                                            banner['title'],
                                            style: const TextStyle(
                                              color: Colors.white,
                                              fontSize: 24,
                                              fontWeight: FontWeight.bold,
                                              shadows: [
                                                Shadow(
                                                  offset: Offset(1, 1),
                                                  blurRadius: 3,
                                                  color: Colors.black54,
                                                ),
                                              ],
                                            ),
                                            textAlign: TextAlign.center,
                                          ),
                                        ),

                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
              ),
            ),
            
            // Explore Categories Section
            Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Text(
                        'Explore Categories',
                        style: TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.bold,
                          color: Colors.black87,
                        ),
                      ),
                      const Spacer(),
                      if (_categories.length > 4)
                        const Icon(
                          Icons.arrow_forward_ios,
                          color: Colors.blue,
                          size: 20,
                        ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  _isLoadingCategories
                    ? const Center(child: CircularProgressIndicator())
                    : _categories.isEmpty
                      ? const Center(child: Text('No categories available'))
                      : Container(
                          height: 220,
                          child: _categories.length <= 4
                            ? GridView.count(
                                shrinkWrap: true,
                                physics: const NeverScrollableScrollPhysics(),
                                crossAxisCount: 2,
                                crossAxisSpacing: 16,
                                mainAxisSpacing: 16,
                                childAspectRatio: 1.8,
                                children: _categories.map((category) => _buildCategoryCard(category)).toList(),
                              )
                            : PageView.builder(
                                controller: _categoryController,
                                itemCount: _categories.length,
                                itemBuilder: (context, pageIndex) {
                                  List<Map<String, dynamic>> displayCategories = [];
                                  
                                  for (int i = 0; i < 4; i++) {
                                    int index = (pageIndex + i) % _categories.length;
                                    displayCategories.add(_categories[index]);
                                  }
                                  
                                  return Padding(
                                    padding: const EdgeInsets.symmetric(horizontal: 4),
                                    child: GridView.count(
                                      shrinkWrap: true,
                                      physics: const NeverScrollableScrollPhysics(),
                                      crossAxisCount: 2,
                                      crossAxisSpacing: 16,
                                      mainAxisSpacing: 16,
                                      childAspectRatio: 1.8,
                                      children: displayCategories.map((category) => _buildCategoryCard(category)).toList(),
                                    ),
                                  );
                                },
                              ),
                        ),
                ],
              ),
            ),
            
            // Ads Section
            if (_ads.isNotEmpty)
              Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Ads',
                      style: TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.bold,
                        color: Colors.black87,
                      ),
                    ),
                    const SizedBox(height: 16),
                    _isLoadingAds
                      ? const Center(child: CircularProgressIndicator())
                      : SizedBox(
                          height: 120,
                          child: PageView.builder(
                            controller: _adsController,
                            itemCount: _ads.length,
                            onPageChanged: (index) {
                              print('PageView onPageChanged: $index');
                              _currentAdIndex = index;
                            },
                            itemBuilder: (context, index) {
                              final ad = _ads[index];
                              return GestureDetector(
                                onTap: () {
                                  final link = ad['link']?.toString() ?? '';
                                  if (link.isNotEmpty) {
                                    // Copy link to clipboard and show message
                                    Clipboard.setData(ClipboardData(text: link));
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(
                                        content: Text('Link copied to clipboard: $link'),
                                        duration: const Duration(seconds: 3),
                                        action: SnackBarAction(
                                          label: 'OK',
                                          onPressed: () {},
                                        ),
                                      ),
                                    );
                                  }
                                },
                                child: Container(
                                  margin: const EdgeInsets.symmetric(horizontal: 4),
                                  decoration: BoxDecoration(
                                    borderRadius: BorderRadius.circular(12),
                                    boxShadow: [
                                      BoxShadow(
                                        color: Colors.grey.withOpacity(0.2),
                                        blurRadius: 8,
                                        offset: const Offset(0, 4),
                                      ),
                                    ],
                                  ),
                                  child: ClipRRect(
                                    borderRadius: BorderRadius.circular(12),
                                    child: Stack(
                                      children: [
                                        ad['mediaType'] == 'video'
                                          ? Container(
                                              width: double.infinity,
                                              height: double.infinity,
                                              color: Colors.black,
                                              child: const Center(
                                                child: Icon(
                                                  Icons.play_circle_fill,
                                                  color: Colors.white,
                                                  size: 40,
                                                ),
                                              ),
                                            )
                                          : ad['image'].toString().startsWith('http')
                                            ? Image.network(
                                                ad['image'],
                                                width: double.infinity,
                                                height: double.infinity,
                                                fit: BoxFit.cover,
                                                errorBuilder: (context, error, stackTrace) {
                                                  return Container(
                                                    color: Colors.grey.shade300,
                                                    child: const Icon(Icons.image, color: Colors.grey),
                                                  );
                                                },
                                              )
                                            : ad['image'].toString().startsWith('data:image')
                                              ? Image.memory(
                                                  base64Decode(ad['image'].toString().split(',')[1]),
                                                  width: double.infinity,
                                                  height: double.infinity,
                                                  fit: BoxFit.cover,
                                                )
                                              : Container(
                                                  color: Colors.grey.shade300,
                                                  child: const Icon(Icons.image, color: Colors.grey),
                                                ),
                                        Positioned(
                                          bottom: 8,
                                          left: 8,
                                          child: Container(
                                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                            decoration: BoxDecoration(
                                              color: Colors.black.withOpacity(0.7),
                                              borderRadius: BorderRadius.circular(6),
                                            ),
                                            child: Text(
                                              'Sponsored by ${ad['sponsor']}',
                                              style: const TextStyle(
                                                color: Colors.white,
                                                fontSize: 12,
                                                fontWeight: FontWeight.w500,
                                              ),
                                            ),
                                          ),
                                        ),


                                      ],
                                    ),
                                  ),
                                ),
                              );
                            },
                          ),
                        ),
                  ],
                ),
              ),
            
            // Artists
            Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Artists', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Colors.black87)),
                  const SizedBox(height: 16),
                  _isLoadingArtists
                    ? const Center(child: CircularProgressIndicator())
                    : artists.isEmpty
                      ? const Center(child: Text('No artists available'))
                      : SizedBox(
                    height: 240,
                    child: ListView.builder(
                      scrollDirection: Axis.horizontal,
                      itemCount: artists.length,
                      itemBuilder: (context, index) {
                        final artist = artists[index];
                        return GestureDetector(
                          onTap: () {
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (context) => ArtistDetailScreen(artist: artist),
                              ),
                            );
                          },
                          child: Container(
                          width: 160,
                          margin: const EdgeInsets.only(right: 16),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(12),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.grey.withOpacity(0.1),
                                blurRadius: 8,
                                offset: const Offset(0, 2),
                              ),
                            ],
                          ),
                          child: Column(
                            children: [
                              Padding(
                                padding: const EdgeInsets.all(8),
                                child: Column(
                                  children: [
                                    Container(
                                      width: 110,
                                      height: 110,
                                      decoration: BoxDecoration(
                                        shape: BoxShape.circle,
                                        border: Border.all(color: Colors.grey.shade300, width: 2),
                                        color: Colors.grey.shade200,
                                      ),
                                      child: ClipOval(
                                        child: artist['imageBytes'] != null
                                          ? Image.memory(
                                              artist['imageBytes'],
                                              fit: BoxFit.cover,
                                              width: 110,
                                              height: 110,
                                            )
                                          : Image.network(
                                              artist['image'],
                                              fit: BoxFit.cover,
                                              errorBuilder: (context, error, stackTrace) {
                                                return Container(
                                                  color: const Color(0xFF001F3F),
                                                  child: Center(
                                                    child: Text(
                                                      artist['name'].substring(0, 1).toUpperCase(),
                                                      style: const TextStyle(
                                                        color: Colors.white,
                                                        fontSize: 40,
                                                        fontWeight: FontWeight.bold,
                                                      ),
                                                    ),
                                                  ),
                                                );
                                              },
                                            ),
                                      ),
                                    ),
                                    const SizedBox(height: 8),
                                    Text(
                                      artist['name'],
                                      style: const TextStyle(
                                        fontSize: 13,
                                        fontWeight: FontWeight.bold,
                                        color: Colors.black87,
                                      ),
                                      textAlign: TextAlign.center,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                    const SizedBox(height: 8),
                                  ],
                                ),
                              ),
                              Padding(
                                padding: const EdgeInsets.all(8),
                                child: SizedBox(
                                  width: double.infinity,
                                  height: 32,
                                  child: ElevatedButton(
                                    onPressed: () async {
                                      final artistId = artists[index]['id'];
                                      final userPhone = await ApiService.getUserPhone();
                                      
                                      if (artistId == null || userPhone == null) return;
                                      
                                      final wasFollowing = artists[index]['isFollowing'];
                                      
                                      // Update UI immediately
                                      setState(() {
                                        artists[index]['isFollowing'] = !artists[index]['isFollowing'];
                                      });
                                      
                                      await _saveFollowStatus(artistId, artists[index]['isFollowing']);
                                      
                                      // Save to backend
                                      final result = await ApiService.toggleFollowArtist(
                                        artistId: artistId,
                                        userPhone: userPhone,
                                        action: artists[index]['isFollowing'] ? 'follow' : 'unfollow',
                                      );
                                      
                                      if (result['success'] != true) {
                                        // Revert on failure
                                        setState(() {
                                          artists[index]['isFollowing'] = wasFollowing;
                                        });
                                        await _saveFollowStatus(artistId, wasFollowing);
                                      }
                                    },
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: artist['isFollowing'] 
                                          ? Colors.grey.shade800 
                                          : const Color(0xFF001F3F),
                                      foregroundColor: Colors.white,
                                      shape: RoundedRectangleBorder(
                                        borderRadius: BorderRadius.circular(6),
                                      ),
                                      elevation: 0,
                                      padding: const EdgeInsets.symmetric(horizontal: 8),
                                    ),
                                    child: FittedBox(
                                      child: Text(
                                        artist['isFollowing'] ? 'Following' : 'Follow',
                                        style: const TextStyle(
                                          fontSize: 11,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
            
            // Events Near Me
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Row(
                children: [
                  const Icon(Icons.near_me, color: Color(0xFF001F3F), size: 24),
                  const SizedBox(width: 8),
                  const Text('Events Near Me', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Colors.black87)),
                  const Spacer(),
                  TextButton(onPressed: () {}, child: const Text('View All', style: TextStyle(color: Color(0xFF001F3F), fontWeight: FontWeight.w600))),
                ],
              ),
            ),
            
            // Nearby Events Horizontal Scroll
            Padding(
              padding: const EdgeInsets.fromLTRB(0, 20, 0, 40),
              child: SizedBox(
                height: 220,
                child: ListView.builder(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  itemCount: filteredEvents.length,
                  itemBuilder: (context, index) {
                    final event = filteredEvents[index];
                    return GestureDetector(
                      onTap: () {
                        Navigator.push(context, MaterialPageRoute(builder: (context) => EventDetailsScreen(event: event)));
                      },
                      child: Container(
                        width: 180,
                        margin: const EdgeInsets.only(right: 16),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(12),
                          boxShadow: [BoxShadow(color: Colors.grey.withOpacity(0.2), blurRadius: 8, offset: const Offset(0, 4))],
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                              flex: 3,
                              child: Container(
                                width: double.infinity,
                                decoration: BoxDecoration(
                                  borderRadius: const BorderRadius.only(topLeft: Radius.circular(12), topRight: Radius.circular(12)),
                                  image: DecorationImage(image: NetworkImage(event['image']), fit: BoxFit.cover),
                                ),
                                child: Container(
                                  decoration: BoxDecoration(
                                    borderRadius: const BorderRadius.only(topLeft: Radius.circular(12), topRight: Radius.circular(12)),
                                    gradient: LinearGradient(
                                      begin: Alignment.topCenter,
                                      end: Alignment.bottomCenter,
                                      colors: [Colors.transparent, const Color(0xFF001F3F).withOpacity(0.7)],
                                    ),
                                  ),
                                  child: Stack(
                                    children: [
                                      Positioned(
                                        top: 8, right: 8,
                                        child: Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                          decoration: BoxDecoration(color: Colors.white.withOpacity(0.9), borderRadius: BorderRadius.circular(8)),
                                          child: Text(event['distance'], style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: Color(0xFF001F3F))),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                            Expanded(
                              flex: 2,
                              child: Container(
                                width: double.infinity,
                                padding: const EdgeInsets.all(8),
                                decoration: const BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.only(bottomLeft: Radius.circular(12), bottomRight: Radius.circular(12)),
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Text(event['title'], style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.black87), maxLines: 1, overflow: TextOverflow.ellipsis),
                                    const SizedBox(height: 1),
                                    Text(event['artist'], style: TextStyle(fontSize: 11, color: Colors.grey.shade600), maxLines: 1, overflow: TextOverflow.ellipsis),
                                    const SizedBox(height: 6),
                                    Row(
                                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                      children: [
                                        Flexible(child: Text(event['price'], style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Color(0xFF001F3F)))),
                                        Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                                          decoration: BoxDecoration(color: const Color(0xFF001F3F), borderRadius: BorderRadius.circular(10)),
                                          child: const Text('Book', style: TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w600)),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ),
            ),
            
            // Pick a Date Section
            Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Pick a Date, Find an Event',
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                      color: Colors.black87,
                    ),
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    height: 80,
                    child: ListView.builder(
                      scrollDirection: Axis.horizontal,
                      itemCount: _dateOptions.length,
                      itemBuilder: (context, index) {
                        final dateOption = _dateOptions[index];
                        return GestureDetector(
                          onTap: () {
                            // Handle date selection
                            print('Selected: ${dateOption['title']}');
                          },
                          child: Container(
                            width: 140,
                            margin: const EdgeInsets.only(right: 12),
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: Colors.grey.shade300,
                                width: 1,
                              ),
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.grey.withOpacity(0.1),
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
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Text(
                                        dateOption['title'] ?? '',
                                        style: const TextStyle(
                                          fontSize: 14,
                                          fontWeight: FontWeight.bold,
                                          color: Color(0xFF001F3F),
                                        ),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        dateOption['subtitle'] ?? '',
                                        style: TextStyle(
                                          fontSize: 12,
                                          color: Colors.grey.shade600,
                                        ),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ],
                                  ),
                                ),
                                const SizedBox(width: 8),
                                const Icon(
                                  Icons.calendar_today,
                                  color: Color(0xFF001F3F),
                                  size: 24,
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
            
            // Organized Events Section
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Text(
                        'Organized Events',
                        style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.bold,
                          color: Colors.black87,
                        ),
                      ),
                      const Spacer(),
                      const Icon(
                        Icons.arrow_forward_ios,
                        color: Colors.blue,
                        size: 20,
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  _isLoadingEvents
                    ? const Center(child: CircularProgressIndicator())
                    : _organizedEvents.isEmpty
                      ? const Center(child: Text('No events available'))
                      : SizedBox(
                    height: 260,
                    child: ListView.builder(
                      scrollDirection: Axis.horizontal,
                      itemCount: _organizedEvents.length,
                      itemBuilder: (context, index) {
                        final event = _organizedEvents[index];
                        return GestureDetector(
                          onTap: () {
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (context) => OrganizedEventDetailsScreen(event: event),
                              ),
                            );
                          },
                          child: Container(
                          width: 180,
                          margin: const EdgeInsets.only(right: 16),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(12),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.grey.withOpacity(0.2),
                                blurRadius: 8,
                                offset: const Offset(0, 4),
                              ),
                            ],
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(
                                flex: 2,
                                child: Container(
                                  width: double.infinity,
                                  decoration: BoxDecoration(
                                    borderRadius: const BorderRadius.only(
                                      topLeft: Radius.circular(12),
                                      topRight: Radius.circular(12),
                                    ),
                                    color: Colors.grey.shade200,
                                  ),
                                  child: Stack(
                                    children: [
                                      ClipRRect(
                                        borderRadius: const BorderRadius.only(
                                          topLeft: Radius.circular(12),
                                          topRight: Radius.circular(12),
                                        ),
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
                                            size: 16,
                                            color: Colors.grey,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                              Expanded(
                                flex: 2,
                                child: Container(
                                  width: double.infinity,
                                  padding: const EdgeInsets.all(8),
                                  decoration: const BoxDecoration(
                                    color: Colors.white,
                                    borderRadius: BorderRadius.only(
                                      bottomLeft: Radius.circular(12),
                                      bottomRight: Radius.circular(12),
                                    ),
                                  ),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Text(
                                        event['date'] ?? '',
                                        style: TextStyle(
                                          fontSize: 12,
                                          color: Colors.grey.shade600,
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        event['title'] ?? '',
                                        style: const TextStyle(
                                          fontSize: 14,
                                          fontWeight: FontWeight.bold,
                                          color: Colors.black87,
                                        ),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        event['description'] ?? '',
                                        style: TextStyle(
                                          fontSize: 12,
                                          color: Colors.grey.shade600,
                                        ),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                      const SizedBox(height: 4),
                                      Row(
                                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                        children: [
                                          Text(
                                            event['price'] ?? '',
                                            style: const TextStyle(
                                              fontSize: 14,
                                              fontWeight: FontWeight.bold,
                                              color: Color(0xFF001F3F),
                                            ),
                                          ),
                                          Container(
                                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                            decoration: BoxDecoration(
                                              color: const Color(0xFF001F3F),
                                              borderRadius: BorderRadius.circular(6),
                                            ),
                                            child: const Text(
                                              'Book',
                                              style: TextStyle(
                                                color: Colors.white,
                                                fontSize: 10,
                                                fontWeight: FontWeight.w600,
                                              ),
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
                        ),
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
            
            // Events Near You Section
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Events Near You',
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                      color: Colors.black87,
                    ),
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    height: 80,
                    child: ListView(
                      scrollDirection: Axis.horizontal,
                      children: [
                        _buildDistanceCard('5 kms', 'Events nearby', Icons.location_on, Colors.orange),
                        _buildDistanceCard('10 kms', 'Wider Area', Icons.route, Colors.orange),
                        _buildDistanceCard('20 kms', 'Wider Area', Icons.warning, Colors.red),
                        _buildDistanceCard('Custom', 'Pick distance', Icons.tune, Colors.blue),
                      ],
                    ),
                  ),
                ],
              ),
            ),
                ],
              ),
            ),
          ),
        ],
      ),
      bottomNavigationBar: BottomNavigationBar(
        type: BottomNavigationBarType.fixed,
        backgroundColor: Colors.white,
        selectedItemColor: const Color(0xFF001F3F),
        unselectedItemColor: Colors.grey,
        currentIndex: _currentBottomIndex,
        onTap: (index) {
          if (index == 2) {
            Navigator.push(
              context,
              MaterialPageRoute(builder: (context) => const UserProfileMenuScreen()),
            );
          } else {
            setState(() {
              _currentBottomIndex = index;
            });
          }
        },
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.home), label: 'Home'),
          BottomNavigationBarItem(icon: Icon(Icons.confirmation_number), label: 'Ticket'),
          BottomNavigationBarItem(icon: Icon(Icons.person), label: 'Profile'),
        ],
      ),
    );
  }

  Widget _buildDistanceCard(String distance, String subtitle, IconData icon, Color iconColor) {
    return Container(
      width: 180,
      margin: const EdgeInsets.only(right: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade300, width: 1),
      ),
      child: Row(
        children: [
          Icon(
            icon,
            size: 24,
            color: iconColor,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  distance,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF001F3F),
                  ),
                ),
                Text(
                  subtitle,
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey.shade600,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _searchController.dispose();
    _bannerController.dispose();
    _categoryController.dispose();
    _adsController.dispose();
    super.dispose();
  }
}