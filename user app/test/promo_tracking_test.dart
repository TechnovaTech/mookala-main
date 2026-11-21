import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mookalaa_app/services/api_client.dart';
import 'package:mookalaa_app/services/api_service.dart';
import 'package:mookalaa_app/services/session.dart';
import 'package:mookalaa_app/widgets/promo_carousel.dart';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

Promo promo(String id, {String campaign = '', String link = ''}) => Promo.fromJson({
      '_id': id,
      'title': id,
      'image': 'data:image/png;base64,$png',
      'mediaType': 'image',
      'link': link,
      if (campaign.isNotEmpty) 'campaignId': campaign,
    });

void main() {
  final sent = <String>[];
  setUp(() {
    sent.clear();
    PromoTracker.reset();
    PromoTracker.send = (id, {required bool click}) async => sent.add('${click ? 'click' : 'impression'} $id');
  });

  testWidgets('a visible campaign slide is reported once, a plain banner never', (tester) async {
    final items = [promo('c1', campaign: 'aaaaaaaaaaaaaaaaaaaaaaaa'), promo('b1'), promo('c2', campaign: 'bbbbbbbbbbbbbbbbbbbbbbbb')];
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: ListView(children: [PromoCarousel(items: items)]))));
    await tester.pump();
    expect(sent, ['impression aaaaaaaaaaaaaaaaaaaaaaaa']);

    // Rebuilding or scrolling does not report it again.
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: ListView(children: [PromoCarousel(items: items)]))));
    await tester.pump();
    expect(sent.length, 1);

    // Swipe to the plain banner: nothing. Swipe on to the second campaign: one more.
    await tester.drag(find.byType(PageView), const Offset(-600, 0));
    await tester.pumpAndSettle(const Duration(milliseconds: 100), EnginePhase.sendSemanticsUpdate, const Duration(seconds: 2));
    expect(sent.length, 1);
    await tester.drag(find.byType(PageView), const Offset(-600, 0));
    await tester.pumpAndSettle(const Duration(milliseconds: 100), EnginePhase.sendSemanticsUpdate, const Duration(seconds: 2));
    expect(sent, ['impression aaaaaaaaaaaaaaaaaaaaaaaa', 'impression bbbbbbbbbbbbbbbbbbbbbbbb']);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('a campaign below the fold is reported only after it scrolls into view', (tester) async {
    final controller = ScrollController();
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: ListView(controller: controller, children: [
          const SizedBox(height: 2000),
          PromoCarousel(items: [promo('c1', campaign: 'cccccccccccccccccccccccc')]),
          const SizedBox(height: 2000),
        ]),
      ),
    ));
    await tester.pump();
    expect(sent, isEmpty);
    controller.jumpTo(1800);
    await tester.pump();
    await tester.pump();
    expect(sent, ['impression cccccccccccccccccccccccc']);
  });

  testWidgets('tapping a campaign slide reports a click each time; tapping a plain banner does not', (tester) async {
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: ListView(children: [PromoCarousel(items: [promo('c1', campaign: 'dddddddddddddddddddddddd', link: 'https://example.test/x')])]))));
    await tester.pump();
    await tester.tap(find.byType(GestureDetector).first);
    await tester.pump();
    await tester.tap(find.byType(GestureDetector).first);
    await tester.pump();
    expect(sent.where((e) => e.startsWith('click')).length, 2);

    sent.clear();
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: ListView(children: [PromoCarousel(items: [promo('b1', link: 'https://example.test/y')])]))));
    await tester.pump();
    await tester.tap(find.byType(GestureDetector).first);
    await tester.pump();
    expect(sent, isEmpty);
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 5));
  });

  test('getAds and getBanners send the profile city, and trackAd posts campaign, type and city', () async {
    SharedPreferences.setMockInitialValues({});
    await Session.save(token: 't', phone: '9000000555');
    final calls = <String>[];
    ApiClient.useHttpClient(MockClient((request) async {
      final path = request.url.path.replaceFirst(RegExp(r'^.*/api'), '');
      calls.add('${request.method} $path ${request.url.query} ${request.body}');
      if (path == '/user/profile') return http.Response(jsonEncode({'success': true, 'user': {'city': 'Rajkot'}}), 200, headers: {'content-type': 'application/json'});
      if (path == '/ads') return http.Response(jsonEncode({'success': true, 'ads': []}), 200, headers: {'content-type': 'application/json'});
      if (path == '/banners') return http.Response(jsonEncode({'success': true, 'banners': []}), 200, headers: {'content-type': 'application/json'});
      return http.Response(jsonEncode({'success': true, 'counted': true}), 200, headers: {'content-type': 'application/json'});
    }));
    await Future.wait([ApiService.getBanners(), ApiService.getAds()]);
    await ApiService.trackAd('eeeeeeeeeeeeeeeeeeeeeeee', click: false);
    await ApiService.trackAd('eeeeeeeeeeeeeeeeeeeeeeee', click: true);
    expect(calls.where((c) => c.startsWith('GET /user/profile')).length, 1);
    expect(calls.any((c) => c.startsWith('GET /ads city=Rajkot')), isTrue);
    expect(calls.any((c) => c.startsWith('GET /banners city=Rajkot')), isTrue);
    expect(calls.any((c) => c.contains('POST /public/ads/track') && c.contains('"type":"impression"') && c.contains('"city":"Rajkot"') && c.contains('eeeeeeeeeeeeeeeeeeeeeeee')), isTrue);
    expect(calls.any((c) => c.contains('POST /public/ads/track') && c.contains('"type":"click"')), isTrue);
  });
}
