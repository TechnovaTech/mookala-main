import 'package:flutter/material.dart';

import '../logic/calendar_grid.dart';
import '../logic/event_logic.dart';
import '../services/api.dart';
import '../services/api_client.dart';
import '../widgets/common.dart';

/// A month calendar of the events the artist has accepted.
class ArtistCalendarScreen extends StatefulWidget {
  const ArtistCalendarScreen({super.key, this.embedded = false});

  /// Shown as a tab of the dashboard (no back arrow).
  final bool embedded;

  @override
  State<ArtistCalendarScreen> createState() => _ArtistCalendarScreenState();
}

class _ArtistCalendarScreenState extends State<ArtistCalendarScreen> {
  late DateTime _month;
  String? _selectedKey;
  List<Map<String, dynamic>>? _events;
  String? _error;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _month = DateTime(now.year, now.month, 1);
    _load();
  }

  Future<void> _load() async {
    try {
      final rows = await Api.artistEvents();
      if (!mounted) return;
      setState(() {
        _events = rows;
        _error = null;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    }
  }

  void _shift(int delta) {
    setState(() {
      _month = CalendarGrid.addMonths(_month, delta);
      _selectedKey = null;
    });
  }

  void _goToToday() {
    final now = DateTime.now();
    setState(() {
      _month = DateTime(now.year, now.month, 1);
      _selectedKey = CalendarGrid.dateKey(now.year, now.month, now.day);
    });
  }

  /// Events per "YYYY-MM-DD".
  Map<String, List<Map<String, dynamic>>> _byDay() {
    final out = <String, List<Map<String, dynamic>>>{};
    for (final event in _events ?? const <Map<String, dynamic>>[]) {
      final key = CalendarGrid.keyOf(event['eventDate']);
      if (key != null) out.putIfAbsent(key, () => []).add(event);
    }
    return out;
  }

  static String _text(dynamic v) => (v ?? '').toString().trim();

  Widget _eventTile(Map<String, dynamic> event) {
    final time = _text(event['eventTime']);
    final venue = _text(event['venue']);
    final city = _text(event['city']);
    const unset = {'Venue TBD', 'City TBD', ''};
    final place = [if (!unset.contains(venue)) venue, if (!unset.contains(city)) city].join(', ');
    final rawOrganizer = _text(event['organizerName']);
    final organizer = rawOrganizer == 'Unknown Organizer' ? '' : rawOrganizer;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: const CircleAvatar(
          backgroundColor: AppColors.navy,
          child: Icon(Icons.event, color: Colors.white, size: 20),
        ),
        title: Text(_text(event['eventTitle']).isEmpty ? 'Untitled event' : _text(event['eventTitle']),
            style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text([
          '${EventLogic.displayDate(event['eventDate'])}${time.isEmpty ? '' : ', $time'}',
          if (place.isNotEmpty) place,
          if (organizer.isNotEmpty) 'Organiser: $organizer',
        ].join('\n')),
        isThreeLine: place.isNotEmpty && organizer.isNotEmpty,
      ),
    );
  }

  Widget _grid(Map<String, List<Map<String, dynamic>>> byDay) {
    final now = DateTime.now();
    final todayKey = CalendarGrid.dateKey(now.year, now.month, now.day);
    final cells = CalendarGrid.cells(_month.year, _month.month);
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 7),
      itemCount: cells.length,
      itemBuilder: (context, index) {
        final day = cells[index];
        if (day == null) return const SizedBox.shrink();
        final key = CalendarGrid.dateKey(_month.year, _month.month, day);
        final hasEvents = byDay.containsKey(key);
        final isToday = key == todayKey;
        final isSelected = key == _selectedKey;
        return InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: () => setState(() => _selectedKey = isSelected ? null : key),
          child: Container(
            margin: const EdgeInsets.all(3),
            decoration: BoxDecoration(
              color: isSelected ? AppColors.navy : (hasEvents ? AppColors.navy.withValues(alpha: 0.10) : null),
              borderRadius: BorderRadius.circular(8),
              border: isToday ? Border.all(color: AppColors.navy, width: 1.6) : null,
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text('$day',
                    style: TextStyle(
                      color: isSelected ? Colors.white : Colors.black87,
                      fontWeight: isToday || hasEvents ? FontWeight.w700 : FontWeight.normal,
                    )),
                Container(
                  margin: const EdgeInsets.only(top: 3),
                  width: 6,
                  height: 6,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: hasEvents ? (isSelected ? Colors.white : Colors.green.shade700) : Colors.transparent,
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _content() {
    final byDay = _byDay();
    final monthPrefix = CalendarGrid.dateKey(_month.year, _month.month, 1).substring(0, 8);
    final monthKeys = byDay.keys.where((k) => k.startsWith(monthPrefix)).toList()..sort();
    final selected = _selectedKey;
    final listed = selected != null
        ? (byDay[selected] ?? const <Map<String, dynamic>>[])
        : [for (final k in monthKeys) ...byDay[k]!];
    final undated = (_events ?? const <Map<String, dynamic>>[])
        .where((e) => CalendarGrid.keyOf(e['eventDate']) == null)
        .length;

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      children: [
        if (_error != null) ...[InfoBanner(_error!, color: Colors.red), const SizedBox(height: 12)],
        Card(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(8, 8, 8, 12),
            child: Column(
              children: [
                Row(
                  children: [
                    IconButton(
                      tooltip: 'Previous month',
                      icon: const Icon(Icons.chevron_left, color: AppColors.navy),
                      onPressed: () => _shift(-1),
                    ),
                    Expanded(
                      child: Text(CalendarGrid.title(_month),
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: AppColors.navy)),
                    ),
                    IconButton(
                      tooltip: 'Next month',
                      icon: const Icon(Icons.chevron_right, color: AppColors.navy),
                      onPressed: () => _shift(1),
                    ),
                  ],
                ),
                Row(
                  children: [
                    for (final label in CalendarGrid.weekdayLabels)
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 6),
                          child: Text(label,
                              textAlign: TextAlign.center,
                              style: const TextStyle(fontSize: 12, color: Colors.black54, fontWeight: FontWeight.w600)),
                        ),
                      ),
                  ],
                ),
                _grid(byDay),
                const SizedBox(height: 6),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.green.shade700),
                    ),
                    const SizedBox(width: 6),
                    const Text('Accepted event', style: TextStyle(fontSize: 12, color: Colors.black54)),
                    const SizedBox(width: 16),
                    TextButton(onPressed: _goToToday, child: const Text('Today')),
                  ],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        SectionTitle(selected != null ? 'Events on ${EventLogic.displayDate(selected)}' : 'Events in ${CalendarGrid.title(_month)}'),
        if (listed.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Text(
              selected != null ? 'No accepted events on this day.' : 'No accepted events this month.',
              style: const TextStyle(color: Colors.black54),
            ),
          )
        else
          for (final event in listed) _eventTile(event),
        if (undated > 0)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              '$undated accepted event${undated == 1 ? ' has' : 's have'} no readable date and cannot be placed on the calendar. See Bookings.',
              style: const TextStyle(color: Colors.black54, fontSize: 12),
            ),
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    Widget body;
    if (_events == null) {
      body = _error != null ? StateView.error(_error!, onRetry: _load) : const LoadingView();
    } else {
      body = RefreshIndicator(onRefresh: _load, child: _content());
    }
    return Scaffold(
      appBar: appBar('Calendar', showBack: !widget.embedded),
      body: SafeArea(child: body),
    );
  }
}
