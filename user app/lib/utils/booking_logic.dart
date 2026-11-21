import '../models/booking.dart';
import '../models/event.dart';
import 'formats.dart';

/// Pure booking rules used by the booking and "my bookings" screens. They copy
/// the server's checks so the customer sees a problem before sending; the
/// server still decides everything (price, seats, status).

const int maxSeatsPerBooking = 100;
const int maxLinesPerBooking = 20;

/// One row of the ticket picker.
class TicketLineDraft {
  TicketLineDraft({this.ticketIndex, this.fromSeat, this.toSeat, this.quantity = 1});

  /// Index into the event's tickets; null until a category is chosen.
  int? ticketIndex;
  int? fromSeat;
  int? toSeat;

  /// Used for unnumbered tickets only.
  int quantity;
}

TicketType? _ticketOf(List<TicketType> tickets, TicketLineDraft line) {
  final i = line.ticketIndex;
  return i == null || i < 0 || i >= tickets.length ? null : tickets[i];
}

/// Seats this line asks for, or 0 while it is incomplete.
int lineQuantity(List<TicketType> tickets, TicketLineDraft line) {
  final ticket = _ticketOf(tickets, line);
  if (ticket == null) return 0;
  if (ticket.isSeated) {
    final from = line.fromSeat, to = line.toSeat;
    if (from == null || to == null || to < from) return 0;
    return to - from + 1;
  }
  return line.quantity < 1 ? 0 : line.quantity;
}

/// The problem with one line, or null when it can be sent.
String? validateLine(List<TicketType> tickets, TicketLineDraft line) {
  final ticket = _ticketOf(tickets, line);
  if (ticket == null) return 'Choose a ticket category';
  if (ticket.isSoldOut) return '${ticket.name} is sold out';

  if (ticket.isSeated) {
    final from = line.fromSeat, to = line.toSeat;
    if (from == null || to == null) return 'Enter the first and last seat number for ${ticket.name}';
    if (from < 1 || to < 1) return 'Seat numbers for ${ticket.name} are not valid';
    if (from > to) return 'The first seat must not be after the last seat';
    if (from < ticket.firstSeat || to > ticket.lastSeat) {
      return 'Seats for ${ticket.name} must be between ${ticket.firstSeat} and ${ticket.lastSeat}';
    }
    return null;
  }

  if (line.quantity < 1) return 'Choose at least 1 ticket';
  final left = ticket.remaining;
  if (left != null && line.quantity > left) {
    return 'Only $left ${left == 1 ? 'ticket is' : 'tickets are'} left for ${ticket.name}';
  }
  return null;
}

/// The first problem with the whole selection, or null when "Proceed" may be enabled.
String? validateSelection(List<TicketType> tickets, List<TicketLineDraft> lines) {
  if (tickets.isEmpty) return 'This event has no tickets on sale';
  if (lines.isEmpty) return 'Choose at least one ticket';
  if (lines.length > maxLinesPerBooking) return 'A booking can have at most $maxLinesPerBooking ticket lines';

  for (final line in lines) {
    final problem = validateLine(tickets, line);
    if (problem != null) return problem;
  }

  // The same seats twice in one booking.
  for (var i = 0; i < lines.length; i++) {
    final a = _ticketOf(tickets, lines[i])!;
    if (!a.isSeated) continue;
    for (var j = i + 1; j < lines.length; j++) {
      final b = _ticketOf(tickets, lines[j])!;
      if (!b.isSeated || a.holdKey != b.holdKey) continue;
      if (lines[i].fromSeat! <= lines[j].toSeat! && lines[i].toSeat! >= lines[j].fromSeat!) {
        return 'The same seats were chosen twice';
      }
    }
  }

  // Unnumbered tickets of one category spread over several lines.
  final perTicket = <int, int>{};
  for (final line in lines) {
    final ticket = _ticketOf(tickets, line)!;
    if (ticket.isSeated) continue;
    perTicket[line.ticketIndex!] = (perTicket[line.ticketIndex!] ?? 0) + line.quantity;
  }
  for (final entry in perTicket.entries) {
    final left = tickets[entry.key].remaining;
    if (left != null && entry.value > left) {
      return 'Only $left ${left == 1 ? 'ticket is' : 'tickets are'} left for ${tickets[entry.key].name}';
    }
  }

  final seats = totalSeats(tickets, lines);
  if (seats > maxSeatsPerBooking) return 'A booking can have at most $maxSeatsPerBooking seats';
  return null;
}

int totalSeats(List<TicketType> tickets, List<TicketLineDraft> lines) =>
    lines.fold(0, (sum, line) => sum + lineQuantity(tickets, line));

/// An estimate from the listed prices. The amount charged is always the one
/// the server returns with the order.
double estimateTotal(List<TicketType> tickets, List<TicketLineDraft> lines) {
  var total = 0.0;
  for (final line in lines) {
    final ticket = _ticketOf(tickets, line);
    if (ticket == null) continue;
    total += ticket.price * lineQuantity(tickets, line);
  }
  return (total * 100).round() / 100;
}

/// The `tickets` array of `POST /payment/order`. No prices, totals or status:
/// the server prices the booking.
List<Map<String, dynamic>> orderLines(List<TicketType> tickets, List<TicketLineDraft> lines) {
  return [
    for (final line in lines)
      if (_ticketOf(tickets, line) != null)
        () {
          final ticket = _ticketOf(tickets, line)!;
          return <String, dynamic>{
            'category': ticket.name,
            'block': ticket.blockName,
            if (ticket.isSeated) 'fromSeat': line.fromSeat,
            if (ticket.isSeated) 'toSeat': line.toSeat,
            'quantity': lineQuantity(tickets, line),
          };
        }(),
  ];
}

/* ------------------------------------------------------------------ */
/* My bookings                                                         */
/* ------------------------------------------------------------------ */

enum BookingGroup { upcoming, past, cancelled }

/// Which tab a booking belongs to: cancelled by status, otherwise by the event
/// date. A booking whose date cannot be read stays under Upcoming.
BookingGroup bookingGroupOf(Booking booking, DateTime now) {
  if (booking.status == 'cancelled' || booking.status == 'expired') return BookingGroup.cancelled;
  if (booking.status == 'attended') return BookingGroup.past;
  final end = booking.endOfDay;
  if (end != null && end.instantUtc.isBefore(now.toUtc())) return BookingGroup.past;
  return BookingGroup.upcoming;
}

Map<BookingGroup, List<Booking>> groupBookings(List<Booking> bookings, DateTime now) {
  final groups = <BookingGroup, List<Booking>>{
    BookingGroup.upcoming: [],
    BookingGroup.past: [],
    BookingGroup.cancelled: [],
  };
  for (final booking in bookings) {
    groups[bookingGroupOf(booking, now)]!.add(booking);
  }
  int startOf(Booking b) => b.start?.instantUtc.millisecondsSinceEpoch ?? 0;
  // Soonest first for upcoming; most recent first for the other two.
  groups[BookingGroup.upcoming]!.sort((a, b) => startOf(a).compareTo(startOf(b)));
  groups[BookingGroup.past]!.sort((a, b) => startOf(b).compareTo(startOf(a)));
  groups[BookingGroup.cancelled]!.sort((a, b) => b.bookingDate.compareTo(a.bookingDate));
  return groups;
}

String bookingStatusLabel(String status) {
  switch (status) {
    case 'confirmed':
      return 'Confirmed';
    case 'attended':
      return 'Attended';
    case 'cancelled':
      return 'Cancelled';
    case 'pending_payment':
      return 'Awaiting payment';
    case 'expired':
      return 'Expired';
    default:
      return status.isEmpty ? 'Unknown' : status;
  }
}

String paymentStatusLabel(String paymentStatus, {bool isFree = false}) {
  if (isFree && (paymentStatus == 'paid' || paymentStatus.isEmpty)) return 'Free ticket';
  switch (paymentStatus) {
    case 'paid':
      return 'Paid';
    case 'pending':
      return 'Payment pending';
    case 'unverified':
      return 'Payment not verified';
    case 'failed':
      return 'Payment failed';
    case 'refund_requested':
      return 'Refund requested';
    case 'refunded':
      return 'Refunded';
    default:
      return paymentStatus.isEmpty ? 'Unknown' : paymentStatus;
  }
}

/// One rule of the published refund policy as a sentence.
String refundRuleSentence(Map<String, dynamic> rule) {
  final min = parseAmount(rule['minHoursBefore']);
  final max = rule['maxHoursBefore'] == null ? null : parseAmount(rule['maxHoursBefore']);
  final percent = parseAmount(rule['refundPercent']);
  final flat = parseAmount(rule['deductionFlat']);

  String hours(double h) => h == h.roundToDouble() ? h.toInt().toString() : h.toString();
  final window = max == null
      ? 'More than ${hours(min)} hours before the event'
      : '${hours(min)} to ${hours(max)} hours before the event';
  final refund = percent <= 0
      ? 'no refund'
      : '${hours(percent)}% refund${flat > 0 ? ' less ${formatRupees(flat)}' : ''}';
  return '$window: $refund';
}
