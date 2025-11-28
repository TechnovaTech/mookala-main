import 'package:flutter/material.dart';

class FollowingArtistsScreen extends StatefulWidget {
  const FollowingArtistsScreen({super.key});

  @override
  State<FollowingArtistsScreen> createState() => _FollowingArtistsScreenState();
}

class _FollowingArtistsScreenState extends State<FollowingArtistsScreen> {
  bool notificationsEnabled = true;

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
      'notificationsEnabled': true,
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
      'notificationsEnabled': true,
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
      'notificationsEnabled': false,
    },
    {
      'id': '4',
      'name': 'Shreya Ghoshal',
      'image': 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop&crop=face',
      'followers': '2.8M',
      'upcomingShows': 1,
      'isFollowing': true,
      'genre': 'Playback Singer',
      'lastShow': 'Mar 5, 2025',
      'notificationsEnabled': true,
    },
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.black),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Text(
          'Following',
          style: TextStyle(
            color: Colors.black,
            fontSize: 20,
            fontWeight: FontWeight.bold,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.search, color: Colors.black),
            onPressed: () => _showSearchDialog(),
          ),
        ],
      ),
      body: followingArtists.isEmpty 
        ? _buildEmptyState()
        : Column(
            children: [
              // Notification Settings
              Container(
                color: Colors.white,
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    Icon(Icons.notifications, color: const Color(0xFF001F3F)),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Artist Notifications',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          Text(
                            'Get notified when artists announce new shows',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey.shade600,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Switch(
                      value: notificationsEnabled,
                      onChanged: (value) {
                        setState(() {
                          notificationsEnabled = value;
                        });
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text(
                              notificationsEnabled 
                                ? 'Artist notifications enabled'
                                : 'Artist notifications disabled',
                            ),
                          ),
                        );
                      },
                      activeColor: const Color(0xFF001F3F),
                    ),
                  ],
                ),
              ),
              
              const SizedBox(height: 8),
              
              // Artists List
              Expanded(
                child: ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  itemCount: followingArtists.length,
                  itemBuilder: (context, index) {
                    final artist = followingArtists[index];
                    return _buildArtistCard(artist);
                  },
                ),
              ),
            ],
          ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.favorite_outline,
            size: 80,
            color: Colors.grey.shade400,
          ),
          const SizedBox(height: 16),
          Text(
            'No artists followed yet',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: Colors.grey.shade600,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Follow your favorite artists to get notified\nabout their upcoming shows',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 14,
              color: Colors.grey.shade500,
            ),
          ),
          const SizedBox(height: 24),
          ElevatedButton(
            onPressed: () => Navigator.pop(context),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF001F3F),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
            ),
            child: const Text('Discover Artists'),
          ),
        ],
      ),
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
      child: Column(
        children: [
          Row(
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
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
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
                          ],
                        ),
                        const SizedBox(height: 4),
                        Row(
                          children: [
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
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(
                            artist['isFollowing'] 
                              ? 'Now following ${artist['name']}'
                              : 'Unfollowed ${artist['name']}',
                          ),
                        ),
                      );
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
                ],
              ),
            ],
          ),
          
          if (artist['upcomingShows'] > 0) ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFF001F3F).withOpacity(0.05),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  Icon(Icons.event_available, color: const Color(0xFF001F3F), size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Next Show',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF001F3F),
                          ),
                        ),
                        Text(
                          artist['lastShow'],
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey.shade700,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Column(
                    children: [
                      IconButton(
                        onPressed: () => _toggleArtistNotifications(artist),
                        icon: Icon(
                          artist['notificationsEnabled'] ? Icons.notifications : Icons.notifications_off,
                          color: const Color(0xFF001F3F),
                          size: 20,
                        ),
                      ),
                      TextButton(
                        onPressed: () => _viewArtistShows(artist),
                        child: const Text(
                          'Shows',
                          style: TextStyle(
                            color: Color(0xFF001F3F),
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
          ],
        ],
      ),
    );
  }

  void _toggleArtistNotifications(Map<String, dynamic> artist) {
    setState(() {
      artist['notificationsEnabled'] = !artist['notificationsEnabled'];
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          artist['notificationsEnabled'] 
            ? 'Notifications enabled for ${artist['name']}'
            : 'Notifications disabled for ${artist['name']}',
        ),
      ),
    );
  }

  void _viewArtistShows(Map<String, dynamic> artist) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Viewing shows for ${artist['name']}')),
    );
  }

  void _showSearchDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Search Artists'),
        content: TextField(
          decoration: const InputDecoration(
            hintText: 'Search for artists to follow...',
            prefixIcon: Icon(Icons.search),
          ),
          onChanged: (value) {
            // Implement search functionality
          },
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