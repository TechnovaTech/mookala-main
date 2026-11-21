import 'package:flutter/material.dart';

import '../models/event.dart';
import '../services/api_client.dart';
import '../services/api_service.dart';
import '../services/session.dart';
import '../utils/event_filter.dart';
import '../widgets/app_image.dart';
import '../widgets/app_theme.dart';
import '../widgets/event_card.dart';
import '../widgets/promo_carousel.dart';
import '../widgets/state_views.dart';
import 'artist_detail_screen.dart';
import 'category_events_screen.dart';
import 'filter_screen.dart';
import 'hire_professionals_screen.dart';
import 'my_bookings_screen.dart';
import 'organized_event_details_screen.dart';
import 'user_profile_menu_screen.dart';

/// How many artists the home screen shows (and asks the follow state for).
const int _homeArtistLimit = 12;

/// The home screen. Everything on it comes from the backend: events, banners,
/// ads, categories and artists. A section with nothing to show is left out or
/// says so; nothing is filled in with sample content.
class DiscoveryHomeScreen extends StatefulWidget {
  const DiscoveryHomeScreen({super.key});

  @override
  State<DiscoveryHomeScreen> createState() => _DiscoveryHomeScreenState();
}

class _DiscoveryHomeScreenState extends State<DiscoveryHomeScreen> {
  final _searchController = TextEditingController();
  final _scrollController = ScrollController();
  final _artistsKey = GlobalKey();

  // Events
  List<EventModel> _events = [];
  bool _loadingEvents = true;
  String? _eventsError;

  // Other sections: each fails on its own without blocking the rest.
  List<Promo> _banners = [];
  List<Promo> _ads = [];
  List<Map<String, dynamic>> _categories = [];
  List<Map<String, dynamic>> _artists = [];
  bool _loadingArtists = true;
  String? _artistsError;

  /// artist id -> following? Absent while the server has not answered.
  final Map<String, bool> _following = {};
  final Set<String> _togglingFollow = {};

  // The city the user picked (saved in their profile) and whether it is applied.
  String _city = '';
  bool _allCities = false;

  EventFilter _filter = const EventFilter();

  @override
  void initState() {
    super.initState();
    _loadAll();
  }

  @override
  void dispose() {
    _searchController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  /* ------------------------------ Loading ------------------------------ */

  Future<void> _loadAll() async {
    await Future.wait([_loadEvents(), _loadCity(), _loadPromos(), _loadCategories(), _loadArtists()]);
  }

  Future<void> _loadEvents() async {
    setState(() {
      _loadingEvents = true;
      _eventsError = null;
    });
    try {
      final events = await ApiService.getEvents();
      if (!mounted) return;
      setState(() {
        _events = events;
        _loadingEvents = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _loadingEvents = false;
        _eventsError = e.message;
      });
    }
  }

  Future<void> _loadCity() async {
    try {
      final user = await ApiService.getProfile();
      final all = await Session.showAllCities();
      if (!mounted) return;
      setState(() {
        _city = (user['city'] ?? '').toString().trim();
        _allCities = all;
      });
    } on ApiException {
      // Without the profile the home screen simply shows every city.
    }
  }

  Future<void> _loadPromos() async {
    // Banners and ads are decoration: when they fail the section is left out.
    try {
      final banners = await ApiService.getBanners();
      if (mounted) setState(() => _banners = banners.map(Promo.fromJson).where((p) => p.media.isNotEmpty).toList());
    } on ApiException {
      if (mounted) setState(() => _banners = []);
    }
    try {
      final ads = await ApiService.getAds();
      if (mounted) setState(() => _ads = ads.map(Promo.fromJson).where((p) => p.media.isNotEmpty).toList());
    } on ApiException {
      if (mounted) setState(() => _ads = []);
    }
  }

  Future<void> _loadCategories() async {
    try {
      final categories = await ApiService.getCategories();
      if (mounted) setState(() => _categories = categories.where((c) => (c['name'] ?? '').toString().trim().isNotEmpty).toList());
    } on ApiException {
      if (mounted) setState(() => _categories = []);
    }
  }

  Future<void> _loadArtists() async {
    setState(() {
      _loadingArtists = true;
      _artistsError = null;
    });
    try {
      final artists = await ApiService.getArtists();
      if (!mounted) return;
      setState(() {
        _artists = artists;
        _loadingArtists = false;
      });
      _loadFollowStates(artists.take(_homeArtistLimit));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _loadingArtists = false;
        _artistsError = e.message;
      });
    }
  }

  /// Follow state per user, from the server. A failed check leaves the button
  /// in its "unknown" state rather than guessing.
  Future<void> _loadFollowStates(Iterable<Map<String, dynamic>> artists) async {
    await Future.wait([
      for (final artist in artists)
        () async {
          final id = (artist['_id'] ?? '').toString();
          if (id.isEmpty) return;
          try {
            final following = await ApiService.isFollowing(id);
            if (mounted) setState(() => _following[id] = following);
          } on ApiException {
            // left unknown
          }
        }(),
    ]);
  }

  Future<void> _toggleFollow(Map<String, dynamic> artist) async {
    final id = (artist['_id'] ?? '').toString();
    final current = _following[id];
    if (current == null || _togglingFollow.contains(id)) return;
    setState(() => _togglingFollow.add(id));
    try {
      final result = await ApiService.setFollowing(id, !current);
      if (!mounted) return;
      setState(() {
        _following[id] = result.isFollowing;
        artist['followersCount'] = result.followerCount;
        _togglingFollow.remove(id);
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _togglingFollow.remove(id));
      showMessage(context, e.message);
    }
  }

  /* ------------------------------ Derived ------------------------------ */

  String get _activeCity => _allCities ? '' : _city;

  EventFilter get _effectiveFilter => _filter.copyWith(query: _searchController.text, city: _activeCity);

  Map<String, String> get _artistNames => {
        for (final artist in _artists)
          if ((artist['_id'] ?? '').toString().isNotEmpty) artist['_id'].toString(): (artist['name'] ?? '').toString(),
      };

  /* ------------------------------ Actions ------------------------------ */

  void _openEvent(EventModel event) {
    Navigator.push(context, MaterialPageRoute(builder: (_) => OrganizedEventDetailsScreen(event: event)));
  }

  Future<void> _openArtist(Map<String, dynamic> artist) async {
    final following = await Navigator.push<bool?>(
      context,
      MaterialPageRoute(builder: (_) => ArtistDetailScreen(artist: artist, events: _events)),
    );
    final id = (artist['_id'] ?? '').toString();
    if (following != null && mounted) setState(() => _following[id] = following);
  }

  Future<void> _openFilters() async {
    final result = await Navigator.push<EventFilter>(
      context,
      MaterialPageRoute(builder: (_) => FilterScreen(initial: _filter, events: _events, artistNames: _artistNames)),
    );
    if (result != null && mounted) setState(() => _filter = result);
  }

  Future<void> _pickCity() async {
    final cities = citiesOf(_events);
    if (_city.isNotEmpty && !cities.any((c) => sameCity(c, _city))) cities.insert(0, _city);
    final choice = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.white,
      builder: (sheet) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 16, 16, 4),
              child: Text('Show events in', style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
            ),
            ListTile(
              leading: const Icon(Icons.public),
              title: const Text('All cities'),
              trailing: _activeCity.isEmpty ? const Icon(Icons.check, color: AppColors.navy) : null,
              onTap: () => Navigator.pop(sheet, ''),
            ),
            for (final city in cities)
              ListTile(
                leading: const Icon(Icons.location_city_outlined),
                title: Text(city),
                trailing: sameCity(city, _activeCity) ? const Icon(Icons.check, color: AppColors.navy) : null,
                onTap: () => Navigator.pop(sheet, city),
              ),
            if (cities.isEmpty)
              Padding(
                padding: const EdgeInsets.all(16),
                child: Text('No event lists a city yet.', style: TextStyle(color: Colors.grey.shade700)),
              ),
          ],
        ),
      ),
    );
    if (choice == null || !mounted) return;

    if (choice.isEmpty) {
      await Session.setShowAllCities(true);
      if (mounted) setState(() => _allCities = true);
      return;
    }
    try {
      // The chosen city is part of the user's profile, so it follows them to another phone.
      await ApiService.updateProfile(city: choice);
      await Session.setShowAllCities(false);
      if (!mounted) return;
      setState(() {
        _city = choice;
        _allCities = false;
      });
    } on ApiException catch (e) {
      if (mounted) showMessage(context, 'Your city was not saved. ${e.message}');
    }
  }

  void _clearFilters() => setState(() {
        _filter = const EventFilter();
        _searchController.clear();
      });

  /* -------------------------------- UI -------------------------------- */

  @override
  Widget build(BuildContext context) {
    final filter = _effectiveFilter;
    final now = DateTime.now();
    final browsing = filter.query.trim().isEmpty && _filter.activeCount == 0;
    final shown = filterEvents(_events, filter, now);

    return Scaffold(
      backgroundColor: Colors.grey.shade100,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            _header(),
            Expanded(
              child: RefreshIndicator(
                onRefresh: _loadAll,
                child: ListView(
                  controller: _scrollController,
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.only(bottom: 24),
                  children: browsing ? _browseSections(shown, now) : _resultSections(shown),
                ),
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: BottomNavigationBar(
        type: BottomNavigationBarType.fixed,
        backgroundColor: Colors.white,
        selectedItemColor: AppColors.navy,
        unselectedItemColor: Colors.grey,
        currentIndex: 0,
        onTap: (index) {
          if (index == 1) Navigator.push(context, MaterialPageRoute(builder: (_) => const MyBookingsScreen()));
          if (index == 2) {
            Navigator.push(context, MaterialPageRoute(builder: (_) => const UserProfileMenuScreen())).then((_) {
              if (mounted) _loadCity();
            });
          }
        },
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.home), label: 'Home'),
          BottomNavigationBarItem(icon: Icon(Icons.confirmation_number), label: 'Tickets'),
          BottomNavigationBarItem(icon: Icon(Icons.person), label: 'Profile'),
        ],
      ),
    );
  }

  Widget _header() {
    final filterCount = _filter.activeCount;
    return Container(
      color: AppColors.navy,
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          InkWell(
            onTap: _pickCity,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.location_on, color: AppColors.green, size: 20),
                  const SizedBox(width: 6),
                  Text(
                    _activeCity.isEmpty ? 'All cities' : _activeCity,
                    style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.bold),
                  ),
                  const Icon(Icons.arrow_drop_down, color: Colors.white),
                ],
              ),
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _searchController,
                  onChanged: (_) => setState(() {}),
                  textInputAction: TextInputAction.search,
                  decoration: InputDecoration(
                    hintText: 'Search events, venues, cities',
                    prefixIcon: const Icon(Icons.search),
                    suffixIcon: _searchController.text.isEmpty
                        ? null
                        : IconButton(icon: const Icon(Icons.clear), onPressed: () => setState(_searchController.clear)),
                    filled: true,
                    fillColor: Colors.white,
                    isDense: true,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Badge(
                isLabelVisible: filterCount > 0,
                label: Text('$filterCount'),
                child: IconButton.filled(
                  tooltip: 'Filters',
                  style: IconButton.styleFrom(backgroundColor: Colors.white, foregroundColor: AppColors.navy),
                  onPressed: _loadingEvents ? null : _openFilters,
                  icon: const Icon(Icons.tune),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _sectionTitle(String title, {VoidCallback? onViewAll}) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 22, 8, 10),
        child: Row(
          children: [
            Expanded(child: Text(title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold))),
            if (onViewAll != null) TextButton(onPressed: onViewAll, child: const Text('View all')),
          ],
        ),
      );

  /// Search or filters are active: one list of matching events.
  List<Widget> _resultSections(List<EventModel> shown) {
    return [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 8, 8),
        child: Row(
          children: [
            Expanded(
              child: Text(
                _loadingEvents ? 'Searching…' : '${shown.length} ${shown.length == 1 ? 'event' : 'events'} found',
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
              ),
            ),
            TextButton(onPressed: _clearFilters, child: const Text('Clear')),
          ],
        ),
      ),
      if (_filter.dates != null)
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Align(
            alignment: Alignment.centerLeft,
            child: InputChip(
              avatar: const Icon(Icons.date_range, size: 18),
              label: Text(_filter.dates!.label),
              onDeleted: () => setState(() => _filter = _filter.copyWith(clearDates: true)),
            ),
          ),
        ),
      if (_loadingEvents)
        const Padding(padding: EdgeInsets.all(40), child: LoadingView())
      else if (_eventsError != null)
        ErrorView(message: _eventsError!, onRetry: _loadEvents)
      else if (shown.isEmpty)
        EmptyView(
          icon: Icons.search_off,
          title: 'No events match',
          subtitle: _activeCity.isEmpty ? 'Try a different search or fewer filters.' : 'Only events in $_activeCity are shown. Try "All cities".',
        )
      else
        for (final event in shown)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
            child: EventCard(event: event, imageHeight: 170, onTap: () => _openEvent(event)),
          ),
    ];
  }

  List<Widget> _browseSections(List<EventModel> shown, DateTime now) {
    final presets = datePresets(now);
    return [
      if (_banners.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 16), child: PromoCarousel(items: _banners)),

      // Quick access: each chip opens something that exists.
      SizedBox(
        height: 56,
        child: ListView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.fromLTRB(16, 14, 8, 2),
          children: [
            _quickChip(Icons.people_alt_outlined, 'Artists', () {
              final ctx = _artistsKey.currentContext;
              if (ctx != null) Scrollable.ensureVisible(ctx, duration: const Duration(milliseconds: 400), curve: Curves.easeInOut);
            }),
            _quickChip(Icons.event_outlined, 'All events',
                () => Navigator.push(context, MaterialPageRoute(builder: (_) => CategoryEventsScreen(preloaded: _events)))),
            _quickChip(Icons.camera_alt_outlined, 'Photographers',
                () => Navigator.push(context, MaterialPageRoute(builder: (_) => const HireProfessionalsScreen(type: 'photographer')))),
            _quickChip(Icons.videocam_outlined, 'Videographers',
                () => Navigator.push(context, MaterialPageRoute(builder: (_) => const HireProfessionalsScreen(type: 'videographer')))),
          ],
        ),
      ),

      _sectionTitle('When'),
      SizedBox(
        height: 30 + MediaQuery.textScalerOf(context).scale(36),
        child: ListView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          children: [
            for (final preset in presets)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: _dateCard(preset.title, preset.range.label, () => setState(() => _filter = _filter.copyWith(dates: preset.range))),
              ),
            _dateCard('Pick dates', 'Choose a range', () async {
              final picked = await showDateRangePicker(
                context: context,
                firstDate: DateTime(now.year, now.month, now.day),
                lastDate: DateTime(now.year + 2, now.month, now.day),
              );
              if (picked != null && mounted) setState(() => _filter = _filter.copyWith(dates: DayRange(picked.start, picked.end)));
            }),
          ],
        ),
      ),

      if (_categories.isNotEmpty) ...[
        _sectionTitle('Categories'),
        SizedBox(
          height: 84 + MediaQuery.textScalerOf(context).scale(36),
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: _categories.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (_, i) => _categoryCard(_categories[i]),
          ),
        ),
      ],

      _sectionTitle(
        _activeCity.isEmpty ? 'Upcoming events' : 'Upcoming in $_activeCity',
        onViewAll: shown.length > 1
            ? () => Navigator.push(context, MaterialPageRoute(builder: (_) => CategoryEventsScreen(preloaded: shown)))
            : null,
      ),
      if (_loadingEvents)
        const SizedBox(height: 160, child: LoadingView())
      else if (_eventsError != null)
        ErrorView(message: _eventsError!, onRetry: _loadEvents, compact: true)
      else if (shown.isEmpty)
        EmptyView(
          compact: true,
          icon: Icons.event_busy,
          title: _activeCity.isEmpty ? 'No upcoming events yet' : 'No upcoming events in $_activeCity',
          subtitle: _activeCity.isEmpty ? 'New events will appear here.' : null,
          action: _activeCity.isEmpty
              ? null
              : OutlinedButton(
                  onPressed: () async {
                    await Session.setShowAllCities(true);
                    if (mounted) setState(() => _allCities = true);
                  },
                  child: const Text('Show all cities'),
                ),
        )
      else ...[
        // The soonest event gets the large card.
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: EventCard(event: shown.first, imageHeight: 190, onTap: () => _openEvent(shown.first)),
        ),
        if (shown.length > 1)
          SizedBox(
            // Room for the picture plus four lines of text at the user's text size.
            height: 176 + MediaQuery.textScalerOf(context).scale(110),
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
              itemCount: shown.length - 1 > 10 ? 10 : shown.length - 1,
              separatorBuilder: (_, __) => const SizedBox(width: 12),
              itemBuilder: (_, i) => EventCard(event: shown[i + 1], width: 230, imageHeight: 120, onTap: () => _openEvent(shown[i + 1])),
            ),
          ),
      ],

      if (_ads.isNotEmpty) ...[
        _sectionTitle('Sponsored'),
        PromoCarousel(items: _ads, height: 150, showSponsor: true),
      ],

      KeyedSubtree(key: _artistsKey, child: _sectionTitle('Artists')),
      if (_loadingArtists)
        const SizedBox(height: 120, child: LoadingView())
      else if (_artistsError != null)
        ErrorView(message: _artistsError!, onRetry: _loadArtists, compact: true)
      else if (_artists.isEmpty)
        const EmptyView(compact: true, icon: Icons.people_outline, title: 'No artists to show yet')
      else
        SizedBox(
          height: 170 + MediaQuery.textScalerOf(context).scale(40),
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: _artists.length > _homeArtistLimit ? _homeArtistLimit : _artists.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (_, i) => _artistCard(_artists[i]),
          ),
        ),

      _sectionTitle('Hire for your own event'),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Row(
          children: [
            Expanded(child: _hireCard(Icons.camera_alt_outlined, 'Photographers', 'photographer')),
            const SizedBox(width: 12),
            Expanded(child: _hireCard(Icons.videocam_outlined, 'Videographers', 'videographer')),
          ],
        ),
      ),
    ];
  }

  Widget _quickChip(IconData icon, String label, VoidCallback onTap) => Padding(
        padding: const EdgeInsets.only(right: 8),
        child: ActionChip(
          avatar: Icon(icon, size: 18, color: AppColors.navy),
          label: Text(label),
          backgroundColor: Colors.white,
          onPressed: onTap,
        ),
      );

  Widget _dateCard(String title, String subtitle, VoidCallback onTap) => Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        child: InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: onTap,
          child: Container(
            constraints: const BoxConstraints(minWidth: 110),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(title, style: const TextStyle(fontWeight: FontWeight.bold)),
                Text(subtitle, style: TextStyle(color: Colors.grey.shade700, fontSize: 12)),
              ],
            ),
          ),
        ),
      );

  Widget _categoryCard(Map<String, dynamic> category) {
    final name = (category['name'] ?? '').toString().trim();
    final subs = <String>[
      if (category['subCategories'] is List)
        for (final sub in category['subCategories'] as List)
          if (sub is Map && sub['name'] is String) sub['name'] as String else if (sub is String) sub,
    ];
    return GestureDetector(
      onTap: () => Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => CategoryEventsScreen(categoryName: name, subcategories: subs, preloaded: _eventsError == null && !_loadingEvents ? _events : null)),
      ),
      child: SizedBox(
        width: 92,
        child: Column(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: AppImage(category['image'] is String ? category['image'] as String : null, width: 84, height: 72, placeholderIcon: Icons.category_outlined),
            ),
            const SizedBox(height: 6),
            Text(name, maxLines: 2, textAlign: TextAlign.center, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }

  Widget _artistCard(Map<String, dynamic> artist) {
    final id = (artist['_id'] ?? '').toString();
    final following = _following[id];
    final busy = _togglingFollow.contains(id);
    final genre = artist['genre'] is String ? (artist['genre'] as String).trim() : '';
    return SizedBox(
      width: 140,
      child: Card(
        margin: EdgeInsets.zero,
        color: Colors.white,
        surfaceTintColor: Colors.white,
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () => _openArtist(artist),
          child: Padding(
            padding: const EdgeInsets.all(10),
            child: Column(
              children: [
                AppAvatar(artist['profileImage'] is String ? artist['profileImage'] as String : null, radius: 34),
                const SizedBox(height: 8),
                Text((artist['name'] ?? 'Artist').toString(), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.bold)),
                Text(genre, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
                const Spacer(),
                SizedBox(
                  width: double.infinity,
                  height: 34,
                  child: following == true
                      ? OutlinedButton(
                          onPressed: busy ? null : () => _toggleFollow(artist),
                          style: OutlinedButton.styleFrom(padding: EdgeInsets.zero),
                          child: const Text('Following'),
                        )
                      : ElevatedButton(
                          onPressed: following == null || busy ? null : () => _toggleFollow(artist),
                          style: ElevatedButton.styleFrom(backgroundColor: AppColors.navy, foregroundColor: Colors.white, padding: EdgeInsets.zero),
                          child: const Text('Follow'),
                        ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _hireCard(IconData icon, String label, String type) => Card(
        margin: EdgeInsets.zero,
        color: Colors.white,
        surfaceTintColor: Colors.white,
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => HireProfessionalsScreen(type: type))),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 18),
            child: Column(
              children: [
                Icon(icon, color: AppColors.navy, size: 30),
                const SizedBox(height: 6),
                Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
              ],
            ),
          ),
        ),
      );
}
