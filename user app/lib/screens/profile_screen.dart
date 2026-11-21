import 'package:flutter/material.dart';

import 'edit_profile_screen.dart';

/// The profile step of sign-up. A name is required because the server only
/// treats a profile as complete once it has one.
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) => const ProfileFormScreen(onboarding: true);
}
