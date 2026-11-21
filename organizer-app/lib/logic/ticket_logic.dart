/// Ticket prices, counts and seat-range rules. Pure.
///
/// Stored ticket shape (what the backend prices bookings from):
///   general:   { name, quantity: "120", price: 500, currency: "INR", priceType, isSeatWise: false }
///   seat-wise: { name: "VIP - Block A", quantity: "50", price: 499.5, blockName: "A",
///                startSeat: 1, endSeat: 50, priceType: "VIP", isSeatWise: true }
/// `price` is sent as a JSON number, never as display text. `sold` and ids are
/// owned by the server and never sent.
class TicketLogic {
  TicketLogic._();

  static const int maxQuantity = 100000;
  static const num maxPrice = 1000000;

  /// A price typed by the organiser: digits with at most two decimals.
  /// Returns null when it is not a valid price. Zero means a free ticket.
  static num? parsePrice(String input) {
    final text = input.trim();
    if (!RegExp(r'^\d{1,7}(\.\d{1,2})?$').hasMatch(text)) return null;
    final value = double.parse(text);
    if (value > maxPrice) return null;
    return value == value.roundToDouble() ? value.toInt() : value;
  }

  /// Reads a stored price, including the display strings older builds saved
  /// ("₹500.00", "₹499.50.00"). Mirrors `parseAmount` on the server.
  static num priceOf(dynamic stored) {
    if (stored is num) return stored.isFinite ? _tidy(stored) : 0;
    if (stored is! String) return 0;
    final cleaned = stored.replaceAll(RegExp(r'[^0-9.\-]'), '');
    final firstDot = cleaned.indexOf('.');
    final normalised = firstDot == -1
        ? cleaned
        : cleaned.substring(0, firstDot + 1) + cleaned.substring(firstDot + 1).replaceAll('.', '');
    final parsed = double.tryParse(normalised);
    return parsed == null || !parsed.isFinite ? 0 : _tidy(parsed);
  }

  static num _tidy(num value) => value == value.roundToDouble() ? value.toInt() : value;

  /// "Free", "₹500" or "₹499.50".
  static String formatPrice(dynamic stored) {
    final value = priceOf(stored);
    if (value == 0) return 'Free';
    return '₹${formatAmount(value)}';
  }

  /// "500" or "499.50" (no currency sign).
  static String formatAmount(num value) =>
      value == value.roundToDouble() ? value.toInt().toString() : value.toStringAsFixed(2);

  /// Counts stored as "120", 120 or "120 seats"; 0 when unreadable.
  static int countOf(dynamic stored) {
    if (stored is num) return stored.isFinite && stored > 0 ? stored.floor() : 0;
    if (stored is String) {
      final parsed = int.tryParse(stored.replaceAll(RegExp(r'[^0-9\-]'), ''));
      return parsed == null || parsed < 0 ? 0 : parsed;
    }
    return 0;
  }

  /// A quantity typed by the organiser, or null when not a whole number from 1.
  static int? parseQuantity(String input) {
    final text = input.trim();
    if (!RegExp(r'^\d{1,6}$').hasMatch(text)) return null;
    final value = int.parse(text);
    return value >= 1 && value <= maxQuantity ? value : null;
  }

  /// The key the server treats as one ticket: name + block, case-insensitive.
  static String keyOf(Map<String, dynamic> ticket) =>
      '${(ticket['name'] ?? '').toString().trim().toLowerCase()}|${(ticket['blockName'] ?? '').toString().trim().toLowerCase()}';

  static String? validateGeneral({required String name, required String priceText, required String quantityText}) {
    if (name.trim().isEmpty) return 'Enter a ticket name';
    if (name.trim().length > 60) return 'Ticket name is too long (60 characters at most)';
    if (parseQuantity(quantityText) == null) return 'Quantity for "${name.trim()}" must be a whole number from 1';
    if (parsePrice(priceText) == null) {
      return 'Price for "${name.trim()}" must be a number such as 500 or 499.50 (0 for a free ticket)';
    }
    return null;
  }

  /// Checks the price categories of one seating block.
  /// [blockSeats] is the number of seats in the block (seats are 1..blockSeats).
  static String? validateSeatRanges(String blockName, int blockSeats, List<SeatRange> ranges) {
    if (ranges.isEmpty) return 'Block $blockName has no price category';
    final names = <String>{};
    for (final r in ranges) {
      final label = r.category.trim();
      if (label.isEmpty) return 'Block $blockName: enter a category name';
      if (!names.add(label.toLowerCase())) return 'Block $blockName: "$label" is used twice';
      final start = r.start;
      final end = r.end;
      if (start == null || end == null) return 'Block $blockName, $label: enter the first and last seat number';
      if (start < 1) return 'Block $blockName, $label: seats start at 1';
      if (start > end) return 'Block $blockName, $label: the first seat ($start) is after the last seat ($end)';
      if (end > blockSeats) return 'Block $blockName, $label: seat $end is beyond the block ($blockSeats seats)';
      if (r.price == null) {
        return 'Block $blockName, $label: price must be a number such as 500 or 499.50 (0 for free)';
      }
    }
    final sorted = [...ranges]..sort((a, b) => a.start!.compareTo(b.start!));
    for (var i = 1; i < sorted.length; i++) {
      final previous = sorted[i - 1];
      final current = sorted[i];
      if (current.start! <= previous.end!) {
        return 'Block $blockName: seats ${current.start}-${current.end} (${current.category.trim()}) overlap '
            '${previous.start}-${previous.end} (${previous.category.trim()})';
      }
    }
    return null;
  }

  /// Checks a whole ticket list before it is sent.
  static String? validateList(List<Map<String, dynamic>> tickets) {
    if (tickets.isEmpty) return 'Add at least one ticket before continuing';
    final seen = <String>{};
    for (final t in tickets) {
      final name = (t['name'] ?? '').toString().trim();
      if (name.isEmpty) return 'A ticket has no name';
      if (!seen.add(keyOf(t))) return 'Two tickets are called "$name". Each ticket needs its own name.';
      if (countOf(t['quantity']) < 1) return '"$name" needs a quantity of at least 1';
    }
    return null;
  }

  static Map<String, dynamic> general({required String name, required num price, required int quantity}) => {
        'name': name.trim(),
        'quantity': quantity.toString(),
        'price': price,
        'currency': 'INR',
        'priceType': name.trim(),
        'isSeatWise': false,
      };

  static Map<String, dynamic> seatWise({
    required String category,
    required String blockName,
    required int startSeat,
    required int endSeat,
    required num price,
  }) =>
      {
        'name': '${category.trim()} - Block $blockName',
        'quantity': (endSeat - startSeat + 1).toString(),
        'price': price,
        'currency': 'INR',
        'blockName': blockName,
        'startSeat': startSeat,
        'endSeat': endSeat,
        'priceType': category.trim(),
        'isSeatWise': true,
      };

  /// The ticket as sent to the server: numeric price, no `sold`, no made-up ids.
  static Map<String, dynamic> forServer(Map<String, dynamic> ticket) {
    final out = Map<String, dynamic>.from(ticket)
      ..remove('sold')
      ..remove('id')
      ..remove('_id');
    out['price'] = priceOf(ticket['price']);
    out['quantity'] = countOf(ticket['quantity']).toString();
    return out;
  }

  static List<Map<String, dynamic>> listForServer(List<Map<String, dynamic>> tickets) =>
      tickets.map(forServer).toList();

  static int totalQuantity(dynamic tickets) =>
      tickets is List ? tickets.whereType<Map>().fold(0, (sum, t) => sum + countOf(t['quantity'])) : 0;

  static int totalSold(dynamic tickets) =>
      tickets is List ? tickets.whereType<Map>().fold(0, (sum, t) => sum + countOf(t['sold'])) : 0;
}

class SeatRange {
  const SeatRange({required this.category, required this.start, required this.end, required this.price});
  final String category;
  final int? start;
  final int? end;
  final num? price;
}
