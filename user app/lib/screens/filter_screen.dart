import 'package:flutter/material.dart';

import '../models/event.dart';
import '../utils/event_filter.dart';
import '../utils/formats.dart';
import '../widgets/app_theme.dart';

/// Filters that work on the fields live events really carry. Pops with the new
/// [EventFilter] (search text and city are kept as they were).
///
/// Venue is not a separate filter: it is covered by the search box, which
/// matches venue names. Artists are matched through the artist ids on each
/// event, joined with the public artist list for their names.
class FilterScreen extends StatefulWidget {
  const FilterScreen({super.key, required this.initial, required this.events, required this.artistNames});

  final EventFilter initial;

  /// The loaded events: choices (categories, languages, artists, price range) come from them.
  final List<EventModel> events;

  /// Artist id -> name, from `/artists`.
  final Map<String, String> artistNames;

  @override
  State<FilterScreen> createState() => _FilterScreenState();
}

class _FilterScreenState extends State<FilterScreen> {
  late Set<String> _categories = {...widget.initial.categories};
  late DayRange? _dates = widget.initial.dates;
  late bool _freeOnly = widget.initial.freeOnly;
  late String _artistId = widget.initial.artistId;
  late String _language = widget.initial.language;
  late RangeValues _price;
  late final double _priceCeiling;

  late final List<String> _allCategories;
  late final List<String> _allLanguages;
  late final List<MapEntry<String, String>> _artists;

  @override
  void initState() {
    super.initState();
    final categories = <String, String>{};
    var highest = 0.0;
    final artistIds = <String>{};
    for (final event in widget.events) {
      if (event.category.isNotEmpty) categories.putIfAbsent(event.category.toLowerCase(), () => event.category);
      final max = event.maxPrice ?? 0;
      if (max > highest) highest = max;
      artistIds.addAll(event.artistIds);
    }
    _allCategories = categories.values.toList()..sort();
    _allLanguages = languagesOf(widget.events);
    // Only artists who appear on a loaded event and whose name is known.
    _artists = [
      for (final id in artistIds)
        if ((widget.artistNames[id] ?? '').isNotEmpty) MapEntry(id, widget.artistNames[id]!),
    ]..sort((a, b) => a.value.toLowerCase().compareTo(b.value.toLowerCase()));
    if (_artistId.isNotEmpty && !_artists.any((a) => a.key == _artistId)) _artistId = '';

    _priceCeiling = highest <= 0 ? 0 : (highest / 100).ceil() * 100.0;
    final low = (widget.initial.minPrice ?? 0).clamp(0, _priceCeiling).toDouble();
    final high = (widget.initial.maxPrice ?? _priceCeiling).clamp(low, _priceCeiling).toDouble();
    _price = RangeValues(low, high);
  }

  bool get _priceSet => _priceCeiling > 0 && (_price.start > 0 || _price.end < _priceCeiling);

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

  void _apply() {
    Navigator.of(context).pop(EventFilter(
      query: widget.initial.query,
      city: widget.initial.city,
      categories: _categories,
      dates: _dates,
      freeOnly: _freeOnly,
      minPrice: _priceSet && !_freeOnly ? _price.start : null,
      maxPrice: _priceSet && !_freeOnly ? _price.end : null,
      artistId: _artistId,
      language: _language,
    ));
  }

  void _reset() => setState(() {
        _categories = {};
        _dates = null;
        _freeOnly = false;
        _artistId = '';
        _language = '';
        _price = RangeValues(0, _priceCeiling);
      });

  Widget _title(String text) => Padding(
        padding: const EdgeInsets.only(top: 20, bottom: 8),
        child: Text(text, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
      );

  @override
  Widget build(BuildContext context) {
    final presets = datePresets(DateTime.now());
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: navyAppBar('Filters', actions: [
        TextButton(onPressed: _reset, child: const Text('Reset', style: TextStyle(color: Colors.white))),
      ]),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        children: [
          _title('Date'),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final preset in presets)
                ChoiceChip(
                  label: Text('${preset.title} (${preset.range.label})'),
                  selected: _dates == preset.range,
                  onSelected: (on) => setState(() => _dates = on ? preset.range : null),
                ),
              ActionChip(
                avatar: const Icon(Icons.date_range, size: 18),
                label: Text(_dates != null && !presets.any((p) => p.range == _dates) ? _dates!.label : 'Pick dates'),
                onPressed: _pickDates,
              ),
            ],
          ),
          if (_allCategories.isNotEmpty) ...[
            _title('Category'),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final category in _allCategories)
                  FilterChip(
                    label: Text(category),
                    selected: _categories.contains(category),
                    onSelected: (on) => setState(() => on ? _categories.add(category) : _categories.remove(category)),
                  ),
              ],
            ),
          ],
          _title('Price'),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Free events only'),
            value: _freeOnly,
            activeThumbColor: AppColors.navy,
            onChanged: (on) => setState(() => _freeOnly = on),
          ),
          if (_priceCeiling > 0 && !_freeOnly) ...[
            Text('${formatRupees(_price.start)} to ${formatRupees(_price.end)} per ticket', style: TextStyle(color: Colors.grey.shade700)),
            RangeSlider(
              values: _price,
              min: 0,
              max: _priceCeiling,
              divisions: (_priceCeiling / 50).round().clamp(1, 200),
              activeColor: AppColors.navy,
              onChanged: (values) => setState(() => _price = values),
            ),
          ],
          if (_artists.isNotEmpty) ...[
            _title('Artist'),
            DropdownButtonFormField<String>(
              key: ValueKey('artist-$_artistId'),
              initialValue: _artistId,
              isExpanded: true,
              decoration: const InputDecoration(border: OutlineInputBorder()),
              items: [
                const DropdownMenuItem(value: '', child: Text('Any artist')),
                for (final artist in _artists) DropdownMenuItem(value: artist.key, child: Text(artist.value, overflow: TextOverflow.ellipsis)),
              ],
              onChanged: (value) => setState(() => _artistId = value ?? ''),
            ),
          ],
          if (_allLanguages.isNotEmpty) ...[
            _title('Language'),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final language in _allLanguages)
                  ChoiceChip(
                    label: Text(language),
                    selected: _language.toLowerCase() == language.toLowerCase(),
                    onSelected: (on) => setState(() => _language = on ? language : ''),
                  ),
              ],
            ),
          ],
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: ElevatedButton(onPressed: _apply, style: primaryButtonStyle(), child: const Text('SHOW EVENTS')),
        ),
      ),
    );
  }
}
