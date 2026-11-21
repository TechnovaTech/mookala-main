import '../utils/formats.dart';

/// One ticket type of an event, as `adminpanel/lib/bookings.ts` reads it.
class TicketType {
  TicketType({
    required this.name,
    required this.blockName,
    required this.priceType,
    required this.price,
    required this.capacity,
    required this.sold,
    required this.startSeat,
    required this.endSeat,
  });

  factory TicketType.fromJson(Map<String, dynamic> json) {
    return TicketType(
      name: cleanText(json['name']?.toString()),
      blockName: cleanText(json['blockName']),
      priceType: cleanText(json['priceType']),
      price: parseAmount(json['price']),
      capacity: parseCount(json['quantity']),
      sold: parseCount(json['sold']),
      startSeat: parseCount(json['startSeat']),
      endSeat: parseCount(json['endSeat']),
    );
  }

  final String name;
  final String blockName;
  final String priceType;
  final double price;
  final int capacity;
  final int sold;
  final int startSeat;
  final int endSeat;

  /// The server asks for seat numbers exactly when both ends are set.
  bool get isSeated => startSeat > 0 && endSeat > 0;

  int get firstSeat => startSeat > 0 ? startSeat : 1;
  int get lastSeat => endSeat > 0 ? endSeat : firstSeat + capacity - 1;

  /// Tickets left, or null when the capacity is not known.
  int? get remaining => capacity > 0 ? (capacity - sold < 0 ? 0 : capacity - sold) : null;

  bool get isSoldOut => remaining == 0;

  /// Seats are unique under the block, or under the category when it has none.
  String get holdKey => blockName.isNotEmpty ? blockName : name;

  String get priceLabel => price == 0 ? 'Free' : formatRupees(price);
}

/// A live event from `/events/approved` or `/events/{id}`.
class EventModel {
  EventModel({
    required this.id,
    required this.name,
    required this.category,
    required this.subCategories,
    required this.languages,
    required this.description,
    required this.terms,
    required this.locationType,
    required this.start,
    required this.end,
    required this.venueName,
    required this.venueAddress,
    required this.venueCity,
    required this.image,
    required this.gallery,
    required this.seatingLayoutImage,
    required this.tickets,
    required this.artistIds,
    required this.artists,
    required this.organizerName,
  });

  factory EventModel.fromJson(Map<String, dynamic> json) {
    final location = json['location'] is Map ? Map<String, dynamic>.from(json['location'] as Map) : const <String, dynamic>{};
    final venueDoc = json['venue'] is Map
        ? Map<String, dynamic>.from(json['venue'] as Map)
        : (json['venueDetails'] is Map ? Map<String, dynamic>.from(json['venueDetails'] as Map) : const <String, dynamic>{});
    final venueLocation =
        venueDoc['location'] is Map ? Map<String, dynamic>.from(venueDoc['location'] as Map) : const <String, dynamic>{};

    // Same order as the server: the typed-in location, then the venue record,
    // then free text. A bare venue id is never shown.
    var venueName = cleanText(location['name']);
    if (venueName.isEmpty) venueName = cleanText(venueDoc['name']);
    if (venueName.isEmpty) {
      final raw = cleanText(json['venue']);
      if (raw.isNotEmpty && !looksLikeObjectId(raw)) venueName = raw;
    }
    var address = cleanText(location['address']);
    if (address.isEmpty) address = cleanText(venueLocation['address']);
    var city = cleanText(location['city']);
    if (city.isEmpty) city = cleanText(venueLocation['city']);

    final media = json['media'] is Map ? Map<String, dynamic>.from(json['media'] as Map) : const <String, dynamic>{};
    final gallery = <String>[
      if (media['images'] is List)
        for (final item in media['images'] as List)
          if (item is String && item.trim().isNotEmpty) item,
    ];
    var image = cleanText(media['bannerImage']);
    if (image.isEmpty && gallery.isNotEmpty) image = gallery.first;
    if (image.isEmpty) image = cleanText(json['eventImage']);
    if (image.isEmpty) image = cleanText(json['image']);

    final tickets = <TicketType>[
      if (json['tickets'] is List)
        for (final t in json['tickets'] as List)
          if (t is Map) TicketType.fromJson(Map<String, dynamic>.from(t)),
    ];

    final artistIds = <String>[
      if (json['artists'] is List)
        for (final a in json['artists'] as List)
          if (a is String && a.isNotEmpty) a else if (a is Map && a['_id'] != null) a['_id'].toString(),
    ];
    final artists = <Map<String, dynamic>>[
      if (json['artistDetails'] is List)
        for (final a in json['artistDetails'] as List)
          if (a is Map) Map<String, dynamic>.from(a),
    ];

    String organizerName = '';
    for (final key in ['organizer', 'artist']) {
      final person = json[key];
      if (organizerName.isEmpty && person is Map) organizerName = cleanText(person['name']);
    }

    List<String> strings(dynamic value) => [
          if (value is List)
            for (final v in value)
              if (v is String && v.trim().isNotEmpty) v.trim(),
        ];

    final languages = strings(json['languages']);
    if (languages.isEmpty && cleanText(json['language']).isNotEmpty) languages.add(cleanText(json['language']));

    final start = parseEventMoment(json['startDate'], json['startTime']);
    final end = parseEventMoment(json['endDate'], json['endTime'], true) ?? parseEventMoment(json['startDate'], null, true);

    return EventModel(
      id: (json['_id'] ?? json['id'] ?? '').toString(),
      name: cleanText(json['name']).isNotEmpty ? cleanText(json['name']) : cleanText(json['title']),
      category: cleanText(json['category']),
      subCategories: strings(json['subCategories']),
      languages: languages,
      description: cleanText(json['description']),
      terms: cleanText(json['terms']),
      locationType: cleanText(json['locationType']),
      start: start,
      end: end,
      venueName: venueName,
      venueAddress: address,
      venueCity: city,
      image: image,
      gallery: gallery,
      seatingLayoutImage: cleanText(venueDoc['seatingLayoutImage']),
      tickets: tickets,
      artistIds: artistIds,
      artists: artists,
      organizerName: organizerName,
    );
  }

  final String id;
  final String name;
  final String category;
  final List<String> subCategories;
  final List<String> languages;
  final String description;
  final String terms;
  final String locationType;
  final EventMoment? start;
  final EventMoment? end;
  final String venueName;
  final String venueAddress;
  final String venueCity;

  /// Banner image source (any form `imageProviderFor` accepts), or ''.
  final String image;
  final List<String> gallery;
  final String seatingLayoutImage;
  final List<TicketType> tickets;
  final List<String> artistIds;

  /// Public artist records; only the detail response carries them.
  final List<Map<String, dynamic>> artists;
  final String organizerName;

  String get title => name.isEmpty ? 'Untitled event' : name;
  bool get isOnline => locationType == 'online' || locationType == 'recorded';
  bool get hasTickets => tickets.isNotEmpty;

  double? get minPrice {
    if (tickets.isEmpty) return null;
    return tickets.map((t) => t.price).reduce((a, b) => a < b ? a : b);
  }

  double? get maxPrice {
    if (tickets.isEmpty) return null;
    return tickets.map((t) => t.price).reduce((a, b) => a > b ? a : b);
  }

  bool get isFree => hasTickets && maxPrice == 0;

  /// "Free", "₹500", "₹500 onwards", or '' when no tickets are on sale.
  String get priceLabel {
    final low = minPrice;
    final high = maxPrice;
    if (low == null || high == null) return '';
    if (high == 0) return 'Free';
    if (low == high) return formatRupees(low);
    return low == 0 ? 'Free – ${formatRupees(high)}' : '${formatRupees(low)} onwards';
  }

  /// True once the event has ended (India time). Unknown dates are not "over".
  bool isOver(DateTime now) => end != null && end!.instantUtc.isBefore(now.toUtc());

  bool get isBookable => hasTickets && id.length == 24;

  String get dateLabel => start?.label ?? 'Date to be announced';

  /// "Seed Hall, Bengaluru" with whatever parts exist.
  String get placeLabel {
    final parts = <String>[
      if (venueName.isNotEmpty) venueName,
      if (venueCity.isNotEmpty && venueCity.toLowerCase() != venueName.toLowerCase()) venueCity,
    ];
    if (parts.isNotEmpty) return parts.join(', ');
    return isOnline ? 'Online event' : '';
  }

  String get fullAddress {
    final parts = <String>[
      if (venueName.isNotEmpty) venueName,
      if (venueAddress.isNotEmpty) venueAddress,
      if (venueCity.isNotEmpty) venueCity,
    ];
    return parts.join(', ');
  }
}
