import 'package:flutter/material.dart';

import '../models/event.dart';
import '../services/api_client.dart';
import '../services/api_service.dart';
import '../utils/event_filter.dart';
import '../utils/image_source.dart';
import '../widgets/app_image.dart';
import '../widgets/app_theme.dart';
import '../widgets/event_card.dart';
import 'organized_event_details_screen.dart';

/// A public artist profile. Follow state and the follower count come from the
/// server and belong to the signed-in user, not to this phone.
/// Pops with the latest follow state (`bool`) so lists can update.
class ArtistDetailScreen extends StatefulWidget {
  const ArtistDetailScreen({super.key, required this.artist, this.events});

  /// A record from `/artists` or an event's `artistDetails`.
  final Map<String, dynamic> artist;

  /// Loaded events, to list this artist's upcoming ones. Optional.
  final List<EventModel>? events;

  @override
  State<ArtistDetailScreen> createState() => _ArtistDetailScreenState();
}

class _ArtistDetailScreenState extends State<ArtistDetailScreen> {
  bool? _following; // null until the server has answered
  int? _followers;
  bool _toggling = false;
  String? _followError;

  String get _id => (widget.artist['_id'] ?? widget.artist['id'] ?? '').toString();
  String _text(String key) => widget.artist[key] is String ? (widget.artist[key] as String).trim() : '';

  @override
  void initState() {
    super.initState();
    final count = widget.artist['followersCount'];
    if (count is num) _followers = count.toInt();
    _load();
  }

  Future<void> _load() async {
    if (_id.isEmpty) return;
    setState(() => _followError = null);
    try {
      final results = await Future.wait([ApiService.isFollowing(_id), ApiService.getFollowerCount(_id)]);
      if (!mounted) return;
      setState(() {
        _following = results[0] as bool;
        _followers = results[1] as int;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _followError = e.message);
    }
  }

  Future<void> _toggle() async {
    final current = _following;
    if (current == null || _toggling) return;
    setState(() => _toggling = true);
    try {
      final result = await ApiService.setFollowing(_id, !current);
      if (!mounted) return;
      setState(() {
        _following = result.isFollowing;
        _followers = result.followerCount;
        _toggling = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _toggling = false);
      showMessage(context, e.message);
    }
  }

  List<String> get _photos => [
        if (widget.artist['media'] is List)
          for (final item in widget.artist['media'] as List)
            if (item is String && item.isNotEmpty)
              item
            else if (item is Map && item['data'] is String && !isVideoSource(item['data'] as String, item['type']?.toString()))
              item['data'] as String,
      ];

  @override
  Widget build(BuildContext context) {
    final name = _text('name').isEmpty ? 'Artist' : _text('name');
    final banner = _text('bannerImage');
    final details = [_text('genre'), _text('city')].where((s) => s.isNotEmpty).join(' • ');
    final photos = _photos;
    final events = widget.events == null
        ? const <EventModel>[]
        : filterEvents(widget.events!, EventFilter(artistId: _id), DateTime.now());

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) Navigator.of(context).pop(_following);
      },
      child: Scaffold(
        backgroundColor: Colors.white,
        appBar: navyAppBar(name),
        body: ListView(
          padding: const EdgeInsets.only(bottom: 24),
          children: [
            if (banner.isNotEmpty) AppImage(banner, height: 160, width: double.infinity),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  AppAvatar(_text('profileImage'), radius: 40),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(name, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                        if (details.isNotEmpty) Text(details, style: TextStyle(color: Colors.grey.shade700)),
                        if (_followers != null)
                          Text('${_followers!} ${_followers == 1 ? 'follower' : 'followers'}', style: TextStyle(color: Colors.grey.shade700)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: _followError != null
                  ? Row(
                      children: [
                        Expanded(child: Text(_followError!, style: TextStyle(color: Colors.grey.shade700))),
                        TextButton(onPressed: _load, child: const Text('Retry')),
                      ],
                    )
                  : _following == true
                      ? OutlinedButton.icon(
                          onPressed: _toggling ? null : _toggle,
                          icon: const Icon(Icons.check),
                          label: const Text('Following'),
                          style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(46)),
                        )
                      : ElevatedButton.icon(
                          onPressed: _following == null || _toggling ? null : _toggle,
                          icon: const Icon(Icons.person_add_alt),
                          label: Text(_following == null ? 'Loading…' : 'Follow'),
                          style: primaryButtonStyle(),
                        ),
            ),
            if (_text('bio').isNotEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('About', style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 6),
                    Text(_text('bio'), style: const TextStyle(height: 1.4)),
                  ],
                ),
              ),
            if (photos.isNotEmpty) ...[
              const Padding(
                padding: EdgeInsets.fromLTRB(16, 20, 16, 8),
                child: Text('Photos', style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
              ),
              GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                padding: const EdgeInsets.symmetric(horizontal: 16),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 3, crossAxisSpacing: 6, mainAxisSpacing: 6),
                itemCount: photos.length,
                itemBuilder: (context, i) => GestureDetector(
                  onTap: () => showDialog<void>(
                    context: context,
                    builder: (dialog) => Dialog(
                      insetPadding: const EdgeInsets.all(12),
                      child: InteractiveViewer(child: AppImage(photos[i], fit: BoxFit.contain)),
                    ),
                  ),
                  child: ClipRRect(borderRadius: BorderRadius.circular(6), child: AppImage(photos[i])),
                ),
              ),
            ],
            if (events.isNotEmpty) ...[
              const Padding(
                padding: EdgeInsets.fromLTRB(16, 20, 16, 8),
                child: Text('Upcoming events', style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
              ),
              for (final event in events)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                  child: EventCard(
                    event: event,
                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrganizedEventDetailsScreen(event: event))),
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}
