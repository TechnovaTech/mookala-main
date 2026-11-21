import 'dart:convert';

import '../utils/formats.dart';

class BookingLine {
  BookingLine({
    required this.category,
    required this.block,
    required this.fromSeat,
    required this.toSeat,
    required this.quantity,
    required this.price,
    required this.totalPrice,
  });

  factory BookingLine.fromJson(Map<String, dynamic> json) {
    int? seat(dynamic v) {
      if (v == null || v == '') return null;
      final n = v is num ? v.toInt() : int.tryParse(v.toString());
      return n != null && n > 0 ? n : null;
    }

    final quantity = parseCount(json['quantity']);
    final price = parseAmount(json['price']);
    return BookingLine(
      category: cleanText(json['category']?.toString()),
      block: cleanText(json['block']?.toString()),
      fromSeat: seat(json['fromSeat']),
      toSeat: seat(json['toSeat']),
      quantity: quantity,
      price: price,
      totalPrice: json['totalPrice'] != null ? parseAmount(json['totalPrice']) : price * quantity,
    );
  }

  final String category;
  final String block;
  final int? fromSeat;
  final int? toSeat;
  final int quantity;
  final double price;
  final double totalPrice;

  bool get hasSeats => fromSeat != null && toSeat != null;

  /// "A12" / "A12 – A15" / "" for unnumbered tickets.
  String get seatLabel {
    if (!hasSeats) return '';
    return fromSeat == toSeat ? '$block$fromSeat' : '$block$fromSeat – $block$toSeat';
  }

  String get summary {
    final seats = seatLabel;
    final count = '$quantity ${quantity == 1 ? 'ticket' : 'tickets'}';
    return seats.isEmpty ? '$category • $count' : '$category • $count • Seats $seats';
  }
}

/// A booking exactly as the server reports it. Nothing here is decided on the device.
class Booking {
  Booking({
    required this.id,
    required this.eventId,
    required this.eventTitle,
    required this.eventDate,
    required this.eventTime,
    required this.venue,
    required this.lines,
    required this.totalSeats,
    required this.totalPrice,
    required this.amountPaid,
    required this.status,
    required this.paymentStatus,
    required this.isFree,
    required this.checkedIn,
    required this.bookingDate,
    required this.cancelReason,
    required this.expiresAt,
  });

  factory Booking.fromJson(Map<String, dynamic> json) {
    final lines = <BookingLine>[
      if (json['tickets'] is List)
        for (final t in json['tickets'] as List)
          if (t is Map) BookingLine.fromJson(Map<String, dynamic>.from(t)),
    ];
    final totalPrice = parseAmount(json['totalPrice']);
    final seats = parseCount(json['totalSeats']);
    return Booking(
      id: (json['_id'] ?? '').toString(),
      eventId: (json['eventId'] ?? '').toString(),
      eventTitle: cleanText(json['eventTitle']),
      eventDate: cleanText(json['eventDate']),
      eventTime: cleanText(json['eventTime']),
      venue: cleanText(json['venue']),
      lines: lines,
      totalSeats: seats > 0 ? seats : lines.fold(0, (sum, l) => sum + l.quantity),
      totalPrice: totalPrice,
      amountPaid: parseAmount(json['amountPaid']),
      status: cleanText(json['status']),
      paymentStatus: cleanText(json['paymentStatus']),
      isFree: json['isFree'] == true || (json['isFree'] == null && totalPrice == 0),
      checkedIn: json['checkedIn'] == true,
      bookingDate: cleanText(json['bookingDate']),
      cancelReason: cleanText(json['cancelReason']).isNotEmpty ? cleanText(json['cancelReason']) : cleanText(json['cancellationReason']),
      expiresAt: json['expiresAt'] is String ? DateTime.tryParse(json['expiresAt'] as String) : null,
    );
  }

  final String id;
  final String eventId;
  final String eventTitle;
  final String eventDate;
  final String eventTime;
  final String venue;
  final List<BookingLine> lines;
  final int totalSeats;
  final double totalPrice;
  final double amountPaid;
  final String status;
  final String paymentStatus;
  final bool isFree;
  final bool checkedIn;
  final String bookingDate;
  final String cancelReason;
  final DateTime? expiresAt;

  String get title => eventTitle.isEmpty ? 'Event' : eventTitle;

  EventMoment? get start => parseEventMoment(eventDate, eventTime);

  /// The end of the event day: a booking only stores the start.
  EventMoment? get endOfDay => parseEventMoment(eventDate, null, true);

  /// What the gate scanner reads. The server id is all it needs.
  String get qrPayload => jsonEncode({'bookingId': id});

  /// The last 8 characters of the server id, for people to read out.
  String get reference {
    if (id.isEmpty) return '';
    final tail = id.length <= 8 ? id : id.substring(id.length - 8);
    return tail.toUpperCase();
  }

  /// A QR is only useful for a ticket that can still be scanned.
  bool get showsQr => status == 'confirmed' || status == 'attended';

  String get priceLabel => totalPrice == 0 ? 'Free' : formatRupees(totalPrice);
}
