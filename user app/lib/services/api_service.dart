import '../config/app_config.dart';
import '../models/booking.dart';
import '../models/event.dart';
import 'api_client.dart';
import 'session.dart';

/// What the server knows about the signed-in phone (`/public/session`).
class SessionInfo {
  SessionInfo({required this.phone, required this.hasUserProfile, required this.userName, required this.userStatus});

  factory SessionInfo.fromJson(Map<String, dynamic> json) {
    final profiles = json['profiles'] is Map ? json['profiles'] as Map : const {};
    final user = profiles['user'] is Map ? profiles['user'] as Map : null;
    return SessionInfo(
      phone: (json['phone'] ?? '').toString(),
      hasUserProfile: user != null,
      userName: user?['name'] is String ? (user!['name'] as String).trim() : '',
      userStatus: user?['status'] is String ? user!['status'] as String : '',
    );
  }

  final String phone;
  final bool hasUserProfile;
  final String userName;
  final String userStatus;

  /// The server treats a customer profile as finished only with a name.
  bool get isProfileComplete => hasUserProfile && userStatus == 'completed' && userName.isNotEmpty;
}

class PlatformInfo {
  PlatformInfo({
    required this.name,
    required this.supportEmail,
    required this.supportPhone,
    required this.supportAddress,
    required this.policyLinks,
    required this.maintenanceActive,
    required this.maintenanceMessage,
  });

  factory PlatformInfo.fromJson(Map<String, dynamic> json) {
    final support = json['support'] is Map ? json['support'] as Map : const {};
    final maintenance = json['maintenance'] is Map ? json['maintenance'] as Map : const {};
    final links = <String, String>{};
    if (json['policyLinks'] is Map) {
      (json['policyLinks'] as Map).forEach((key, value) {
        if (value is String && value.trim().isNotEmpty) links[key.toString()] = value.trim();
      });
    }
    String text(dynamic v) => v is String ? v.trim() : '';
    return PlatformInfo(
      name: text(json['name']),
      supportEmail: text(support['email']),
      supportPhone: text(support['phone']),
      supportAddress: text(support['address']),
      policyLinks: links,
      maintenanceActive: maintenance['active'] == true,
      maintenanceMessage: text(maintenance['message']),
    );
  }

  final String name;
  final String supportEmail;
  final String supportPhone;
  final String supportAddress;
  final Map<String, String> policyLinks;
  final bool maintenanceActive;
  final String maintenanceMessage;
}

class PaymentConfig {
  PaymentConfig({required this.enabled, required this.holdMinutes, required this.refundPolicy});

  factory PaymentConfig.fromJson(Map<String, dynamic> json) {
    return PaymentConfig(
      enabled: json['enabled'] == true,
      holdMinutes: json['holdMinutes'] is num ? (json['holdMinutes'] as num).toInt() : 15,
      refundPolicy: [
        if (json['refundPolicy'] is List)
          for (final rule in json['refundPolicy'] as List)
            if (rule is Map) Map<String, dynamic>.from(rule),
      ],
    );
  }

  /// False means paid booking is unavailable right now.
  final bool enabled;
  final int holdMinutes;
  final List<Map<String, dynamic>> refundPolicy;
}

/// The answer of `POST /payment/order`.
class OrderResult {
  OrderResult({
    required this.bookingId,
    required this.isFree,
    this.booking,
    this.orderId = '',
    this.amountPaise = 0,
    this.currency = 'INR',
    this.keyId = '',
    this.expiresAt,
    this.totalPrice = 0,
  });

  factory OrderResult.fromJson(Map<String, dynamic> json) {
    final free = json['free'] == true;
    return OrderResult(
      bookingId: (json['bookingId'] ?? '').toString(),
      isFree: free,
      booking: json['booking'] is Map ? Booking.fromJson(Map<String, dynamic>.from(json['booking'] as Map)) : null,
      orderId: (json['orderId'] ?? '').toString(),
      amountPaise: json['amount'] is num ? (json['amount'] as num).round() : 0,
      currency: json['currency'] is String ? json['currency'] as String : 'INR',
      keyId: (json['keyId'] ?? '').toString(),
      expiresAt: json['expiresAt'] is String ? DateTime.tryParse(json['expiresAt'] as String) : null,
      totalPrice: json['totalPrice'] is num ? (json['totalPrice'] as num).toDouble() : 0,
    );
  }

  final String bookingId;
  final bool isFree;

  /// Set for a free event: the booking is already confirmed.
  final Booking? booking;
  final String orderId;
  final int amountPaise;
  final String currency;
  final String keyId;

  /// The seats are held until this moment.
  final DateTime? expiresAt;

  /// The amount the server will charge, in rupees.
  final double totalPrice;
}

/// The answer of `POST /payment/verify` when it is not an error.
class VerifyResult {
  VerifyResult({required this.confirmed, this.booking, this.message = ''});
  final bool confirmed;
  final Booking? booking;

  /// Set while the payment is still being processed (HTTP 202).
  final String message;
}

class CancelPreview {
  CancelPreview({
    required this.cancellable,
    required this.status,
    required this.explanation,
    required this.refundAmount,
    required this.deductionAmount,
    required this.amountPaid,
    required this.ruleName,
  });

  factory CancelPreview.fromJson(Map<String, dynamic> json) {
    final quote = json['quote'] is Map ? json['quote'] as Map : const {};
    double money(dynamic v) => v is num ? v.toDouble() : 0;
    return CancelPreview(
      cancellable: json['cancellable'] == true,
      status: (json['status'] ?? '').toString(),
      explanation: quote['explanation'] is String ? quote['explanation'] as String : '',
      refundAmount: money(quote['refundAmount']),
      deductionAmount: money(quote['deductionAmount']),
      amountPaid: money(quote['amountPaid']),
      ruleName: quote['ruleName'] is String ? quote['ruleName'] as String : '',
    );
  }

  final bool cancellable;
  final String status;
  final String explanation;
  final double refundAmount;
  final double deductionAmount;
  final double amountPaid;
  final String ruleName;
}

/// Every backend call the app makes, in one place. Each method returns parsed
/// data or throws an [ApiException]; none of them invents a result.
class ApiService {
  ApiService._();

  static String get _phone {
    final phone = Session.phone;
    if (phone == null || phone.isEmpty) {
      throw ApiException(message: 'Please sign in to continue.', statusCode: 401);
    }
    return phone;
  }

  static List<Map<String, dynamic>> _maps(dynamic value) => [
        if (value is List)
          for (final item in value)
            if (item is Map) Map<String, dynamic>.from(item),
      ];

  /* ----------------------------- Sign-in ----------------------------- */

  /// Sends a code by SMS. Returns true when the server is in development mode
  /// (no SMS is sent and the test code is accepted).
  static Future<bool> sendOtp(String phone) async {
    final res = await ApiClient.post('/public/otp/send', body: {'phone': phone});
    return res.map['devMode'] == true;
  }

  /// Checks the code and stores the session. Returns nothing else on purpose:
  /// the profile is read with [ensureUserProfile].
  static Future<void> verifyOtp(String phone, String otp) async {
    final res = await ApiClient.post('/public/otp/verify', body: {'phone': phone, 'otp': otp, 'role': 'user'});
    final token = res.map['token'];
    if (token is! String || token.isEmpty) {
      throw ApiException(message: 'Sign-in did not complete. Please try again.');
    }
    final serverPhone = res.map['phone'] is String ? res.map['phone'] as String : phone;
    await Session.save(token: token, phone: serverPhone);
  }

  /// Makes sure a customer record exists for the signed-in phone (the token is
  /// the proof of the phone, so no second code is needed). Returns whether the
  /// profile is complete.
  static Future<bool> ensureUserProfile() async {
    final res = await ApiClient.post('/user/verify-otp', body: {'phone': _phone});
    return res.map['isProfileComplete'] == true;
  }

  static Future<SessionInfo> getSession() async {
    final res = await ApiClient.get('/public/session');
    return SessionInfo.fromJson(res.map);
  }

  static Future<void> signOut() => Session.clear();

  /* ----------------------------- Platform ---------------------------- */

  static Future<PlatformInfo> getPlatform() async {
    final res = await ApiClient.get('/public/platform');
    return PlatformInfo.fromJson(res.map);
  }

  /// Published policies: `[{type, title, version, effectiveDate}]`.
  static Future<List<Map<String, dynamic>>> getPolicies() async {
    final res = await ApiClient.get('/public/policies');
    return _maps(res.map['policies']);
  }

  /// One published policy with its text. Throws 404 when none is published.
  static Future<Map<String, dynamic>> getPolicy(String type) async {
    final res = await ApiClient.get('/public/policies/$type');
    return res.map['policy'] is Map ? Map<String, dynamic>.from(res.map['policy'] as Map) : <String, dynamic>{};
  }

  /* ----------------------------- Profile ----------------------------- */

  static Future<Map<String, dynamic>> getProfile() async {
    final res = await ApiClient.get('/user/profile', query: {'phone': _phone});
    return res.map['user'] is Map ? Map<String, dynamic>.from(res.map['user'] as Map) : <String, dynamic>{};
  }

  /// Only the fields that are passed are changed. `profileImage` is raw base64.
  static Future<void> updateProfile({
    String? name,
    String? email,
    String? city,
    String? profileImage,
    List<String>? genres,
  }) async {
    final body = <String, dynamic>{'phone': _phone};
    if (name != null && name.trim().isNotEmpty) body['name'] = name.trim();
    if (email != null && email.trim().isNotEmpty) body['email'] = email.trim();
    if (city != null && city.trim().isNotEmpty) body['city'] = city.trim();
    if (profileImage != null && profileImage.isNotEmpty) body['profileImage'] = profileImage;
    if (genres != null && genres.isNotEmpty) body['genres'] = genres;
    await ApiClient.post('/user/profile', body: body, timeout: AppConfig.listTimeout);
  }

  static Future<List<String>> getGenres() async {
    final res = await ApiClient.get('/genres');
    return [
      if (res.map['genres'] is List)
        for (final g in res.map['genres'] as List)
          if (g is String && g.trim().isNotEmpty) g.trim(),
    ];
  }

  /* ------------------------------ Browse ----------------------------- */

  static Future<List<EventModel>> getEvents({String? category}) async {
    final res = await ApiClient.get('/events/approved', query: {'category': category}, timeout: AppConfig.listTimeout);
    return [
      for (final json in _maps(res.map['events'])) EventModel.fromJson(json),
    ].where((e) => e.id.isNotEmpty).toList();
  }

  static Future<EventModel> getEvent(String eventId) async {
    final res = await ApiClient.get('/events/$eventId', timeout: AppConfig.listTimeout);
    if (res.map['event'] is! Map) {
      throw ApiException(message: 'This event could not be loaded.');
    }
    return EventModel.fromJson(Map<String, dynamic>.from(res.map['event'] as Map));
  }

  /// A venue record by its exact name, for the seating layout picture.
  static Future<Map<String, dynamic>?> getVenueByName(String name) async {
    final res = await ApiClient.get('/venues', query: {'name': name});
    final venues = _maps(res.map['venues']);
    return venues.isEmpty ? null : venues.first;
  }

  static Future<List<Map<String, dynamic>>> getCategories() async {
    final res = await ApiClient.get('/categories');
    return _maps(res.data);
  }

  /// Home banners. Advertiser campaigns in the list carry a `campaignId`; the
  /// signed-in user's city is sent so city-targeted campaigns can be matched.
  static Future<List<Map<String, dynamic>>> getBanners() async {
    final res = await ApiClient.get('/banners', query: {'city': await _cityForAds()}, timeout: AppConfig.listTimeout);
    return _maps(res.map['banners']);
  }

  /// Sponsored ads, with the same `campaignId` and city rules as [getBanners].
  static Future<List<Map<String, dynamic>>> getAds() async {
    final res = await ApiClient.get('/ads', query: {'city': await _cityForAds()}, timeout: AppConfig.listTimeout);
    return _maps(res.map['ads']);
  }

  static String _adCity = '';
  static String? _adCityPhone;
  static DateTime? _adCityAt;
  static Future<String>? _adCityRequest;

  /// The city on the signed-in user's profile, used only to target ads. It is
  /// read at most once a minute, and banners and ads share one request. With
  /// no session, no city or no connection the answer is empty, and the server
  /// then leaves out campaigns that are limited to particular cities.
  static Future<String> _cityForAds() {
    if (!Session.isSignedIn) return Future.value('');
    final at = _adCityAt;
    if (at != null && _adCityPhone == Session.phone && DateTime.now().difference(at) < const Duration(minutes: 1)) {
      return Future.value(_adCity);
    }
    return _adCityRequest ??= () async {
      try {
        final user = await getProfile();
        _adCity = (user['city'] ?? '').toString().trim();
        _adCityPhone = Session.phone;
        _adCityAt = DateTime.now();
        return _adCity;
      } catch (_) {
        return '';
      } finally {
        _adCityRequest = null;
      }
    }();
  }

  /// Reports that an advertiser campaign was shown (`click: false`) or tapped
  /// (`click: true`). Reporting never interrupts the screen: every failure is
  /// ignored.
  static Future<void> trackAd(String campaignId, {required bool click}) async {
    if (campaignId.isEmpty) return;
    try {
      final city = Session.isSignedIn && _adCityPhone == Session.phone ? _adCity : '';
      await ApiClient.post('/public/ads/track', body: {
        'campaignId': campaignId,
        'type': click ? 'click' : 'impression',
        if (city.isNotEmpty) 'city': city,
      });
    } catch (_) {
      // Counting an ad view is best effort.
    }
  }

  static Future<List<Map<String, dynamic>>> getArtists() async {
    final res = await ApiClient.get('/artists', timeout: AppConfig.listTimeout);
    return _maps(res.map['artists']);
  }

  /* ------------------------------ Follow ----------------------------- */

  static Future<bool> isFollowing(String artistId) async {
    final res = await ApiClient.get('/user/follow-status', query: {'artistId': artistId, 'userPhone': _phone});
    return res.map['isFollowing'] == true;
  }

  /// Follows or unfollows. Returns the server's `{isFollowing, followerCount}`.
  static Future<({bool isFollowing, int followerCount})> setFollowing(String artistId, bool follow) async {
    final res = await ApiClient.post('/artists/follow', body: {
      'artistId': artistId,
      'userPhone': _phone,
      'action': follow ? 'follow' : 'unfollow',
    });
    return (
      isFollowing: res.map['isFollowing'] == true,
      followerCount: res.map['followerCount'] is num ? (res.map['followerCount'] as num).toInt() : 0,
    );
  }

  static Future<int> getFollowerCount(String artistId) async {
    final res = await ApiClient.get('/artists/follower-count', query: {'artistId': artistId});
    return res.map['followerCount'] is num ? (res.map['followerCount'] as num).toInt() : 0;
  }

  /* ----------------------- Booking and payment ----------------------- */

  static Future<PaymentConfig> getPaymentConfig() async {
    final res = await ApiClient.get('/payment/config');
    return PaymentConfig.fromJson(res.map);
  }

  /// Starts a booking. The server prices it and holds the seats; a free event
  /// comes back already confirmed.
  static Future<OrderResult> createOrder({required String eventId, required List<Map<String, dynamic>> tickets}) async {
    final res = await ApiClient.post('/payment/order', body: {
      'userPhone': _phone,
      'eventId': eventId,
      'tickets': tickets,
    });
    return OrderResult.fromJson(res.map);
  }

  /// Confirms a Razorpay payment. 200 = ticket, 202 = still processing; every
  /// other outcome is thrown as an [ApiException] with its `code`.
  static Future<VerifyResult> verifyPayment({
    required String bookingId,
    required String orderId,
    required String paymentId,
    required String signature,
  }) async {
    final res = await ApiClient.post('/payment/verify', body: {
      'bookingId': bookingId,
      'razorpay_order_id': orderId,
      'razorpay_payment_id': paymentId,
      'razorpay_signature': signature,
    });
    final confirmed = res.statusCode == 200 && res.map['confirmed'] == true;
    return VerifyResult(
      confirmed: confirmed,
      booking: res.map['booking'] is Map ? Booking.fromJson(Map<String, dynamic>.from(res.map['booking'] as Map)) : null,
      message: res.map['message'] is String ? res.map['message'] as String : '',
    );
  }

  static Future<List<Booking>> getMyBookings() async {
    final res = await ApiClient.get('/bookings', query: {'userPhone': _phone}, timeout: AppConfig.listTimeout);
    return [for (final json in _maps(res.map['bookings'])) Booking.fromJson(json)];
  }

  static Future<CancelPreview> previewCancellation(String bookingId) async {
    final res = await ApiClient.post('/bookings/cancel', body: {
      'bookingId': bookingId,
      'userPhone': _phone,
      'preview': true,
    });
    return CancelPreview.fromJson(res.map);
  }

  /// Cancels the booking and returns the server's message.
  static Future<String> cancelBooking(String bookingId, String reason) async {
    final res = await ApiClient.post('/bookings/cancel', body: {
      'bookingId': bookingId,
      'userPhone': _phone,
      'reason': reason,
    });
    return res.map['message'] is String ? res.map['message'] as String : 'Booking cancelled.';
  }

  /* ------------------------------- Hire ------------------------------ */

  static Future<List<Map<String, dynamic>>> getProfessionals(String type) async {
    final res = await ApiClient.get('/professionals', query: {'type': type}, timeout: AppConfig.listTimeout);
    return _maps(res.map['professionals']);
  }

  static Future<String> createHireRequest({
    required String professionalId,
    required String professionalName,
    required String type,
    required String userName,
    required String eventDate,
    required String city,
    required String message,
  }) async {
    final res = await ApiClient.post('/hire-requests', body: {
      'professionalId': professionalId,
      'professionalName': professionalName,
      'type': type,
      'userPhone': _phone,
      'userName': userName,
      'eventDate': eventDate,
      'city': city,
      'message': message,
    });
    return res.map['message'] is String ? res.map['message'] as String : 'Request sent.';
  }
}
