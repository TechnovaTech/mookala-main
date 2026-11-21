import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../services/api_client.dart';
import '../services/api_service.dart';
import '../services/session.dart';
import '../utils/image_source.dart';
import '../utils/pick_image.dart';
import '../widgets/app_theme.dart';
import '../widgets/state_views.dart';
import 'phone_login_screen.dart';
import 'preferences_screen.dart';

/// Edit profile (from the profile menu). Pops with `true` after a save.
class EditProfileScreen extends StatelessWidget {
  const EditProfileScreen({super.key});

  @override
  Widget build(BuildContext context) => const ProfileFormScreen(onboarding: false);
}

/// The profile form, used both at sign-up and for editing.
///
/// What the backend stores (`POST /user/profile`): name, email, city,
/// profileImage, genres. There is no bio field and a photo cannot be removed
/// on the server, so neither control exists here. The phone number is the
/// account itself and is shown read-only.
class ProfileFormScreen extends StatefulWidget {
  const ProfileFormScreen({super.key, required this.onboarding});

  /// True right after the first sign-in: saving continues to the preferences step.
  final bool onboarding;

  @override
  State<ProfileFormScreen> createState() => _ProfileFormScreenState();
}

class _ProfileFormScreenState extends State<ProfileFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _cityController = TextEditingController();

  bool _loading = true;
  bool _saving = false;
  String? _loadError;
  Uint8List? _photoBytes; // what is shown
  String? _newPhotoBase64; // set only when a new photo was picked

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final user = await ApiService.getProfile();
      if (!mounted) return;
      setState(() {
        _nameController.text = (user['name'] ?? '').toString();
        _emailController.text = (user['email'] ?? '').toString();
        _cityController.text = (user['city'] ?? '').toString();
        // The website saves a data: URL, this app raw base64: both decode here.
        _photoBytes = decodeImageBytes(user['profileImage'] is String ? user['profileImage'] as String : null);
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _loadError = e.message;
      });
    }
  }

  Future<void> _pickPhoto() async {
    final photo = await pickPhoto(context);
    if (photo == null || !mounted) return;
    setState(() {
      _photoBytes = photo.bytes;
      _newPhotoBase64 = photo.base64;
    });
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    setState(() => _saving = true);
    try {
      await ApiService.updateProfile(
        name: _nameController.text,
        email: _emailController.text,
        city: _cityController.text,
        profileImage: _newPhotoBase64,
      );
      if (!mounted) return;
      if (widget.onboarding) {
        Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const PreferencesScreen(onboarding: true)));
      } else {
        showMessage(context, 'Profile saved.');
        Navigator.of(context).pop(true);
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      // Includes the server's own message when a photo is refused (413).
      showMessage(context, e.message);
    }
  }

  Future<void> _useAnotherNumber() async {
    await Session.clear();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const PhoneLoginScreen()), (route) => false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: navyAppBar(
        widget.onboarding ? 'Your profile' : 'Edit profile',
        showBack: !widget.onboarding,
        actions: [
          if (widget.onboarding)
            TextButton(
              onPressed: _saving ? null : _useAnotherNumber,
              child: const Text('Sign out', style: TextStyle(color: Colors.white)),
            ),
        ],
      ),
      body: _loading
          ? const LoadingView()
          : _loadError != null
              ? ErrorView(message: _loadError!, onRetry: _load)
              : GestureDetector(
                  onTap: () => FocusScope.of(context).unfocus(),
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.all(24),
                    child: Form(
                      key: _formKey,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          if (widget.onboarding) ...[
                            const Text('Tell us about you', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
                            const SizedBox(height: 6),
                            Text('Only your name is needed to continue.', style: TextStyle(color: Colors.grey.shade600)),
                            const SizedBox(height: 20),
                          ],
                          Center(
                            child: Stack(
                              children: [
                                CircleAvatar(
                                  radius: 48,
                                  backgroundColor: Colors.grey.shade200,
                                  backgroundImage: _photoBytes == null ? null : MemoryImage(_photoBytes!),
                                  child: _photoBytes == null ? Icon(Icons.person, size: 48, color: Colors.grey.shade500) : null,
                                ),
                                Positioned(
                                  right: 0,
                                  bottom: 0,
                                  child: Material(
                                    color: AppColors.navy,
                                    shape: const CircleBorder(),
                                    child: IconButton(
                                      tooltip: 'Change photo',
                                      onPressed: _saving ? null : _pickPhoto,
                                      icon: const Icon(Icons.camera_alt, color: Colors.white, size: 20),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 24),
                          TextFormField(
                            controller: _nameController,
                            textCapitalization: TextCapitalization.words,
                            maxLength: 120,
                            decoration: fieldDecoration('Full name', icon: Icons.person_outline).copyWith(counterText: ''),
                            validator: (value) => (value ?? '').trim().length < 2 ? 'Please enter your name' : null,
                          ),
                          const SizedBox(height: 16),
                          TextFormField(
                            controller: _emailController,
                            keyboardType: TextInputType.emailAddress,
                            decoration: fieldDecoration('Email (optional)', icon: Icons.email_outlined),
                            validator: (value) {
                              final text = (value ?? '').trim();
                              if (text.isEmpty) return null;
                              return RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(text) ? null : 'This email address does not look right';
                            },
                          ),
                          const SizedBox(height: 16),
                          TextFormField(
                            controller: _cityController,
                            textCapitalization: TextCapitalization.words,
                            decoration: fieldDecoration(
                              'City (optional)',
                              icon: Icons.location_city_outlined,
                              helper: 'Used to show events in your city first.',
                            ),
                          ),
                          const SizedBox(height: 16),
                          InputDecorator(
                            decoration: fieldDecoration('Mobile number', icon: Icons.phone, helper: 'Your number is your account and cannot be changed here.'),
                            child: Text('+91 ${Session.phone ?? ''}', style: TextStyle(color: Colors.grey.shade700, fontSize: 16)),
                          ),
                          const SizedBox(height: 28),
                          ElevatedButton(
                            onPressed: _saving ? null : _save,
                            style: primaryButtonStyle(),
                            child: _saving
                                ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                : Text(widget.onboarding ? 'CONTINUE' : 'SAVE'),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
    );
  }

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _cityController.dispose();
    super.dispose();
  }
}
