import 'package:shared_preferences/shared_preferences.dart';

class StorageService {
  static const String _keyUserPhone = 'user_phone';
  static const String _keyUserRole = 'user_role';
  static const String _keyIsLoggedIn = 'is_logged_in';
  static const String _keyUserProfile = 'user_profile';
  
  static Future<void> saveUserSession(String phone, String role) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_keyUserPhone, phone);
    await prefs.setString(_keyUserRole, role);
    await prefs.setBool(_keyIsLoggedIn, true);
  }
  
  static Future<Map<String, dynamic>> getUserSession() async {
    final prefs = await SharedPreferences.getInstance();
    return {
      'phone': prefs.getString(_keyUserPhone),
      'role': prefs.getString(_keyUserRole),
      'isLoggedIn': prefs.getBool(_keyIsLoggedIn) ?? false,
    };
  }
  
  static Future<void> saveUserProfile(Map<String, dynamic> profile) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_keyUserProfile, profile.toString());
  }
  
  static Future<void> clearSession() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.clear();
  }
}