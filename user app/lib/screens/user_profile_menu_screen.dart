import 'package:flutter/material.dart';

import '../services/api_client.dart';
import '../services/api_service.dart';
import '../services/session.dart';
import '../widgets/app_image.dart';
import '../widgets/app_theme.dart';
import 'edit_profile_screen.dart';
import 'following_artists_screen.dart';
import 'help_support_screen.dart';
import 'my_bookings_screen.dart';
import 'phone_login_screen.dart';
import 'preferences_screen.dart';
import 'referrals/referral_screen.dart';

/// The account menu. Every row opens something that works.
class UserProfileMenuScreen extends StatefulWidget {
  const UserProfileMenuScreen({super.key});

  @override
  State<UserProfileMenuScreen> createState() => _UserProfileMenuScreenState();
}

class _UserProfileMenuScreenState extends State<UserProfileMenuScreen> {
  Map<String, dynamic>? _user;
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final user = await ApiService.getProfile();
      if (mounted) {
        setState(() {
          _user = user;
          _loading = false;
        });
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = e.message;
        });
      }
    }
  }

  Future<void> _logout() async {
    final sure = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: const Text('Sign out'),
        content: const Text('Sign out of Mookalaa on this phone?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialog, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(dialog, true), child: const Text('Sign out')),
        ],
      ),
    );
    if (sure != true) return;
    // Removes the token, the phone and all per-user data kept on this device.
    await ApiService.signOut();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const PhoneLoginScreen()), (route) => false);
  }

  Future<void> _push(Widget screen, {bool reload = false}) async {
    await Navigator.push(context, MaterialPageRoute(builder: (_) => screen));
    if (reload && mounted) _load();
  }

  Widget _item(IconData icon, String title, VoidCallback onTap, {Color? color}) => ListTile(
        leading: Icon(icon, color: color ?? AppColors.navy),
        title: Text(title, style: TextStyle(color: color)),
        trailing: color == null ? const Icon(Icons.chevron_right, color: Colors.grey) : null,
        onTap: onTap,
      );

  @override
  Widget build(BuildContext context) {
    final user = _user;
    final name = (user?['name'] ?? '').toString();
    final email = (user?['email'] ?? '').toString();
    return Scaffold(
      backgroundColor: Colors.grey.shade100,
      appBar: navyAppBar('Profile'),
      body: ListView(
        children: [
          Container(
            color: Colors.white,
            padding: const EdgeInsets.all(20),
            child: Row(
              children: [
                AppAvatar(user?['profileImage'] is String ? user!['profileImage'] as String : null, radius: 34),
                const SizedBox(width: 16),
                Expanded(
                  child: _loading
                      ? const Align(alignment: Alignment.centerLeft, child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)))
                      : Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (_error != null)
                              Row(
                                children: [
                                  Expanded(child: Text(_error!, style: TextStyle(color: Colors.grey.shade700))),
                                  TextButton(onPressed: _load, child: const Text('Retry')),
                                ],
                              )
                            else
                              Text(name.isEmpty ? 'Your profile' : name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                            Text('+91 ${Session.phone ?? ''}', style: TextStyle(color: Colors.grey.shade700)),
                            if (email.isNotEmpty) Text(email, style: TextStyle(color: Colors.grey.shade700)),
                          ],
                        ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Material(
            color: Colors.white,
            child: Column(
              children: [
                _item(Icons.person_outline, 'Edit profile', () => _push(const EditProfileScreen(), reload: true)),
                const Divider(height: 1),
                _item(Icons.music_note_outlined, 'Favourite genres', () => _push(const PreferencesScreen())),
                const Divider(height: 1),
                _item(Icons.confirmation_number_outlined, 'My bookings', () => _push(const MyBookingsScreen())),
                const Divider(height: 1),
                _item(Icons.people_outline, 'Artists I follow', () => _push(const FollowingArtistsScreen())),
                const Divider(height: 1),
                _item(Icons.card_giftcard_outlined, 'Refer friends', () => _push(const ReferralScreen())),
                const Divider(height: 1),
                _item(Icons.help_outline, 'Help and policies', () => _push(const HelpSupportScreen())),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Material(color: Colors.white, child: _item(Icons.logout, 'Sign out', _logout, color: AppColors.danger)),
        ],
      ),
    );
  }
}
