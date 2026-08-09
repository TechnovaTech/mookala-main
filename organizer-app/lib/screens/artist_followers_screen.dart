import 'package:flutter/material.dart';
import '../services/auth_service.dart';

class ArtistFollowersScreen extends StatefulWidget {
  const ArtistFollowersScreen({super.key});

  @override
  State<ArtistFollowersScreen> createState() => _ArtistFollowersScreenState();
}

class _ArtistFollowersScreenState extends State<ArtistFollowersScreen> {
  static const navy = Color(0xFF001F3F);

  bool _loading = true;
  List<Map<String, dynamic>> _followers = [];

  @override
  void initState() {
    super.initState();
    _loadFollowers();
  }

  Future<void> _loadFollowers() async {
    setState(() => _loading = true);
    final userData = await AuthService.getUserData();
    final phone = userData['phone'];
    if (phone == null) {
      if (!mounted) return;
      setState(() {
        _followers = [];
        _loading = false;
      });
      return;
    }
    final result = await AuthService.getArtistFollowers(phone);
    if (!mounted) return;
    final list = (result['followers'] as List?) ?? [];
    setState(() {
      _followers = list.map((f) => Map<String, dynamic>.from(f)).toList();
      _loading = false;
    });
  }

  String _avatarLetter(Map<String, dynamic> f) {
    final name = (f['name']?.toString() ?? '').trim();
    return name.isNotEmpty ? name[0].toUpperCase() : 'U';
  }

  @override
  Widget build(BuildContext context) {
    final verifiedCount = _followers.where((f) => f['isVerified'] == true).length;
    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      appBar: AppBar(
        backgroundColor: navy,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        title: const Text(
          'Followers',
          style: TextStyle(
            color: Colors.white,
            fontSize: 18,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: _loadFollowers,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : Column(
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
                            offset: const Offset(0, 2)),
                      ],
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            children: [
                              Text('${_followers.length}',
                                  style: const TextStyle(
                                      fontSize: 28, fontWeight: FontWeight.bold, color: navy)),
                              const Text('Total Followers',
                                  style: TextStyle(fontSize: 14, color: Colors.grey)),
                            ],
                          ),
                        ),
                        Container(height: 40, width: 1, color: Colors.grey.shade300),
                        Expanded(
                          child: Column(
                            children: [
                              Text('$verifiedCount',
                                  style: const TextStyle(
                                      fontSize: 28, fontWeight: FontWeight.bold, color: Colors.green)),
                              const Text('Verified Followers',
                                  style: TextStyle(fontSize: 14, color: Colors.grey)),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),

                  // Followers list / empty state
                  Expanded(
                    child: _followers.isEmpty
                        ? ListView(
                            children: [
                              const SizedBox(height: 80),
                              Icon(Icons.people_outline, size: 56, color: Colors.grey.shade400),
                              const SizedBox(height: 12),
                              Center(
                                child: Text('No followers yet',
                                    style: TextStyle(color: Colors.grey.shade600, fontSize: 16)),
                              ),
                            ],
                          )
                        : ListView.builder(
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
                                        offset: const Offset(0, 2)),
                                  ],
                                ),
                                child: Row(
                                  children: [
                                    CircleAvatar(
                                      radius: 25,
                                      backgroundColor: navy,
                                      child: Text(_avatarLetter(follower),
                                          style: const TextStyle(
                                              color: Colors.white,
                                              fontSize: 18,
                                              fontWeight: FontWeight.bold)),
                                    ),
                                    const SizedBox(width: 16),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Row(
                                            children: [
                                              Flexible(
                                                child: Text(follower['name']?.toString() ?? 'User',
                                                    style: const TextStyle(
                                                        fontSize: 16,
                                                        fontWeight: FontWeight.w600,
                                                        color: Colors.black87),
                                                    overflow: TextOverflow.ellipsis),
                                              ),
                                              if (follower['isVerified'] == true) ...[
                                                const SizedBox(width: 4),
                                                const Icon(Icons.verified, size: 16, color: Colors.blue),
                                              ],
                                            ],
                                          ),
                                          const SizedBox(height: 4),
                                          Text(
                                            (follower['city']?.toString().isNotEmpty == true)
                                                ? follower['city'].toString()
                                                : 'Location not set',
                                            style: TextStyle(fontSize: 14, color: Colors.grey.shade600),
                                          ),
                                        ],
                                      ),
                                    ),
                                    OutlinedButton(
                                      onPressed: () => _showFollowerDetails(follower),
                                      style: OutlinedButton.styleFrom(
                                        side: const BorderSide(color: navy),
                                        shape: RoundedRectangleBorder(
                                            borderRadius: BorderRadius.circular(8)),
                                      ),
                                      child: const Text('View',
                                          style: TextStyle(color: navy, fontSize: 12)),
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
    );
  }

  void _showFollowerDetails(Map<String, dynamic> follower) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Row(
          children: [
            CircleAvatar(
              backgroundColor: navy,
              child: Text(_avatarLetter(follower),
                  style: const TextStyle(color: Colors.white)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(follower['name']?.toString() ?? 'User',
                  style: const TextStyle(fontSize: 18)),
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Phone: ${follower['phone']?.toString() ?? '—'}'),
            const SizedBox(height: 8),
            Text('Location: ${follower['city']?.toString().isNotEmpty == true ? follower['city'] : 'Not set'}'),
            const SizedBox(height: 8),
            Text('Status: ${follower['isVerified'] == true ? 'Verified User' : 'Regular User'}'),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Close')),
        ],
      ),
    );
  }
}
