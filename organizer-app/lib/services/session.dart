import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// What the app remembers between launches.
///
/// A phone session is `token + phone + active role`. A gate-staff session is
/// separate: the event and staff member returned by the staff login.
class Session {
  Session._();

  static const _kToken = 'session_token';
  static const _kPhone = 'session_phone';
  static const _kRole = 'session_role';
  static const _kStaff = 'session_staff';

  /// Keys written by earlier builds; removed on sign-out so nothing stale stays.
  static const _legacyKeys = [
    'userPhone',
    'userRole',
    'isLoggedIn',
    'user_phone',
    'user_role',
    'is_logged_in',
    'rememberMe',
  ];

  static String? _token;
  static String? _phone;
  static String? _role;
  static Map<String, dynamic>? _staff;
  static bool _loaded = false;

  static String? get token => _token;
  static String? get phone => _phone;

  /// 'organizer' or 'artist', or null while no role is chosen yet.
  static String? get role => _role;
  static bool get hasToken => (_token ?? '').isNotEmpty && (_phone ?? '').isNotEmpty;
  static bool get isArtist => _role == 'artist';

  /// `{ event: {...}, staff: {...} }` from the staff login, or null.
  static Map<String, dynamic>? get staff => _staff;

  static Future<void> load() async {
    if (_loaded) return;
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString(_kToken);
    _phone = prefs.getString(_kPhone);
    _role = prefs.getString(_kRole);
    final rawStaff = prefs.getString(_kStaff);
    if (rawStaff != null) {
      try {
        final decoded = jsonDecode(rawStaff);
        if (decoded is Map<String, dynamic>) _staff = decoded;
      } catch (_) {
        _staff = null;
      }
    }
    _loaded = true;
  }

  static Future<void> signIn({required String token, required String phone}) async {
    final prefs = await SharedPreferences.getInstance();
    _token = token;
    _phone = phone;
    _role = null;
    await prefs.setString(_kToken, token);
    await prefs.setString(_kPhone, phone);
    await prefs.remove(_kRole);
  }

  static Future<void> setRole(String? role) async {
    final prefs = await SharedPreferences.getInstance();
    _role = role;
    if (role == null) {
      await prefs.remove(_kRole);
    } else {
      await prefs.setString(_kRole, role);
    }
  }

  static Future<void> saveStaff(Map<String, dynamic> event, Map<String, dynamic> staffMember) async {
    final prefs = await SharedPreferences.getInstance();
    _staff = {'event': event, 'staff': staffMember};
    await prefs.setString(_kStaff, jsonEncode(_staff));
  }

  static Future<void> clearStaff() async {
    final prefs = await SharedPreferences.getInstance();
    _staff = null;
    await prefs.remove(_kStaff);
  }

  /// Removes everything: token, phone, role, staff session and legacy keys.
  static Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    _token = null;
    _phone = null;
    _role = null;
    _staff = null;
    for (final key in [_kToken, _kPhone, _kRole, _kStaff, ..._legacyKeys]) {
      await prefs.remove(key);
    }
  }
}
