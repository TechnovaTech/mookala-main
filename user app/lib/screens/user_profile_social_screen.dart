import 'package:flutter/material.dart';

class UserProfileSocialScreen extends StatefulWidget {
  const UserProfileSocialScreen({super.key});

  @override
  State<UserProfileSocialScreen> createState() => _UserProfileSocialScreenState();
}

class _UserProfileSocialScreenState extends State<UserProfileSocialScreen> with TickerProviderStateMixin {
  late TabController _tabController;
  bool isPremium = false;
  bool notificationsEnabled = true;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
  }

  final List<Map<String, dynamic>> upcomingBookings = [
    {
      'id': 'TKT001234',
      'title': 'AR Rahman Live Concert',
      'artist': 'A.R. Rahman',
      'date': 'Dec 25, 2024',
      'time': '7:00 PM',
      'venue': 'NSCI Dome, Mumbai',
      'seats': 'A12, A13',
      'quantity': 2,
      'price': '₹5,000',
      'image': 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&h=200&fit=crop',
      'status': 'confirmed',
      'qrCode': 'QR123456789',
    },
    {
      'id': 'TKT001235',
      'title': 'Shakespeare Drama',
      'artist': 'Mumbai Theatre Group',
      'date': 'Jan 2, 2025',
      'time': '8:00 PM',
      'venue': 'Prithvi Theatre',
      'seats': 'B5',
      'quantity': 1,
      'price': '₹800',
      'image': 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&h=200&fit=crop',
      'status': 'confirmed',
      'qrCode': 'QR987654321',
    },
  ];

  final List<Map<String, dynamic>> pastBookings = [
    {
      'id': 'TKT001230',
      'title': 'Classical Music Evening',
      'artist': 'Pandit Jasraj',
      'date': 'Nov 15, 2024',
      'venue': 'Tata Theatre',
      'price': '₹1,200',
      'image': 'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=300&h=200&fit=crop',
      'status': 'attended',
      'rating': 5,
    },
    {
      'id': 'TKT001228',
      'title': 'Folk Dance Festival',
      'artist': 'Gujarat Folk Artists',
      'date': 'Oct 20, 2024',
      'venue': 'Shanmukhananda Hall',
      'price': '₹600',
      'image': 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=300&h=200&fit=crop',
      'status': 'attended',
      'rating': 4,
    },
  ];

  final List<Map<String, dynamic>> followingArtists = [
    {
      'id': '1',
      'name': 'A.R. Rahman',
      'image': 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop&crop=face',
      'followers': '2.5M',
      'upcomingShows': 3,
      'isFollowing': true,
      'genre': 'Music Composer',
      'lastShow': 'Dec 25, 2024',
    },
    {
      'id': '2',
      'name': 'Sunidhi Chauhan',
      'image': 'https://images.unsplash.com/photo-1494790108755-2616c9c0b8d3?w=200&h=200&fit=crop&crop=face',
      'followers': '1.8M',
      'upcomingShows': 2,
      'isFollowing': true,
      'genre': 'Playback Singer',
      'lastShow': 'Jan 15, 2025',
    },
    {
      'id': '3',
      'name': 'Arijit Singh',
      'image': 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&h=200&fit=crop&crop=face',
      'followers': '3.2M',
      'upcomingShows': 5,
      'isFollowing': true,
      'genre': 'Playback Singer',
      'lastShow': 'Feb 10, 2025',
    },
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      body: CustomScrollView(
        slivers: [
          // Profile Header
          SliverAppBar(
            expandedHeight: 280,
            pinned: true,
            backgroundColor: const Color(0xFF001F3F),
            flexibleSpace: FlexibleSpaceBar(
              background: Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      const Color(0xFF001F3F),
                      const Color(0xFF001F3F).withOpacity(0.8),
                    ],
                  ),
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const SizedBox(height: 60),
                      Stack(
                        children: [
                          CircleAvatar(
                            radius: 50,
                            backgroundColor: Colors.grey.shade300,
                            child: const Icon(Icons.person, size: 50, color: Colors.white),
                          ),
                          if (isPremium)
                            Positioned(
                              bottom: 0,
                              right: 0,
                              child: Container(
                                padding: const EdgeInsets.all(6),
                                decoration: const BoxDecoration(
                                  color: Colors.orange,
                                  shape: BoxShape.circle,
                                ),
                                child: const Icon(Icons.star, color: Colors.white, size: 16),
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      const Text(
                        'John Doe',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 24,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        decoration: BoxDecoration(
                          color: isPremium ? Colors.orange : Colors.grey.shade600,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              isPremium ? Icons.star : Icons.person,
                              color: Colors.white,
                              size: 16,
                            ),
                            const SizedBox(width: 8),
                            Text(
                              isPremium ? 'Premium Member' : 'Free Member',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 20),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                        children: [
                          _buildStatItem('Events', '${upcomingBookings.length + pastBookings.length}'),
                          _buildStatItem('Following', '${followingArtists.length}'),
                          _buildStatItem('Reviews', '${pastBookings.where((b) => b['rating'] != null).length}'),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
            actions: [
              IconButton(
                icon: const Icon(Icons.settings, color: Colors.white),
                onPressed: () => _showSettingsDialog(),
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
                isScrollable: true,
                tabs: const [
                  Tab(text: 'Upcoming'),
                  Tab(text: 'History'),
                  Tab(text: 'Following'),
                  Tab(text: 'Social'),
                ],
              ),
            ),
          ),

          // Tab Content
          SliverFillRemaining(
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildUpcomingTab(),
                _buildHistoryTab(),
                _buildFollowingTab(),
                _buildSocialTab(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatItem(String label, String value) {
    return Column(
      children: [
        Text(
          value,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.bold,
          ),
        ),
        Text(
          label,
          style: const TextStyle(
            color: Colors.white70,
            fontSize: 12,
          ),
        ),
      ],
    );
  }

  Widget _buildBenefitItem(IconData icon, String text) {
    return Column(
      children: [
        Icon(icon, color: Colors.white, size: 24),
        const SizedBox(height: 4),
        Text(
          text,
          style: const TextStyle(color: Colors.white, fontSize: 12),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }

  Widget _buildUpcomingTab() {
    return ListView.builder(
      padding: const EdgeInsets.all(20),
      itemCount: upcomingBookings.length,
      itemBuilder: (context, index) {
        final booking = upcomingBookings[index];
        return _buildBookingCard(booking, true);
      },
    );
  }

  Widget _buildHistoryTab() {
    return ListView.builder(
      padding: const EdgeInsets.all(20),
      itemCount: pastBookings.length,
      itemBuilder: (context, index) {
        final booking = pastBookings[index];
        return _buildBookingCard(booking, false);
      },
    );
  }

  Widget _buildBookingCard(Map<String, dynamic> booking, bool isUpcoming) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.grey.withOpacity(0.1),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        children: [
          Container(
            height: 140,
            decoration: BoxDecoration(
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(16),
                topRight: Radius.circular(16),
              ),
              image: DecorationImage(
                image: NetworkImage(booking['image']),
                fit: BoxFit.cover,
              ),
            ),
            child: Container(
              decoration: BoxDecoration(
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(16),
                  topRight: Radius.circular(16),
                ),
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.transparent,
                    Colors.black.withOpacity(0.7),
                  ],
                ),
              ),
              child: Stack(
                children: [
                  Positioned(
                    top: 12,
                    right: 12,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: isUpcoming ? Colors.green : Colors.grey,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        isUpcoming ? 'UPCOMING' : 'ATTENDED',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ),
                  Positioned(
                    bottom: 12,
                    left: 12,
                    right: 12,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          booking['title'],
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        Text(
                          booking['artist'],
                          style: const TextStyle(
                            color: Colors.white70,
                            fontSize: 14,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                Row(
                  children: [
                    const Icon(Icons.calendar_today, color: Color(0xFF001F3F), size: 16),
                    const SizedBox(width: 8),
                    Text(booking['date'], style: const TextStyle(fontWeight: FontWeight.w600)),
                    if (isUpcoming) ...[
                      const SizedBox(width: 16),
                      const Icon(Icons.access_time, color: Color(0xFF001F3F), size: 16),
                      const SizedBox(width: 8),
                      Text(booking['time'], style: const TextStyle(fontWeight: FontWeight.w600)),
                    ],
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    const Icon(Icons.location_on, color: Color(0xFF001F3F), size: 16),
                    const SizedBox(width: 8),
                    Expanded(child: Text(booking['venue'])),
                  ],
                ),
                if (isUpcoming) ...[
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      const Icon(Icons.confirmation_number, color: Color(0xFF001F3F), size: 16),
                      const SizedBox(width: 8),
                      Text('${booking['quantity']} Tickets - ${booking['seats']}'),
                    ],
                  ),
                ],
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Ticket ID: ${booking['id']}',
                          style: TextStyle(
                            color: Colors.grey.shade600,
                            fontSize: 12,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          booking['price'],
                          style: const TextStyle(
                            color: Color(0xFF001F3F),
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                    if (!isUpcoming && booking['rating'] != null)
                      Row(
                        children: List.generate(5, (i) => Icon(
                          Icons.star,
                          size: 16,
                          color: i < booking['rating'] ? Colors.orange : Colors.grey.shade300,
                        )),
                      ),
                  ],
                ),
                if (isUpcoming) ...[
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () => _downloadTicket(booking),
                          icon: const Icon(Icons.download, size: 16),
                          label: const Text('Download'),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: const Color(0xFF001F3F),
                            side: const BorderSide(color: Color(0xFF001F3F)),
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: ElevatedButton.icon(
                          onPressed: () => _showQRCode(booking),
                          icon: const Icon(Icons.qr_code, size: 16),
                          label: const Text('Show QR'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF001F3F),
                            foregroundColor: Colors.white,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFollowingTab() {
    return ListView.builder(
      padding: const EdgeInsets.all(20),
      itemCount: followingArtists.length,
      itemBuilder: (context, index) {
        final artist = followingArtists[index];
        return _buildArtistCard(artist);
      },
    );
  }

  Widget _buildArtistCard(Map<String, dynamic> artist) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.grey.withOpacity(0.1),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 35,
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
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF001F3F),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  artist['genre'],
                  style: TextStyle(
                    color: Colors.grey.shade600,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Icon(Icons.people, color: Colors.grey.shade600, size: 16),
                    const SizedBox(width: 4),
                    Text(
                      '${artist['followers']} followers',
                      style: TextStyle(
                        color: Colors.grey.shade600,
                        fontSize: 12,
                      ),
                    ),
                    const SizedBox(width: 16),
                    Icon(Icons.event, color: Colors.grey.shade600, size: 16),
                    const SizedBox(width: 4),
                    Text(
                      '${artist['upcomingShows']} shows',
                      style: TextStyle(
                        color: Colors.grey.shade600,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          Column(
            children: [
              ElevatedButton(
                onPressed: () {
                  setState(() {
                    artist['isFollowing'] = !artist['isFollowing'];
                  });
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: artist['isFollowing'] ? Colors.grey.shade300 : const Color(0xFF001F3F),
                  foregroundColor: artist['isFollowing'] ? Colors.black : Colors.white,
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                ),
                child: Text(
                  artist['isFollowing'] ? 'Following' : 'Follow',
                  style: const TextStyle(fontSize: 12),
                ),
              ),
              const SizedBox(height: 8),
              IconButton(
                onPressed: () => _toggleNotifications(artist),
                icon: Icon(
                  notificationsEnabled ? Icons.notifications : Icons.notifications_off,
                  color: const Color(0xFF001F3F),
                ),
                iconSize: 20,
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSocialTab() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Social Features',
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.bold,
              color: Color(0xFF001F3F),
            ),
          ),
          const SizedBox(height: 20),
          _buildSocialFeatureCard(
            Icons.share,
            'Share Profile',
            'Let friends discover your music taste',
            () => _shareProfile(),
          ),
          _buildSocialFeatureCard(
            Icons.group_add,
            'Invite Friends',
            'Invite friends to join the platform',
            () => _inviteFriends(),
          ),
          _buildSocialFeatureCard(
            Icons.reviews,
            'Write Reviews',
            'Share your event experiences',
            () => _writeReview(),
          ),
          _buildSocialFeatureCard(
            Icons.leaderboard,
            'Event Leaderboard',
            'See who attends the most events',
            () => _showLeaderboard(),
          ),
        ],
      ),
    );
  }

  Widget _buildSocialFeatureCard(IconData icon, String title, String subtitle, VoidCallback onTap) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      child: ListTile(
        leading: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: const Color(0xFF001F3F).withOpacity(0.1),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(icon, color: const Color(0xFF001F3F)),
        ),
        title: Text(
          title,
          style: const TextStyle(
            fontWeight: FontWeight.bold,
            color: Color(0xFF001F3F),
          ),
        ),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.arrow_forward_ios, size: 16),
        onTap: onTap,
        tileColor: Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
    );
  }

  void _downloadTicket(Map<String, dynamic> booking) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Downloading ticket for ${booking['title']}')),
    );
  }

  void _showQRCode(Map<String, dynamic> booking) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('QR Code - ${booking['title']}'),
        content: Container(
          width: 200,
          height: 200,
          decoration: BoxDecoration(
            border: Border.all(color: Colors.grey),
            borderRadius: BorderRadius.circular(8),
          ),
          child: const Center(
            child: Icon(Icons.qr_code, size: 150, color: Color(0xFF001F3F)),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  void _toggleNotifications(Map<String, dynamic> artist) {
    setState(() {
      notificationsEnabled = !notificationsEnabled;
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          notificationsEnabled 
            ? 'Notifications enabled for ${artist['name']}'
            : 'Notifications disabled for ${artist['name']}',
        ),
      ),
    );
  }

  void _shareProfile() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Profile shared successfully!')),
    );
  }

  void _inviteFriends() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Invite sent to friends!')),
    );
  }

  void _writeReview() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Opening review editor...')),
    );
  }

  void _showLeaderboard() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Loading event leaderboard...')),
    );
  }

  void _showSettingsDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Profile Settings'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.edit),
              title: const Text('Edit Profile'),
              onTap: () => Navigator.pop(context),
            ),
            ListTile(
              leading: const Icon(Icons.privacy_tip),
              title: const Text('Privacy Settings'),
              onTap: () => Navigator.pop(context),
            ),
            ListTile(
              leading: const Icon(Icons.notifications),
              title: const Text('Notification Settings'),
              onTap: () => Navigator.pop(context),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close'),
          ),
        ],
      ),
    );
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