import 'ticket_logic.dart';

/// Event dates, status labels and sales summaries. Pure.
class EventLogic {
  EventLogic._();

  static const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /// "YYYY-MM-DD", the format the backend reads event dates in.
  static String formatDate(DateTime date) =>
      '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';

  /// "7:30 PM", independent of the device locale.
  static String formatTime(int hour, int minute) {
    final period = hour >= 12 ? 'PM' : 'AM';
    final h = hour % 12 == 0 ? 12 : hour % 12;
    return '$h:${minute.toString().padLeft(2, '0')} $period';
  }

  /// Parses "2026-12-05" with an optional "6:30 PM" / "18:30". Null when unreadable.
  static DateTime? parseDateTime(dynamic date, [dynamic time]) {
    if (date is! String) return null;
    final d = RegExp(r'^(\d{4})-(\d{1,2})-(\d{1,2})').firstMatch(date.trim());
    if (d == null) return null;
    final year = int.parse(d.group(1)!);
    final month = int.parse(d.group(2)!);
    final day = int.parse(d.group(3)!);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    var hour = 0;
    var minute = 0;
    if (time is String && time.trim().isNotEmpty) {
      final t = RegExp(r'^(\d{1,2})[:.](\d{2})(?::\d{2})?\s*(?:([AaPp])\.?\s*[Mm]\.?)?$').firstMatch(time.trim());
      if (t == null) return null;
      hour = int.parse(t.group(1)!);
      minute = int.parse(t.group(2)!);
      final marker = t.group(3)?.toLowerCase();
      if (marker != null) {
        if (hour == 12) {
          hour = marker == 'p' ? 12 : 0;
        } else if (marker == 'p') {
          hour += 12;
        }
      }
      if (hour > 23 || minute > 59) return null;
    }
    return DateTime(year, month, day, hour, minute);
  }

  /// "5 Dec 2026" from a stored date, or the raw text when it cannot be read.
  static String displayDate(dynamic date) {
    final parsed = parseDateTime(date);
    if (parsed == null) return date is String && date.trim().isNotEmpty ? date.trim() : 'Date not set';
    return '${parsed.day} ${_months[parsed.month - 1]} ${parsed.year}';
  }

  static String displaySchedule(Map<String, dynamic> event) {
    final start = displayDate(event['startDate']);
    final time = (event['startTime'] ?? '').toString().trim();
    return time.isEmpty ? start : '$start, $time';
  }

  /// Checks the schedule of a new event. Returns an error message or null.
  static String? validateSchedule({
    required String startDate,
    required String startTime,
    String endDate = '',
    String endTime = '',
    DateTime? now,
  }) {
    if (startDate.trim().isEmpty) return 'Choose the start date';
    if (startTime.trim().isEmpty) return 'Choose the start time';
    final start = parseDateTime(startDate, startTime);
    if (start == null) return 'The start date or time is not valid';
    final today = now ?? DateTime.now();
    if (start.isBefore(DateTime(today.year, today.month, today.day))) return 'The start date is in the past';

    final hasEndDate = endDate.trim().isNotEmpty;
    final hasEndTime = endTime.trim().isNotEmpty;
    if (!hasEndDate && !hasEndTime) return null;
    if (hasEndDate != hasEndTime) return 'Set both the end date and the end time, or leave both empty';
    final end = parseDateTime(endDate, endTime);
    if (end == null) return 'The end date or time is not valid';
    if (!end.isAfter(start)) return 'The event must end after it starts';
    return null;
  }

  /// 'pending' | 'approved' | 'rejected' (anything else counts as pending).
  static String statusOf(Map<String, dynamic> event) {
    final status = (event['status'] ?? '').toString();
    return status == 'approved' || status == 'rejected' ? status : 'pending';
  }

  /// The line shown on an event card.
  static String statusLabel(Map<String, dynamic> event) {
    switch (statusOf(event)) {
      case 'rejected':
        return 'Rejected';
      case 'approved':
        switch ((event['bookingStatus'] ?? '').toString()) {
          case 'artist_pending':
            return 'Approved · waiting for artist';
          case 'artist_declined':
            return 'Approved · artist declined';
          default:
            return 'Approved';
        }
      default:
        return 'Waiting for approval';
    }
  }

  /// True when the event is approved and its end (or start) has passed.
  static bool isPast(Map<String, dynamic> event, {DateTime? now}) {
    final end = parseDateTime(event['endDate'], event['endTime']) ??
        parseDateTime(event['startDate'])?.add(const Duration(days: 1));
    if (end == null) return false;
    return end.isBefore(now ?? DateTime.now());
  }

  /// Venue or mode of an event as one line.
  static String placeOf(Map<String, dynamic> event) {
    final type = (event['locationType'] ?? 'venue').toString();
    if (type == 'online') return 'Online event';
    if (type == 'recorded') return 'Recorded event';
    final location = event['location'];
    if (location is Map) {
      final name = (location['name'] ?? location['venue'] ?? '').toString().trim();
      final city = (location['city'] ?? '').toString().trim();
      final address = (location['address'] ?? '').toString().trim();
      final parts = [if (name.isNotEmpty) name else if (address.isNotEmpty) address, if (city.isNotEmpty) city];
      if (parts.isNotEmpty) return parts.join(', ');
    }
    return 'Venue not set';
  }

  static bool matchesSearch(Map<String, dynamic> event, String query) {
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return true;
    final haystack = [
      event['name'],
      placeOf(event),
      event['startDate'],
      statusLabel(event),
    ].map((e) => (e ?? '').toString().toLowerCase()).join(' ');
    return haystack.contains(q);
  }
}

/// Sales of one event, built from `GET /bookings?organizerPhone=&eventId=`.
class EventSales {
  const EventSales({
    required this.bookings,
    required this.ticketsSold,
    required this.checkedInTickets,
    required this.cancelledBookings,
    required this.grossSales,
    required this.unverifiedBookings,
  });

  /// Confirmed or attended bookings.
  final int bookings;
  final int ticketsSold;
  final int checkedInTickets;
  final int cancelledBookings;

  /// Ticket value of confirmed and attended bookings. This is not a payout:
  /// commission, taxes, gateway fees and refunds are settled by Mookalaa.
  final num grossSales;

  /// Confirmed bookings whose payment the gateway never verified.
  final int unverifiedBookings;

  static int _seats(Map<String, dynamic> booking) {
    final total = TicketLogic.countOf(booking['totalSeats']);
    if (total > 0) return total;
    final tickets = booking['tickets'];
    if (tickets is List) {
      return tickets.whereType<Map>().fold(0, (sum, t) => sum + TicketLogic.countOf(t['quantity']));
    }
    return 0;
  }

  /// Only rows whose `eventId` equals [eventId] are counted, so two events
  /// with the same title never merge.
  factory EventSales.fromBookings(List<Map<String, dynamic>> rows, String eventId) {
    var bookings = 0, sold = 0, checkedIn = 0, cancelled = 0, unverified = 0;
    num gross = 0;
    for (final row in rows) {
      if ((row['eventId'] ?? '').toString() != eventId) continue;
      final status = (row['status'] ?? '').toString();
      if (status == 'cancelled') {
        cancelled += 1;
        continue;
      }
      if (status != 'confirmed' && status != 'attended') continue;
      final seats = _seats(row);
      bookings += 1;
      sold += seats;
      gross += TicketLogic.priceOf(row['totalPrice']);
      if (row['checkedIn'] == true) checkedIn += seats;
      if ((row['paymentStatus'] ?? '').toString() == 'unverified') unverified += 1;
    }
    return EventSales(
      bookings: bookings,
      ticketsSold: sold,
      checkedInTickets: checkedIn,
      cancelledBookings: cancelled,
      grossSales: gross,
      unverifiedBookings: unverified,
    );
  }
}
