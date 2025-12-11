import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class ApiService {
  static const String baseUrl = 'http://localhost:3000/api';
  
  // Organizer APIs
  static Future<Map<String, dynamic>> registerOrganizer(String phone) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/organizer/register'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'phone': phone}),
      );
      return jsonDecode(response.body);
    } catch (e) {
      return {'success': false, 'error': 'Network error'};
    }
  }
  
  static Future<Map<String, dynamic>> verifyOrganizerOTP(String phone, String otp) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/organizer/verify-otp'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'phone': phone, 'otp': otp}),
      );
      return jsonDecode(response.body);
    } catch (e) {
      return {'success': false, 'error': 'Network error'};
    }
  }
  
  static Future<Map<String, dynamic>> updateOrganizerProfile({
    required String phone,
    String? name,
    String? email,
    String? city,
    String? profileImage,
  }) async {
    try {
      final Map<String, dynamic> body = {'phone': phone};
      if (name != null && name.isNotEmpty) body['name'] = name;
      if (email != null && email.isNotEmpty) body['email'] = email;
      if (city != null && city.isNotEmpty) body['city'] = city;
      if (profileImage != null) body['profileImage'] = profileImage;
      
      final response = await http.post(
        Uri.parse('$baseUrl/organizer/profile'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(body),
      );
      return jsonDecode(response.body);
    } catch (e) {
      return {'success': false, 'error': 'Network error'};
    }
  }
  
  static Future<Map<String, dynamic>> updateOrganizerKYC({
    required String phone,
    String? cardId,
    String? cardImage,
  }) async {
    try {
      final Map<String, dynamic> body = {'phone': phone};
      if (cardId != null && cardId.isNotEmpty) body['cardId'] = cardId;
      if (cardImage != null) body['cardImage'] = cardImage;
      
      final response = await http.post(
        Uri.parse('$baseUrl/organizer/kyc'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(body),
      );
      return jsonDecode(response.body);
    } catch (e) {
      return {'success': false, 'error': 'Network error'};
    }
  }
  
  static Future<Map<String, dynamic>> getOrganizerProfile(String phone) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/organizer/profile?phone=$phone'),
        headers: {'Content-Type': 'application/json'},
      );
      
      if (response.statusCode == 404) {
        return {'success': false, 'error': 'User not found'};
      }
      
      return jsonDecode(response.body);
    } catch (e) {
      return {'success': false, 'error': 'Network error'};
    }
  }
  
  // Artist APIs
  static Future<Map<String, dynamic>> registerArtist(String phone) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/artist/register'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'phone': phone}),
      );
      return jsonDecode(response.body);
    } catch (e) {
      return {'success': false, 'error': 'Network error'};
    }
  }
  
  static Future<Map<String, dynamic>> verifyArtistOTP(String phone, String otp) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/artist/verify-otp'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'phone': phone, 'otp': otp}),
      );
      return jsonDecode(response.body);
    } catch (e) {
      return {'success': false, 'error': 'Network error'};
    }
  }
  
  static Future<Map<String, dynamic>> updateArtistProfile({
    required String phone,
    String? name,
    String? email,
    String? city,
    String? profileImage,
    String? pricing,
  }) async {
    try {
      final Map<String, dynamic> body = {'phone': phone};
      if (name != null && name.isNotEmpty) body['name'] = name;
      if (email != null && email.isNotEmpty) body['email'] = email;
      if (city != null && city.isNotEmpty) body['city'] = city;
      if (profileImage != null) body['profileImage'] = profileImage;
      if (pricing != null && pricing.isNotEmpty) body['pricing'] = pricing;
      
      final response = await http.post(
        Uri.parse('$baseUrl/artist/profile'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(body),
      );
      return jsonDecode(response.body);
    } catch (e) {
      return {'success': false, 'error': 'Network error'};
    }
  }
  
  static Future<Map<String, dynamic>> getArtistProfile(String phone) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/artist/profile?phone=$phone'),
        headers: {'Content-Type': 'application/json'},
      );
      
      if (response.statusCode == 404) {
        return {'success': false, 'error': 'User not found'};
      }
      
      return jsonDecode(response.body);
    } catch (e) {
      return {'success': false, 'error': 'Network error'};
    }
  }
  
  // Local Storage
  static Future<void> saveUserData(String phone, String userType) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('user_phone', phone);
    await prefs.setString('user_type', userType);
  }
  
  static Future<String?> getUserPhone() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('user_phone');
  }
  
  static Future<String?> getUserType() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('user_type');
  }
  
  static Future<void> clearUserData() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('user_phone');
    await prefs.remove('user_type');
  }
  
  static Future<Map<String, dynamic>> getCategories() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/categories'),
        headers: {'Content-Type': 'application/json'},
      );
      if (response.statusCode == 200) {
        final categories = jsonDecode(response.body) as List;
        return {'success': true, 'categories': categories};
      }
      return {'success': false, 'error': 'Failed to fetch categories'};
    } catch (e) {
      return {'success': false, 'error': 'Network error'};
    }
  }
  
  static Future<Map<String, dynamic>> getLanguages() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/languages'),
        headers: {'Content-Type': 'application/json'},
      );
      return jsonDecode(response.body);
    } catch (e) {
      return {'success': false, 'error': 'Network error'};
    }
  }
  
  static Future<Map<String, dynamic>> createEvent({
    required String name,
    required String category,
    required List<String> languages,
    required String venue,
    required String date,
    required String time,
    String? description,
    String? terms,
    List<String>? artists,
    List<String>? committeeMembers,
  }) async {
    try {
      final phone = await getUserPhone();
      if (phone == null) {
        return {'success': false, 'error': 'User not logged in'};
      }
      
      final response = await http.post(
        Uri.parse('$baseUrl/events'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'name': name,
          'category': category,
          'languages': languages,
          'venue': venue,
          'date': date,
          'time': time,
          'description': description,
          'terms': terms,
          'artists': artists,
          'committeeMembers': committeeMembers,
          'organizerPhone': phone,
          'status': 'pending',
        }),
      );
      
      if (response.statusCode == 201) {
        return {'success': true, 'message': 'Event created successfully'};
      }
      return {'success': false, 'error': 'Failed to create event'};
    } catch (e) {
      return {'success': false, 'error': 'Network error'};
    }
  }
}