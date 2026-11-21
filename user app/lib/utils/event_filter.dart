import '../models/event.dart';
import 'formats.dart';

/// An inclusive range of calendar days.
class DayRange {
  DayRange(DateTime start, DateTime end)
      : start = DateTime(start.year, start.month, start.day),
        end = DateTime(end.year, end.month, end.day);

  final DateTime start;
  final DateTime end;

  bool contains(DateTime day) {
    final d = DateTime(day.year, day.month, day.day);
    return !d.isBefore(start) && !d.isAfter(end);
  }

  String get label {
    String one(DateTime d) => '${d.day} ${monthName(d.month)}';
    return start == end ? one(start) : '${one(start)} – ${one(end)}';
  }

  @override
  bool operator ==(Object other) => other is DayRange && other.start == start && other.end == end;

  @override
  int get hashCode => Object.hash(start, end);
}

class DatePreset {
  DatePreset(this.title, this.range);
  final String title;
  final DayRange range;
}

/// The quick date choices of the home screen, computed from today's date.
List<DatePreset> datePresets(DateTime now) {
  final today = DateTime(now.year, now.month, now.day);
  DateTime plus(int days) => DateTime(today.year, today.month, today.day + days);

  // Weekend = Saturday and Sunday. On a Sunday "this weekend" is today only.
  final weekday = today.weekday; // Mon = 1 ... Sun = 7
  final saturday = weekday == DateTime.sunday ? today : plus(DateTime.saturday - weekday);
  final sunday = weekday == DateTime.sunday ? today : plus(DateTime.sunday - weekday);
  final endOfMonth = DateTime(today.year, today.month + 1, 0);

  return [
    DatePreset('Today', DayRange(today, today)),
    DatePreset('Tomorrow', DayRange(plus(1), plus(1))),
    DatePreset('This weekend', DayRange(saturday, sunday)),
    DatePreset('This week', DayRange(today, plus(DateTime.sunday - weekday))),
    DatePreset('This month', DayRange(today, endOfMonth)),
  ];
}

/// Everything the search box and the filter screen can narrow by. Each part
/// reads a field the live event really has.
class EventFilter {
  const EventFilter({
    this.query = '',
    this.categories = const {},
    this.dates,
    this.minPrice,
    this.maxPrice,
    this.freeOnly = false,
    this.city = '',
    this.artistId = '',
    this.language = '',
  });

  final String query;
  final Set<String> categories;
  final DayRange? dates;
  final double? minPrice;
  final double? maxPrice;
  final bool freeOnly;
  final String city;
  final String artistId;
  final String language;

  /// How many filter-screen choices are set (the search text and city are separate controls).
  int get activeCount =>
      (categories.isNotEmpty ? 1 : 0) +
      (dates != null ? 1 : 0) +
      (minPrice != null || maxPrice != null ? 1 : 0) +
      (freeOnly ? 1 : 0) +
      (artistId.isNotEmpty ? 1 : 0) +
      (language.isNotEmpty ? 1 : 0);

  bool get isEmpty => activeCount == 0 && query.trim().isEmpty;

  EventFilter copyWith({
    String? query,
    Set<String>? categories,
    DayRange? dates,
    bool clearDates = false,
    double? minPrice,
    double? maxPrice,
    bool clearPrice = false,
    bool? freeOnly,
    String? city,
    String? artistId,
    String? language,
  }) {
    return EventFilter(
      query: query ?? this.query,
      categories: categories ?? this.categories,
      dates: clearDates ? null : (dates ?? this.dates),
      minPrice: clearPrice ? null : (minPrice ?? this.minPrice),
      maxPrice: clearPrice ? null : (maxPrice ?? this.maxPrice),
      freeOnly: freeOnly ?? this.freeOnly,
      city: city ?? this.city,
      artistId: artistId ?? this.artistId,
      language: language ?? this.language,
    );
  }
}

String _norm(String value) => value.trim().toLowerCase();

bool sameCity(String a, String b) => _norm(a).isNotEmpty && _norm(a) == _norm(b);

bool eventMatches(EventModel event, EventFilter filter) {
  final query = _norm(filter.query);
  if (query.isNotEmpty) {
    final haystack = [
      event.name,
      event.category,
      event.venueName,
      event.venueCity,
      event.description,
      event.organizerName,
      ...event.subCategories,
      ...event.languages,
    ].join(' ').toLowerCase();
    if (!haystack.contains(query)) return false;
  }

  if (filter.categories.isNotEmpty && !filter.categories.map(_norm).contains(_norm(event.category))) return false;

  if (filter.dates != null) {
    // An event with no readable date cannot be said to be on the chosen days.
    final start = event.start;
    if (start == null) return false;
    final lastDay = event.end?.dateOnly ?? start.dateOnly;
    final overlaps = !lastDay.isBefore(filter.dates!.start) && !start.dateOnly.isAfter(filter.dates!.end);
    if (!overlaps) return false;
  }

  if (filter.freeOnly && !event.tickets.any((t) => t.price == 0)) return false;

  if (filter.minPrice != null || filter.maxPrice != null) {
    // True when at least one ticket type is inside the range (not only the first one).
    final low = filter.minPrice ?? 0;
    final high = filter.maxPrice ?? double.infinity;
    if (!event.tickets.any((t) => t.price >= low && t.price <= high)) return false;
  }

  if (filter.city.trim().isNotEmpty && !sameCity(event.venueCity, filter.city)) return false;
  if (filter.artistId.isNotEmpty && !event.artistIds.contains(filter.artistId)) return false;
  if (filter.language.trim().isNotEmpty && !event.languages.map(_norm).contains(_norm(filter.language))) return false;

  return true;
}

/// Events that have not ended, soonest first; events without a date go last.
List<EventModel> upcomingEvents(Iterable<EventModel> events, DateTime now) {
  final list = events.where((e) => !e.isOver(now)).toList();
  list.sort((a, b) {
    final x = a.start?.instantUtc, y = b.start?.instantUtc;
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return x.compareTo(y);
  });
  return list;
}

List<EventModel> filterEvents(Iterable<EventModel> events, EventFilter filter, DateTime now) =>
    upcomingEvents(events.where((e) => eventMatches(e, filter)), now);

/// The distinct cities of a set of events, tidied ("  surat " -> "Surat").
List<String> citiesOf(Iterable<EventModel> events) {
  final seen = <String, String>{};
  for (final event in events) {
    final city = event.venueCity.trim();
    if (city.isEmpty) continue;
    seen.putIfAbsent(city.toLowerCase(), () => city[0].toUpperCase() + city.substring(1));
  }
  final list = seen.values.toList()..sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));
  return list;
}

List<String> languagesOf(Iterable<EventModel> events) {
  final seen = <String, String>{};
  for (final event in events) {
    for (final language in event.languages) {
      seen.putIfAbsent(language.toLowerCase(), () => language);
    }
  }
  return seen.values.toList()..sort();
}
