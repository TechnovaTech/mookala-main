import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../logic/event_logic.dart';
import '../logic/ticket_logic.dart';
import '../services/api.dart';
import '../services/api_client.dart';
import '../widgets/common.dart';
import 'add_tickets_screen.dart';
import 'event_analytics_screen.dart';
import 'ticket_scanner_screen.dart';

/// One event as the server has it (`GET /events/{id}`).
class ViewEventScreen extends StatefulWidget {
  const ViewEventScreen({super.key, required this.eventId});

  final String eventId;

  @override
  State<ViewEventScreen> createState() => _ViewEventScreenState();
}

class _ViewEventScreenState extends State<ViewEventScreen> {
  bool _loading = true;
  String? _error;
  Map<String, dynamic> _event = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = _event.isEmpty;
      _error = null;
    });
    try {
      final event = await Api.event(widget.eventId);
      if (!mounted) return;
      setState(() => _event = event);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _text(dynamic v) => (v ?? '').toString().trim();

  Future<void> _push(Widget screen) async {
    await Navigator.push(context, MaterialPageRoute(builder: (_) => screen));
    if (mounted) _load();
  }

  Future<void> _copyDetails() async {
    final lines = [
      _text(_event['name']),
      EventLogic.displaySchedule(_event),
      EventLogic.placeOf(_event),
    ].where((l) => l.isNotEmpty).join('\n');
    await Clipboard.setData(ClipboardData(text: lines));
    if (mounted) showMessage(context, 'Event details copied');
  }

  Future<void> _delete() async {
    final ok = await confirm(
      context,
      title: 'Delete event',
      message: 'Delete "${_text(_event['name'])}"? This cannot be undone. An event with confirmed bookings cannot be deleted.',
      yes: 'Delete',
      danger: true,
    );
    if (!ok || !mounted) return;
    try {
      await Api.deleteEvent(widget.eventId);
      if (!mounted) return;
      showMessage(context, 'Event deleted');
      Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) showMessage(context, e.message, error: true);
    }
  }

  Widget _section(String title, List<Widget> children) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 18, 16, 0),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [SectionTitle(title), ...children]),
      );

  Widget _line(IconData icon, String text) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 18, color: AppColors.navy),
            const SizedBox(width: 8),
            Expanded(child: SelectableText(text, style: const TextStyle(height: 1.35))),
          ],
        ),
      );

  Widget _statusBanner() {
    final status = EventLogic.statusOf(_event);
    final reason = _text(_event['rejectionReason']);
    final hasArtists = _event['artists'] is List && (_event['artists'] as List).isNotEmpty;
    final response = _text(_event['artistResponse']);
    switch (status) {
      case 'approved':
        var text = 'Approved by Mookalaa.';
        if (hasArtists) {
          text += response == 'accepted'
              ? ' The invited artist accepted.'
              : response == 'rejected'
                  ? ' The invited artist declined.'
                  : ' Waiting for the invited artist to answer.';
        }
        return InfoBanner(text, color: Colors.green, icon: Icons.check_circle_outline);
      case 'rejected':
        return InfoBanner(
          reason.isEmpty ? 'Rejected by Mookalaa. No reason was given.' : 'Rejected by Mookalaa. Reason: $reason',
          color: Colors.red,
          icon: Icons.cancel_outlined,
        );
      default:
        return const InfoBanner('Waiting for approval by Mookalaa. The event is not on sale yet.', icon: Icons.hourglass_top);
    }
  }

  Widget _content() {
    final media = _event['media'] is Map ? Map<String, dynamic>.from(_event['media'] as Map) : <String, dynamic>{};
    final images = media['images'] is List ? (media['images'] as List) : const [];
    final tickets = _event['tickets'] is List
        ? (_event['tickets'] as List).whereType<Map>().map((t) => Map<String, dynamic>.from(t)).toList()
        : <Map<String, dynamic>>[];
    final artists = _event['artistDetails'] is List ? (_event['artistDetails'] as List).whereType<Map>().toList() : const <Map>[];
    final staff = _event['scannerStaff'] is List ? (_event['scannerStaff'] as List).whereType<Map>().toList() : const <Map>[];
    final languages = _event['languages'] is List ? (_event['languages'] as List).join(', ') : '';
    final subs = _event['subCategories'] is List ? (_event['subCategories'] as List).join(', ') : '';
    final type = _text(_event['locationType']);
    final online = _event['onlineDetails'] is Map ? _event['onlineDetails'] as Map : const {};
    final recorded = _event['recordedDetails'] is Map ? _event['recordedDetails'] as Map : const {};
    final endDate = _text(_event['endDate']);
    final status = EventLogic.statusOf(_event);
    final name = _text(_event['name']);

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.only(bottom: 28),
        children: [
          SizedBox(height: 200, child: StoredImage(media['bannerImage'], placeholderIcon: Icons.event)),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name.isEmpty ? 'Untitled event' : name,
                    style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: AppColors.navy)),
                const SizedBox(height: 10),
                _statusBanner(),
              ],
            ),
          ),
          _section('When and where', [
            _line(Icons.calendar_today, 'Starts ${EventLogic.displaySchedule(_event)}'),
            if (endDate.isNotEmpty)
              _line(Icons.flag_outlined,
                  'Ends ${EventLogic.displayDate(endDate)}${_text(_event['endTime']).isEmpty ? '' : ', ${_text(_event['endTime'])}'}'),
            _line(Icons.place_outlined, EventLogic.placeOf(_event)),
            if (type == 'venue' && _event['location'] is Map && _text((_event['location'] as Map)['address']).isNotEmpty)
              _line(Icons.map_outlined, _text((_event['location'] as Map)['address'])),
            if (type == 'online' && _text(online['link']).isNotEmpty) _line(Icons.link, _text(online['link'])),
            if (type == 'recorded' && _text(recorded['videoLink']).isNotEmpty) _line(Icons.link, _text(recorded['videoLink'])),
            if (_text(online['accessInstructions']).isNotEmpty) _line(Icons.info_outline, _text(online['accessInstructions'])),
            if (_text(recorded['accessInstructions']).isNotEmpty) _line(Icons.info_outline, _text(recorded['accessInstructions'])),
          ]),
          _section('About', [
            if (_text(_event['category']).isNotEmpty)
              _line(Icons.category_outlined, '${_text(_event['category'])}${subs.isEmpty ? '' : ' · $subs'}'),
            if (languages.isNotEmpty) _line(Icons.language, languages),
            Text(_text(_event['description']).isEmpty ? 'No description.' : _text(_event['description']),
                style: const TextStyle(height: 1.45)),
            if (_text(_event['terms']).isNotEmpty) ...[
              const SizedBox(height: 12),
              const Text('Terms & conditions', style: TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 4),
              Text(_text(_event['terms']), style: const TextStyle(height: 1.45, color: Colors.black87)),
            ],
            if (_text(_event['photographyContact']).isNotEmpty) ...[
              const SizedBox(height: 10),
              _line(Icons.camera_alt_outlined, 'Photography: ${_text(_event['photographyContact'])}'),
            ],
            if (_text(media['promotionalVideo']).isNotEmpty) _line(Icons.ondemand_video, _text(media['promotionalVideo'])),
          ]),
          if (images.isNotEmpty)
            _section('Photos', [
              SizedBox(
                height: 110,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: images.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (_, i) => ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: StoredImage(images[i], width: 150, height: 110),
                  ),
                ),
              ),
            ]),
          _section('Tickets', [
            if (tickets.isEmpty) const Text('This event has no tickets.', style: TextStyle(color: Colors.black54)),
            for (final t in tickets)
              Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  dense: true,
                  title: Text(_text(t['name']), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
                  subtitle: Text([
                    '${TicketLogic.countOf(t['sold'])} of ${TicketLogic.countOf(t['quantity'])} sold',
                    if (t['isSeatWise'] == true && t['startSeat'] != null)
                      'Block ${t['blockName']} · seats ${t['startSeat']}-${t['endSeat']}',
                  ].join(' · ')),
                  trailing: Text(TicketLogic.formatPrice(t['price']),
                      style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.navy, fontSize: 15)),
                ),
              ),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: () => _push(AddTicketsScreen(eventData: _event)),
                icon: const Icon(Icons.edit_outlined, color: AppColors.navy),
                label: const Text('Edit tickets', style: TextStyle(color: AppColors.navy)),
              ),
            ),
          ]),
          if (artists.isNotEmpty)
            _section('Artists', [
              for (final a in artists)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: ClipOval(child: StoredImage(a['profileImage'], width: 42, height: 42, placeholderIcon: Icons.person)),
                  title: Text(_text(a['name']).isEmpty ? 'Artist' : _text(a['name'])),
                  subtitle: Text([_text(a['genre']), _text(a['city'])].where((s) => s.isNotEmpty).join(' · ')),
                ),
            ]),
          if (staff.isNotEmpty)
            _section('Gate staff', [
              Text(staff.map((s) => _text(s['name'])).where((s) => s.isNotEmpty).join(', ')),
              const SizedBox(height: 4),
              const Text('Staff passwords are stored securely and cannot be shown.',
                  style: TextStyle(color: Colors.black54, fontSize: 12)),
            ]),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
            child: Column(
              children: [
                PrimaryButton(
                  label: 'Sales & check-ins',
                  icon: Icons.insights,
                  onPressed: () => _push(EventAnalyticsScreen(eventId: widget.eventId, eventName: name)),
                ),
                if (status == 'approved') ...[
                  const SizedBox(height: 10),
                  PrimaryButton(
                    label: 'Scan tickets',
                    icon: Icons.qr_code_scanner,
                    onPressed: () => _push(TicketScannerScreen(eventId: widget.eventId, eventName: name)),
                  ),
                ],
                const SizedBox(height: 14),
                const InfoBanner(
                  'Only tickets can be changed from the app. To change the name, date, venue, description, photos, '
                  'artists or gate staff of an event, contact Mookalaa support (Account > Help & Support).',
                  color: Colors.blue,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: appBar('Event', actions: [
        if (_event.isNotEmpty) ...[
          IconButton(tooltip: 'Copy details', icon: const Icon(Icons.copy), onPressed: _copyDetails),
          IconButton(tooltip: 'Delete event', icon: const Icon(Icons.delete_outline), onPressed: _delete),
        ],
      ]),
      body: SafeArea(
        child: _loading
            ? const LoadingView()
            : _error != null && _event.isEmpty
                ? StateView.error(_error!, onRetry: _load)
                : _content(),
      ),
    );
  }
}
