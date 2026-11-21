import 'package:flutter/material.dart';

import '../app_flow.dart';
import '../services/api.dart';
import '../services/api_client.dart';
import '../services/session.dart';
import '../widgets/common.dart';
import 'kyc_verification_screen.dart';
import 'profile_screen.dart';
import 'support_screen.dart';

/// The organiser's account screen.
class UserProfileScreen extends StatefulWidget {
  const UserProfileScreen({super.key});

  @override
  State<UserProfileScreen> createState() => _UserProfileScreenState();
}

class _UserProfileScreenState extends State<UserProfileScreen> {
  Map<String, dynamic>? _user;
  String? _error;
  bool _loading = true;
  bool _switching = false;

  static const _kycLabels = {
    'not_submitted': 'Not submitted',
    'pending': 'Under review',
    'approved': 'Approved',
    'rejected': 'Rejected',
  };

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = _user == null;
      _error = null;
    });
    try {
      final user = await Api.profile('organizer');
      if (!mounted) return;
      setState(() => _user = user);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _edit() async {
    final changed = await Navigator.push<bool>(
      context,
      MaterialPageRoute(builder: (_) => const OrganizerProfileScreen(editing: true)),
    );
    if (changed == true && mounted) _load();
  }

  Future<void> _kyc() async {
    await Navigator.push(context, MaterialPageRoute(builder: (_) => const KYCVerificationScreen()));
    if (mounted) _load();
  }

  Future<void> _switchRole() async {
    if (_switching) return;
    setState(() => _switching = true);
    try {
      await AppFlow.openRoleSwitcher(context);
    } on ApiException catch (e) {
      if (mounted) showMessage(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _switching = false);
    }
  }

  Future<void> _signOut() async {
    final yes = await confirm(context, title: 'Sign out', message: 'Sign out of this phone?', yes: 'Sign out', danger: true);
    if (yes) await AppFlow.signOut();
  }

  Widget _entry(IconData icon, String title, VoidCallback onTap, {String? subtitle, Color? color, Widget? trailing}) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        leading: Icon(icon, color: color ?? AppColors.navy),
        title: Text(title, style: TextStyle(fontWeight: FontWeight.w600, color: color)),
        subtitle: subtitle == null ? null : Text(subtitle),
        trailing: trailing ?? const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }

  Widget _content() {
    final user = _user!;
    String text(String key) => (user[key] ?? '').toString().trim();
    final kyc = text('kycStatus');
    final phone = text('phone').isEmpty ? (Session.phone ?? '') : text('phone');
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          if (_error != null) ...[InfoBanner('Could not refresh: $_error'), const SizedBox(height: 12)],
          Center(
            child: ClipOval(
              child: SizedBox(
                width: 100,
                height: 100,
                child: StoredImage(user['profileImage'], placeholderIcon: Icons.person),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Center(
            child: Text(text('name').isEmpty ? 'Organiser' : text('name'),
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: AppColors.navy)),
          ),
          const SizedBox(height: 4),
          Center(child: Text('+91 $phone · Organiser', style: const TextStyle(color: Colors.black54))),
          if (text('email').isNotEmpty) Center(child: Text(text('email'), style: const TextStyle(color: Colors.black54))),
          if (text('city').isNotEmpty) Center(child: Text(text('city'), style: const TextStyle(color: Colors.black54))),
          const SizedBox(height: 20),
          _entry(Icons.edit_outlined, 'Edit profile', _edit),
          _entry(Icons.verified_user_outlined, 'KYC verification', _kyc, subtitle: _kycLabels[kyc] ?? kyc),
          _entry(
            Icons.swap_horiz,
            'Switch role',
            _switchRole,
            subtitle: 'Use this phone number as an artist',
            trailing: _switching
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.5))
                : null,
          ),
          _entry(Icons.support_agent, 'Help & Support', () {
            Navigator.push(context, MaterialPageRoute(builder: (_) => const SupportScreen()));
          }),
          _entry(Icons.logout, 'Sign out', _signOut, color: Colors.red.shade700, trailing: const SizedBox.shrink()),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final Widget body;
    if (_loading) {
      body = const LoadingView();
    } else if (_user == null) {
      body = Column(
        children: [
          Expanded(child: StateView.error(_error ?? 'Could not load your profile.', onRetry: _load)),
          Padding(
            padding: const EdgeInsets.all(16),
            child: OutlinedButton.icon(
              onPressed: _signOut,
              icon: const Icon(Icons.logout),
              label: const Text('Sign out'),
              style: OutlinedButton.styleFrom(foregroundColor: Colors.red.shade700),
            ),
          ),
        ],
      );
    } else {
      body = _content();
    }
    return Scaffold(appBar: appBar('My account'), body: SafeArea(child: body));
  }
}
