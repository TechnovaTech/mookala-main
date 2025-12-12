import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/api_service.dart';

class FollowingArtistsScreen extends StatefulWidget {
  const FollowingArtistsScreen({super.key});

  @override
  State<FollowingArtistsScreen> createState() => _FollowingArtistsScreenState();
}

class _FollowingArtistsScreenState extends State<FollowingArtistsScreen> {
  bool notificationsEnabled = true;
  List<Map<String, dynamic>> followingArtists = [];
  bool _isLoading = false;
  Set<String> _togglingArtists = {};
  
  @override
  void initState() {
    super.initState();
    _loadArtists();
  }
  
  Future<void> _loadFollowStatus(List<Map<String, dynamic>> artists) async {
    final prefs = await SharedPreferences.getInstance();
    for (var artist in artists) {
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
      _isLoading = true;
    });
    
    final result = await ApiService.getArtists();
    
    if (result['success'] == true && result['artists'] != null) {
      final artists = (result['artists'] as List).map((artist) => {
        'id': artist['_id'],
        'name': artist['name'] ?? 'Unknown Artist',
        'image': (artist['profileImage'] != null && artist['profileImage'].toString().isNotEmpty) 
          ? artist['profileImage'] 
          : 'https://ui-avatars.com/api/?name=${Uri.encodeComponent(artist['name'] ?? 'Artist')}&size=200&background=001F3F&color=fff',
        'followers': '0',
        'upcomingShows': 0,
        'isFollowing': false,
        'genre': artist['genre'] ?? 'Artist',
        'lastShow': 'TBA',
        'notificationsEnabled': true,
      }).toList();
      
      await _loadFollowStatus(artists);
      
      setState(() {
        followingArtists = artists.where((artist) => artist['isFollowing'] == true).toList();
        _isLoading = false;
      });
    } else {
      setState(() {
        _isLoading = false;
      });
    }
  }

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
      body: _isLoading
        ? const Center(child: CircularProgressIndicator())
        : followingArtists.isEmpty 
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
              Container(
                width: 70,
                height: 70,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.grey.shade200,
                ),
                child: ClipOval(
                  child: Image.network(
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
                              fontSize: 30,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
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
                    onPressed: _togglingArtists.contains(artist['id']) ? null : () async {
                      final artistId = artist['id'];
                      final userPhone = await ApiService.getUserPhone();
                      
                      if (artistId == null || userPhone == null) return;
                      
                      // Prevent multiple simultaneous requests
                      if (_togglingArtists.contains(artistId)) return;
                      
                      setState(() {
                        _togglingArtists.add(artistId);
                      });
                      
                      try {
                        final wasFollowing = artist['isFollowing'];
                        final action = wasFollowing ? 'unfollow' : 'follow';
                        
                        // Update UI optimistically
                        setState(() {
                          artist['isFollowing'] = !artist['isFollowing'];
                        });
                        
                        // Save to backend
                        final result = await ApiService.toggleFollowArtist(
                          artistId: artistId,
                          userPhone: userPhone,
                          action: action,
                        );
                        
                        if (result['success'] == true) {
                          // Update with server response
                          setState(() {
                            artist['isFollowing'] = result['isFollowing'] ?? artist['isFollowing'];
                          });
                          
                          await _saveFollowStatus(artistId, artist['isFollowing']);
                          
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text(
                                artist['isFollowing'] 
                                  ? 'Now following ${artist['name']}'
                                  : 'Unfollowed ${artist['name']}',
                              ),
                            ),
                          );
                          
                          // Remove from list if unfollowed
                          if (!artist['isFollowing']) {
                            setState(() {
                              followingArtists.removeWhere((a) => a['id'] == artist['id']);
                            });
                          }
                        } else {
                          // Revert on failure
                          setState(() {
                            artist['isFollowing'] = wasFollowing;
                          });
                          await _saveFollowStatus(artistId, wasFollowing);
                          
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('Failed to update follow status'),
                            ),
                          );
                        }
                      } catch (e) {
                        print('Error toggling follow: $e');
                        // Reload artist data on error
                        await _loadArtists();
                      } finally {
                        setState(() {
                          _togglingArtists.remove(artistId);
                        });
                      }
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