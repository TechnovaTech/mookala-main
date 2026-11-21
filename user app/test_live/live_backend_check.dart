// Runs the app's real ApiService against a running backend, to prove the Dart
// parsing matches the live response shapes. NOT part of `flutter test`
// (it needs a backend and a seeded database). Run it with:
//
//   flutter test test_live/live_backend_check.dart \
//     --dart-define=API_BASE_URL=http://127.0.0.1:3100/api \
//     --dart-define=LIVE_PHONE=9000000556 \
//     --dart-define=FREE_EVENT=<id> --dart-define=PAID_EVENT=<id> --dart-define=ARTIST=<id>
//
// It refuses to run against the production address.
// ignore_for_file: invalid_use_of_visible_for_testing_member
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mookalaa_app/config/app_config.dart';
import 'package:mookalaa_app/models/booking.dart';
import 'package:mookalaa_app/models/event.dart';
import 'package:mookalaa_app/services/api_client.dart';
import 'package:mookalaa_app/services/api_service.dart';
import 'package:mookalaa_app/services/session.dart';
import 'package:mookalaa_app/utils/booking_logic.dart';
import 'package:mookalaa_app/utils/event_filter.dart';
import 'package:mookalaa_app/utils/image_source.dart';
import 'package:mookalaa_app/utils/ticket_pdf.dart';
import 'package:shared_preferences/shared_preferences.dart';

const phone = String.fromEnvironment('LIVE_PHONE');
const freeEventId = String.fromEnvironment('FREE_EVENT');
const paidEventId = String.fromEnvironment('PAID_EVENT');
const artistId = String.fromEnvironment('ARTIST');

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('whole attendee flow against the local backend', () async {
    expect(AppConfig.apiBaseUrl.contains('vercel.app'), isFalse, reason: 'never run this against production');
    HttpOverrides.global = null; // flutter_test blocks real HTTP by default
    SharedPreferences.setMockInitialValues({});
    await Session.clear();
    void log(String line) => stdout.writeln('LIVE  $line');

    // Sign-in
    final devMode = await ApiService.sendOtp(phone);
    log('sendOtp -> devMode=$devMode');
    try {
      await ApiService.sendOtp(phone);
      fail('second send should be rate limited');
    } on ApiException catch (e) {
      log('sendOtp again -> ${e.statusCode} "${e.message}" retryAfterSeconds=${e.retryAfterSeconds}');
      expect(e.statusCode, 429);
      expect(e.retryAfterSeconds, isNotNull);
    }
    try {
      await ApiService.verifyOtp(phone, '9999');
      fail('wrong code accepted');
    } on ApiException catch (e) {
      log('verifyOtp wrong -> ${e.statusCode} "${e.message}" attemptsLeft=${e.attemptsLeft}');
      expect(e.statusCode, 400);
      expect(Session.isSignedIn, isFalse);
    }
    await ApiService.verifyOtp(phone, '1234');
    expect(Session.isSignedIn, isTrue);
    log('verifyOtp ok -> session saved for ${Session.phone}, token length ${Session.token!.length}');

    final complete = await ApiService.ensureUserProfile();
    log('ensureUserProfile -> isProfileComplete=$complete');
    var session = await ApiService.getSession();
    log('getSession -> hasUserProfile=${session.hasUserProfile} status=${session.userStatus} complete=${session.isProfileComplete}');
    expect(session.hasUserProfile, isTrue);

    // Onboarding
    await ApiService.updateProfile(name: 'Live Check', city: 'Bengaluru');
    final genres = await ApiService.getGenres();
    log('getGenres -> ${genres.length} genres, first: ${genres.take(3).toList()}');
    await ApiService.updateProfile(genres: genres.take(2).toList());
    final user = await ApiService.getProfile();
    log('getProfile -> name=${user['name']} city=${user['city']} genres=${user['genres']} status=${user['status']}');
    session = await ApiService.getSession();
    expect(session.isProfileComplete, isTrue);
    log('getSession -> complete=${session.isProfileComplete}');

    // Platform
    final platform = await ApiService.getPlatform();
    log('getPlatform -> name=${platform.name} email=${platform.supportEmail} phone=${platform.supportPhone} maintenance=${platform.maintenanceActive} links=${platform.policyLinks}');
    final policies = await ApiService.getPolicies();
    log('getPolicies -> ${policies.map((p) => p['type']).toList()}');
    if (policies.isNotEmpty) {
      final policy = await ApiService.getPolicy(policies.first['type'].toString());
      log('getPolicy -> title=${policy['title']} bodyLength=${(policy['body'] ?? '').toString().length}');
    }
    try {
      await ApiService.getPolicy('privacy');
    } on ApiException catch (e) {
      log('getPolicy(privacy) -> ${e.statusCode} "${e.message}"');
    }

    // Browse
    final events = await ApiService.getEvents();
    final upcoming = filterEvents(events, const EventFilter(), DateTime.now());
    log('getEvents -> ${events.length} events, ${upcoming.length} upcoming; cities=${citiesOf(events)}');
    final EventModel free = events.firstWhere((e) => e.id == freeEventId);
    final EventModel paid = events.firstWhere((e) => e.id == paidEventId);
    log('free event -> "${free.title}" ${free.dateLabel} | ${free.placeLabel} | ${free.priceLabel} | image decodes=${decodeImageBytes(free.image) != null} artistIds=${free.artistIds}');
    log('paid event -> "${paid.title}" ${paid.dateLabel} | ${paid.fullAddress} | ${paid.priceLabel} | tickets=${paid.tickets.map((t) => '${t.name}:${t.price}:${t.firstSeat}-${t.lastSeat}:seated=${t.isSeated}').toList()}');
    expect(free.venueName, 'Seed Hall');
    expect(paid.venueName, 'Seed Hall');
    expect(paid.priceLabel, '₹500 onwards');
    expect(filterEvents(events, const EventFilter(city: 'bengaluru'), DateTime.now()).any((e) => e.id == freeEventId), isTrue);

    final detail = await ApiService.getEvent(freeEventId);
    log('getEvent -> artists=${detail.artists.map((a) => a['name']).toList()} organiser=${detail.organizerName} terms="${detail.terms}"');
    expect(detail.artists, isNotEmpty);

    log('getCategories -> ${(await ApiService.getCategories()).map((c) => c['name']).toList()}');
    log('getBanners -> ${(await ApiService.getBanners()).map((b) => '${b['title']}|${b['link']}').toList()}');
    log('getAds -> ${(await ApiService.getAds()).map((b) => '${b['title']}|${b['sponsor']}').toList()}');
    final artists = await ApiService.getArtists();
    log('getArtists -> ${artists.length}; seed artist present=${artists.any((a) => a['_id'] == artistId)}');
    log('getProfessionals -> ${(await ApiService.getProfessionals('photographer')).length}');

    // Follow (per user, on the server)
    expect(await ApiService.isFollowing(artistId), isFalse);
    final followed = await ApiService.setFollowing(artistId, true);
    log('setFollowing(true) -> isFollowing=${followed.isFollowing} followerCount=${followed.followerCount}');
    expect(await ApiService.isFollowing(artistId), isTrue);
    final unfollowed = await ApiService.setFollowing(artistId, false);
    log('setFollowing(false) -> isFollowing=${unfollowed.isFollowing} followerCount=${unfollowed.followerCount}; getFollowerCount=${await ApiService.getFollowerCount(artistId)}');

    // Payment config
    final config = await ApiService.getPaymentConfig();
    log('getPaymentConfig -> enabled=${config.enabled} holdMinutes=${config.holdMinutes}');
    for (final rule in config.refundPolicy) {
      log('   policy: ${refundRuleSentence(rule)}');
    }

    // Free booking end to end
    final freeLines = [TicketLineDraft(ticketIndex: 0, quantity: 2)];
    expect(validateSelection(free.tickets, freeLines), isNull);
    final order = await ApiService.createOrder(eventId: free.id, tickets: orderLines(free.tickets, freeLines));
    log('createOrder(free) -> isFree=${order.isFree} bookingId=${order.bookingId} status=${order.booking?.status} payment=${order.booking?.paymentStatus}');
    expect(order.isFree, isTrue);
    expect(order.booking!.status, 'confirmed');

    var bookings = await ApiService.getMyBookings();
    final Booking mine = bookings.firstWhere((b) => b.id == order.bookingId);
    log('getMyBookings -> ${bookings.length}; "${mine.title}" ${mine.start?.label} @ ${mine.venue} | ${mine.lines.first.summary} | ${mine.priceLabel} | group=${bookingGroupOf(mine, DateTime.now()).name} | ref=${mine.reference} | qr=${mine.qrPayload}');
    expect(bookingGroupOf(mine, DateTime.now()), BookingGroup.upcoming);
    expect(mine.venue, 'Seed Hall');

    final pdf = await buildTicketPdf(mine);
    log('buildTicketPdf -> ${pdf.length} bytes, header=${String.fromCharCodes(pdf.take(5))}');
    expect(String.fromCharCodes(pdf.take(4)), '%PDF');

    final preview = await ApiService.previewCancellation(mine.id);
    log('previewCancellation -> cancellable=${preview.cancellable} refund=${preview.refundAmount} "${preview.explanation}"');
    expect(preview.cancellable, isTrue);
    final message = await ApiService.cancelBooking(mine.id, 'Live check clean-up');
    log('cancelBooking -> "$message"');
    bookings = await ApiService.getMyBookings();
    final cancelled = bookings.firstWhere((b) => b.id == order.bookingId);
    log('after cancel -> status=${cancelled.status} group=${bookingGroupOf(cancelled, DateTime.now()).name} reason="${cancelled.cancelReason}" showsQr=${cancelled.showsQr}');
    expect(bookingGroupOf(cancelled, DateTime.now()), BookingGroup.cancelled);

    // Paid booking: up to the server's answer
    final paidLines = [TicketLineDraft(ticketIndex: 0, fromSeat: 3, toSeat: 5)];
    expect(validateSelection(paid.tickets, paidLines), isNull);
    log('paid estimate -> ${estimateTotal(paid.tickets, paidLines)} body=${orderLines(paid.tickets, paidLines)}');
    try {
      final paidOrder = await ApiService.createOrder(eventId: paid.id, tickets: orderLines(paid.tickets, paidLines));
      log('createOrder(paid) -> orderId=${paidOrder.orderId} amountPaise=${paidOrder.amountPaise} totalPrice=${paidOrder.totalPrice} expiresAt=${paidOrder.expiresAt}');
    } on ApiException catch (e) {
      log('createOrder(paid) -> ${e.statusCode} code=${e.code} "${e.message}"');
      expect(e.code, 'PAYMENTS_UNAVAILABLE');
    }

    // A stale token signs the user out
    var signedOut = false;
    ApiClient.onUnauthorized = () async {
      signedOut = true;
      await Session.clear();
    };
    await Session.save(token: 'not-a-real-token', phone: phone);
    try {
      await ApiService.getSession();
    } on ApiException catch (e) {
      log('getSession with a bad token -> ${e.statusCode}; signedOut=$signedOut; Session.isSignedIn=${Session.isSignedIn}');
    }
    expect(signedOut, isTrue);
  }, timeout: const Timeout(Duration(minutes: 3)));
}
