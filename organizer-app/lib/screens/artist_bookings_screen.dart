import 'package:flutter/material.dart';

import '../logic/event_logic.dart';
import '../services/api.dart';
import '../services/api_client.dart';
import '../widgets/common.dart';

/// Booking requests (events that list this artist and wait for an answer) and
/// the events the artist has accepted.
class ArtistBookingsScreen extends StatefulWidget {
  const ArtistBookingsScreen({super.key, this.onChanged, this.embedded = false});

  /// Called after a request was accepted or declined, so a parent can refresh its counts.
  final VoidCallback? onChanged;

  /// Shown as a tab of the dashboard (no back arrow).
  final bool embedded;

  @override
  State<ArtistBookingsScreen> createState() => _ArtistBookingsScreenState();
}

class _ArtistBookingsScreenState extends State<ArtistBookingsScreen> {
  List<Map<String, dynamic>>? _requests;
  List<Map<String, dynamic>>? _accepted;
  String? _requestsError;
  String? _acceptedError;
  String? _busyId;

  @override
  void initState() {
    super.initState();
    _loadRequests();
    _loadAccepted();
  }

  Future<void> _loadRequests() async {
    try {
      final rows = await Api.bookingRequests();
      if (!mounted) return;
      setState(() {
        _requests = rows;
        _requestsError = null;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _requestsError = e.message);
    }
  }

  Future<void> _loadAccepted() async {
    try {
      final rows = await Api.artistEvents();
      if (!mounted) return;
      setState(() {
        _accepted = rows;
        _acceptedError = null;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _acceptedError = e.message);
    }
  }

  Future<void> _respond(Map<String, dynamic> request, bool accept) async {
    final id = (request['_id'] ?? '').toString();
    final title = (request['eventTitle'] ?? 'this event').toString();
    if (id.isEmpty) return;
    if (!accept) {
      final sure = await confirm(
        context,
        title: 'Decline request',
        message: 'Decline the request to perform at "$title"? The organiser will see that you declined. '
            'This cannot be undone in the app.',
        yes: 'Decline',
        danger: true,
      );
      if (!sure || !mounted) return;
    }
    setState(() => _busyId = id);
    try {
      await Api.respondToBooking(id, accept: accept);
      if (!mounted) return;
      showMessage(context, accept ? 'You accepted "$title"' : 'You declined "$title"');
      widget.onChanged?.call();
      await Future.wait([_loadRequests(), _loadAccepted()]);
    } on ApiException catch (e) {
      if (mounted) showMessage(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  static String _text(dynamic v) => (v ?? '').toString().trim();

  static String _when(Map<String, dynamic> row) {
    final date = EventLogic.displayDate(row['eventDate']);
    final time = _text(row['eventTime']);
    return time.isEmpty || time == 'Time TBD' ? date : '$date, $time';
  }

  static String _where(Map<String, dynamic> row) {
    final venue = _text(row['venue']);
    final city = _text(row['city']);
    // The server uses these words when the event has no venue stored.
    const unset = {'Venue TBD', 'Location TBD', 'City TBD', ''};
    final parts = [
      if (!unset.contains(venue)) venue,
      if (!unset.contains(city) && !venue.toLowerCase().contains(city.toLowerCase())) city,
    ];
    return parts.isEmpty ? 'Venue not set by the organiser' : parts.join(', ');
  }

  static const _typeLabels = {'venue': 'Venue event', 'online': 'Online event', 'recorded': 'Recorded event'};

  Widget _line(IconData icon, String text) => Padding(
        padding: const EdgeInsets.only(top: 6),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 16, color: Colors.black45),
            const SizedBox(width: 8),
            Expanded(child: Text(text, style: const TextStyle(color: Colors.black87, height: 1.3))),
          ],
        ),
      );

  Widget _card(Map<String, dynamic> row, {required bool request}) {
    final id = _text(row['_id']);
    final type = _text(row['eventType']);
    // The server sends this placeholder when it cannot find the creator's name.
    final rawOrganizer = _text(row['organizerName']);
    final organizer = rawOrganizer == 'Unknown Organizer' ? '' : rawOrganizer;
    final organizerPhone = _text(row['organizerPhone']);
    final description = _text(row['description']);
    final busy = _busyId == id;
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(_text(row['eventTitle']).isEmpty ? 'Untitled event' : _text(row['eventTitle']),
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.navy)),
            if (type.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(_typeLabels[type] ?? type, style: const TextStyle(color: Colors.black54, fontSize: 13)),
              ),
            _line(Icons.calendar_today, _when(row)),
            _line(Icons.location_on_outlined, _where(row)),
            _line(
              Icons.person_outline,
              organizer.isEmpty
                  ? 'Organiser name not available'
                  : organizerPhone.isEmpty
                      ? 'Organiser: $organizer'
                      : 'Organiser: $organizer · $organizerPhone',
            ),
            if (request && description.isNotEmpty) _line(Icons.notes, description),
            if (request) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _busyId != null ? null : () => _respond(row, false),
                      style: OutlinedButton.styleFrom(foregroundColor: Colors.red.shade700),
                      child: const Text('Decline'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: _busyId != null ? null : () => _respond(row, true),
                      style: ElevatedButton.styleFrom(backgroundColor: AppColors.navy, foregroundColor: Colors.white),
                      child: busy
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                            )
                          : const Text('Accept'),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _requestsTab() {
    final rows = _requests;
    if (rows == null) {
      return _requestsError != null ? StateView.error(_requestsError!, onRetry: _loadRequests) : const LoadingView();
    }
    return RefreshIndicator(
      onRefresh: _loadRequests,
      child: rows.isEmpty
          ? const StateView(
              icon: Icons.inbox_outlined,
              title: 'No booking requests',
              message: 'When an organiser adds you to an event and Mookalaa approves it, the request appears here.',
            )
          : ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(16),
              children: [
                if (_requestsError != null) ...[InfoBanner(_requestsError!, color: Colors.red), const SizedBox(height: 12)],
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Text('${rows.length} request${rows.length == 1 ? '' : 's'} waiting for your answer',
                      style: const TextStyle(fontWeight: FontWeight.w600, color: AppColors.navy)),
                ),
                for (final row in rows) _card(row, request: true),
              ],
            ),
    );
  }

  Widget _acceptedTab() {
    final rows = _accepted;
    if (rows == null) {
      return _acceptedError != null ? StateView.error(_acceptedError!, onRetry: _loadAccepted) : const LoadingView();
    }
    const note = 'Requests you declined are not listed: the server does not provide them to the app yet.';
    return RefreshIndicator(
      onRefresh: _loadAccepted,
      child: rows.isEmpty
          ? const StateView(
              icon: Icons.event_available_outlined,
              title: 'No accepted events',
              message: 'Events you accept will appear here.\n\n$note',
            )
          : ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(16),
              children: [
                if (_acceptedError != null) ...[InfoBanner(_acceptedError!, color: Colors.red), const SizedBox(height: 12)],
                for (final row in rows) _card(row, request: false),
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: Text(note, style: TextStyle(color: Colors.black54, fontSize: 12)),
                ),
              ],
            ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final pending = _requests?.length;
    final accepted = _accepted?.length;
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: appBar(
          'Bookings',
          showBack: !widget.embedded,
          bottom: TabBar(
            labelColor: Colors.white,
            unselectedLabelColor: Colors.white70,
            indicatorColor: Colors.white,
            tabs: [
              Tab(text: pending == null ? 'Requests' : 'Requests ($pending)'),
              Tab(text: accepted == null ? 'Accepted' : 'Accepted ($accepted)'),
            ],
          ),
        ),
        body: SafeArea(child: TabBarView(children: [_requestsTab(), _acceptedTab()])),
      ),
    );
  }
}
