import '../../utils/formats.dart';

/// What a ticket can be about. The same values as the admin panel's services.
const List<MapEntry<String, String>> supportServices = [
  MapEntry('ticketing', 'Event ticketing'),
  MapEntry('artist_booking', 'Artist booking'),
  MapEntry('learning', 'Learning'),
  MapEntry('wishes', 'Wishes & greetings'),
  MapEntry('membership', 'Membership'),
  MapEntry('advertising', 'Advertising'),
  MapEntry('payment', 'Payment or refund'),
  MapEntry('account', 'Account'),
  MapEntry('other', 'Other'),
];

String supportServiceLabel(String value) {
  for (final entry in supportServices) {
    if (entry.key == value) return entry.value;
  }
  return value.isEmpty ? 'Other' : value.replaceAll('_', ' ');
}

class TicketReply {
  TicketReply({required this.text, required this.at, required this.from});

  factory TicketReply.fromJson(Map<String, dynamic> json) => TicketReply(
        text: cleanText(json['text']),
        at: cleanText(json['at']),
        from: cleanText(json['from']).isEmpty ? 'Mookalaa support' : cleanText(json['from']),
      );

  final String text;
  final String at;
  final String from;
}

/// One ticket or complaint as `GET /public/support/tickets` returns it.
class SupportTicket {
  SupportTicket({
    required this.id,
    required this.reference,
    required this.kind,
    required this.subject,
    required this.service,
    required this.description,
    required this.bookingId,
    required this.status,
    required this.statusLabel,
    required this.finished,
    required this.createdAt,
    required this.replies,
  });

  factory SupportTicket.fromJson(Map<String, dynamic> json) => SupportTicket(
        id: cleanText(json['id']),
        reference: cleanText(json['reference']),
        kind: cleanText(json['kind']) == 'complaint' ? 'complaint' : 'ticket',
        subject: cleanText(json['subject']),
        service: cleanText(json['service']),
        description: cleanText(json['description']),
        bookingId: cleanText(json['bookingId']),
        status: cleanText(json['status']),
        statusLabel: cleanText(json['statusLabel']).isEmpty ? 'Received' : cleanText(json['statusLabel']),
        finished: json['finished'] == true,
        createdAt: cleanText(json['createdAt']),
        replies: [
          if (json['replies'] is List)
            for (final r in json['replies'] as List)
              if (r is Map) TicketReply.fromJson(Map<String, dynamic>.from(r)),
        ],
      );

  final String id;
  final String reference;
  final String kind;
  final String subject;
  final String service;
  final String description;
  final String bookingId;
  final String status;
  final String statusLabel;
  final bool finished;
  final String createdAt;
  final List<TicketReply> replies;
}

/// A rating the customer gave, from `GET /public/feedback`.
class MyRating {
  MyRating({required this.bookingId, required this.rating, required this.statusLabel});

  factory MyRating.fromJson(Map<String, dynamic> json) => MyRating(
        bookingId: cleanText(json['bookingId']),
        rating: json['rating'] is num ? (json['rating'] as num).toInt() : int.tryParse('${json['rating']}') ?? 0,
        statusLabel: cleanText(json['statusLabel']),
      );

  final String bookingId;
  final int rating;
  final String statusLabel;
}
