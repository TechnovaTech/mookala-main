import 'package:flutter/material.dart';
import 'event_details_screen.dart';
import 'filter_screen.dart';
import 'user_profile_menu_screen.dart';
import 'category_events_screen.dart';

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
  

  
  final List<Map<String, dynamic>> featuredEvents = [
    {
      'title': 'AR Rahman Live Concert',
      'artist': 'A.R. Rahman',
      'venue': 'NSCI Dome, Mumbai',
      'date': 'Dec 25, 2024',
      'price': '₹2,500',
      'image': 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=160&fit=crop',
    },
    {
      'title': 'Bollywood Night',
      'artist': 'Arijit Singh',
      'venue': 'Phoenix Mills, Mumbai',
      'date': 'Dec 28, 2024',
      'price': '₹1,800',
      'image': 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=400&h=160&fit=crop',
    },
  ];

  final List<Map<String, dynamic>> nearbyEvents = [
    {
      'title': 'Classical Music Evening',
      'artist': 'Pandit Jasraj',
      'venue': 'Tata Theatre',
      'date': 'Dec 30, 2024',
      'time': '7:00 PM',
      'price': '₹1,200',
      'distance': '2.5 km',
      'category': 'Concerts',
      'type': 'concert',
      'address': 'NCPA, Nariman Point, Mumbai 400021',
      'image': 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=200&h=120&fit=crop',
      'description': 'Experience the mesmerizing classical music performance by the legendary Pandit Jasraj.',
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

  Widget _buildCategoryCard(String title, String imagePath, Color backgroundColor) {
    return GestureDetector(
      onTap: () {
        final categoryEvents = nearbyEvents.where((event) => 
          event['category'].toLowerCase().contains(title.toLowerCase())).toList();
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (context) => CategoryEventsScreen(
              categoryName: title,
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
            // Full background image
            ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: Image.asset(
                imagePath,
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
            // Dark overlay
            Container(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                color: Colors.black.withOpacity(0.4),
              ),
            ),
            // Centered white text
            Center(
              child: Text(
                title,
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

  final List<Map<String, dynamic>> artists = [
    {'name': 'A. R. Rahman', 'image': 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop', 'followers': '2.5M', 'isFollowing': false},
    {'name': 'Arijit Singh', 'image': 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop', 'followers': '3.2M', 'isFollowing': false},
    {'name': 'Shreya Ghoshal', 'image': 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop', 'followers': '1.8M', 'isFollowing': true},
    {'name': 'Sonu Nigam', 'image': 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop', 'followers': '1.5M', 'isFollowing': false},
    {'name': 'Sunidhi Chauhan', 'image': 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&h=200&fit=crop', 'followers': '900K', 'isFollowing': false},
    {'name': 'Rahat Fateh Ali Khan', 'image': 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&h=200&fit=crop', 'followers': '1.2M', 'isFollowing': true},
    {'name': 'Armaan Malik', 'image': 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=200&h=200&fit=crop', 'followers': '800K', 'isFollowing': false},
    {'name': 'Neha Kakkar', 'image': 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=200&h=200&fit=crop', 'followers': '2.1M', 'isFollowing': false},
  ];

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
            Padding(
              padding: const EdgeInsets.only(top: 20),
              child: SizedBox(
                height: 160,
                child: PageView.builder(
                  itemCount: featuredEvents.length,
                  itemBuilder: (context, index) {
                    final event = featuredEvents[index];
                    return Container(
                      margin: const EdgeInsets.symmetric(horizontal: 20),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(16),
                        image: DecorationImage(image: NetworkImage(event['image']), fit: BoxFit.cover),
                        boxShadow: [BoxShadow(color: const Color(0xFF001F3F).withOpacity(0.3), blurRadius: 12, offset: const Offset(0, 6))],
                      ),
                      child: Container(
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(16),
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [Colors.transparent, const Color(0xFF001F3F).withOpacity(0.8)],
                          ),
                        ),
                        child: Stack(
                          children: [
                            Positioned(
                              top: 16, right: 16,
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                decoration: BoxDecoration(color: Colors.orange, borderRadius: BorderRadius.circular(12)),
                                child: const Text('FEATURED', style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
                              ),
                            ),
                            Positioned(
                              left: 20, bottom: 20, right: 20,
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(event['title'], style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
                                  const SizedBox(height: 4),
                                  Text(event['artist'], style: const TextStyle(color: Colors.white70, fontSize: 16)),
                                  const SizedBox(height: 8),
                                  Row(
                                    children: [
                                      const Icon(Icons.location_on, color: Colors.white70, size: 16),
                                      const SizedBox(width: 4),
                                      Expanded(child: Text(event['venue'], style: const TextStyle(color: Colors.white70, fontSize: 14))),
                                    ],
                                  ),
                                  const SizedBox(height: 4),
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                    children: [
                                      Row(
                                        children: [
                                          const Icon(Icons.calendar_today, color: Colors.white70, size: 16),
                                          const SizedBox(width: 4),
                                          Text(event['date'], style: const TextStyle(color: Colors.white70, fontSize: 14)),
                                        ],
                                      ),
                                      Text(event['price'], style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                                    ],
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
                      const Icon(
                        Icons.arrow_forward_ios,
                        color: Colors.blue,
                        size: 20,
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  // 2x2 Grid
                  GridView.count(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    crossAxisCount: 2,
                    crossAxisSpacing: 16,
                    mainAxisSpacing: 16,
                    childAspectRatio: 1.8,
                    children: [
                      _buildCategoryCard('Music', 'assets/images/concert.jpg', Colors.blue.shade50),
                      _buildCategoryCard('Theatre', 'assets/images/theatre.jpg', Colors.blue.shade50),
                      _buildCategoryCard('Concert', 'assets/images/concert.jpg', Colors.blue.shade50),
                      _buildCategoryCard('Jatra', 'assets/images/folk.jpg', Colors.orange.shade50),
                    ],
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
                  SizedBox(
                    height: 240,
                    child: ListView.builder(
                      scrollDirection: Axis.horizontal,
                      itemCount: artists.length,
                      itemBuilder: (context, index) {
                        final artist = artists[index];
                        return Container(
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
                                padding: const EdgeInsets.fromLTRB(8, 8, 8, 0),
                                child: Column(
                                  children: [
                                    Container(
                                      width: 90,
                                      height: 90,
                                      decoration: BoxDecoration(
                                        shape: BoxShape.circle,
                                        image: DecorationImage(
                                          image: NetworkImage(artist['image']),
                                          fit: BoxFit.cover,
                                        ),
                                        border: Border.all(color: Colors.grey.shade300, width: 2),
                                      ),
                                    ),
                                    const SizedBox(height: 6),
                                    Text(
                                      artist['name'],
                                      style: const TextStyle(
                                        fontSize: 13,
                                        fontWeight: FontWeight.bold,
                                        color: Colors.black87,
                                      ),
                                      textAlign: TextAlign.center,
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      '${artist['followers']} followers',
                                      style: TextStyle(
                                        fontSize: 11,
                                        color: Colors.grey.shade600,
                                      ),
                                      textAlign: TextAlign.center,
                                    ),
                                  ],
                                ),
                              ),
                              const Spacer(),
                              Padding(
                                padding: const EdgeInsets.all(8),
                                child: SizedBox(
                                  width: double.infinity,
                                  height: 32,
                                  child: ElevatedButton(
                                    onPressed: () {
                                      setState(() {
                                        artists[index]['isFollowing'] = !artists[index]['isFollowing'];
                                      });
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
            
            // Nearby Events Grid
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
              child: GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  crossAxisSpacing: 16,
                  mainAxisSpacing: 16,
                  childAspectRatio: 0.8,
                ),
                itemCount: filteredEvents.length,
                itemBuilder: (context, index) {
                  final event = filteredEvents[index];
                  return GestureDetector(
                    onTap: () {
                      Navigator.push(context, MaterialPageRoute(builder: (context) => EventDetailsScreen(event: event)));
                    },
                    child: Container(
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
          if (index == 3) {
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
          BottomNavigationBarItem(icon: Icon(Icons.school), label: 'Learn'),
          BottomNavigationBarItem(icon: Icon(Icons.person), label: 'Profile'),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }
}