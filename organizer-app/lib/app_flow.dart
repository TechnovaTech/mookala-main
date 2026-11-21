import 'package:flutter/material.dart';

import 'logic/role_routing.dart';
import 'screens/artist_dashboard_screen.dart';
import 'screens/artist_fill_profile_screen.dart';
import 'screens/dashboard_screen.dart';
import 'screens/kyc_verification_screen.dart';
import 'screens/phone_login_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/role_selection_screen.dart';
import 'services/api.dart';
import 'services/api_client.dart';
import 'services/session.dart';

/// Navigation between the sign-in steps and the dashboards.
class AppFlow {
  AppFlow._();

  static final navigatorKey = GlobalKey<NavigatorState>();
  static bool _expiring = false;

  static void install() {
    ApiClient.onUnauthorized = sessionExpired;
  }

  static void _replaceAll(Widget screen) {
    navigatorKey.currentState?.pushAndRemoveUntil(MaterialPageRoute(builder: (_) => screen), (_) => false);
  }

  /// Signs out completely and returns to the phone screen.
  static Future<void> signOut({String? notice}) async {
    await Session.clear();
    _replaceAll(PhoneLoginScreen(notice: notice));
  }

  /// The server answered 401: the token is no longer valid.
  static Future<void> sessionExpired() async {
    if (_expiring) return;
    _expiring = true;
    try {
      await signOut(notice: 'Your session has expired. Please sign in again.');
    } finally {
      _expiring = false;
    }
  }

  static Widget dashboardFor(String role) =>
      role == 'artist' ? const ArtistDashboardScreen() : const DashboardScreen();

  /// The screen for a routing decision.
  static Widget screenFor(RouteDecision decision, SessionInfo info) {
    switch (decision.step) {
      case NextStep.chooseNewRole:
      case NextStep.chooseExistingRole:
        return RoleSelectionScreen(info: info);
      case NextStep.restricted:
        return RoleSelectionScreen(info: info, notice: decision.message);
      case NextStep.fillProfile:
        return decision.role == 'artist' ? const ArtistFillProfileScreen() : const OrganizerProfileScreen();
      case NextStep.submitKyc:
        return const KYCVerificationScreen(firstTime: true);
      case NextStep.dashboard:
        return dashboardFor(decision.role ?? 'organizer');
    }
  }

  /// Routes from what the server says about this phone. Saves the active role.
  static Future<void> routeFrom(SessionInfo info, {String? preferredRole}) async {
    final decision = decideRoute(info, savedRole: preferredRole);
    if (decision.role != null && decision.step != NextStep.restricted) {
      await Session.setRole(decision.role);
    } else {
      await Session.setRole(null);
    }
    _replaceAll(screenFor(decision, info));
  }

  /// Makes [role] the active role, registering its profile first when the
  /// phone does not have a usable one yet (the token is the proof of the phone).
  static Future<void> useRole(String role, SessionInfo info) async {
    if (profileIncomplete(info.profiles[role])) {
      await Api.registerRole(role);
    }
    await refreshAndRoute(preferredRole: role);
  }

  /// Re-reads roles and profiles from the server and routes again.
  static Future<void> refreshAndRoute({String? preferredRole}) async {
    final info = SessionInfo.fromJson(await Api.session());
    await routeFrom(info, preferredRole: preferredRole ?? Session.role);
  }

  /// Opens the role chooser ("Switch role" in the profile screens).
  static Future<void> openRoleSwitcher(BuildContext context) async {
    final navigator = Navigator.of(context);
    final info = SessionInfo.fromJson(await Api.session());
    navigator.push(MaterialPageRoute(builder: (_) => RoleSelectionScreen(info: info, switching: true)));
  }
}
