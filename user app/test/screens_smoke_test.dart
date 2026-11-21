import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mookalaa_app/models/booking.dart';
import 'package:mookalaa_app/models/event.dart';
import 'package:mookalaa_app/screens/booking_screen.dart';
import 'package:mookalaa_app/screens/discovery_home_screen.dart';
import 'package:mookalaa_app/screens/my_bookings_screen.dart';
import 'package:mookalaa_app/screens/organized_event_details_screen.dart';
import 'package:mookalaa_app/screens/otp_verification_screen.dart';
import 'package:mookalaa_app/screens/phone_login_screen.dart';
import 'package:mookalaa_app/screens/ticket_screen.dart';
import 'package:mookalaa_app/services/api_client.dart';
import 'package:mookalaa_app/services/session.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Screens are pumped against a fake backend that answers with the same
/// shapes the real one returned during the live check. A layout overflow or an
/// exception in build() fails these tests.
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

final freeEvent = {
  '_id': '6b01784678c24a2daef0befc',
  'name': 'Seed Free Recital',
  'category': 'Concerts',
  'subCategories': ['Classical'],
  'languages': ['Kannada'],
  'description': 'A free recital.',
  'terms': 'Be on time.',
  'startDate': '2099-12-01',
  'startTime': '6:30 PM',
  'endDate': '2099-12-01',
  'endTime': '9:00 PM',
  'location': {'name': 'Seed Hall', 'address': '12 MG Road', 'city': 'Bengaluru'},
  'artists': ['6b01784678c24a2daef0befa'],
  'media': {'bannerImage': png, 'images': [], 'videos': []},
  'tickets': [
    {'name': 'General', 'quantity': '50', 'price': '0', 'isSeatWise': false, 'sold': '0'}
  ],
  'status': 'approved',
};

final paidEvent = {
  '_id': '6b01784678c24a2daef0befd',
  'name': 'Seed Paid Concert with a deliberately long name to check wrapping in cards',
  'category': 'Concerts',
  'startDate': '2099-12-11',
  'startTime': '19:00',
  'venue': {
    '_id': '6b01784678c24a2daef0bef9',
    'name': 'Seed Hall',
    'location': {'address': '12 MG Road', 'city': 'Bengaluru', 'state': 'Karnataka'}
  },
  'media': {'bannerImage': null, 'images': [], 'videos': []},
  'tickets': [
    {'name': 'VIP - Block A', 'quantity': '20', 'price': '1500', 'blockName': 'A', 'startSeat': 1, 'endSeat': 20, 'sold': '0'},
    {'name': 'Normal - Block A', 'quantity': '80', 'price': '500.00', 'blockName': 'A', 'startSeat': 21, 'endSeat': 100, 'sold': '0'}
  ],
  'status': 'approved',
};

// An event with almost nothing on it, as some live rows are.
final bareEvent = {'_id': '6b0170180a624176a219e75c', 'name': 'Bare Online Show', 'locationType': 'online', 'tickets': [], 'media': {}};

final artist = {
  '_id': '6b01784678c24a2daef0befa',
  'name': 'Seed Artist',
  'city': 'Mysuru',
  'genre': 'Classical',
  'bio': 'Bio',
  'profileImage': 'this is not an image',
  'followersCount': 1,
  'media': [
    {'data': png, 'type': 'image'}
  ],
};

Map<String, dynamic> bookingJson(String id, String status, String date, {String payment = 'paid', double total = 0}) => {
      '_id': id,
      'userPhone': '9000000555',
      'eventId': '6b01784678c24a2daef0befc',
      'eventTitle': 'Seed Free Recital',
      'eventDate': date,
      'eventTime': '6:30 PM',
      'venue': 'Seed Hall',
      'tickets': [
        {'category': 'General', 'block': '', 'fromSeat': null, 'toSeat': null, 'quantity': 2, 'price': total / 2, 'totalPrice': total}
      ],
      'totalSeats': 2,
      'totalPrice': total,
      'status': status,
      'paymentStatus': payment,
      'isFree': total == 0,
      'checkedIn': false,
      'bookingDate': '2026-11-21T11:11:48.242Z',
    };

final requests = <String>[];

http.Response ok(Object body, [int status = 200]) =>
    http.Response.bytes(utf8.encode(jsonEncode(body)), status, headers: {'content-type': 'application/json; charset=utf-8'});

MockClient backend({int orderStatus = 503}) => MockClient((request) async {
      final path = request.url.path.replaceFirst(RegExp(r'^.*/api'), '');
      requests.add('${request.method} $path');
      switch (path) {
        case '/events/approved':
          return ok({'success': true, 'events': [paidEvent, freeEvent, bareEvent], 'count': 3});
        case '/events/6b01784678c24a2daef0befc':
          return ok({'success': true, 'event': {...freeEvent, 'artistDetails': [artist], 'organizer': {'name': 'Seed Organiser'}}});
        case '/events/6b01784678c24a2daef0befd':
          return ok({'success': true, 'event': {...paidEvent, 'venue': '6b01784678c24a2daef0bef9'}});
        case '/user/profile':
          return ok({'success': true, 'user': {'phone': '9000000555', 'name': 'Test Attendee', 'email': '', 'city': 'Bengaluru', 'profileImage': null, 'genres': [], 'status': 'completed'}});
        case '/banners':
          return ok({'success': true, 'banners': [{'_id': 'b1', 'title': 'Seed Banner', 'image': 'data:image/png;base64,$png', 'mediaType': 'image', 'link': 'https://example.test/banner'}]});
        case '/ads':
          return ok({'success': true, 'ads': [{'_id': 'a1', 'title': 'Seed Ad', 'image': 'data:image/png;base64,$png', 'mediaType': 'image', 'link': '', 'sponsor': 'Seed Sponsor', 'duration': 5}]});
        case '/categories':
          return ok([{'_id': 'c1', 'name': 'Concerts', 'type': 'Event', 'image': null, 'subCategories': [{'name': 'Classical'}]}]);
        case '/artists':
          return ok({'success': true, 'artists': [artist], 'count': 1});
        case '/user/follow-status':
          return ok({'success': true, 'isFollowing': true});
        case '/venues':
          return ok({'success': true, 'venues': []});
        case '/payment/config':
          return ok({
            'success': true,
            'enabled': false,
            'holdMinutes': 15,
            'refundPolicy': [
              {'name': 'r', 'minHoursBefore': 72, 'maxHoursBefore': null, 'refundPercent': 80, 'deductionFlat': 0}
            ]
          });
        case '/payment/order':
          return orderStatus == 503
              ? ok({'success': false, 'error': 'Online payment is not available right now. Please try again later.', 'code': 'PAYMENTS_UNAVAILABLE'}, 503)
              : ok({
                  'success': true,
                  'bookingId': 'bk1',
                  'orderId': 'order_1',
                  'amount': 450000,
                  'currency': 'INR',
                  'keyId': 'rzp_test_x',
                  'expiresAt': DateTime.now().add(const Duration(minutes: 15)).toUtc().toIso8601String(),
                  'totalPrice': 4500,
                  'totalSeats': 3,
                  'tickets': [],
                });
        case '/bookings':
          return ok({
            'success': true,
            'bookings': [
              bookingJson('6b017c74e4616a0fd4e9de57', 'confirmed', '2099-12-01'),
              bookingJson('6b017c74e4616a0fd4e9de58', 'confirmed', '2020-01-01', total: 900),
              bookingJson('6b017c74e4616a0fd4e9de59', 'cancelled', '2099-12-01', payment: 'refund_requested', total: 900),
            ]
          });
        case '/public/otp/verify':
          return ok({'success': false, 'error': 'Invalid OTP', 'attemptsLeft': 4}, 400);
        case '/public/otp/send':
          return ok({'success': false, 'error': 'Please wait a few seconds before requesting another code.', 'retryAfterSeconds': 30}, 429);
      }
      return ok({'success': false, 'error': 'Not found in the fake backend: $path'}, 404);
    });

Future<void> pumpScreen(WidgetTester tester, Widget screen, {Size size = const Size(360, 740)}) async {
  tester.view.physicalSize = size * 2;
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(MaterialApp(home: screen));
  await tester.pump(); // let the fake requests finish
  await tester.pump(const Duration(milliseconds: 100));
}

void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await Session.save(token: 'tok', phone: '9000000555');
    requests.clear();
    ApiClient.onUnauthorized = null;
    ApiClient.useHttpClient(backend());
  });

  testWidgets('login screen: an invalid number is refused without a request; the 429 wait is shown', (tester) async {
    await Session.clear();
    await pumpScreen(tester, const PhoneLoginScreen());
    await tester.enterText(find.byType(TextField), '12345');
    await tester.ensureVisible(find.text('CONTINUE'));
    await tester.tap(find.text('CONTINUE'));
    await tester.pump();
    expect(find.textContaining('valid 10-digit'), findsOneWidget);
    expect(requests, isEmpty);

    await tester.enterText(find.byType(TextField), '9000000555');
    await tester.ensureVisible(find.text('CONTINUE'));
    await tester.tap(find.text('CONTINUE'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(requests, ['POST /public/otp/send']);
    expect(find.textContaining('try again in 30 seconds'), findsOneWidget);
  });

  testWidgets('OTP screen: the test-code hint appears only in dev mode; a wrong code shows attempts left', (tester) async {
    await Session.clear();
    await pumpScreen(tester, const OTPVerificationScreen(phoneNumber: '9000000555', devMode: false));
    expect(find.textContaining('1234'), findsNothing);
    expect(find.textContaining('Resend code in'), findsOneWidget);

    await tester.enterText(find.byType(TextField), '999999');
    await tester.pump();
    await tester.ensureVisible(find.text('VERIFY'));
    await tester.tap(find.text('VERIFY'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.textContaining('4 attempts left'), findsOneWidget);
    expect(Session.isSignedIn, isFalse);
    await tester.pumpWidget(const SizedBox()); // stop the countdown timer

    await pumpScreen(tester, const OTPVerificationScreen(phoneNumber: '9000000555', devMode: true));
    expect(find.textContaining('Use the code 1234'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('home screen renders live data on a small phone without layout errors', (tester) async {
    await pumpScreen(tester, const DiscoveryHomeScreen(), size: const Size(320, 640));
    expect(find.text('Bengaluru'), findsOneWidget); // city from the profile
    // The outer list (the search box has a scrollable of its own).
    final page = find.byType(ListView).first;
    Future<void> reach(Finder target) => tester.dragUntilVisible(target, page, const Offset(0, -150), maxIteration: 80);
    await reach(find.text('Upcoming in Bengaluru'));
    await reach(find.text('Seed Free Recital'));
    expect(find.textContaining('Classical Music Evening'), findsNothing);
    expect(find.textContaining('kms'), findsNothing);

    // Go through every section so each one is built and laid out.
    await reach(find.text('Sponsored'));
    await reach(find.text('Following')); // follow state came from the server
    await reach(find.text('Hire for your own event'));
    expect(requests, contains('GET /user/follow-status'));
  });

  testWidgets('home search finds a live event that has none of the old card fields', (tester) async {
    await pumpScreen(tester, const DiscoveryHomeScreen());
    await tester.tap(find.text('Bengaluru'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('All cities').last);
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, 'bare');
    await tester.pump();
    expect(find.text('1 event found'), findsOneWidget);
    expect(find.text('Bare Online Show'), findsOneWidget);
    expect(find.text('Online event'), findsOneWidget);
  });

  testWidgets('event details: real fields, working Book button, no venue id shown', (tester) async {
    await pumpScreen(tester, OrganizedEventDetailsScreen(event: EventModel.fromJson(paidEvent)));
    expect(find.textContaining('Seed Hall, 12 MG Road, Bengaluru'), findsOneWidget);
    expect(find.textContaining('6b01784678c24a2daef0bef9'), findsNothing);
    expect(find.text('BOOK NOW'), findsOneWidget);
    expect(find.text('Button Works!'), findsNothing);

    await pumpScreen(tester, OrganizedEventDetailsScreen(key: const ValueKey('bare'), event: EventModel.fromJson(bareEvent)));
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('Tickets are not on sale for this event'), findsOneWidget);
  });

  testWidgets('booking: Proceed stays disabled until a category and a valid seat range are chosen; 503 is shown honestly', (tester) async {
    await pumpScreen(tester, BookingScreen(event: EventModel.fromJson(paidEvent)));
    ElevatedButton proceed() => tester.widget<ElevatedButton>(find.widgetWithText(ElevatedButton, 'PROCEED'));
    expect(proceed().onPressed, isNull);
    expect(find.text('Choose a ticket category'), findsOneWidget);
    expect(find.textContaining('72 hours before the event: 80% refund'), findsOneWidget); // policy before paying

    await tester.tap(find.byType(DropdownButtonFormField<int>));
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('VIP - Block A').last);
    await tester.pumpAndSettle();
    expect(proceed().onPressed, isNull); // seats still missing

    await tester.enterText(find.widgetWithText(TextField, 'First seat'), '18');
    await tester.enterText(find.widgetWithText(TextField, 'Last seat'), '22');
    await tester.pump();
    expect(find.textContaining('between 1 and 20'), findsWidgets);
    expect(proceed().onPressed, isNull);

    await tester.enterText(find.widgetWithText(TextField, 'First seat'), '3');
    await tester.enterText(find.widgetWithText(TextField, 'Last seat'), '5');
    await tester.pump();
    expect(find.text('Estimated ₹4,500'), findsOneWidget);
    expect(proceed().onPressed, isNotNull);

    await tester.tap(find.widgetWithText(ElevatedButton, 'PROCEED'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(requests, contains('POST /payment/order'));
    expect(find.text('Paid booking is unavailable right now. Please try again later.'), findsWidgets);
    expect(find.textContaining('Booking confirmed'), findsNothing);
    expect(find.text('Your seats are held'), findsNothing);
  });

  testWidgets('booking: a paid order shows the server amount and the hold countdown before paying', (tester) async {
    ApiClient.useHttpClient(backend(orderStatus: 200));
    await pumpScreen(tester, BookingScreen(event: EventModel.fromJson(paidEvent)));
    await tester.tap(find.byType(DropdownButtonFormField<int>));
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('VIP - Block A').last);
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'First seat'), '3');
    await tester.enterText(find.widgetWithText(TextField, 'Last seat'), '5');
    await tester.pump();
    await tester.tap(find.widgetWithText(ElevatedButton, 'PROCEED'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('Your seats are held'), findsOneWidget);
    expect(find.textContaining('Pay within 14:5'), findsOneWidget);
    expect(find.text('PAY ₹4,500'), findsOneWidget);
    await tester.pumpWidget(const SizedBox()); // stop the countdown timer
  });

  testWidgets('my bookings: one request, grouped by date and status', (tester) async {
    await pumpScreen(tester, const MyBookingsScreen());
    expect(requests, ['GET /bookings']);
    expect(find.text('Upcoming (1)'), findsOneWidget);
    expect(find.text('Past (1)'), findsOneWidget);
    expect(find.text('Cancelled (1)'), findsOneWidget);
    expect(find.text('Ref D4E9DE57'), findsOneWidget);

    await tester.tap(find.text('Cancelled (1)'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Refund requested'), findsOneWidget);
  });

  testWidgets('ticket screen: QR for a confirmed ticket, none for a cancelled one', (tester) async {
    await pumpScreen(tester, TicketScreen(booking: Booking.fromJson(bookingJson('6b017c74e4616a0fd4e9de57', 'confirmed', '2099-12-01'))));
    expect(find.text('Free ticket'), findsOneWidget);
    final page = find.byType(Scrollable).first;
    await tester.scrollUntilVisible(find.text('Show this code at the entrance.'), 200, scrollable: page);
    await tester.scrollUntilVisible(find.text('Cancel booking'), 200, scrollable: page);

    await pumpScreen(
        tester, TicketScreen(key: const ValueKey('cancelled'), booking: Booking.fromJson(bookingJson('6b017c74e4616a0fd4e9de59', 'cancelled', '2099-12-01', payment: 'refund_requested', total: 900))));
    expect(find.text('Refund requested'), findsOneWidget);
    await tester.scrollUntilVisible(find.textContaining('it has no entry code'), 200, scrollable: find.byType(Scrollable).first);
    expect(find.text('Cancel booking'), findsNothing);
  });
}
