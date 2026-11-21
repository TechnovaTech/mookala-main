/// Pure parsing and formatting helpers shared by the models and screens.
/// They mirror how the backend reads the same values (lib/http.ts, lib/bookings.ts).
library;

const List<String> _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const List<String> _weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/// Events are stored and priced in India time.
const Duration istOffset = Duration(hours: 5, minutes: 30);

/// An amount stored as a number or as text such as "₹1,500.00". 0 when unreadable.
double parseAmount(dynamic value) {
  if (value is num) return value.isFinite ? value.toDouble() : 0;
  if (value is! String) return 0;
  final cleaned = value.replaceAll(RegExp(r'[^0-9.\-]'), '');
  final firstDot = cleaned.indexOf('.');
  final normalised = firstDot == -1
      ? cleaned
      : cleaned.substring(0, firstDot + 1) + cleaned.substring(firstDot + 1).replaceAll('.', '');
  return double.tryParse(normalised) ?? 0;
}

/// A count stored as 120, "120" or "120 seats". 0 when unreadable.
int parseCount(dynamic value) {
  if (value is int) return value < 0 ? 0 : value;
  if (value is num) return value.isFinite ? (value < 0 ? 0 : value.floor()) : 0;
  if (value is String) {
    final parsed = int.tryParse(value.replaceAll(RegExp(r'[^0-9\-]'), ''));
    return parsed == null || parsed < 0 ? 0 : parsed;
  }
  return 0;
}

String _group(int whole) {
  // Indian grouping: 12,34,567
  final s = whole.toString();
  if (s.length <= 3) return s;
  final last3 = s.substring(s.length - 3);
  var rest = s.substring(0, s.length - 3);
  final parts = <String>[];
  while (rest.length > 2) {
    parts.insert(0, rest.substring(rest.length - 2));
    rest = rest.substring(0, rest.length - 2);
  }
  if (rest.isNotEmpty) parts.insert(0, rest);
  return '${parts.join(',')},$last3';
}

/// "₹1,500" or "₹1,500.50".
String formatRupees(num amount) {
  final negative = amount < 0;
  final abs = amount.abs();
  final paise = (abs * 100).round();
  final whole = paise ~/ 100;
  final frac = paise % 100;
  final text = frac == 0 ? _group(whole) : '${_group(whole)}.${frac.toString().padLeft(2, '0')}';
  return '${negative ? '-' : ''}₹$text';
}

/// A calendar date and optional clock time as written on the event, plus the
/// instant it means in India time.
class EventMoment {
  EventMoment(this.year, this.month, this.day, this.hour, this.minute, this.instantUtc);

  final int year;
  final int month;
  final int day;
  final int? hour;
  final int? minute;

  /// The moment in UTC (midnight India time when there is no clock time).
  final DateTime instantUtc;

  bool get hasTime => hour != null;

  /// The calendar day only, for date filters.
  DateTime get dateOnly => DateTime(year, month, day);

  String get dateLabel {
    final weekday = _weekdays[DateTime(year, month, day).weekday - 1];
    return '$weekday, $day ${_months[month - 1]} $year';
  }

  String get shortDateLabel => '$day ${_months[month - 1]}';

  String get timeLabel {
    if (hour == null) return '';
    final h = hour!;
    final suffix = h >= 12 ? 'PM' : 'AM';
    final h12 = h % 12 == 0 ? 12 : h % 12;
    return '$h12:${(minute ?? 0).toString().padLeft(2, '0')} $suffix';
  }

  /// "Sat, 5 Dec 2026 • 6:30 PM"
  String get label => hasTime ? '$dateLabel • $timeLabel' : dateLabel;
}

/// "6:30 PM", "18:30", "6.30pm" -> (hour, minute), or null.
List<int>? parseClock(dynamic value) {
  if (value is! String) return null;
  final match = RegExp(r'^(\d{1,2})[:.](\d{2})(?::\d{2})?\s*(?:([AaPp])\.?\s*[Mm]\.?)?$').firstMatch(value.trim());
  if (match == null) return null;
  var h = int.parse(match.group(1)!);
  final m = int.parse(match.group(2)!);
  final meridiem = match.group(3);
  if (meridiem != null) {
    final pm = meridiem.toLowerCase() == 'p';
    if (h == 12) {
      h = pm ? 12 : 0;
    } else if (pm) {
      h += 12;
    }
  }
  if (h > 23 || m > 59) return null;
  return [h, m];
}

/// Reads an event date ("2026-12-05", "05/12/2026", ISO timestamp) with an
/// optional clock time, as India time. Null when the date cannot be understood:
/// callers must not guess.
EventMoment? parseEventMoment(dynamic dateValue, [dynamic timeValue, bool endOfDayWithoutTime = false]) {
  final text = dateValue is String ? dateValue.trim() : '';
  if (text.isEmpty) return null;

  int y, mo, d;
  var match = RegExp(r'^(\d{4})-(\d{1,2})-(\d{1,2})$').firstMatch(text);
  if (match != null) {
    y = int.parse(match.group(1)!);
    mo = int.parse(match.group(2)!);
    d = int.parse(match.group(3)!);
  } else if ((match = RegExp(r'^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$').firstMatch(text)) != null) {
    d = int.parse(match!.group(1)!);
    mo = int.parse(match.group(2)!);
    y = int.parse(match.group(3)!);
  } else {
    final parsed = DateTime.tryParse(text);
    if (parsed == null) return null;
    final ist = parsed.toUtc().add(istOffset);
    if (RegExp(r'\dT\d').hasMatch(text)) {
      // A full timestamp already carries its own time.
      return EventMoment(ist.year, ist.month, ist.day, ist.hour, ist.minute, parsed.toUtc());
    }
    y = ist.year;
    mo = ist.month;
    d = ist.day;
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;

  final clock = parseClock(timeValue);
  final h = clock != null ? clock[0] : (endOfDayWithoutTime ? 23 : 0);
  final mi = clock != null ? clock[1] : (endOfDayWithoutTime ? 59 : 0);
  final instant = DateTime.utc(y, mo, d, h, mi).subtract(istOffset);
  return EventMoment(y, mo, d, clock?[0], clock?[1], instant);
}

/// "2 h 05 m", "14:59" style countdown text.
String formatCountdown(Duration left) {
  if (left.isNegative) return '0:00';
  final m = left.inMinutes;
  final s = left.inSeconds % 60;
  return '$m:${s.toString().padLeft(2, '0')}';
}

/// A server timestamp (ISO text) shown in the device's local time.
String formatTimestamp(dynamic value) {
  if (value is! String || value.isEmpty) return '';
  final parsed = DateTime.tryParse(value);
  if (parsed == null) return '';
  final local = parsed.toLocal();
  final suffix = local.hour >= 12 ? 'PM' : 'AM';
  final h12 = local.hour % 12 == 0 ? 12 : local.hour % 12;
  return '${local.day} ${_months[local.month - 1]} ${local.year}, $h12:${local.minute.toString().padLeft(2, '0')} $suffix';
}

String monthName(int month) => _months[month - 1];

/// Trimmed text, or '' for anything that is not a non-empty string.
String cleanText(dynamic value) => value is String ? value.trim() : '';

bool looksLikeObjectId(String value) => RegExp(r'^[0-9a-fA-F]{24}$').hasMatch(value);
