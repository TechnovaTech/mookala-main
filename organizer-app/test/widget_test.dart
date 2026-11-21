import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:organizer_app/logic/role_routing.dart';
import 'package:organizer_app/screens/create_ticket_screen.dart';
import 'package:organizer_app/screens/phone_login_screen.dart';
import 'package:organizer_app/screens/role_selection_screen.dart';

void main() {
  testWidgets('phone screen refuses an invalid number without calling the server', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: PhoneLoginScreen()));
    await tester.enterText(find.byType(TextField), '12345');
    await tester.tap(find.text('Send code'));
    await tester.pump();
    expect(find.text('Enter a valid 10-digit mobile number'), findsOneWidget);
    expect(find.textContaining('development code'), findsNothing, reason: 'no code hint on the phone screen');
  });

  testWidgets('role chooser lists both roles and explains a suspended one', (tester) async {
    final info = SessionInfo.fromJson({
      'roles': ['organizer'],
      'profiles': {
        'organizer': {'status': 'profile_completed', 'name': 'Asha Events', 'kycStatus': 'approved'},
        'artist': {'status': 'completed', 'name': 'Asha', 'kycStatus': 'approved'},
      },
      'restrictions': {'artist': 'This artist account is suspended.'},
    });
    await tester.pumpWidget(MaterialApp(home: RoleSelectionScreen(info: info)));
    expect(find.text('Organiser'), findsOneWidget);
    expect(find.text('Artist'), findsOneWidget);
    expect(find.textContaining('Asha Events · KYC approved'), findsOneWidget);
    expect(find.textContaining('This artist account is suspended.'), findsOneWidget);
  });

  testWidgets('seat pricing screen blocks overlapping ranges and returns valid tickets', (tester) async {
    List<Map<String, dynamic>>? result;
    await tester.pumpWidget(MaterialApp(
      home: Builder(
        builder: (context) => Scaffold(
          body: TextButton(
            onPressed: () async {
              result = await Navigator.push<List<Map<String, dynamic>>>(
                context,
                MaterialPageRoute(
                  builder: (_) => const CreateTicketScreen(
                    venueName: 'Town Hall',
                    blocks: [
                      {'name': 'A', 'type': 'VIP', 'totalSeats': 100},
                    ],
                    existing: [
                      {'name': 'VIP - Block A', 'blockName': 'A', 'priceType': 'VIP', 'startSeat': 1, 'endSeat': 60, 'price': 1500, 'isSeatWise': true},
                      {'name': 'Normal - Block A', 'blockName': 'A', 'priceType': 'Normal', 'startSeat': 50, 'endSeat': 100, 'price': '₹500.00', 'isSeatWise': true},
                    ],
                  ),
                ),
              );
            },
            child: const Text('open'),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Use these seat prices'));
    await tester.pumpAndSettle();
    expect(find.text('Block A: seats 50-100 (Normal) overlap 1-60 (VIP)'), findsOneWidget);
    expect(result, isNull);

    // Fix the second range: first seat 50 -> 61.
    await tester.enterText(find.widgetWithText(TextField, 'First seat').last, '61');
    await tester.pump();
    await tester.tap(find.text('Use these seat prices'));
    await tester.pumpAndSettle();
    expect(result, isNotNull);
    expect(result!.length, 2);
    expect(result![1]['name'], 'Normal - Block A');
    expect(result![1]['startSeat'], 61);
    expect(result![1]['quantity'], '40');
    expect(result![1]['price'], 500);
  });
}
