import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class ApiService {
  static const String baseUrl = 'http://localhost:3000/api';
  
  static Future<Map<String, dynamic>> registerPhone(String phone) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/user/register'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'phone': phone}),
      );
      
      return jsonDecode(response.body);
    } catch (e) {
      return {'success': false, 'error': 'Network error'};
    }
  }
  
  static Future<Map<String, dynamic>> verifyOTP(String phone, String otp) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/user/verify-otp'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'phone': phone, 'otp': otp}),
      );
      
      return jsonDecode(response.body);
    } catch (e) {
      return {'success': false, 'error': 'Network error'};
    }
  }
  
  static Future<Map<String, dynamic>> updateProfile({
    required String phone,
    String? name,
    String? email,
    String? city,
    String? profileImage,
    List<String>? genres,
  }) async {
    try {
      final Map<String, dynamic> body = {'phone': phone};
      if (name != null && name.isNotEmpty) body['name'] = name;
      if (email != null && email.isNotEmpty) body['email'] = email;
      if (city != null && city.isNotEmpty) body['city'] = city;
      if (profileImage != null) body['profileImage'] = profileImage;
      if (genres != null) body['genres'] = genres;
      
      final response = await http.post(
        Uri.parse('$baseUrl/user/profile'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(body),
      );
      
      return jsonDecode(response.body);
    } catch (e) {
      return {'success': false, 'error': 'Network error'};
    }
  }
  
  static Future<Map<String, dynamic>> getProfile(String phone) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/user/profile?phone=$phone'),
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
  
  static Future<List<String>> getGenres() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/genres'),
        headers: {'Content-Type': 'application/json'},
      );
      
      final data = jsonDecode(response.body);
      if (data['success']) {
        return List<String>.from(data['genres']);
      }
      return [];
    } catch (e) {
      return [];
    }
  }
  
  static Future<void> saveUserPhone(String phone) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('user_phone', phone);
  }
  
  static Future<String?> getUserPhone() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('user_phone');
  }
  
  static Future<void> clearUserData() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('user_phone');
  }
  
  static Future<Map<String, dynamic>> getArtists() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/artists'),
        headers: {'Content-Type': 'application/json'},
      );
      
      return jsonDecode(response.body);
    } catch (e) {
      return {'success': false, 'error': 'Network error'};
    }
  }
  
  static Future<Map<String, dynamic>> getApprovedEvents() async {
    try {
      print('Calling API: $baseUrl/events/approved');
      final response = await http.get(
        Uri.parse('$baseUrl/events/approved'),
        headers: {'Content-Type': 'application/json'},
      );
      
      print('API Response Status: ${response.statusCode}');
      print('API Response Body: ${response.body}');
      
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        print('Parsed API Data: $data');
        return data;
      } else {
        print('API Error: Status ${response.statusCode}');
        return {'success': false, 'error': 'API returned status ${response.statusCode}'};
      }
    } catch (e) {
      print('Network Error: $e');
      return {'success': false, 'error': 'Network error: $e'};
    }
  }
  
  static Future<Map<String, dynamic>> getEventDetails(String eventId) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/events/$eventId'),
        headers: {'Content-Type': 'application/json'},
      );
      
      return jsonDecode(response.body);
    } catch (e) {
      return {'success': false, 'error': 'Network error'};
    }
  }
  
  static Future<Map<String, dynamic>> getVenueDetails(String venueId) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/venues/$venueId'),
        headers: {'Content-Type': 'application/json'},
      );
      
      return jsonDecode(response.body);
    } catch (e) {
      return {'success': false, 'error': 'Network error'};
    }
  }
  
  static Future<Map<String, dynamic>> getVenueByName(String venueName) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/venues?name=${Uri.encodeComponent(venueName)}'),
        headers: {'Content-Type': 'application/json'},
      );
      
      return jsonDecode(response.body);
    } catch (e) {
      return {'success': false, 'error': 'Network error'};
    }
  }
  
  static Future<Map<String, dynamic>> getFeaturedEvents() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/events'),
        headers: {'Content-Type': 'application/json'},
      );
      
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return {'success': true, 'events': data['events'] ?? []};
      } else {
        return {'success': false, 'error': 'Failed to fetch events'};
      }
    } catch (e) {
      return {'success': false, 'error': 'Network error: $e'};
    }
  }
  
  static Future<Map<String, dynamic>> getVenueById(String venueId) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/venues/$venueId'),
        headers: {'Content-Type': 'application/json'},
      );
      
      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      } else {
        return {'success': false, 'error': 'Venue not found'};
      }
    } catch (e) {
      return {'success': false, 'error': 'Network error: $e'};
    }
  }
  
  static Future<List<Map<String, dynamic>>> getBanners() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/banners'),
        headers: {'Content-Type': 'application/json'},
      );
      
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (data['success'] == true && data['banners'] != null) {
          return List<Map<String, dynamic>>.from(data['banners']);
        }
      }
      return [];
    } catch (e) {
      print('Error fetching banners: $e');
      return [];
    }
  }
  
  static Future<List<Map<String, dynamic>>> getCategories() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/categories'),
        headers: {'Content-Type': 'application/json'},
      );
      
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (data is List) {
          return List<Map<String, dynamic>>.from(data);
        }
      }
      return [];
    } catch (e) {
      print('Error fetching categories: $e');
      return [];
    }
  }
  
  static Future<List<Map<String, dynamic>>> getAds() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/ads'),
        headers: {'Content-Type': 'application/json'},
      );
      
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (data['success'] == true && data['ads'] != null) {
          return List<Map<String, dynamic>>.from(data['ads']);
        }
      }
      return [];
    } catch (e) {
      print('Error fetching ads: $e');
      return [];
    }
  }
  
  static Future<Map<String, dynamic>> toggleFollowArtist({
    required String artistId,
    required String userPhone,
    required String action,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/artists/follow'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'artistId': artistId,
          'userPhone': userPhone,
          'action': action,
        }),
      );
      
      return jsonDecode(response.body);
    } catch (e) {
      return {'success': false, 'error': 'Network error: $e'};
    }
  }
  
  static Future<Map<String, dynamic>> checkFollowStatus({
    required String artistId,
    required String userPhone,
  }) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/user/follow-status?artistId=$artistId&userPhone=$userPhone'),
        headers: {'Content-Type': 'application/json'},
      );
      
      return jsonDecode(response.body);
    } catch (e) {
      return {'success': false, 'error': 'Network error: $e'};
    }
  }
  
  static Future<Map<String, dynamic>> getArtistFollowerCount(String artistId) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/artists/follower-count?artistId=$artistId'),
        headers: {'Content-Type': 'application/json'},
      );
      
      return jsonDecode(response.body);
    } catch (e) {
      return {'success': false, 'error': 'Network error: $e'};
    }
  }
  
  static Future<Map<String, dynamic>> getVenues() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/venues'),
        headers: {'Content-Type': 'application/json'},
      );
      
      return jsonDecode(response.body);
    } catch (e) {
      return {'success': false, 'error': 'Network error: $e'};
    }
  }
}