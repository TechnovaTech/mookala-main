import 'package:flutter/material.dart';

import '../services/api_client.dart';
import '../services/api_service.dart';
import '../services/session.dart';
import '../widgets/app_theme.dart';
import 'discovery_home_screen.dart';
import 'phone_login_screen.dart';
import 'profile_screen.dart';

/// Decides where the app starts. There is no fixed wait: it shows the logo
/// only for as long as the two start-up requests take.
///   1. `/public/platform`  -> maintenance message when one is active.
///   2. `/public/session`   -> is the stored token still valid, and is the
///      customer profile finished?
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  String? _maintenanceMessage;
  String? _error;
  bool _busy = true;

  @override
  void initState() {
    super.initState();
    _start();
  }

  Future<void> _start() async {
    setState(() {
      _busy = true;
      _error = null;
      _maintenanceMessage = null;
    });

    await Session.load();

    // The platform call is public; if it fails the session check below reports
    // the connection problem, so its own failure is not shown twice.
    PlatformInfo? platform;
    try {
      platform = await ApiService.getPlatform();
    } on ApiException {
      platform = null;
    }
    if (!mounted) return;
    if (platform != null && platform.maintenanceActive) {
      setState(() {
        _busy = false;
        _maintenanceMessage = platform!.maintenanceMessage.isNotEmpty
            ? platform.maintenanceMessage
            : 'Mookalaa is under maintenance. Please try again a little later.';
      });
      return;
    }

    if (!Session.isSignedIn) {
      _go(const PhoneLoginScreen());
      return;
    }

    try {
      final session = await ApiService.getSession();
      if (!mounted) return;
      if (session.isProfileComplete) {
        _go(const DiscoveryHomeScreen());
        return;
      }
      // Signed in but the profile was never finished: resume it.
      if (!session.hasUserProfile) await ApiService.ensureUserProfile();
      if (!mounted) return;
      _go(const ProfileScreen());
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.statusCode == 401) return; // the client already showed the login screen
      if (e.statusCode == 403) {
        // Suspended or blocked: sign out and show the server's reason on the login screen.
        await Session.clear();
        if (!mounted) return;
        _go(PhoneLoginScreen(notice: e.message));
        return;
      }
      setState(() {
        _busy = false;
        _error = e.message;
      });
    }
  }

  void _go(Widget screen) {
    Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => screen));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Image.asset(
                  'assets/images/logo_image.png',
                  width: 260,
                  height: 260,
                  fit: BoxFit.contain,
                  errorBuilder: (_, __, ___) => const Icon(Icons.event, size: 96, color: AppColors.navy),
                ),
                const SizedBox(height: 24),
                if (_busy) const CircularProgressIndicator(color: AppColors.navy),
                if (_maintenanceMessage != null) ...[
                  const Icon(Icons.build_circle_outlined, size: 40, color: AppColors.warning),
                  const SizedBox(height: 12),
                  const Text('Under maintenance', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  Text(_maintenanceMessage!, textAlign: TextAlign.center, style: TextStyle(color: Colors.grey.shade700)),
                  const SizedBox(height: 16),
                  OutlinedButton.icon(onPressed: _start, icon: const Icon(Icons.refresh), label: const Text('Check again')),
                ],
                if (_error != null) ...[
                  Text(_error!, textAlign: TextAlign.center, style: TextStyle(color: Colors.grey.shade800)),
                  const SizedBox(height: 16),
                  OutlinedButton.icon(onPressed: _start, icon: const Icon(Icons.refresh), label: const Text('Try again')),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
