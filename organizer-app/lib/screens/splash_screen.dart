import 'package:flutter/material.dart';

import '../app_flow.dart';
import '../logic/role_routing.dart';
import '../services/api.dart';
import '../services/api_client.dart';
import '../services/session.dart';
import '../widgets/common.dart';
import 'phone_login_screen.dart';
import 'staff_dashboard_screen.dart';

/// First screen: checks maintenance, restores the saved session and routes.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  String? _maintenance;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _start());
  }

  void _go(Widget screen) {
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => screen), (_) => false);
  }

  Future<void> _start() async {
    setState(() {
      _maintenance = null;
      _error = null;
    });
    await Session.load();

    // Maintenance notice. When the platform call itself fails the app carries
    // on: the next call will report the network problem properly.
    try {
      final platform = await Api.platform();
      final maintenance = platform['maintenance'];
      if (maintenance is Map && maintenance['active'] == true) {
        final message = (maintenance['message'] ?? '').toString().trim();
        if (!mounted) return;
        setState(() => _maintenance =
            message.isEmpty ? 'Mookalaa is under maintenance. Please try again in a little while.' : message);
        return;
      }
    } on ApiException {
      // handled below by the session call, or not needed when signed out
    }

    final staff = Session.staff;
    if (staff != null && staff['event'] is Map) {
      _go(StaffDashboardScreen(
        eventData: Map<String, dynamic>.from(staff['event'] as Map),
        staffData: staff['staff'] is Map ? Map<String, dynamic>.from(staff['staff'] as Map) : const {},
      ));
      return;
    }

    if (!Session.hasToken) {
      _go(const PhoneLoginScreen());
      return;
    }

    try {
      final info = SessionInfo.fromJson(await Api.session());
      if (!mounted) return;
      await AppFlow.routeFrom(info, preferredRole: Session.role);
    } on ApiException catch (e) {
      if (e.isUnauthorized) return; // ApiClient already signed the user out
      if (e.statusCode == 403) {
        await AppFlow.signOut(notice: e.message);
        return;
      }
      if (!mounted) return;
      setState(() => _error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    Widget body;
    if (_maintenance != null) {
      body = StateView(
        icon: Icons.build_circle_outlined,
        title: 'Under maintenance',
        message: _maintenance,
        actionLabel: 'Check again',
        onAction: _start,
      );
    } else if (_error != null) {
      body = StateView(
        icon: Icons.cloud_off,
        title: 'Could not connect',
        message: _error,
        actionLabel: 'Try again',
        onAction: _start,
      );
    } else {
      body = Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Image.asset('assets/images/logo_image.png', width: 180, height: 180),
            const SizedBox(height: 24),
            const CircularProgressIndicator(color: AppColors.navy),
          ],
        ),
      );
    }
    return Scaffold(backgroundColor: Colors.white, body: SafeArea(child: body));
  }
}
