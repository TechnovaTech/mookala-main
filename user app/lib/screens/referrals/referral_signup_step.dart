import 'package:flutter/material.dart';

import '../../utils/formats.dart';
import '../../widgets/app_theme.dart';
import 'referral_api.dart';
import 'referral_claim_field.dart';

/// Optional sign-up step: "Did a friend invite you?". Shown only when the
/// server says this new customer can still enter a code. [onDone] continues
/// sign-up, whether or not a code was entered.
class ReferralSignupStep extends StatefulWidget {
  const ReferralSignupStep({super.key, required this.status, required this.onDone});

  final ReferralStatus status;
  final VoidCallback onDone;

  @override
  State<ReferralSignupStep> createState() => _ReferralSignupStepState();
}

class _ReferralSignupStepState extends State<ReferralSignupStep> {
  String? _accepted;

  @override
  Widget build(BuildContext context) {
    final reward = widget.status.refereeReward;
    return Scaffold(
      backgroundColor: Colors.grey.shade100,
      appBar: navyAppBar('Welcome', showBack: false),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            const Text('Did a friend invite you?', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Text(
              reward > 0
                  ? 'Enter their referral code and you get a ${formatRupees(reward)} coupon after your first paid booking.'
                  : 'Enter their referral code so they are rewarded after your first paid booking.',
              style: TextStyle(color: Colors.grey.shade800),
            ),
            const SizedBox(height: 4),
            Text('You can only enter a code once, before your first booking.', style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
            const SizedBox(height: 16),
            if (_accepted != null)
              Text(_accepted!, key: const Key('referral-signup-done'), style: const TextStyle(color: AppColors.navy, fontWeight: FontWeight.w600))
            else
              ReferralClaimField(onClaimed: (message) => setState(() => _accepted = message)),
            const SizedBox(height: 24),
            ElevatedButton(
              key: const Key('referral-signup-continue'),
              onPressed: widget.onDone,
              style: primaryButtonStyle(),
              child: Text(_accepted != null ? 'CONTINUE' : 'SKIP'),
            ),
          ],
        ),
      ),
    );
  }
}
