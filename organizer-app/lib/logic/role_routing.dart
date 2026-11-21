/// Where a signed-in phone goes next. Pure: no Flutter, no network.
///
/// The server answers sign-in and `GET /public/session` with
/// `roles: [...]` and `profiles: { user, artist, organizer }`, where a profile
/// is null or `{ status, name, kycStatus }`.
enum NextStep {
  /// The phone has neither an artist nor an organiser profile: choose one to register.
  chooseNewRole,

  /// The phone holds both roles: ask which one to use.
  chooseExistingRole,

  /// The role profile exists but has no details yet.
  fillProfile,

  /// Profile done, KYC documents never uploaded.
  submitKyc,

  /// Dashboard (which itself shows the KYC review / rejected state).
  dashboard,

  /// Every app role this phone has is suspended or blocked.
  restricted,
}

const appRoles = ['organizer', 'artist'];

class RouteDecision {
  const RouteDecision(this.step, {this.role, this.message});
  final NextStep step;
  final String? role;
  final String? message;

  @override
  String toString() => 'RouteDecision($step, role: $role)';
}

class SessionInfo {
  SessionInfo({required this.roles, required this.profiles, required this.restrictions});

  factory SessionInfo.fromJson(Map<String, dynamic> json) {
    final roles = <String>[];
    final rawRoles = json['roles'];
    if (rawRoles is List) {
      for (final r in rawRoles) {
        if (r is String && appRoles.contains(r)) roles.add(r);
      }
    }
    final profiles = <String, Map<String, dynamic>>{};
    final rawProfiles = json['profiles'];
    if (rawProfiles is Map) {
      for (final role in appRoles) {
        final p = rawProfiles[role];
        if (p is Map) profiles[role] = Map<String, dynamic>.from(p);
      }
    }
    final restrictions = <String, String>{};
    final rawRestrictions = json['restrictions'];
    if (rawRestrictions is Map) {
      for (final role in appRoles) {
        final m = rawRestrictions[role];
        if (m is String && m.trim().isNotEmpty) restrictions[role] = m.trim();
      }
    }
    return SessionInfo(roles: roles, profiles: profiles, restrictions: restrictions);
  }

  /// App roles (artist / organizer) the phone holds and may use.
  final List<String> roles;

  /// Profile summary per app role; a missing key means no profile.
  final Map<String, Map<String, dynamic>> profiles;

  /// Message per suspended or blocked role.
  final Map<String, String> restrictions;

  bool hasRole(String role) => roles.contains(role);

  /// Roles this phone could still register for.
  List<String> get unregisteredRoles =>
      appRoles.where((r) => !profiles.containsKey(r) && !restrictions.containsKey(r)).toList();
}

/// A profile is unfinished while its signup status is 'pending' / 'verified'
/// or it has no name: the profile form is what moves it on.
bool profileIncomplete(Map<String, dynamic>? profile) {
  if (profile == null) return true;
  final status = (profile['status'] ?? 'pending').toString();
  final name = (profile['name'] ?? '').toString().trim();
  if (status == 'pending' || status == 'verified') return true;
  return name.isEmpty;
}

/// The step for one specific role.
RouteDecision stepForRole(SessionInfo info, String role) {
  final restriction = info.restrictions[role];
  if (restriction != null) return RouteDecision(NextStep.restricted, role: role, message: restriction);
  final profile = info.profiles[role];
  if (profileIncomplete(profile)) return RouteDecision(NextStep.fillProfile, role: role);
  if ((profile!['kycStatus'] ?? 'not_submitted') == 'not_submitted') {
    return RouteDecision(NextStep.submitKyc, role: role);
  }
  return RouteDecision(NextStep.dashboard, role: role);
}

/// The step right after sign-in or on app start.
///
/// [savedRole] is the role used last time on this device; it wins when the
/// phone still holds it, so a dual-role user is not asked on every launch.
RouteDecision decideRoute(SessionInfo info, {String? savedRole}) {
  if (savedRole != null && info.hasRole(savedRole)) return stepForRole(info, savedRole);

  if (info.roles.isEmpty) {
    if (info.restrictions.isNotEmpty && info.unregisteredRoles.isEmpty) {
      return RouteDecision(NextStep.restricted, message: info.restrictions.values.first);
    }
    return const RouteDecision(NextStep.chooseNewRole);
  }
  if (info.roles.length == 1) return stepForRole(info, info.roles.first);
  return const RouteDecision(NextStep.chooseExistingRole);
}
