/// Month grid maths for the artist calendar. Pure.
class CalendarGrid {
  CalendarGrid._();

  static const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  static const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  static int daysInMonth(int year, int month) => DateTime(year, month + 1, 0).day;

  /// Empty cells before day 1 in a Sunday-first grid (0 when the 1st is a Sunday).
  static int leadingBlanks(int year, int month) => DateTime(year, month, 1).weekday % 7;

  /// The cells of the grid, row by row: null for a blank, else the day number.
  /// The length is always a multiple of 7.
  static List<int?> cells(int year, int month) {
    final out = <int?>[
      for (var i = 0; i < leadingBlanks(year, month); i++) null,
      for (var d = 1; d <= daysInMonth(year, month); d++) d,
    ];
    while (out.length % 7 != 0) {
      out.add(null);
    }
    return out;
  }

  /// First day of the month [delta] months away from [month].
  static DateTime addMonths(DateTime month, int delta) => DateTime(month.year, month.month + delta, 1);

  static String title(DateTime month) => '${monthNames[month.month - 1]} ${month.year}';

  /// "YYYY-MM-DD", the format the backend stores event dates in.
  static String dateKey(int year, int month, int day) =>
      '${year.toString().padLeft(4, '0')}-${month.toString().padLeft(2, '0')}-${day.toString().padLeft(2, '0')}';

  /// Reads the "YYYY-MM-DD" part of a stored event date; null when unreadable.
  static String? keyOf(dynamic value) {
    if (value is! String) return null;
    final match = RegExp(r'^(\d{4})-(\d{1,2})-(\d{1,2})').firstMatch(value.trim());
    if (match == null) return null;
    final y = int.parse(match.group(1)!);
    final m = int.parse(match.group(2)!);
    final d = int.parse(match.group(3)!);
    if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
    return dateKey(y, m, d);
  }
}
