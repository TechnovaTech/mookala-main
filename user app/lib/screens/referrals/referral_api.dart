import '../../services/api_client.dart';
import '../../services/session.dart';

/// The customer's referral details from `GET /public/referrals/code`.
class ReferralStatus {
  ReferralStatus({
    required this.code,
    required this.referred,
    required this.qualified,
    required this.canClaim,
    this.programmeName,
    this.referrerReward = 0,
    this.refereeReward = 0,
    this.conditions = '',
    this.claimedCode,
  });

  factory ReferralStatus.fromJson(Map<String, dynamic> json) {
    final programme = json['programme'] is Map ? Map<String, dynamic>.from(json['programme'] as Map) : null;
    final claimed = json['claimed'] is Map ? Map<String, dynamic>.from(json['claimed'] as Map) : null;
    double money(dynamic v) => v is num ? v.toDouble() : 0;
    return ReferralStatus(
      code: (json['code'] ?? '').toString(),
      referred: json['referred'] is num ? (json['referred'] as num).toInt() : 0,
      qualified: json['qualified'] is num ? (json['qualified'] as num).toInt() : 0,
      canClaim: json['canClaim'] == true,
      programmeName: programme?['name']?.toString(),
      referrerReward: money(programme?['referrerReward']),
      refereeReward: money(programme?['refereeReward']),
      conditions: (programme?['conditions'] ?? '').toString(),
      claimedCode: claimed?['code']?.toString(),
    );
  }

  /// This customer's own code, to share.
  final String code;

  /// People who entered the code, and how many of them have made their first paid booking.
  final int referred;
  final int qualified;

  /// Whether this customer may still enter a friend's code (new account, no bookings, programme running).
  final bool canClaim;

  /// The programme running now; null when there is none.
  final String? programmeName;
  final double referrerReward;
  final double refereeReward;
  final String conditions;

  /// The friend's code this customer entered, if any.
  final String? claimedCode;
}

/// Calls for the referral screens. They need a signed-in customer.
class ReferralApi {
  ReferralApi._();

  static String get _phone {
    final phone = Session.phone;
    if (phone == null || phone.isEmpty) throw ApiException(message: 'Please sign in to continue.', statusCode: 401);
    return phone;
  }

  static Future<ReferralStatus> status() async {
    final res = await ApiClient.get('/public/referrals/code', query: {'phone': _phone});
    return ReferralStatus.fromJson(res.map);
  }

  /// Enters a friend's code. Returns the server's message; refusals are thrown as [ApiException].
  static Future<String> claim(String code) async {
    final res = await ApiClient.post('/public/referrals/claim', body: {'phone': _phone, 'code': code.trim().toUpperCase()});
    return res.map['message'] is String ? res.map['message'] as String : 'Code accepted.';
  }
}
