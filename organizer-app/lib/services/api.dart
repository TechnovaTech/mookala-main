import '../config/app_config.dart';
import '../logic/scan_result.dart';
import 'api_client.dart';
import 'session.dart';

Map<String, dynamic> _map(dynamic value) => value is Map<String, dynamic> ? value : <String, dynamic>{};

List<Map<String, dynamic>> _list(dynamic value) {
  if (value is! List) return [];
  return value.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
}

List<String> _strings(dynamic value) {
  if (value is! List) return [];
  return value.whereType<String>().map((e) => e.trim()).where((e) => e.isNotEmpty).toList();
}

/// Every backend call the app makes, in one place. All of them throw
/// [ApiException] on failure.
class Api {
  Api._();

  static String get _phone => Session.phone ?? '';
  static String get _role => Session.role == 'artist' ? 'artist' : 'organizer';

  // ---- Platform -----------------------------------------------------------

  /// `{ name, support:{email,phone,address}, policyLinks, maintenance:{active,message,...} }`
  static Future<Map<String, dynamic>> platform() async => _map(await ApiClient.get('/public/platform', auth: false));

  // ---- Sign-in ------------------------------------------------------------

  /// `{ success, message, devMode? }`
  static Future<Map<String, dynamic>> sendOtp(String phone) async =>
      _map(await ApiClient.post('/public/otp/send', {'phone': phone}, auth: false));

  /// `{ success, token, phone, roles, profiles, restrictions, devMode? }`
  static Future<Map<String, dynamic>> verifyOtp(String phone, String otp) async =>
      _map(await ApiClient.post('/public/otp/verify', {'phone': phone, 'otp': otp}, auth: false));

  /// `{ success, phone, roles, profiles, restrictions }`; 401 when the token is no longer valid.
  static Future<Map<String, dynamic>> session() async => _map(await ApiClient.get('/public/session'));

  /// Creates or resumes the role profile; the Bearer token proves the phone.
  /// `{ success, verified:true }` or `{ success, alreadyRegistered:true, status }`.
  static Future<Map<String, dynamic>> registerRole(String role) async =>
      _map(await ApiClient.post('/$role/register', {'phone': _phone}));

  // ---- Profiles and KYC ---------------------------------------------------

  static Future<Map<String, dynamic>> profile([String? role]) async {
    final data = _map(await ApiClient.get('/${role ?? _role}/profile', query: {'phone': _phone}));
    return _map(data['user']);
  }

  static Future<void> saveOrganizerProfile({
    required String name,
    required String email,
    required String city,
    String? profileImage,
  }) async {
    await ApiClient.post(
      '/organizer/profile',
      {
        'phone': _phone,
        'name': name,
        'email': email,
        'city': city,
        if (profileImage != null) 'profileImage': profileImage,
      },
      timeout: AppConfig.uploadTimeout,
    );
  }

  /// Only the given fields are changed; the server ignores empty values.
  static Future<void> saveArtistProfile(Map<String, dynamic> fields) async {
    await ApiClient.post('/artist/profile', {'phone': _phone, ...fields}, timeout: AppConfig.uploadTimeout);
  }

  /// `{ kycStatus: not_submitted|pending|approved|rejected, canSubmit, rejectionNotes, aadharId, panId, ... }`
  static Future<Map<String, dynamic>> kycStatus([String? role]) async =>
      _map(await ApiClient.get('/${role ?? _role}/kyc-status', query: {'phone': _phone}));

  static Future<Map<String, dynamic>> submitKyc({
    required String aadharId,
    required String panId,
    String? aadharImage,
    String? panImage,
    required bool resubmit,
  }) async {
    return _map(await ApiClient.post(
      '/$_role/${resubmit ? 'resubmit-kyc' : 'kyc'}',
      {
        'phone': _phone,
        'aadharId': aadharId,
        'panId': panId,
        if (aadharImage != null) 'aadharImage': aadharImage,
        if (panImage != null) 'panImage': panImage,
      },
      timeout: AppConfig.uploadTimeout,
    ));
  }

  // ---- Lookups ------------------------------------------------------------

  static Future<List<Map<String, dynamic>>> categories() async {
    final data = await ApiClient.get('/categories', auth: false);
    return _list(data is List ? data : _map(data)['categories']);
  }

  static Future<List<String>> languages() async => _strings(_map(await ApiClient.get('/languages', auth: false))['languages']);

  static Future<List<String>> genres() async => _strings(_map(await ApiClient.get('/genres', auth: false))['genres']);

  static Future<List<Map<String, dynamic>>> venues() async => _list(_map(await ApiClient.get('/venues', auth: false))['venues']);

  /// Approved artists (public fields only).
  static Future<List<Map<String, dynamic>>> artists() async => _list(_map(await ApiClient.get('/artists', auth: false))['artists']);

  // ---- Organiser: events --------------------------------------------------

  static Future<List<Map<String, dynamic>>> myEvents() async =>
      _list(_map(await ApiClient.get('/events/user/$_phone', timeout: AppConfig.uploadTimeout))['events']);

  static Future<Map<String, dynamic>> event(String id) async => _map(_map(await ApiClient.get('/events/$id'))['event']);

  /// Returns the new event id. The server always creates the event as 'pending'.
  static Future<String> createEvent(Map<String, dynamic> payload) async {
    final data = _map(await ApiClient.post('/events', payload, timeout: AppConfig.uploadTimeout));
    return (data['eventId'] ?? '').toString();
  }

  /// Replaces the ticket list. 409 when a sold ticket would be removed or shrunk.
  static Future<String> updateTickets(String eventId, List<Map<String, dynamic>> tickets) async {
    final data = _map(await ApiClient.patch('/events/$eventId', {'tickets': tickets}));
    return (data['message'] ?? 'Tickets updated successfully').toString();
  }

  /// 409 when the event has confirmed bookings.
  static Future<void> deleteEvent(String eventId) async {
    await ApiClient.delete('/events/$eventId');
  }

  /// Confirmed, attended and cancelled bookings of one of my events.
  static Future<List<Map<String, dynamic>>> eventBookings(String eventId) async {
    final data = _map(await ApiClient.get('/bookings', query: {'organizerPhone': _phone, 'eventId': eventId}));
    return _list(data['bookings']);
  }

  /// `{ totalTickets, soldTickets, scannedTickets, remainingTickets, unsoldTickets }`
  static Future<Map<String, dynamic>> scanStats(String eventId) async =>
      _map(_map(await ApiClient.get('/events/$eventId/scan-stats'))['stats']);

  // ---- Jatra --------------------------------------------------------------

  static Future<List<Map<String, dynamic>>> myJatras() async =>
      _list(_map(await ApiClient.get('/jatra', query: {'organizerPhone': _phone}))['jatras']);

  static Future<String> registerJatra(Map<String, dynamic> payload) async {
    final data = _map(await ApiClient.post('/jatra', {...payload, 'organizerPhone': _phone}));
    return (data['message'] ?? 'Jatra registered. Awaiting admin approval.').toString();
  }

  // ---- Artist -------------------------------------------------------------

  /// `{ followers, bookingRequests, upcomingEvents, totalEarnings }`
  static Future<Map<String, dynamic>> artistStats() async =>
      _map(_map(await ApiClient.get('/artist/dashboard-stats', query: {'phone': _phone}))['stats']);

  /// Approved events that list the artist and are not answered yet.
  static Future<List<Map<String, dynamic>>> bookingRequests() async =>
      _list(_map(await ApiClient.get('/artist/booking-requests', query: {'phone': _phone}))['requests']);

  static Future<String> respondToBooking(String eventId, {required bool accept}) async {
    final data = _map(await ApiClient.post('/artist/booking-response', {
      'eventId': eventId,
      'artistPhone': _phone,
      'response': accept ? 'accepted' : 'rejected',
    }));
    return (data['message'] ?? '').toString();
  }

  /// Approved events the artist has accepted.
  static Future<List<Map<String, dynamic>>> artistEvents() async =>
      _list(_map(await ApiClient.get('/artist/events', query: {'phone': _phone}))['events']);

  static Future<List<Map<String, dynamic>>> artistFollowers() async =>
      _list(_map(await ApiClient.get('/artist/followers', query: {'phone': _phone}))['followers']);

  /// `mediaType` is always 'image': the app does not upload videos.
  static Future<void> uploadArtistImage(String base64Image) async {
    await ApiClient.post(
      '/artist/media',
      {'phone': _phone, 'mediaData': base64Image, 'mediaType': 'image'},
      timeout: AppConfig.uploadTimeout,
    );
  }

  // ---- Gate ---------------------------------------------------------------

  /// `{ success, event:{_id,name,startDate,startTime,location}, staff:{name,email,phone} }`
  static Future<Map<String, dynamic>> staffLogin(String email, String password) async =>
      _map(await ApiClient.post('/staff/login', {'email': email, 'password': password}, auth: false));

  /// Always 200 with `{ valid, reason, message, booking?, checkedInAt? }`.
  static Future<Map<String, dynamic>> verifyTicket(String qrText, {String? eventId, bool checkOnly = false}) async {
    return _map(await ApiClient.post('/bookings/verify', {
      ...scanRequestBody(qrText, eventId: eventId),
      if (checkOnly) 'checkOnly': true,
    }));
  }
}
