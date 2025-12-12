import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class AuthService {
  static const String baseUrl = 'http://localhost:3000/api';
  
  static Future<Map<String, dynamic>> checkUser(String phone) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/auth/check-user'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'phone': phone}),
      );
      
      return jsonDecode(response.body);
    } catch (e) {
      return {'error': 'Network error: $e'};
    }
  }
  
  static Future<Map<String, dynamic>> registerUser(String phone, String role) async {
    try {
      final endpoint = role == 'artist' ? '/artist/register' : '/organizer/register';
      final response = await http.post(
        Uri.parse('$baseUrl$endpoint'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'phone': phone}),
      );
      
      return jsonDecode(response.body);
    } catch (e) {
      return {'error': 'Network error: $e'};
    }
  }
  
  static Future<Map<String, dynamic>> verifyOTP(String phone, String otp, String role) async {
    try {
      final endpoint = role == 'artist' ? '/artist/verify-otp' : '/organizer/verify-otp';
      final response = await http.post(
        Uri.parse('$baseUrl$endpoint'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'phone': phone, 'otp': otp}),
      );
      
      final result = jsonDecode(response.body);
      
      if (result['success'] == true) {
        await _saveUserData(phone, role);
      }
      
      return result;
    } catch (e) {
      return {'error': 'Network error: $e'};
    }
  }
  
  static Future<Map<String, dynamic>> getUserProfile(String phone, String role) async {
    try {
      final endpoint = role == 'artist' ? '/artist/profile' : '/organizer/profile';
      final response = await http.get(
        Uri.parse('$baseUrl$endpoint?phone=$phone'),
        headers: {'Content-Type': 'application/json'},
      );
      
      return jsonDecode(response.body);
    } catch (e) {
      return {'error': 'Network error: $e'};
    }
  }
  
  static Future<Map<String, dynamic>> loginExistingUser(String phone, String role) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/auth/login-existing'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'phone': phone, 'role': role}),
      );
      
      final result = jsonDecode(response.body);
      
      if (result['success'] == true) {
        await _saveUserData(phone, role);
      }
      
      return result;
    } catch (e) {
      return {'error': 'Network error: $e'};
    }
  }
  
  static Future<Map<String, dynamic>> updateOrganizerProfile(
    String phone, String name, String email, String city, String? profileImage) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/organizer/profile'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'phone': phone,
          'name': name,
          'email': email,
          'city': city,
          if (profileImage != null) 'profileImage': profileImage,
        }),
      );
      
      return jsonDecode(response.body);
    } catch (e) {
      return {'error': 'Network error: $e'};
    }
  }
  
  static Future<Map<String, dynamic>> updateOrganizerKYC(
    String phone, String aadharId, String panId, String? aadharImage, String? panImage) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/organizer/kyc'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'phone': phone,
          'aadharId': aadharId,
          'panId': panId,
          if (aadharImage != null) 'aadharImage': aadharImage,
          if (panImage != null) 'panImage': panImage,
        }),
      );
      
      return jsonDecode(response.body);
    } catch (e) {
      return {'error': 'Network error: $e'};
    }
  }
  
  static Future<Map<String, dynamic>> updateArtistKYC(
    String phone, String aadharId, String panId, String? aadharImage, String? panImage) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/artist/kyc'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'phone': phone,
          'aadharId': aadharId,
          'panId': panId,
          if (aadharImage != null) 'aadharImage': aadharImage,
          if (panImage != null) 'panImage': panImage,
        }),
      );
      
      return jsonDecode(response.body);
    } catch (e) {
      return {'error': 'Network error: $e'};
    }
  }
  
  static Future<Map<String, dynamic>> getKYCStatus(String phone) async {
    try {
      final userData = await getUserData();
      final role = userData['role'];
      final endpoint = role == 'artist' ? '/artist/kyc-status' : '/organizer/kyc-status';
      
      final response = await http.get(
        Uri.parse('$baseUrl$endpoint?phone=$phone'),
        headers: {'Content-Type': 'application/json'},
      );
      
      return jsonDecode(response.body);
    } catch (e) {
      return {'error': 'Network error: $e'};
    }
  }
  
  static Future<Map<String, dynamic>> updateArtistProfile(
    String phone, String name, String email, String city, String bio, 
    String genre, String? pricing, String? profileImage, [String? bannerImage]) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/artist/profile'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'phone': phone,
          'name': name,
          'email': email,
          'city': city,
          'bio': bio,
          'genre': genre,
          if (pricing != null) 'pricing': pricing,
          if (profileImage != null) 'profileImage': profileImage,
          if (bannerImage != null) 'bannerImage': bannerImage,
        }),
      );
      
      return jsonDecode(response.body);
    } catch (e) {
      return {'error': 'Network error: $e'};
    }
  }
  
  static Future<Map<String, dynamic>> updateProfile(Map<String, dynamic> data) async {
    try {
      final role = data['role'];
      final endpoint = role == 'artist' ? '/artist/profile' : '/organizer/profile';
      
      final response = await http.post(
        Uri.parse('$baseUrl$endpoint'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(data),
      );
      
      return jsonDecode(response.body);
    } catch (e) {
      return {'error': 'Network error: $e'};
    }
  }
  
  static Future<Map<String, dynamic>> uploadMedia(Map<String, dynamic> data) async {
    try {
      final role = data['role'];
      final endpoint = role == 'artist' ? '/artist/media' : '/organizer/media';
      
      final response = await http.post(
        Uri.parse('$baseUrl$endpoint'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(data),
      );
      
      return jsonDecode(response.body);
    } catch (e) {
      return {'error': 'Network error: $e'};
    }
  }
  
  static Future<Map<String, dynamic>> getArtistBookingRequests(String phone) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/artist/booking-requests?phone=$phone'),
        headers: {'Content-Type': 'application/json'},
      );
      
      return jsonDecode(response.body);
    } catch (e) {
      return {'error': 'Network error: $e'};
    }
  }
  
  static Future<Map<String, dynamic>> respondToBooking(String eventId, String artistPhone, String response) async {
    try {
      final httpResponse = await http.post(
        Uri.parse('$baseUrl/artist/booking-response'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'eventId': eventId,
          'artistPhone': artistPhone,
          'response': response,
        }),
      );
      
      return jsonDecode(httpResponse.body);
    } catch (e) {
      return {'error': 'Network error: $e'};
    }
  }
  
  static Future<Map<String, dynamic>> getArtistEvents(String phone) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/artist/events?phone=$phone'),
        headers: {'Content-Type': 'application/json'},
      );
      
      return jsonDecode(response.body);
    } catch (e) {
      return {'error': 'Network error: $e'};
    }
  }
  
  static Future<Map<String, dynamic>> getDashboardStats(String phone) async {
    try {
      final userData = await getUserData();
      final role = userData['role'];
      final endpoint = role == 'artist' ? '/artist/dashboard-stats' : '/organizer/dashboard-stats';
      
      final response = await http.get(
        Uri.parse('$baseUrl$endpoint?phone=$phone'),
        headers: {'Content-Type': 'application/json'},
      );
      
      return jsonDecode(response.body);
    } catch (e) {
      return {'error': 'Network error: $e'};
    }
  }
  
  static Future<Map<String, dynamic>> resubmitKYC(
    String phone, String aadharId, String panId, String? aadharImage, String? panImage) async {
    try {
      final userData = await getUserData();
      final role = userData['role'];
      final endpoint = role == 'artist' ? '/artist/resubmit-kyc' : '/organizer/resubmit-kyc';
      
      final response = await http.post(
        Uri.parse('$baseUrl$endpoint'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'phone': phone,
          'aadharId': aadharId,
          'panId': panId,
          if (aadharImage != null) 'aadharImage': aadharImage,
          if (panImage != null) 'panImage': panImage,
        }),
      );
      
      return jsonDecode(response.body);
    } catch (e) {
      return {'error': 'Network error: $e'};
    }
  }
  
  static Future<void> _saveUserData(String phone, String role) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('user_phone', phone);
    await prefs.setString('user_role', role);
    await prefs.setBool('is_logged_in', true);
  }
  
  static Future<Map<String, String?>> getUserData() async {
    final prefs = await SharedPreferences.getInstance();
    return {
      'phone': prefs.getString('user_phone'),
      'role': prefs.getString('user_role'),
      'isLoggedIn': prefs.getBool('is_logged_in')?.toString(),
    };
  }
  
  static Future<void> logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.clear();
  }
}