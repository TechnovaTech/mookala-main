import 'package:flutter/material.dart';

import '../widgets/common.dart';

/// Earnings: there is no backend endpoint an artist can read, so this screen
/// says so instead of showing numbers.
class ArtistPaymentsScreen extends StatelessWidget {
  const ArtistPaymentsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: appBar('Earnings'),
      body: const SafeArea(
        child: StateView(
          icon: Icons.account_balance_wallet_outlined,
          title: 'Earnings are not available in the app yet',
          message: 'Payments to artists are recorded by the Mookalaa team. The app has no way to read '
              'them yet, so no amounts are shown here. For a payment question, use Help & Support in your profile.',
        ),
      ),
    );
  }
}
