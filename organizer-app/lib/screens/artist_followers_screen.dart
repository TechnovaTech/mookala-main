import 'package:flutter/material.dart';

import '../logic/event_logic.dart';
import '../services/api.dart';
import '../services/api_client.dart';
import '../widgets/common.dart';

/// The customers who follow this artist (`GET /artist/followers`).
class ArtistFollowersScreen extends StatefulWidget {
  const ArtistFollowersScreen({super.key});

  @override
  State<ArtistFollowersScreen> createState() => _ArtistFollowersScreenState();
}

class _ArtistFollowersScreenState extends State<ArtistFollowersScreen> {
  List<Map<String, dynamic>> _followers = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (_followers.isEmpty) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final rows = await Api.artistFollowers();
      if (!mounted) return;
      setState(() {
        _followers = rows;
        _error = null;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      if (_followers.isEmpty) {
        setState(() => _error = e.message);
      } else {
        showMessage(context, e.message, error: true);
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// "since 5 Dec 2026" from an ISO timestamp, or empty.
  static String _since(dynamic value) {
    if (value is! String || value.length < 10) return '';
    final shown = EventLogic.displayDate(value.substring(0, 10));
    return shown == 'Date not set' ? '' : shown;
  }

  Widget _tile(Map<String, dynamic> f) {
    final name = (f['name'] ?? '').toString().trim();
    final city = (f['city'] ?? '').toString().trim();
    final joined = _since(f['followedDate']);
    final details = [if (city.isNotEmpty) city, if (joined.isNotEmpty) 'On Mookalaa since $joined'].join(' · ');
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: ClipOval(
          child: StoredImage(f['profileImage'], width: 44, height: 44, placeholderIcon: Icons.person),
        ),
        title: Row(
          children: [
            Flexible(
              child: Text(name.isEmpty ? 'Mookalaa user' : name,
                  overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
            ),
            if (f['isVerified'] == true) ...[
              const SizedBox(width: 6),
              const Tooltip(
                message: 'Profile completed',
                child: Icon(Icons.check_circle, size: 16, color: Colors.green),
              ),
            ],
          ],
        ),
        subtitle: details.isEmpty ? null : Text(details),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    Widget body;
    if (_loading && _followers.isEmpty) {
      body = const LoadingView();
    } else if (_error != null) {
      body = StateView.error(_error!, onRetry: _load);
    } else if (_followers.isEmpty) {
      body = RefreshIndicator(
        onRefresh: _load,
        child: const StateView(
          icon: Icons.people_outline,
          title: 'No followers yet',
          message: 'People who follow you in the Mookalaa app will appear here.',
        ),
      );
    } else {
      body = RefreshIndicator(
        onRefresh: _load,
        child: ListView.builder(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          itemCount: _followers.length + 1,
          itemBuilder: (context, index) {
            if (index == 0) {
              return Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text(
                  '${_followers.length} follower${_followers.length == 1 ? '' : 's'}',
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.navy),
                ),
              );
            }
            return _tile(_followers[index - 1]);
          },
        ),
      );
    }
    return Scaffold(appBar: appBar('Followers'), body: SafeArea(child: body));
  }
}
