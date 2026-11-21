import 'package:flutter/material.dart';

import '../models/event.dart';
import '../services/api_client.dart';
import '../services/api_service.dart';
import '../utils/links.dart';
import '../widgets/app_image.dart';
import '../widgets/app_theme.dart';
import 'artist_detail_screen.dart';
import 'booking_screen.dart';

/// The one event details screen. It opens with the event from the list and
/// replaces it with the full record (`GET /events/{id}`), which also carries
/// the artists and the organiser. Only real fields are shown.
class OrganizedEventDetailsScreen extends StatefulWidget {
  const OrganizedEventDetailsScreen({super.key, required this.event});

  final EventModel event;

  @override
  State<OrganizedEventDetailsScreen> createState() => _OrganizedEventDetailsScreenState();
}

class _OrganizedEventDetailsScreenState extends State<OrganizedEventDetailsScreen> {
  late EventModel _event = widget.event;
  bool _loadingDetail = true;
  String? _detailError;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loadingDetail = true;
      _detailError = null;
    });
    try {
      final full = await ApiService.getEvent(widget.event.id);
      if (!mounted) return;
      setState(() {
        // The detail response has no resolved venue record; keep the list's
        // venue and image when the detail has none.
        _event = _merge(widget.event, full);
        _loadingDetail = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _loadingDetail = false;
        _detailError = e.message;
      });
    }
  }

  static EventModel _merge(EventModel list, EventModel detail) {
    return EventModel(
      id: detail.id.isNotEmpty ? detail.id : list.id,
      name: detail.name.isNotEmpty ? detail.name : list.name,
      category: detail.category.isNotEmpty ? detail.category : list.category,
      subCategories: detail.subCategories.isNotEmpty ? detail.subCategories : list.subCategories,
      languages: detail.languages.isNotEmpty ? detail.languages : list.languages,
      description: detail.description.isNotEmpty ? detail.description : list.description,
      terms: detail.terms.isNotEmpty ? detail.terms : list.terms,
      locationType: detail.locationType.isNotEmpty ? detail.locationType : list.locationType,
      start: detail.start ?? list.start,
      end: detail.end ?? list.end,
      // A resolved venue name always wins over anything the detail could not resolve.
      venueName: list.venueName.isNotEmpty ? list.venueName : detail.venueName,
      venueAddress: list.venueAddress.isNotEmpty ? list.venueAddress : detail.venueAddress,
      venueCity: list.venueCity.isNotEmpty ? list.venueCity : detail.venueCity,
      image: detail.image.isNotEmpty ? detail.image : list.image,
      gallery: detail.gallery.isNotEmpty ? detail.gallery : list.gallery,
      seatingLayoutImage: list.seatingLayoutImage.isNotEmpty ? list.seatingLayoutImage : detail.seatingLayoutImage,
      tickets: detail.tickets.isNotEmpty ? detail.tickets : list.tickets,
      artistIds: detail.artistIds.isNotEmpty ? detail.artistIds : list.artistIds,
      artists: detail.artists,
      organizerName: detail.organizerName.isNotEmpty ? detail.organizerName : list.organizerName,
    );
  }

  void _share() {
    final e = _event;
    final lines = [
      e.title,
      e.dateLabel,
      if (e.fullAddress.isNotEmpty) e.fullAddress,
      if (e.priceLabel.isNotEmpty) 'Tickets: ${e.priceLabel}',
      'Book it on the Mookalaa app.',
    ];
    shareText(context, lines.join('\n'), subject: e.title);
  }

  Widget _row(IconData icon, String text, {Widget? trailing}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 7),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 20, color: Colors.grey.shade700),
            const SizedBox(width: 12),
            Expanded(child: Text(text, style: const TextStyle(fontSize: 15))),
            if (trailing != null) trailing,
          ],
        ),
      );

  Widget _section(String title, Widget child) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            child,
          ],
        ),
      );

  @override
  Widget build(BuildContext context) {
    final e = _event;
    final over = e.isOver(DateTime.now());
    final address = e.fullAddress;
    final String? bookingBlocked = over
        ? 'This event has ended'
        : !e.hasTickets
            ? (_loadingDetail ? null : 'Tickets are not on sale for this event')
            : e.tickets.every((t) => t.isSoldOut)
                ? 'Sold out'
                : null;

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: navyAppBar(e.title, actions: [
        IconButton(tooltip: 'Share', icon: const Icon(Icons.share_outlined), onPressed: _share),
      ]),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 24),
        children: [
          AppImage(e.image, height: 220, width: double.infinity, placeholderIcon: Icons.event),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(e.title, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 6,
                  children: [
                    for (final tag in [if (e.category.isNotEmpty) e.category, ...e.subCategories])
                      Chip(label: Text(tag), visualDensity: VisualDensity.compact, materialTapTargetSize: MaterialTapTargetSize.shrinkWrap),
                  ],
                ),
                const SizedBox(height: 8),
                _row(Icons.calendar_today, e.dateLabel),
                if (e.end != null && e.start != null && e.end!.hasTime)
                  _row(Icons.schedule, e.end!.dateOnly == e.start!.dateOnly ? 'Ends at ${e.end!.timeLabel}' : 'Ends ${e.end!.label}'),
                if (address.isNotEmpty)
                  _row(
                    Icons.location_on_outlined,
                    address,
                    trailing: TextButton(onPressed: () => openMapSearch(context, address), child: const Text('Directions')),
                  )
                else if (e.isOnline)
                  _row(Icons.videocam_outlined, 'Online event'),
                if (e.languages.isNotEmpty) _row(Icons.language, e.languages.join(', ')),
                if (e.organizerName.isNotEmpty) _row(Icons.business_outlined, 'Organised by ${e.organizerName}'),
              ],
            ),
          ),
          if (_detailError != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: Row(
                children: [
                  Expanded(child: Text('Some details could not be loaded: $_detailError', style: TextStyle(color: Colors.grey.shade700))),
                  TextButton(onPressed: _load, child: const Text('Retry')),
                ],
              ),
            ),
          if (e.tickets.isNotEmpty)
            _section(
              'Tickets',
              Column(
                children: [
                  for (final t in e.tickets)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Row(
                        children: [
                          Expanded(child: Text(t.name.isEmpty ? 'Ticket' : t.name)),
                          if (t.isSoldOut) Text('Sold out  ', style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
                          Text(t.priceLabel, style: const TextStyle(fontWeight: FontWeight.bold)),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          if (e.artists.isNotEmpty)
            _section(
              e.artists.length == 1 ? 'Artist' : 'Artists',
              Column(
                children: [
                  for (final artist in e.artists)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: AppAvatar(artist['profileImage'] is String ? artist['profileImage'] as String : null),
                      title: Text((artist['name'] ?? 'Artist').toString()),
                      subtitle: (artist['genre'] ?? '').toString().isEmpty ? null : Text(artist['genre'].toString()),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ArtistDetailScreen(artist: artist))),
                    ),
                ],
              ),
            ),
          if (e.description.isNotEmpty) _section('About this event', Text(e.description, style: const TextStyle(height: 1.4))),
          if (e.gallery.length > 1)
            _section(
              'Photos',
              SizedBox(
                height: 110,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: e.gallery.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (_, i) => ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: AppImage(e.gallery[i], width: 150, height: 110),
                  ),
                ),
              ),
            ),
          if (e.terms.isNotEmpty) _section('Terms and conditions', Text(e.terms, style: TextStyle(height: 1.4, color: Colors.grey.shade800))),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (e.priceLabel.isNotEmpty && bookingBlocked == null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(e.priceLabel, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.navy)),
                ),
              ElevatedButton(
                onPressed: bookingBlocked != null || !e.isBookable
                    ? null
                    : () => Navigator.push(context, MaterialPageRoute(builder: (_) => BookingScreen(event: e))),
                style: primaryButtonStyle(),
                child: Text(bookingBlocked ?? (e.hasTickets ? 'BOOK NOW' : 'LOADING…')),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
