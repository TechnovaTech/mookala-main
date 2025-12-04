import 'package:flutter/material.dart';

class ArtistFollowersScreen extends StatefulWidget {
  const ArtistFollowersScreen({super.key});

  @override
  State<ArtistFollowersScreen> createState() => _ArtistFollowersScreenState();
}

class _ArtistFollowersScreenState extends State<ArtistFollowersScreen> {
  final List<Map<String, dynamic>> _followers = [
    {
      'name': 'Rajesh Kumar',
      'avatar': 'R',
      'followedDate': '2 days ago',
      'location': 'Mumbai',
      'isVerified': true,
    },
    {
      'name': 'Priya Sharma',
      'avatar': 'P',
      'followedDate': '1 week ago',
      'location': 'Delhi',
      'isVerified': false,
    },
    {
      'name': 'Amit Patel',
      'avatar': 'A',
      'followedDate': '2 weeks ago',
      'location': 'Ahmedabad',
      'isVerified': true,
    },
    {
      'name': 'Sneha Reddy',
      'avatar': 'S',
      'followedDate': '3 weeks ago',
      'location': 'Bangalore',
      'isVerified': false,
    },
    {
      'name': 'Vikram Singh',
      'avatar': 'V',
      'followedDate': '1 month ago',
      'location': 'Jaipur',
      'isVerified': true,
    },
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      body: Column(
        children: [
          // Stats Header
          Container(
            padding: const EdgeInsets.all(20),
            margin: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              boxShadow: [
                BoxShadow(
                  color: Colors.grey.withOpacity(0.1),
                  spreadRadius: 1,
                  blurRadius: 4,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    children: [
                      Text(
                        '${_followers.length}',
                        style: const TextStyle(
                          fontSize: 28,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF001F3F),
                        ),
                      ),
                      const Text(
                        'Total Followers',
                        style: TextStyle(
                          fontSize: 14,
                          color: Colors.grey,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  height: 40,
                  width: 1,
                  color: Colors.grey.shade300,
                ),
                Expanded(
                  child: Column(
                    children: [
                      Text(
                        '${_followers.where((f) => f['isVerified']).length}',
                        style: const TextStyle(
                          fontSize: 28,
                          fontWeight: FontWeight.bold,
                          color: Colors.green,
                        ),
                      ),
                      const Text(
                        'Verified Followers',
                        style: TextStyle(
                          fontSize: 14,
                          color: Colors.grey,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          // Followers List
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: _followers.length,
              itemBuilder: (context, index) {
                final follower = _followers[index];
                return Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.grey.withOpacity(0.1),
                        spreadRadius: 1,
                        blurRadius: 4,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  child: Row(
                    children: [
                      // Avatar
                      CircleAvatar(
                        radius: 25,
                        backgroundColor: const Color(0xFF001F3F),
                        child: Text(
                          follower['avatar'],
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      const SizedBox(width: 16),
                      
                      // Follower Info
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Text(
                                  follower['name'],
                                  style: const TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w600,
                                    color: Colors.black87,
                                  ),
                                ),
                                if (follower['isVerified']) ...[
                                  const SizedBox(width: 4),
                                  const Icon(
                                    Icons.verified,
                                    size: 16,
                                    color: Colors.blue,
                                  ),
                                ],
                              ],
                            ),
                            const SizedBox(height: 4),
                            Text(
                              follower['location'],
                              style: TextStyle(
                                fontSize: 14,
                                color: Colors.grey.shade600,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              'Followed ${follower['followedDate']}',
                              style: TextStyle(
                                fontSize: 12,
                                color: Colors.grey.shade500,
                              ),
                            ),
                          ],
                        ),
                      ),
                      
                      // Action Button
                      OutlinedButton(
                        onPressed: () {
                          _showFollowerDetails(follower);
                        },
                        style: OutlinedButton.styleFrom(
                          side: const BorderSide(color: Color(0xFF001F3F)),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        child: const Text(
                          'View',
                          style: TextStyle(
                            color: Color(0xFF001F3F),
                            fontSize: 12,
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

  void _showFollowerDetails(Map<String, dynamic> follower) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Row(
          children: [
            CircleAvatar(
              backgroundColor: const Color(0xFF001F3F),
              child: Text(
                follower['avatar'],
                style: const TextStyle(color: Colors.white),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        follower['name'],
                        style: const TextStyle(fontSize: 18),
                      ),
                      if (follower['isVerified']) ...[
                        const SizedBox(width: 4),
                        const Icon(Icons.verified, size: 18, color: Colors.blue),
                      ],
                    ],
                  ),
                  Text(
                    follower['location'],
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.grey.shade600,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Followed: ${follower['followedDate']}'),
            const SizedBox(height: 8),
            Text('Location: ${follower['location']}'),
            const SizedBox(height: 8),
            Text('Status: ${follower['isVerified'] ? 'Verified User' : 'Regular User'}'),
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