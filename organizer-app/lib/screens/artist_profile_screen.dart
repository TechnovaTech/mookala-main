import 'dart:convert';

import 'package:flutter/material.dart';

import '../app_flow.dart';
import '../services/api.dart';
import '../services/api_client.dart';
import '../services/session.dart';
import '../utils/image_utils.dart';
import '../widgets/common.dart';
import 'artist_fill_profile_screen.dart';
import 'kyc_verification_screen.dart';
import 'support_screen.dart';

/// The artist's own profile: details, photos, gallery and account actions.
class ArtistProfileScreen extends StatefulWidget {
  const ArtistProfileScreen({super.key, this.embedded = false});

  /// Shown as a tab of the dashboard (no back arrow).
  final bool embedded;

  @override
  State<ArtistProfileScreen> createState() => _ArtistProfileScreenState();
}

class _ArtistProfileScreenState extends State<ArtistProfileScreen> {
  /// Artist media is stored inside the artist record: 3 MB per photo.
  static const int _maxGalleryChars = 4000000;

  Map<String, dynamic>? _profile;
  String? _error;
  String? _busy; // 'profile' | 'cover' | 'gallery' | 'switch'

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final user = await Api.profile('artist');
      if (!mounted) return;
      setState(() {
        _profile = user;
        _error = null;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      if (_profile == null) {
        setState(() => _error = e.message);
      } else {
        showMessage(context, e.message, error: true);
      }
    }
  }

  /// Picks a resized photo and uploads it. [kind] is 'profile', 'cover' or 'gallery'.
  Future<void> _uploadPhoto(String kind) async {
    if (_busy != null) return;
    final bytes = await () async {
      try {
        return await ImageUtils.pick();
      } catch (_) {
        if (mounted) {
          showMessage(context, 'Could not open the photo. Check the photo permission and try again.', error: true);
        }
        return null;
      }
    }();
    if (bytes == null || !mounted) return;
    final problem = kind == 'gallery'
        ? ImageUtils.sizeProblem(bytes, maxChars: _maxGalleryChars)
        : ImageUtils.sizeProblem(bytes);
    if (problem != null) {
      showMessage(context, problem, error: true);
      return;
    }
    setState(() => _busy = kind);
    try {
      final encoded = base64Encode(bytes);
      if (kind == 'gallery') {
        await Api.uploadArtistImage(encoded);
      } else {
        await Api.saveArtistProfile({kind == 'profile' ? 'profileImage' : 'bannerImage': encoded});
      }
      if (!mounted) return;
      showMessage(
        context,
        kind == 'gallery'
            ? 'Photo uploaded. It is waiting for review by the Mookalaa team.'
            : kind == 'profile'
                ? 'Profile photo updated'
                : 'Cover photo updated',
      );
      await _load();
    } on ApiException catch (e) {
      // Includes the server's 413 "too large" message.
      if (mounted) showMessage(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  void _explainVideo() {
    showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Video upload is not available yet'),
        content: const Text(
          'Videos cannot be uploaded from the app. The platform has no file store for videos yet, '
          'and they are too large to save any other way. You can add photos to your gallery.',
        ),
        actions: [TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('OK'))],
      ),
    );
  }

  Future<void> _edit() async {
    await Navigator.push(context, MaterialPageRoute(builder: (_) => const ArtistFillProfileScreen(editing: true)));
    if (mounted) _load();
  }

  Future<void> _switchRole() async {
    if (_busy != null) return;
    setState(() => _busy = 'switch');
    try {
      await AppFlow.openRoleSwitcher(context);
    } on ApiException catch (e) {
      if (mounted) showMessage(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _signOut() async {
    final sure = await confirm(context, title: 'Sign out', message: 'Sign out of this device?', yes: 'Sign out', danger: true);
    if (sure) await AppFlow.signOut();
  }

  static String _text(dynamic v) => (v ?? '').toString().trim();

  Widget _detail(IconData icon, String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 7),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 18, color: AppColors.navy),
            const SizedBox(width: 10),
            SizedBox(width: 70, child: Text(label, style: const TextStyle(color: Colors.black54))),
            Expanded(child: Text(value.isEmpty ? 'Not set' : value, style: const TextStyle(height: 1.3))),
          ],
        ),
      );

  Widget _header(Map<String, dynamic> user) {
    return SizedBox(
      height: 210,
      child: Stack(
        children: [
          Positioned.fill(
            bottom: 50,
            child: StoredImage(user['bannerImage'], placeholderIcon: Icons.panorama_outlined),
          ),
          Positioned(
            right: 10,
            top: 10,
            child: _busy == 'cover'
                ? const CircleAvatar(
                    radius: 18,
                    backgroundColor: Colors.black54,
                    child: SizedBox(
                        width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)),
                  )
                : Material(
                    color: Colors.black54,
                    shape: const StadiumBorder(),
                    child: InkWell(
                      customBorder: const StadiumBorder(),
                      onTap: () => _uploadPhoto('cover'),
                      child: const Padding(
                        padding: EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.camera_alt, size: 15, color: Colors.white),
                            SizedBox(width: 6),
                            Text('Cover photo', style: TextStyle(color: Colors.white, fontSize: 12)),
                          ],
                        ),
                      ),
                    ),
                  ),
          ),
          Positioned(
            left: 16,
            bottom: 0,
            child: GestureDetector(
              onTap: () => _uploadPhoto('profile'),
              child: Stack(
                children: [
                  Container(
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: 3),
                    ),
                    child: ClipOval(
                      child: StoredImage(user['profileImage'], width: 96, height: 96, placeholderIcon: Icons.person),
                    ),
                  ),
                  Positioned(
                    right: 0,
                    bottom: 0,
                    child: CircleAvatar(
                      radius: 15,
                      backgroundColor: AppColors.navy,
                      child: _busy == 'profile'
                          ? const SizedBox(
                              width: 14,
                              height: 14,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const Icon(Icons.camera_alt, size: 15, color: Colors.white),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _gallery(Map<String, dynamic> user) {
    final media = user['media'] is List
        ? (user['media'] as List).whereType<Map>().map((m) => Map<String, dynamic>.from(m)).toList()
        : <Map<String, dynamic>>[];
    final images = media.where((m) => m['type'] == 'image').toList();
    final videos = media.where((m) => m['type'] == 'video').length;
    const reviewLabels = {'pending': 'Waiting for review', 'approved': 'Approved', 'rejected': 'Rejected'};

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Expanded(child: SectionTitle('Gallery')),
            TextButton.icon(
              onPressed: _busy != null ? null : () => _uploadPhoto('gallery'),
              icon: _busy == 'gallery'
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.add_photo_alternate_outlined, size: 18),
              label: const Text('Add photo'),
            ),
            TextButton.icon(
              onPressed: _explainVideo,
              icon: const Icon(Icons.videocam_outlined, size: 18),
              label: const Text('Add video'),
              style: TextButton.styleFrom(foregroundColor: Colors.black54),
            ),
          ],
        ),
        if (images.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Text('No photos yet. Photos are resized before upload and reviewed by the Mookalaa team.',
                style: TextStyle(color: Colors.black54)),
          )
        else
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3,
              crossAxisSpacing: 8,
              mainAxisSpacing: 8,
            ),
            itemCount: images.length,
            itemBuilder: (context, index) {
              final item = images[index];
              final review = _text(item['reviewStatus']);
              return ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    StoredImage(item['data']),
                    if (review.isNotEmpty && review != 'approved')
                      Align(
                        alignment: Alignment.bottomCenter,
                        child: Container(
                          width: double.infinity,
                          color: review == 'rejected' ? Colors.red.withValues(alpha: 0.8) : Colors.black54,
                          padding: const EdgeInsets.symmetric(vertical: 3, horizontal: 2),
                          child: Text(reviewLabels[review] ?? review,
                              textAlign: TextAlign.center,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(color: Colors.white, fontSize: 10)),
                        ),
                      ),
                  ],
                ),
              );
            },
          ),
        if (videos > 0)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              '$videos video${videos == 1 ? '' : 's'} uploaded earlier ${videos == 1 ? 'is' : 'are'} stored on your profile. Videos cannot be played or added in the app.',
              style: const TextStyle(color: Colors.black54, fontSize: 12),
            ),
          ),
      ],
    );
  }

  Widget _action(IconData icon, String label, VoidCallback onTap, {Color? color, bool busy = false}) => ListTile(
        leading: Icon(icon, color: color ?? AppColors.navy),
        title: Text(label, style: TextStyle(color: color)),
        trailing: busy
            ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
            : const Icon(Icons.chevron_right),
        onTap: onTap,
      );

  Widget _content(Map<String, dynamic> user) {
    final name = _text(user['name']);
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        _header(user),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(name.isEmpty ? 'Artist' : name,
                        style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: AppColors.navy)),
                  ),
                  OutlinedButton.icon(
                    onPressed: _edit,
                    icon: const Icon(Icons.edit, size: 16),
                    label: const Text('Edit details'),
                    style: OutlinedButton.styleFrom(foregroundColor: AppColors.navy),
                  ),
                ],
              ),
              Text('+91 ${Session.phone ?? _text(user['phone'])}', style: const TextStyle(color: Colors.black54)),
              const SizedBox(height: 12),
              Card(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  child: Column(
                    children: [
                      _detail(Icons.music_note, 'Genre', _text(user['genre'])),
                      _detail(Icons.location_city, 'City', _text(user['city'])),
                      _detail(Icons.email_outlined, 'Email', _text(user['email'])),
                      _detail(Icons.payments_outlined, 'Fee', _text(user['pricing'])),
                      _detail(Icons.notes, 'About', _text(user['bio'])),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              _gallery(user),
              const SizedBox(height: 16),
              Card(
                child: Column(
                  children: [
                    _action(
                      Icons.verified_user_outlined,
                      'KYC status',
                      () => Navigator.push(context, MaterialPageRoute(builder: (_) => const KYCVerificationScreen())),
                    ),
                    const Divider(height: 1),
                    _action(Icons.swap_horiz, 'Switch role', _switchRole, busy: _busy == 'switch'),
                    const Divider(height: 1),
                    _action(
                      Icons.support_agent,
                      'Help & Support',
                      () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SupportScreen())),
                    ),
                    const Divider(height: 1),
                    _action(Icons.logout, 'Sign out', _signOut, color: Colors.red.shade700),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = _profile;
    Widget body;
    if (user == null) {
      body = _error != null
          ? Column(
              children: [
                Expanded(child: StateView.error(_error!, onRetry: _load)),
                TextButton(
                  onPressed: _signOut,
                  child: Text('Sign out', style: TextStyle(color: Colors.red.shade700)),
                ),
                const SizedBox(height: 12),
              ],
            )
          : const LoadingView();
    } else {
      body = RefreshIndicator(onRefresh: _load, child: _content(user));
    }
    return Scaffold(
      appBar: appBar('My profile', showBack: !widget.embedded),
      body: SafeArea(child: body),
    );
  }
}
