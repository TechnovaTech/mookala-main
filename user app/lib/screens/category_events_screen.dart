import 'package:flutter/material.dart';

import '../models/event.dart';
import '../services/api_client.dart';
import '../services/api_service.dart';
import '../utils/event_filter.dart';
import '../widgets/app_theme.dart';
import '../widgets/event_card.dart';
import '../widgets/state_views.dart';
import 'organized_event_details_screen.dart';

/// Upcoming events of one category (or all events when [categoryName] is
/// null), with a working search, date filter and sub-category chips.
class CategoryEventsScreen extends StatefulWidget {
  const CategoryEventsScreen({super.key, this.categoryName, this.subcategories = const [], this.preloaded});

  final String? categoryName;

  /// Sub-category names from the category record.
  final List<String> subcategories;

  /// Events the caller already has; saves downloading the list again.
  final List<EventModel>? preloaded;

  @override
  State<CategoryEventsScreen> createState() => _CategoryEventsScreenState();
}

class _CategoryEventsScreenState extends State<CategoryEventsScreen> {
  final _search = TextEditingController();
  List<EventModel> _events = [];
  bool _loading = true;
  String? _error;
  String _sub = '';
  DayRange? _dates;

  @override
  void initState() {
    super.initState();
    final preloaded = widget.preloaded;
    if (preloaded != null) {
      _events = _ofCategory(preloaded);
      _loading = false;
    } else {
      _load();
    }
  }

  List<EventModel> _ofCategory(List<EventModel> events) {
    final category = widget.categoryName?.trim().toLowerCase();
    if (category == null || category.isEmpty) return events;
    return events.where((e) => e.category.trim().toLowerCase() == category).toList();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final events = await ApiService.getEvents(category: widget.categoryName);
      if (!mounted) return;
      setState(() {
        _events = _ofCategory(events);
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

  Future<void> _pickDates() async {
    final now = DateTime.now();
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: DateTime(now.year + 2, now.month, now.day),
      initialDateRange: _dates == null ? null : DateTimeRange(start: _dates!.start, end: _dates!.end),
    );
    if (picked != null) setState(() => _dates = DayRange(picked.start, picked.end));
  }

  List<String> get _subChoices {
    // The category's own list, plus any sub-category that events actually use.
    final seen = <String, String>{};
    for (final name in widget.subcategories) {
      if (name.trim().isNotEmpty) seen.putIfAbsent(name.trim().toLowerCase(), () => name.trim());
    }
    for (final event in _events) {
      for (final name in event.subCategories) {
        seen.putIfAbsent(name.toLowerCase(), () => name);
      }
    }
    return seen.values.toList();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final filtered = filterEvents(_events, EventFilter(query: _search.text, dates: _dates), DateTime.now())
        .where((e) => _sub.isEmpty || e.subCategories.any((s) => s.toLowerCase() == _sub.toLowerCase()))
        .toList();
    final subs = _subChoices;

    return Scaffold(
      backgroundColor: Colors.grey.shade100,
      appBar: navyAppBar(widget.categoryName ?? 'All events'),
      body: _loading
          ? const LoadingView()
          : _error != null
              ? ErrorView(message: _error!, onRetry: _load)
              : Column(
                  children: [
                    Container(
                      color: Colors.white,
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                      child: Column(
                        children: [
                          TextField(
                            controller: _search,
                            onChanged: (_) => setState(() {}),
                            decoration: InputDecoration(
                              hintText: 'Search by event, venue or city',
                              prefixIcon: const Icon(Icons.search),
                              suffixIcon: _search.text.isEmpty
                                  ? null
                                  : IconButton(icon: const Icon(Icons.clear), onPressed: () => setState(_search.clear)),
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                              isDense: true,
                            ),
                          ),
                          const SizedBox(height: 8),
                          SizedBox(
                            height: 40,
                            child: ListView(
                              scrollDirection: Axis.horizontal,
                              children: [
                                InputChip(
                                  avatar: const Icon(Icons.date_range, size: 18),
                                  label: Text(_dates?.label ?? 'Any date'),
                                  onPressed: _pickDates,
                                  onDeleted: _dates == null ? null : () => setState(() => _dates = null),
                                ),
                                for (final sub in subs)
                                  Padding(
                                    padding: const EdgeInsets.only(left: 8),
                                    child: ChoiceChip(
                                      label: Text(sub),
                                      selected: _sub.toLowerCase() == sub.toLowerCase(),
                                      onSelected: (on) => setState(() => _sub = on ? sub : ''),
                                    ),
                                  ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    Expanded(
                      child: RefreshIndicator(
                        onRefresh: _load,
                        child: filtered.isEmpty
                            ? ListView(
                                physics: const AlwaysScrollableScrollPhysics(),
                                children: [
                                  const SizedBox(height: 60),
                                  EmptyView(
                                    icon: Icons.event_busy,
                                    title: _events.isEmpty ? 'No upcoming events here yet' : 'No events match',
                                    subtitle: _events.isEmpty ? 'Please check again later.' : 'Try another date or search.',
                                  ),
                                ],
                              )
                            : ListView.separated(
                                physics: const AlwaysScrollableScrollPhysics(),
                                padding: const EdgeInsets.all(16),
                                itemCount: filtered.length,
                                separatorBuilder: (_, __) => const SizedBox(height: 12),
                                itemBuilder: (context, i) => EventCard(
                                  event: filtered[i],
                                  imageHeight: 170,
                                  onTap: () => Navigator.push(
                                    context,
                                    MaterialPageRoute(builder: (_) => OrganizedEventDetailsScreen(event: filtered[i])),
                                  ),
                                ),
                              ),
                      ),
                    ),
                  ],
                ),
    );
  }
}
