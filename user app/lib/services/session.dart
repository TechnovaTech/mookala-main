import 'package:shared_preferences/shared_preferences.dart';

/// The signed-in session: the server token and the phone it belongs to.
///
/// Both live in SharedPreferences (what this app already uses for storage) and
/// are mirrored in memory so the API client can add the token synchronously.
class Session {
  Session._();

  static const _tokenKey = 'session_token';
  static const _phoneKey = 'user_phone';

  /// Survives sign-out on purpose: it only pre-fills the login screen.
  static const rememberedPhoneKey = 'remembered_phone';

  static String? _token;
  static String? _phone;
  static bool _loaded = false;

  static String? get token => _token;
  static String? get phone => _phone;
  static bool get isSignedIn => (_token ?? '').isNotEmpty && (_phone ?? '').isNotEmpty;

  static Future<void> load() async {
    if (_loaded) return;
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString(_tokenKey);
    _phone = prefs.getString(_phoneKey);
    // A phone stored by an older build without a token is not a session.
    if ((_token ?? '').isEmpty) {
      _token = null;
      _phone = null;
    }
    _loaded = true;
  }

  static Future<void> save({required String token, required String phone}) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_tokenKey, token);
    await prefs.setString(_phoneKey, phone);
    _token = token;
    _phone = phone;
    _loaded = true;
  }

  /// Signs out: removes the token, the phone and every per-user value this app
  /// keeps on the device. Only the remembered phone number is kept.
  static Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    final remembered = prefs.getString(rememberedPhoneKey);
    await prefs.clear();
    if (remembered != null) await prefs.setString(rememberedPhoneKey, remembered);
    _token = null;
    _phone = null;
    _loaded = true;
  }

  static Future<String?> rememberedPhone() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(rememberedPhoneKey);
  }

  static Future<void> setRememberedPhone(String? phone) async {
    final prefs = await SharedPreferences.getInstance();
    if (phone == null || phone.isEmpty) {
      await prefs.remove(rememberedPhoneKey);
    } else {
      await prefs.setString(rememberedPhoneKey, phone);
    }
  }

  /// Per-user choice kept on this device: show events from every city even
  /// though the profile has a city. Cleared on sign-out with everything else.
  static const _allCitiesKey = 'show_all_cities';

  static Future<bool> showAllCities() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_allCitiesKey) ?? false;
  }

  static Future<void> setShowAllCities(bool value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_allCitiesKey, value);
  }
}
