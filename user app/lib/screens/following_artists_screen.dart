import 'package:flutter/material.dart';

import '../services/api_client.dart';
import '../services/api_service.dart';
import '../widgets/app_image.dart';
import '../widgets/app_theme.dart';
import '../widgets/state_views.dart';
import 'artist_detail_screen.dart';

/// The artists the signed-in user follows, read from the server.
///
/// The backend has no "artists I follow" list yet, so this asks
/// `/user/follow-status` once per public artist (a few at a time).
class FollowingArtistsScreen extends StatefulWidget {
  const FollowingArtistsScreen({super.key});

  @override
  State<FollowingArtistsScreen> createState() => _FollowingArtistsScreenState();
}

class _FollowingArtistsScreenState extends State<FollowingArtistsScreen> {
  final _search = TextEditingController();
  List<Map<String, dynamic>> _followed = [];
  final Set<String> _busy = {};
  bool _loading = true;
  bool _searching = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final artists = await ApiService.getArtists();
      final followed = <Map<String, dynamic>>[];
      const batch = 6;
      for (var i = 0; i < artists.length; i += batch) {
        final slice = artists.skip(i).take(batch).toList();
        final states = await Future.wait([for (final a in slice) ApiService.isFollowing((a['_id'] ?? '').toString())]);
        for (var j = 0; j < slice.length; j++) {
          if (states[j]) followed.add(slice[j]);
        }
      }
      if (!mounted) return;
      setState(() {
        _followed = followed;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.message;
      });
    }
  }

  Future<void> _unfollow(Map<String, dynamic> artist) async {
    final id = (artist['_id'] ?? '').toString();
    setState(() => _busy.add(id));
    try {
      final result = await ApiService.setFollowing(id, false);
      if (!mounted) return;
      setState(() {
        _busy.remove(id);
        if (!result.isFollowing) _followed.removeWhere((a) => a['_id'] == artist['_id']);
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _busy.remove(id));
      showMessage(context, e.message);
    }
  }

  Future<void> _open(Map<String, dynamic> artist) async {
    final following = await Navigator.push<bool?>(context, MaterialPageRoute(builder: (_) => ArtistDetailScreen(artist: artist)));
    if (following == false && mounted) {
      setState(() => _followed.removeWhere((a) => a['_id'] == artist['_id']));
    }
  }

  @override
  Widget build(BuildContext context) {
    final query = _search.text.trim().toLowerCase();
    final shown = query.isEmpty
        ? _followed
        : _followed.where((a) => (a['name'] ?? '').toString().toLowerCase().contains(query)).toList();

    return Scaffold(
      backgroundColor: Colors.grey.shade100,
      appBar: AppBar(
        backgroundColor: AppColors.navy,
        foregroundColor: Colors.white,
        title: _searching
            ? TextField(
                controller: _search,
                autofocus: true,
                style: const TextStyle(color: Colors.white),
                cursorColor: Colors.white,
                decoration: const InputDecoration(hintText: 'Search by name', hintStyle: TextStyle(color: Colors.white70), border: InputBorder.none),
                onChanged: (_) => setState(() {}),
              )
            : const Text('Following', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w600)),
        actions: [
          IconButton(
            tooltip: _searching ? 'Close search' : 'Search',
            icon: Icon(_searching ? Icons.close : Icons.search),
            onPressed: () => setState(() {
              _searching = !_searching;
              if (!_searching) _search.clear();
            }),
          ),
        ],
      ),
      body: _loading
          ? const LoadingView()
          : _error != null
              ? ErrorView(message: _error!, onRetry: _load)
              : RefreshIndicator(
                  onRefresh: _load,
                  child: shown.isEmpty
                      ? ListView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          children: [
                            const SizedBox(height: 80),
                            EmptyView(
                              icon: Icons.people_outline,
                              title: _followed.isEmpty ? 'You are not following any artist yet' : 'No artist matches "$query"',
                              subtitle: _followed.isEmpty ? 'Follow artists from the home screen to see them here.' : null,
                            ),
                          ],
                        )
                      : ListView.separated(
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: const EdgeInsets.all(16),
                          itemCount: shown.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 8),
                          itemBuilder: (context, i) {
                            final artist = shown[i];
                            final id = (artist['_id'] ?? '').toString();
                            final details = [artist['genre'], artist['city']]
                                .whereType<String>()
                                .map((s) => s.trim())
                                .where((s) => s.isNotEmpty)
                                .join(' • ');
                            final followers = artist['followersCount'];
                            return Card(
                              margin: EdgeInsets.zero,
                              color: Colors.white,
                              surfaceTintColor: Colors.white,
                              child: ListTile(
                                onTap: () => _open(artist),
                                leading: AppAvatar(artist['profileImage'] is String ? artist['profileImage'] as String : null),
                                title: Text((artist['name'] ?? 'Artist').toString(), style: const TextStyle(fontWeight: FontWeight.w600)),
                                subtitle: Text([
                                  if (details.isNotEmpty) details,
                                  if (followers is num) '${followers.toInt()} ${followers == 1 ? 'follower' : 'followers'}',
                                ].join('\n')),
                                isThreeLine: details.isNotEmpty && followers is num,
                                trailing: OutlinedButton(
                                  onPressed: _busy.contains(id) ? null : () => _unfollow(artist),
                                  child: const Text('Unfollow'),
                                ),
                              ),
                            );
                          },
                        ),
                ),
    );
  }
}
