import 'dart:convert';

import 'package:flutter/painting.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mookalaa_app/models/event.dart';
import 'package:mookalaa_app/utils/event_filter.dart';
import 'package:mookalaa_app/utils/formats.dart';
import 'package:mookalaa_app/utils/image_source.dart';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

EventModel ev(Map<String, dynamic> extra) => EventModel.fromJson({'_id': '6b01784678c24a2daef0befc', 'name': 'E', ...extra});

void main() {
  group('formats', () {
    test('parseAmount reads stored price text', () {
      expect(parseAmount('₹1,500.00'), 1500);
      expect(parseAmount('500.00'), 500);
      expect(parseAmount(250), 250);
      expect(parseAmount(null), 0);
      expect(parseAmount('free'), 0);
    });

    test('formatRupees', () {
      expect(formatRupees(0), '₹0');
      expect(formatRupees(1500), '₹1,500');
      expect(formatRupees(123456.5), '₹1,23,456.50');
    });

    test('event date and time are read as India time', () {
      final m = parseEventMoment('2026-12-01', '6:30 PM')!;
      expect(m.instantUtc, DateTime.utc(2026, 12, 1, 13, 0));
      expect(m.label, 'Tue, 1 Dec 2026 • 6:30 PM');
      expect(parseEventMoment('2026-12-05', '19:00')!.timeLabel, '7:00 PM');
      expect(parseEventMoment('05/12/2026', null)!.dateLabel, 'Sat, 5 Dec 2026');
      expect(parseEventMoment('', '7 PM'), isNull);
      expect(parseEventMoment(null), isNull);
      expect(parseEventMoment('next week'), isNull);
    });
  });

  group('event parsing is safe on missing fields', () {
    test('an event with almost nothing does not throw', () {
      final e = ev({'tickets': [], 'media': {}});
      expect(e.title, 'E');
      expect(e.priceLabel, '');
      expect(e.placeLabel, '');
      expect(e.dateLabel, 'Date to be announced');
      expect(e.image, '');
      expect(e.isOver(DateTime.now()), isFalse);
    });

    test('organiser-app event: venue comes from location, never the word "Venue"', () {
      final e = ev({'location': {'name': 'Seed Hall', 'address': '12 MG Road', 'city': 'Bengaluru'}});
      expect(e.venueName, 'Seed Hall');
      expect(e.fullAddress, 'Seed Hall, 12 MG Road, Bengaluru');
    });

    test('admin event: resolved venue record is used, a raw id is never shown', () {
      final resolved = ev({'venue': {'_id': 'x', 'name': 'Town Hall', 'location': {'address': 'Main Rd', 'city': 'Surat'}, 'seatingLayoutImage': png}});
      expect(resolved.venueName, 'Town Hall');
      expect(resolved.venueCity, 'Surat');
      expect(resolved.seatingLayoutImage, png);
      expect(ev({'venue': '6b01784678c24a2daef0bef9'}).venueName, '');
      expect(ev({'venue': 'Free text hall'}).venueName, 'Free text hall');
    });

    test('price label uses every ticket, not the first one', () {
      expect(ev({'tickets': [{'name': 'VIP', 'price': '1500'}, {'name': 'Normal', 'price': '₹500.00'}]}).priceLabel, '₹500 onwards');
      expect(ev({'tickets': [{'name': 'G', 'price': '0'}]}).priceLabel, 'Free');
      expect(ev({'tickets': [{'name': 'G', 'price': 300}]}).priceLabel, '₹300');
    });
  });

  group('images', () {
    test('raw base64, data: URL, web and asset sources all resolve', () {
      expect(imageProviderFor(png), isA<MemoryImage>());
      expect(imageProviderFor('data:image/png;base64,$png'), isA<MemoryImage>());
      expect(imageProviderFor('https://example.test/a.jpg'), isA<NetworkImage>());
      expect(imageProviderFor('assets/images/logo_image.png'), isA<AssetImage>());
    });

    test('bad or missing images give null instead of throwing', () {
      expect(imageProviderFor(null), isNull);
      expect(imageProviderFor(''), isNull);
      expect(imageProviderFor('not base64 !!!'), isNull);
      expect(imageProviderFor('data:video/mp4;base64,AAAA'), isNull);
      expect(decodeImageBytes('data:image/png;base64,$png'), base64Decode(png));
    });
  });

  group('filters', () {
    final now = DateTime.utc(2026, 11, 25, 6, 30);
    final events = [
      ev({'_id': 'a' * 24, 'name': 'Garba Night', 'category': 'Concerts', 'startDate': '2026-11-28', 'startTime': '19:00', 'location': {'name': 'Dash Hall', 'city': 'Rajkot'}, 'tickets': [{'name': 'Gold', 'price': '₹500.00'}], 'languages': ['Gujarati'], 'artists': ['artist1']}),
      ev({'_id': 'b' * 24, 'name': 'Free Recital', 'category': 'Classical', 'startDate': '2026-12-01', 'startTime': '6:30 PM', 'location': {'name': 'Seed Hall', 'city': ' bengaluru '}, 'tickets': [{'name': 'General', 'price': '0'}]}),
      ev({'_id': 'c' * 24, 'name': 'Old Show', 'startDate': '2026-10-12', 'startTime': '19:00'}),
      ev({'_id': 'd' * 24, 'name': 'No Date Show'}),
    ];

    test('ended events are left out and the rest is sorted soonest first, undated last', () {
      expect(filterEvents(events, const EventFilter(), now).map((e) => e.name), ['Garba Night', 'Free Recital', 'No Date Show']);
    });

    test('search matches name, venue and city', () {
      expect(filterEvents(events, const EventFilter(query: 'garba'), now).length, 1);
      expect(filterEvents(events, const EventFilter(query: 'seed hall'), now).single.name, 'Free Recital');
      expect(filterEvents(events, const EventFilter(query: 'rajkot'), now).single.name, 'Garba Night');
    });

    test('date filter is applied; undated events are excluded from it', () {
      final f = EventFilter(dates: DayRange(DateTime(2026, 11, 28), DateTime(2026, 11, 29)));
      expect(filterEvents(events, f, now).map((e) => e.name), ['Garba Night']);
    });

    test('city, category, price, free, artist and language filters', () {
      expect(filterEvents(events, const EventFilter(city: 'Bengaluru'), now).single.name, 'Free Recital');
      expect(filterEvents(events, const EventFilter(categories: {'Concerts'}), now).single.name, 'Garba Night');
      expect(filterEvents(events, const EventFilter(minPrice: 100, maxPrice: 600), now).single.name, 'Garba Night');
      expect(filterEvents(events, const EventFilter(freeOnly: true), now).single.name, 'Free Recital');
      expect(filterEvents(events, const EventFilter(artistId: 'artist1'), now).single.name, 'Garba Night');
      expect(filterEvents(events, const EventFilter(language: 'gujarati'), now).single.name, 'Garba Night');
    });

    test('cities are tidied and de-duplicated', () {
      expect(citiesOf(events), ['Bengaluru', 'Rajkot']);
    });

    test('date presets are computed from today', () {
      // Wednesday 25 Nov 2026
      final presets = {for (final p in datePresets(DateTime(2026, 11, 25, 15))) p.title: p.range};
      expect(presets['Today']!.label, '25 Nov');
      expect(presets['Tomorrow']!.label, '26 Nov');
      expect(presets['This weekend']!.label, '28 Nov – 29 Nov');
      expect(presets['This week']!.label, '25 Nov – 29 Nov');
      expect(presets['This month']!.label, '25 Nov – 30 Nov');
      // On a Sunday the weekend is today.
      expect(datePresets(DateTime(2026, 11, 29)).firstWhere((p) => p.title == 'This weekend').range.label, '29 Nov');
    });
  });
}
