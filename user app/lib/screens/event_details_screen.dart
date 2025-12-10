import 'package:flutter/material.dart';
import 'booking_screen.dart';

class EventDetailsScreen extends StatefulWidget {
  final Map<String, dynamic> event;
  
  const EventDetailsScreen({Key? key, required this.event}) : super(key: key);

  @override
  State<EventDetailsScreen> createState() => _EventDetailsScreenState();
}

class _EventDetailsScreenState extends State<EventDetailsScreen> with TickerProviderStateMixin {
  late TabController _tabController;
  
  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: widget.event['type'] == 'jatra' ? 4 : 3, vsync: this);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: CustomScrollView(
        slivers: [
          // App Bar with Banner
          SliverAppBar(
            expandedHeight: 300,
            pinned: true,
            backgroundColor: const Color(0xFF001F3F),
            flexibleSpace: FlexibleSpaceBar(
              background: Stack(
                fit: StackFit.expand,
                children: [
                  Image.network(
                    widget.event['image'],
                    fit: BoxFit.cover,
                  ),
                  Container(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.transparent,
                          const Color(0xFF001F3F).withOpacity(0.8),
                        ],
                      ),
                    ),
                  ),
                  Positioned(
                    bottom: 20,
                    left: 20,
                    right: 20,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.event['title'],
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 24,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            const Icon(Icons.calendar_today, color: Colors.white, size: 16),
                            const SizedBox(width: 8),
                            Text(
                              widget.event['date'],
                              style: const TextStyle(color: Colors.white, fontSize: 14),
                            ),
                            const SizedBox(width: 20),
                            const Icon(Icons.access_time, color: Colors.white, size: 16),
                            const SizedBox(width: 8),
                            Text(
                              widget.event['time'],
                              style: const TextStyle(color: Colors.white, fontSize: 14),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            actions: [
              IconButton(
                icon: const Icon(Icons.share, color: Colors.white),
                onPressed: () {},
              ),
              IconButton(
                icon: const Icon(Icons.favorite_border, color: Colors.white),
                onPressed: () {},
              ),
            ],
          ),
          
          // Tab Bar
          SliverPersistentHeader(
            pinned: true,
            delegate: _SliverTabBarDelegate(
              TabBar(
                controller: _tabController,
                labelColor: const Color(0xFF001F3F),
                unselectedLabelColor: Colors.grey,
                indicatorColor: const Color(0xFF001F3F),
                tabs: [
                  const Tab(text: 'Details'),
                  const Tab(text: 'Location'),
                  const Tab(text: 'Artists'),
                  if (widget.event['type'] == 'jatra') const Tab(text: 'Jatra'),
                ],
              ),
            ),
          ),
          
          // Tab Content
          SliverFillRemaining(
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildDetailsTab(),
                _buildLocationTab(),
                _buildArtistsTab(),
                if (widget.event['type'] == 'jatra') _buildJatraTab(),
              ],
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) => BookingScreen(
                event: {
                  'title': 'Birthday Party',
                  'date': '2025-12-09',
                  'time': '3:49 PM',
                  'venue': 'Party Hall',
                  'price': '₹500'
                }
              ),
            ),
          );
        },
        backgroundColor: const Color(0xFF001F3F),
        label: const Text('Book Now', style: TextStyle(color: Colors.white)),
        icon: const Icon(Icons.book, color: Colors.white),
      ),
    );
  }

  Widget _buildDetailsTab() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Event Info Cards
          Row(
            children: [
              Expanded(
                child: _buildInfoCard(
                  Icons.calendar_today,
                  'Date',
                  widget.event['date'],
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: _buildInfoCard(
                  Icons.access_time,
                  'Time',
                  widget.event['time'],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _buildInfoCard(
                  Icons.location_on,
                  'Venue',
                  widget.event['venue'],
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: _buildInfoCard(
                  Icons.category,
                  'Category',
                  widget.event['category'],
                ),
              ),
            ],
          ),
          
          const SizedBox(height: 30),
          
          // Description
          const Text(
            'About Event',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: Color(0xFF001F3F),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            widget.event['description'] ?? 'Experience an unforgettable evening filled with amazing performances, great music, and wonderful memories. This event promises to deliver entertainment that will leave you wanting more.',
            style: TextStyle(
              fontSize: 14,
              color: Colors.grey.shade700,
              height: 1.6,
            ),
          ),
          
          const SizedBox(height: 30),
          
          // Terms & Conditions
          const Text(
            'Terms & Conditions',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: Color(0xFF001F3F),
            ),
          ),
          const SizedBox(height: 12),
          _buildTermsSection(),
        ],
      ),
    );
  }

  Widget _buildLocationTab() {
    return Column(
      children: [
        // Venue Info
        Container(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                widget.event['venue'],
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF001F3F),
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  const Icon(Icons.location_on, color: Colors.grey, size: 16),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      widget.event['address'] ?? 'Main Street, City Center, State 12345',
                      style: TextStyle(
                        color: Colors.grey.shade600,
                        fontSize: 14,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        
        // Map Placeholder
        Expanded(
          child: Container(
            margin: const EdgeInsets.symmetric(horizontal: 20),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.grey.shade300),
              color: Colors.grey.shade100,
            ),
            child: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.map,
                    size: 60,
                    color: Colors.grey.shade400,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Venue Location',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: Colors.grey.shade600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    widget.event['address'] ?? 'Main Street, City Center',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Colors.grey.shade500,
                      fontSize: 14,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        
        // Directions Button
        Padding(
          padding: const EdgeInsets.all(20),
          child: ElevatedButton.icon(
            onPressed: () {},
            icon: const Icon(Icons.directions, color: Colors.white),
            label: const Text('Get Directions', style: TextStyle(color: Colors.white)),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF001F3F),
              padding: const EdgeInsets.symmetric(vertical: 12),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildArtistsTab() {
    final artists = widget.event['artists'] ?? [
      {'name': 'Main Artist', 'role': 'Headliner', 'image': 'https://via.placeholder.com/100'},
      {'name': 'Supporting Act', 'role': 'Opening Act', 'image': 'https://via.placeholder.com/100'},
    ];
    
    return ListView.builder(
      padding: const EdgeInsets.all(20),
      itemCount: artists.length,
      itemBuilder: (context, index) {
        final artist = artists[index];
        return Container(
          margin: const EdgeInsets.only(bottom: 16),
          padding: const EdgeInsets.all(16),
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
          child: Row(
            children: [
              CircleAvatar(
                radius: 30,
                backgroundImage: NetworkImage(artist['image']),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      artist['name'],
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF001F3F),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      artist['role'],
                      style: TextStyle(
                        color: Colors.grey.shade600,
                        fontSize: 14,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                onPressed: () {},
                icon: const Icon(Icons.info_outline, color: Color(0xFF001F3F)),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildJatraTab() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Committee Details
          const Text(
            'Committee Details',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: Color(0xFF001F3F),
            ),
          ),
          const SizedBox(height: 16),
          _buildJatraInfoCard('Committee Name', widget.event['committee'] ?? 'Dhaka Jatra Samiti'),
          _buildJatraInfoCard('Organizer', widget.event['organizer'] ?? 'Cultural Association'),
          _buildJatraInfoCard('Contact', widget.event['contact'] ?? '+880 1234-567890'),
          
          const SizedBox(height: 30),
          
          // Cast List
          const Text(
            'Cast & Crew',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: Color(0xFF001F3F),
            ),
          ),
          const SizedBox(height: 16),
          
          ..._buildCastList(),
          
          const SizedBox(height: 30),
          
          // Jatra Story
          const Text(
            'Story Synopsis',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: Color(0xFF001F3F),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            widget.event['story'] ?? 'A traditional Bengali folk drama that tells the story of love, sacrifice, and cultural heritage. This performance showcases the rich tradition of Jatra with authentic costumes, music, and storytelling.',
            style: TextStyle(
              fontSize: 14,
              color: Colors.grey.shade700,
              height: 1.6,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildInfoCard(IconData icon, String title, String value) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.grey.shade50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: const Color(0xFF001F3F), size: 20),
          const SizedBox(height: 8),
          Text(
            title,
            style: TextStyle(
              color: Colors.grey.shade600,
              fontSize: 12,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: const TextStyle(
              color: Color(0xFF001F3F),
              fontSize: 14,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTermsSection() {
    final terms = [
      'All tickets are non-refundable and non-transferable',
      'Entry is subject to security check',
      'Outside food and beverages are not allowed',
      'Photography and recording may be restricted',
      'Event organizers reserve the right to make changes',
    ];
    
    return Column(
      children: terms.map((term) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              margin: const EdgeInsets.only(top: 6),
              width: 4,
              height: 4,
              decoration: const BoxDecoration(
                color: Color(0xFF001F3F),
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                term,
                style: TextStyle(
                  color: Colors.grey.shade700,
                  fontSize: 13,
                  height: 1.4,
                ),
              ),
            ),
          ],
        ),
      )).toList(),
    );
  }

  Widget _buildJatraInfoCard(String title, String value) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Row(
        children: [
          Text(
            '$title: ',
            style: const TextStyle(
              fontWeight: FontWeight.w600,
              color: Color(0xFF001F3F),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: TextStyle(color: Colors.grey.shade700),
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _buildCastList() {
    final cast = widget.event['cast'] ?? [
      {'name': 'Rajesh Kumar', 'role': 'Hero', 'character': 'Prince Arjun'},
      {'name': 'Priya Sharma', 'role': 'Heroine', 'character': 'Princess Radha'},
      {'name': 'Ramesh Babu', 'role': 'Villain', 'character': 'King Duryodhan'},
      {'name': 'Sunita Devi', 'role': 'Supporting', 'character': 'Queen Mother'},
    ];
    
    return cast.map<Widget>((member) => Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
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
          Container(
            width: 50,
            height: 50,
            decoration: BoxDecoration(
              color: const Color(0xFF001F3F).withOpacity(0.1),
              borderRadius: BorderRadius.circular(25),
            ),
            child: const Icon(
              Icons.person,
              color: Color(0xFF001F3F),
              size: 24,
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  member['name'],
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF001F3F),
                  ),
                ),
                Text(
                  '${member['role']} - ${member['character']}',
                  style: TextStyle(
                    color: Colors.grey.shade600,
                    fontSize: 14,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    )).toList();
  }
}

class _SliverTabBarDelegate extends SliverPersistentHeaderDelegate {
  final TabBar _tabBar;

  _SliverTabBarDelegate(this._tabBar);

  @override
  double get minExtent => _tabBar.preferredSize.height;
  @override
  double get maxExtent => _tabBar.preferredSize.height;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
    return Container(
      color: Colors.white,
      child: _tabBar,
    );
  }

  @override
  bool shouldRebuild(_SliverTabBarDelegate oldDelegate) {
    return false;
  }
}