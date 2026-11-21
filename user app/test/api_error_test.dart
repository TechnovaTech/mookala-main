import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mookalaa_app/services/api_client.dart';
import 'package:mookalaa_app/services/api_service.dart';
import 'package:mookalaa_app/services/session.dart';
import 'package:shared_preferences/shared_preferences.dart';

http.Response json(Object body, int status) => http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('mapApiError', () {
    test('uses the server message and code', () {
      final e = mapApiError(409, {'success': false, 'error': 'Seats A3-A5 are no longer available', 'code': 'SEATS_TAKEN'});
      expect(e.message, 'Seats A3-A5 are no longer available');
      expect(e.code, 'SEATS_TAKEN');
      expect(e.statusCode, 409);
    });

    test('429 exposes retryAfterSeconds, 400 exposes attemptsLeft', () {
      expect(mapApiError(429, {'error': 'Please wait', 'retryAfterSeconds': 30}).retryAfterSeconds, 30);
      expect(mapApiError(400, {'error': 'Invalid OTP', 'attemptsLeft': 4}).attemptsLeft, 4);
    });

    test('falls back to a readable message when the body is not JSON', () {
      expect(mapApiError(503, null).message, contains('not available right now'));
      expect(mapApiError(413, null).message, contains('too large'));
      expect(mapApiError(401, null).message, contains('sign in again'));
      expect(mapApiError(500, '<html>').message, contains('went wrong'));
    });
  });

  group('ApiClient', () {
    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      await Session.clear();
      ApiClient.onUnauthorized = null;
    });

    test('adds the Bearer token to every call once signed in', () async {
      await Session.save(token: 'tok123', phone: '9000000555');
      late http.Request seen;
      ApiClient.useHttpClient(MockClient((request) async {
        seen = request;
        return json({'success': true, 'bookings': []}, 200);
      }));
      await ApiService.getMyBookings();
      expect(seen.headers['Authorization'], 'Bearer tok123');
      expect(seen.url.path, endsWith('/bookings'));
      expect(seen.url.queryParameters['userPhone'], '9000000555');
    });

    test('a 401 on a call made with a token signs the user out', () async {
      await Session.save(token: 'expired', phone: '9000000555');
      var signedOut = 0;
      ApiClient.onUnauthorized = () async {
        signedOut++;
        await Session.clear();
      };
      ApiClient.useHttpClient(MockClient((_) async => json({'success': false, 'error': 'Your session has expired. Please sign in again.'}, 401)));
      await expectLater(ApiService.getSession(), throwsA(isA<ApiException>().having((e) => e.statusCode, 'status', 401)));
      expect(signedOut, 1);
      expect(Session.isSignedIn, isFalse);
    });

    test('a 401 without a session does not trigger sign-out', () async {
      var signedOut = 0;
      ApiClient.onUnauthorized = () async => signedOut++;
      ApiClient.useHttpClient(MockClient((_) async => json({'success': false, 'error': 'nope'}, 401)));
      await expectLater(ApiClient.get('/public/session'), throwsA(isA<ApiException>()));
      expect(signedOut, 0);
    });

    test('a rejected order is an error, never a booking', () async {
      await Session.save(token: 't', phone: '9000000555');
      ApiClient.useHttpClient(MockClient((_) async =>
          json({'success': false, 'error': 'Online payment is not available right now. Please try again later.', 'code': 'PAYMENTS_UNAVAILABLE'}, 503)));
      await expectLater(
        ApiService.createOrder(eventId: '6b01784678c24a2daef0befd', tickets: const []),
        throwsA(isA<ApiException>().having((e) => e.code, 'code', 'PAYMENTS_UNAVAILABLE')),
      );
    });

    test('success:false inside a 200 is still an error', () async {
      ApiClient.useHttpClient(MockClient((_) async => json({'success': false, 'error': 'Broken'}, 200)));
      await expectLater(ApiClient.get('/genres'), throwsA(isA<ApiException>().having((e) => e.message, 'message', 'Broken')));
    });

    test('the order body carries no price, status or id', () async {
      await Session.save(token: 't', phone: '9000000555');
      late Map<String, dynamic> sent;
      ApiClient.useHttpClient(MockClient((request) async {
        sent = jsonDecode(request.body) as Map<String, dynamic>;
        return json({
          'success': true,
          'bookingId': 'b1',
          'free': true,
          'amount': 0,
          'currency': 'INR',
          'booking': {'_id': 'b1', 'status': 'confirmed', 'paymentStatus': 'paid', 'totalPrice': 0, 'isFree': true, 'tickets': []},
        }, 200);
      }));
      final order = await ApiService.createOrder(eventId: 'e1', tickets: const [
        {'category': 'General', 'block': '', 'quantity': 2}
      ]);
      expect(sent.keys.toSet(), {'userPhone', 'eventId', 'tickets'});
      expect(order.isFree, isTrue);
      expect(order.booking!.status, 'confirmed');
    });

    test('verify: 202 means still processing, not confirmed', () async {
      await Session.save(token: 't', phone: '9000000555');
      ApiClient.useHttpClient(MockClient((_) async =>
          json({'success': true, 'confirmed': false, 'code': 'PAYMENT_PROCESSING', 'message': 'Your payment is being processed.'}, 202)));
      final result = await ApiService.verifyPayment(bookingId: 'b', orderId: 'o', paymentId: 'p', signature: 's');
      expect(result.confirmed, isFalse);
      expect(result.message, contains('being processed'));
    });

    test('sign-out clears the token, the phone and per-user values but keeps the remembered number', () async {
      SharedPreferences.setMockInitialValues({'following_abc': true, 'bookings_9000000555': <String>['x']});
      await Session.save(token: 't', phone: '9000000555');
      await Session.setRememberedPhone('9000000555');
      await Session.setShowAllCities(true);
      await Session.clear();
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getKeys(), {Session.rememberedPhoneKey});
      expect(Session.token, isNull);
      expect(Session.phone, isNull);
    });
  });
}
