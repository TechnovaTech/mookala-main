import 'package:flutter/material.dart';

import '../services/api_client.dart';
import '../widgets/app_theme.dart';
import 'edit_profile_screen.dart';
import 'referrals/referral_api.dart';
import 'referrals/referral_signup_step.dart';

/// The profile step of sign-up. A name is required because the server only
/// treats a profile as complete once it has one.
///
/// When a referral programme is running and this new customer can still
/// enter a friend's code, an optional "Did a friend invite you?" step comes
/// first. If that cannot be checked, sign-up simply continues to the form.
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  ReferralStatus? _referral;
  bool _checking = true;
  bool _referralDone = false;

  @override
  void initState() {
    super.initState();
    _check();
  }

  Future<void> _check() async {
    try {
      final status = await ReferralApi.status();
      if (mounted) {
        setState(() {
          _referral = status;
          _checking = false;
        });
      }
    } on ApiException {
      // Referrals are optional: never block sign-up on them.
      if (mounted) setState(() => _checking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_checking) {
      return Scaffold(
        backgroundColor: Colors.grey.shade100,
        appBar: navyAppBar('Your profile', showBack: false),
        body: const Center(child: CircularProgressIndicator(color: AppColors.navy)),
      );
    }
    final referral = _referral;
    if (referral != null && referral.canClaim && !_referralDone) {
      return ReferralSignupStep(status: referral, onDone: () => setState(() => _referralDone = true));
    }
    return const ProfileFormScreen(onboarding: true);
  }
}
