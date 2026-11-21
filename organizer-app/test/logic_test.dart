import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:organizer_app/config/app_config.dart';
import 'package:organizer_app/logic/calendar_grid.dart';
import 'package:organizer_app/logic/event_logic.dart';
import 'package:organizer_app/logic/role_routing.dart';
import 'package:organizer_app/logic/scan_result.dart';
import 'package:organizer_app/logic/ticket_logic.dart';
import 'package:organizer_app/logic/validators.dart';
import 'package:organizer_app/services/api_client.dart';
import 'package:organizer_app/utils/image_utils.dart';

SessionInfo info(Map<String, dynamic> json) => SessionInfo.fromJson(json);

Map<String, dynamic> profile(String status, {String? name, String kyc = 'not_submitted'}) =>
    {'status': status, 'name': name, 'kycStatus': kyc};

void main() {
  group('Validators', () {
    test('Aadhaar is 12 digits, spaces allowed', () {
      expect(Validators.aadhaar('123412341234'), isNull);
      expect(Validators.aadhaar('1234 1234 1234'), isNull);
      expect(Validators.normaliseAadhaar('1234 1234 1234'), '123412341234');
      expect(Validators.aadhaar('12341234123'), isNotNull);
      expect(Validators.aadhaar('1234123412345'), isNotNull);
      expect(Validators.aadhaar('12341234123a'), isNotNull);
      expect(Validators.aadhaar(''), isNotNull);
    });

    test('PAN is AAAAA9999A', () {
      expect(Validators.pan('ABCDE1234F'), isNull);
      expect(Validators.pan('abcde1234f'), isNull, reason: 'lower case is upper-cased before sending');
      expect(Validators.normalisePan(' abcde1234f '), 'ABCDE1234F');
      expect(Validators.pan('ABCD1234F'), isNotNull);
      expect(Validators.pan('ABCDE12345'), isNotNull);
      expect(Validators.pan('1BCDE1234F'), isNotNull);
      expect(Validators.pan('ABCDE1234FG'), isNotNull);
    });

    test('phone numbers', () {
      expect(Validators.normalisePhone('9876543210'), '9876543210');
      expect(Validators.normalisePhone('+91 98765 43210'), '9876543210');
      expect(Validators.normalisePhone('09876543210'), '9876543210');
      expect(Validators.normalisePhone('919876543210'), '9876543210');
      expect(Validators.normalisePhone('12345'), isNull);
      expect(Validators.normalisePhone('1234567890'), isNull);
    });

    test('OTP accepts 4 to 8 digits', () {
      expect(Validators.otp('1234'), isNull);
      expect(Validators.otp('123456'), isNull);
      expect(Validators.otp('12345678'), isNull);
      expect(Validators.otp('123'), isNotNull);
      expect(Validators.otp('123456789'), isNotNull);
      expect(Validators.otp('12a4'), isNotNull);
    });

    test('email and url', () {
      expect(Validators.email('a@b.co'), isNull);
      expect(Validators.email('a@b'), isNotNull);
      expect(Validators.email('', required: false), isNull);
      expect(Validators.url('https://meet.example.com/abc'), isNull);
      expect(Validators.url('meet.example.com'), isNotNull);
      expect(Validators.url('', required: false), isNull);
      expect(Validators.url(''), isNotNull);
    });
  });

  group('Role routing', () {
    test('no role: choose one to register', () {
      final d = decideRoute(info({'roles': [], 'profiles': {'user': null, 'artist': null, 'organizer': null}}));
      expect(d.step, NextStep.chooseNewRole);
    });

    test('a customer-only phone is treated as having no app role', () {
      final d = decideRoute(info({
        'roles': ['user'],
        'profiles': {'user': profile('verified', name: 'U'), 'artist': null, 'organizer': null},
      }));
      expect(d.step, NextStep.chooseNewRole);
    });

    test('one finished role goes to its dashboard', () {
      final d = decideRoute(info({
        'roles': ['organizer'],
        'profiles': {'organizer': profile('profile_completed', name: 'Org', kyc: 'pending')},
      }));
      expect(d.step, NextStep.dashboard);
      expect(d.role, 'organizer');
    });

    test('one role with an unfinished profile goes to the profile form', () {
      for (final status in ['pending', 'verified']) {
        final d = decideRoute(info({
          'roles': ['artist'],
          'profiles': {'artist': profile(status)},
        }));
        expect(d.step, NextStep.fillProfile, reason: status);
        expect(d.role, 'artist');
      }
    });

    test('profile done but KYC never submitted goes to KYC', () {
      final d = decideRoute(info({
        'roles': ['organizer'],
        'profiles': {'organizer': profile('profile_completed', name: 'Org')},
      }));
      expect(d.step, NextStep.submitKyc);
    });

    test('rejected KYC goes to the dashboard, which shows the notes', () {
      final d = decideRoute(info({
        'roles': ['artist'],
        'profiles': {'artist': profile('completed', name: 'A', kyc: 'rejected')},
      }));
      expect(d.step, NextStep.dashboard);
    });

    test('two roles: ask, unless a saved role is still held', () {
      final both = info({
        'roles': ['artist', 'organizer'],
        'profiles': {
          'artist': profile('verified'),
          'organizer': profile('profile_completed', name: 'Org', kyc: 'approved'),
        },
      });
      expect(decideRoute(both).step, NextStep.chooseExistingRole);

      final asOrganizer = decideRoute(both, savedRole: 'organizer');
      expect(asOrganizer.step, NextStep.dashboard);
      expect(asOrganizer.role, 'organizer');

      // The dual-role bug: an unfinished artist record must not hijack the organiser.
      final asArtist = decideRoute(both, savedRole: 'artist');
      expect(asArtist.step, NextStep.fillProfile);
      expect(asArtist.role, 'artist');
    });

    test('a saved role the phone no longer holds is ignored', () {
      final d = decideRoute(
        info({
          'roles': ['organizer'],
          'profiles': {'organizer': profile('profile_completed', name: 'Org', kyc: 'approved')},
        }),
        savedRole: 'artist',
      );
      expect(d.role, 'organizer');
      expect(d.step, NextStep.dashboard);
    });

    test('a suspended role is left out and the other still works', () {
      final i = info({
        'roles': ['organizer'],
        'profiles': {
          'artist': profile('completed', name: 'A', kyc: 'approved'),
          'organizer': profile('profile_completed', name: 'O', kyc: 'approved'),
        },
        'restrictions': {'artist': 'Suspended until review'},
      });
      expect(decideRoute(i).role, 'organizer');
      final asArtist = stepForRole(i, 'artist');
      expect(asArtist.step, NextStep.restricted);
      expect(asArtist.message, 'Suspended until review');
      expect(i.unregisteredRoles, isEmpty);
    });

    test('every app role restricted', () {
      final d = decideRoute(info({
        'roles': [],
        'profiles': {'artist': profile('completed', name: 'A'), 'organizer': profile('completed', name: 'O')},
        'restrictions': {'artist': 'Blocked', 'organizer': 'Blocked too'},
      }));
      expect(d.step, NextStep.restricted);
      expect(d.message, 'Blocked too', reason: 'the organiser message comes first (appRoles order)');
    });

    test('malformed session data does not throw', () {
      final i = info({'roles': 'x', 'profiles': [], 'restrictions': null});
      expect(i.roles, isEmpty);
      expect(decideRoute(i).step, NextStep.chooseNewRole);
    });
  });

  group('Calendar grid', () {
    test('leading blanks follow the weekday of the 1st (Sunday first)', () {
      expect(CalendarGrid.leadingBlanks(2026, 11), 0, reason: '1 Nov 2026 is a Sunday');
      expect(CalendarGrid.leadingBlanks(2026, 12), 2, reason: '1 Dec 2026 is a Tuesday');
      expect(CalendarGrid.leadingBlanks(2027, 1), 5, reason: '1 Jan 2027 is a Friday');
      expect(CalendarGrid.leadingBlanks(2026, 8), 6, reason: '1 Aug 2026 is a Saturday');
    });

    test('days in month including leap years', () {
      expect(CalendarGrid.daysInMonth(2026, 2), 28);
      expect(CalendarGrid.daysInMonth(2028, 2), 29);
      expect(CalendarGrid.daysInMonth(2026, 12), 31);
      expect(CalendarGrid.daysInMonth(2026, 4), 30);
    });

    test('cells are whole weeks and hold every day once', () {
      for (var month = 1; month <= 12; month++) {
        final cells = CalendarGrid.cells(2026, month);
        expect(cells.length % 7, 0);
        final days = cells.whereType<int>().toList();
        expect(days, List.generate(CalendarGrid.daysInMonth(2026, month), (i) => i + 1));
        expect(cells.indexOf(1), CalendarGrid.leadingBlanks(2026, month));
      }
    });

    test('month navigation crosses years', () {
      expect(CalendarGrid.addMonths(DateTime(2026, 12, 15), 1), DateTime(2027, 1, 1));
      expect(CalendarGrid.addMonths(DateTime(2026, 1, 31), -1), DateTime(2025, 12, 1));
      expect(CalendarGrid.title(DateTime(2027, 1, 1)), 'January 2027');
    });

    test('date keys', () {
      expect(CalendarGrid.dateKey(2026, 3, 5), '2026-03-05');
      expect(CalendarGrid.keyOf('2026-3-5'), '2026-03-05');
      expect(CalendarGrid.keyOf('2026-12-05T10:00:00.000Z'), '2026-12-05');
      expect(CalendarGrid.keyOf('Date TBD'), isNull);
      expect(CalendarGrid.keyOf('2026-02-30'), isNull);
      expect(CalendarGrid.keyOf(null), isNull);
    });
  });

  group('Ticket prices and quantities', () {
    test('typed prices become numbers, not display text', () {
      expect(TicketLogic.parsePrice('500'), 500);
      expect(TicketLogic.parsePrice('500'), isA<int>());
      expect(TicketLogic.parsePrice('499.50'), 499.5);
      expect(TicketLogic.parsePrice('0'), 0);
      expect(TicketLogic.parsePrice(''), isNull);
      expect(TicketLogic.parsePrice('-5'), isNull);
      expect(TicketLogic.parsePrice('12.345'), isNull);
      expect(TicketLogic.parsePrice('1.2.3'), isNull);
      expect(TicketLogic.parsePrice('₹500'), isNull);
      expect(TicketLogic.parsePrice('99999999'), isNull);
    });

    test('stored legacy prices are read like the server reads them', () {
      expect(TicketLogic.priceOf('₹500.00'), 500);
      expect(TicketLogic.priceOf('₹499.50.00'), 499.5, reason: 'the old "499.50" + ".00" bug');
      expect(TicketLogic.priceOf(750), 750);
      expect(TicketLogic.priceOf(99.99), 99.99);
      expect(TicketLogic.priceOf(null), 0);
      expect(TicketLogic.priceOf('free'), 0);
    });

    test('formatting', () {
      expect(TicketLogic.formatPrice(500), '₹500');
      expect(TicketLogic.formatPrice(499.5), '₹499.50');
      expect(TicketLogic.formatPrice('₹500.00'), '₹500');
      expect(TicketLogic.formatPrice(0), 'Free');
    });

    test('quantities', () {
      expect(TicketLogic.parseQuantity('120'), 120);
      expect(TicketLogic.parseQuantity('0'), isNull);
      expect(TicketLogic.parseQuantity('1.5'), isNull);
      expect(TicketLogic.parseQuantity(''), isNull);
      expect(TicketLogic.countOf('120 seats'), 120);
      expect(TicketLogic.countOf(7), 7);
      expect(TicketLogic.countOf(null), 0);
    });

    test('general ticket validation', () {
      expect(TicketLogic.validateGeneral(name: 'VIP', priceText: '500', quantityText: '10'), isNull);
      expect(TicketLogic.validateGeneral(name: ' ', priceText: '500', quantityText: '10'), isNotNull);
      expect(TicketLogic.validateGeneral(name: 'VIP', priceText: 'abc', quantityText: '10'), isNotNull);
      expect(TicketLogic.validateGeneral(name: 'VIP', priceText: '500', quantityText: '0'), isNotNull);
    });

    test('an event cannot be created with zero tickets or duplicate names', () {
      expect(TicketLogic.validateList([]), isNotNull);
      final vip = TicketLogic.general(name: 'VIP', price: 500, quantity: 10);
      expect(TicketLogic.validateList([vip]), isNull);
      expect(TicketLogic.validateList([vip, TicketLogic.general(name: ' vip ', price: 1, quantity: 1)]), isNotNull);
      expect(TicketLogic.validateList([{'name': 'X', 'quantity': '0', 'price': 5}]), isNotNull);
    });

    test('payload sent to the server has no sold count, no id and a numeric price', () {
      final sent = TicketLogic.forServer({
        'id': '12114225',
        '_id': 'x',
        'name': 'Gold',
        'price': '₹499.50.00',
        'quantity': 40,
        'sold': '12',
        'isSeatWise': false,
      });
      expect(sent.containsKey('sold'), isFalse);
      expect(sent.containsKey('id'), isFalse);
      expect(sent.containsKey('_id'), isFalse);
      expect(sent['price'], 499.5);
      expect(sent['quantity'], '40');
      expect(jsonEncode(TicketLogic.general(name: 'VIP', price: 500, quantity: 10)),
          contains('"price":500'));
    });

    test('seat-wise ticket shape', () {
      final t = TicketLogic.seatWise(category: 'VIP', blockName: 'A', startSeat: 11, endSeat: 30, price: 750);
      expect(t['name'], 'VIP - Block A');
      expect(t['quantity'], '20');
      expect(t['startSeat'], 11);
      expect(t['endSeat'], 30);
      expect(t['isSeatWise'], true);
      expect(TicketLogic.keyOf(t), 'vip - block a|a');
    });

    test('totals', () {
      final list = [
        {'quantity': '100', 'sold': '7'},
        {'quantity': 50, 'sold': 3},
      ];
      expect(TicketLogic.totalQuantity(list), 150);
      expect(TicketLogic.totalSold(list), 10);
      expect(TicketLogic.totalQuantity(null), 0);
    });
  });

  group('Seat ranges', () {
    SeatRange r(String c, int? s, int? e, [num? p = 100]) => SeatRange(category: c, start: s, end: e, price: p);

    test('valid split of a block', () {
      expect(TicketLogic.validateSeatRanges('A', 120, [r('VIP', 1, 40), r('Normal', 41, 120)]), isNull);
      expect(TicketLogic.validateSeatRanges('A', 120, [r('Normal', 41, 120), r('VIP', 1, 40)]), isNull,
          reason: 'order does not matter');
      expect(TicketLogic.validateSeatRanges('A', 120, [r('VIP', 10, 10)]), isNull, reason: 'one seat');
    });

    test('overlap is refused', () {
      expect(TicketLogic.validateSeatRanges('A', 120, [r('VIP', 1, 50), r('Normal', 50, 120)]), contains('overlap'));
      expect(TicketLogic.validateSeatRanges('A', 120, [r('VIP', 1, 120), r('Normal', 30, 40)]), contains('overlap'));
    });

    test('beyond the block is refused', () {
      expect(TicketLogic.validateSeatRanges('A', 120, [r('VIP', 100, 121)]), contains('beyond'));
      expect(TicketLogic.validateSeatRanges('A', 120, [r('VIP', 0, 10)]), contains('start at 1'));
    });

    test('reversed range is refused', () {
      expect(TicketLogic.validateSeatRanges('A', 120, [r('VIP', 40, 10)]), contains('after the last'));
    });

    test('missing numbers, price, names and duplicates are refused', () {
      expect(TicketLogic.validateSeatRanges('A', 120, [r('VIP', null, 10)]), isNotNull);
      expect(TicketLogic.validateSeatRanges('A', 120, [r('VIP', 1, 10, null)]), contains('price'));
      expect(TicketLogic.validateSeatRanges('A', 120, [r(' ', 1, 10)]), contains('category name'));
      expect(TicketLogic.validateSeatRanges('A', 120, [r('VIP', 1, 10), r('vip', 11, 20)]), contains('twice'));
      expect(TicketLogic.validateSeatRanges('A', 120, []), isNotNull);
    });
  });

  group('Event logic', () {
    test('time formatting is locale independent', () {
      expect(EventLogic.formatTime(19, 30), '7:30 PM');
      expect(EventLogic.formatTime(0, 5), '12:05 AM');
      expect(EventLogic.formatTime(12, 0), '12:00 PM');
      expect(EventLogic.formatDate(DateTime(2026, 3, 5)), '2026-03-05');
    });

    test('parsing stored dates and times', () {
      expect(EventLogic.parseDateTime('2026-12-05', '6:30 PM'), DateTime(2026, 12, 5, 18, 30));
      expect(EventLogic.parseDateTime('2026-12-05', '18:30'), DateTime(2026, 12, 5, 18, 30));
      expect(EventLogic.parseDateTime('2026-12-05', '12:15 AM'), DateTime(2026, 12, 5, 0, 15));
      expect(EventLogic.parseDateTime('2026-12-05'), DateTime(2026, 12, 5));
      expect(EventLogic.parseDateTime('soon'), isNull);
      expect(EventLogic.parseDateTime('2026-12-05', '25:00'), isNull);
      expect(EventLogic.displayDate('2026-12-05'), '5 Dec 2026');
      expect(EventLogic.displayDate('Date TBD'), 'Date TBD');
    });

    test('schedule validation: end must be after start', () {
      final now = DateTime(2026, 11, 21, 10);
      String? check({String sd = '2026-12-05', String st = '6:30 PM', String ed = '', String et = ''}) =>
          EventLogic.validateSchedule(startDate: sd, startTime: st, endDate: ed, endTime: et, now: now);
      expect(check(), isNull);
      expect(check(ed: '2026-12-05', et: '9:00 PM'), isNull);
      expect(check(ed: '2026-12-05', et: '6:30 PM'), contains('end after'));
      expect(check(ed: '2026-12-04', et: '9:00 PM'), contains('end after'));
      expect(check(ed: '2026-12-05'), contains('both'));
      expect(check(sd: ''), isNotNull);
      expect(check(st: ''), isNotNull);
      expect(check(sd: '2026-11-20'), contains('past'));
      expect(check(sd: '2026-11-21', st: '9:00 AM'), isNull, reason: 'today is allowed');
    });

    test('status labels', () {
      expect(EventLogic.statusLabel({'status': 'pending'}), 'Waiting for approval');
      expect(EventLogic.statusLabel({}), 'Waiting for approval');
      expect(EventLogic.statusLabel({'status': 'rejected'}), 'Rejected');
      expect(EventLogic.statusLabel({'status': 'approved', 'bookingStatus': 'artist_pending'}), contains('waiting for artist'));
      expect(EventLogic.statusLabel({'status': 'approved', 'bookingStatus': 'confirmed'}), 'Approved');
    });

    test('place and search', () {
      final e = {
        'name': 'Garba Night',
        'status': 'pending',
        'locationType': 'venue',
        'location': {'name': 'Town Hall', 'city': 'Rajkot'},
        'startDate': '2026-12-05',
      };
      expect(EventLogic.placeOf(e), 'Town Hall, Rajkot');
      expect(EventLogic.placeOf({'locationType': 'online'}), 'Online event');
      expect(EventLogic.placeOf({'location': 'Rajkot'}), 'Venue not set');
      expect(EventLogic.matchesSearch(e, 'garba'), isTrue);
      expect(EventLogic.matchesSearch(e, 'RAJKOT'), isTrue);
      expect(EventLogic.matchesSearch(e, 'waiting'), isTrue);
      expect(EventLogic.matchesSearch(e, 'mumbai'), isFalse);
      expect(EventLogic.matchesSearch(e, '  '), isTrue);
    });

    test('past events', () {
      final now = DateTime(2026, 11, 21, 10);
      expect(EventLogic.isPast({'startDate': '2026-11-19'}, now: now), isTrue);
      expect(EventLogic.isPast({'startDate': '2026-11-21'}, now: now), isFalse);
      expect(EventLogic.isPast({'startDate': '2026-11-20', 'endDate': '2026-11-22', 'endTime': '9:00 PM'}, now: now), isFalse);
      expect(EventLogic.isPast({}, now: now), isFalse);
    });

    test('sales are matched by event id, not title', () {
      final rows = [
        {'eventId': 'A', 'eventTitle': 'Same', 'status': 'confirmed', 'totalSeats': 2, 'totalPrice': 1000, 'checkedIn': false, 'paymentStatus': 'paid'},
        {'eventId': 'A', 'eventTitle': 'Same', 'status': 'attended', 'totalSeats': 3, 'totalPrice': '1500', 'checkedIn': true, 'paymentStatus': 'paid'},
        {'eventId': 'A', 'eventTitle': 'Same', 'status': 'cancelled', 'totalSeats': 4, 'totalPrice': 2000},
        {'eventId': 'A', 'eventTitle': 'Same', 'status': 'pending_payment', 'totalSeats': 9, 'totalPrice': 9000},
        {'eventId': 'B', 'eventTitle': 'Same', 'status': 'confirmed', 'totalSeats': 50, 'totalPrice': 99999},
        {'eventId': 'A', 'status': 'confirmed', 'tickets': [{'quantity': '2'}, {'quantity': 1}], 'totalPrice': 300.5, 'paymentStatus': 'unverified'},
      ];
      final s = EventSales.fromBookings(rows, 'A');
      expect(s.bookings, 3);
      expect(s.ticketsSold, 8);
      expect(s.checkedInTickets, 3);
      expect(s.cancelledBookings, 1);
      expect(s.grossSales, 2800.5);
      expect(s.unverifiedBookings, 1);
    });
  });

  group('Gate scanning', () {
    test('every reason in the contract has its own title and keeps the server message', () {
      const reasons = [
        'ok', 'already_used', 'cancelled', 'not_found', 'bad_qr',
        'wrong_event', 'payment_pending', 'expired', 'payment_unverified', 'not_confirmed',
      ];
      final titles = <String>{};
      for (final reason in reasons) {
        final o = ScanOutcome.fromResponse({'valid': reason == 'ok', 'reason': reason, 'message': 'server says $reason'});
        expect(o.message, 'server says $reason');
        expect(o.valid, reason == 'ok');
        titles.add(o.title);
      }
      expect(titles.length, reasons.length);
    });

    test('tones', () {
      expect(ScanOutcome.fromResponse({'valid': true, 'reason': 'ok'}).tone, ScanTone.success);
      expect(ScanOutcome.fromResponse({'valid': false, 'reason': 'wrong_event'}).tone, ScanTone.warning);
      expect(ScanOutcome.fromResponse({'valid': false, 'reason': 'already_used'}).tone, ScanTone.warning);
      expect(ScanOutcome.fromResponse({'valid': false, 'reason': 'cancelled'}).tone, ScanTone.error);
    });

    test('an unknown reason is still refused with a message', () {
      final o = ScanOutcome.fromResponse({'valid': false, 'reason': 'something_new'});
      expect(o.valid, isFalse);
      expect(o.title, 'Entry refused');
      expect(o.message, isNotEmpty);
      expect(ScanOutcome.fromResponse({}).valid, isFalse);
    });

    test('request body always carries the event id when known', () {
      expect(scanRequestBody('{"bookingId":"abc"}', eventId: 'E1'), {'qrData': '{"bookingId":"abc"}', 'eventId': 'E1'});
      expect(scanRequestBody(' 6b017a9fe4616a0fd4e9de48 ', eventId: 'E1'), {'bookingId': '6b017a9fe4616a0fd4e9de48', 'eventId': 'E1'});
      expect(scanRequestBody('{not json', eventId: 'E1'), {'bookingId': '{not json', 'eventId': 'E1'});
      expect(scanRequestBody('abc').containsKey('eventId'), isFalse);
      expect(scanRequestBody('abc', eventId: '').containsKey('eventId'), isFalse);
    });
  });

  group('API client helpers', () {
    test('base URL is normalised', () {
      expect(AppConfig.normaliseBaseUrl('http://127.0.0.1:3100/api/'), 'http://127.0.0.1:3100/api');
      expect(AppConfig.normaliseBaseUrl(' https://x.test/api// '), 'https://x.test/api');
    });

    test('uri building drops empty query values', () {
      final uri = ApiClient.uri('/bookings', {'organizerPhone': '9876543210', 'eventId': '', 'x': null});
      expect(uri.path, endsWith('/bookings'));
      expect(uri.queryParameters, {'organizerPhone': '9876543210'});
      expect(ApiClient.uri('events').path, endsWith('/events'));
    });

    test('error messages prefer the server text', () {
      expect(ApiClient.errorMessage(409, {'error': '"VIP" already has 3 tickets sold'}), '"VIP" already has 3 tickets sold');
      expect(ApiClient.errorMessage(401, {'error': 'Invalid credentials'}), 'Invalid credentials');
      expect(ApiClient.errorMessage(500, null), contains('500'));
      expect(ApiClient.errorMessage(413, {}), contains('too large'));
      expect(ApiClient.errorMessage(429, {'error': '  '}), contains('Too many'));
    });

    test('non-JSON bodies decode to null instead of throwing', () {
      expect(ApiClient.decodeBody(utf8.encode('<html>502</html>')), isNull);
      expect(ApiClient.decodeBody([]), isNull);
      expect(ApiClient.decodeBody(utf8.encode('{"a":1}')), {'a': 1});
    });

    test('retryAfterSeconds is read from the body', () {
      expect(ApiException('x', statusCode: 429, body: {'retryAfterSeconds': 27}).retryAfterSeconds, 27);
      expect(ApiException('x', statusCode: 429, body: {}).retryAfterSeconds, isNull);
      expect(ApiException('x').isNetwork, isTrue);
    });
  });

  group('Stored images', () {
    final png = base64Decode(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');

    test('decodes bare base64 and data URLs, never throws', () {
      expect(ImageUtils.decode(base64Encode(png)), png);
      expect(ImageUtils.decode('data:image/png;base64,${base64Encode(png)}'), png);
      expect(ImageUtils.decode('data:image/png;base64'), isNull, reason: 'the old split(",")[1] crash');
      expect(ImageUtils.decode('not base64 !!'), isNull);
      expect(ImageUtils.decode(null), isNull);
      expect(ImageUtils.decode(''), isNull);
      expect(ImageUtils.decode('https://x.test/a.png'), isNull);
      expect(ImageUtils.isHttpUrl('https://x.test/a.png'), isTrue);
    });

    test('size limits and mime sniffing', () {
      expect(ImageUtils.base64Length(3), 4);
      expect(ImageUtils.base64Length(4), 8);
      expect(ImageUtils.sizeProblem(Uint8List(1000)), isNull);
      expect(ImageUtils.sizeProblem(Uint8List(1200000)), isNotNull);
      expect(ImageUtils.sizeProblem(Uint8List(2000000), maxChars: 4000000), isNull);
      expect(ImageUtils.mimeOf(png), 'image/png');
      expect(ImageUtils.mimeOf(Uint8List.fromList([0xFF, 0xD8, 0xFF, 0xE0])), 'image/jpeg');
    });
  });
}
