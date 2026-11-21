import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../app_flow.dart';
import '../logic/validators.dart';
import '../services/api.dart';
import '../services/api_client.dart';
import '../utils/image_utils.dart';
import '../widgets/common.dart';

/// The organiser's profile form: used once after registration and again for
/// editing. It only shows the fields `POST /organizer/profile` stores.
class OrganizerProfileScreen extends StatefulWidget {
  const OrganizerProfileScreen({super.key, this.editing = false});

  final bool editing;

  @override
  State<OrganizerProfileScreen> createState() => _OrganizerProfileScreenState();
}

class _OrganizerProfileScreenState extends State<OrganizerProfileScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _city = TextEditingController();
  Uint8List? _newImage;
  dynamic _storedImage;
  bool _loading = false;
  bool _saving = false;
  String? _loadError;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _city.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final user = await Api.profile('organizer');
      if (!mounted) return;
      _name.text = (user['name'] ?? '').toString();
      _email.text = (user['email'] ?? '').toString();
      _city.text = (user['city'] ?? '').toString();
      _storedImage = user['profileImage'];
    } on ApiException catch (e) {
      // A first-time form can be filled in without the stored copy.
      if (mounted && widget.editing) _loadError = e.message;
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _pickImage() async {
    try {
      final bytes = await ImageUtils.pick();
      if (bytes == null || !mounted) return;
      final problem = ImageUtils.sizeProblem(bytes);
      if (problem != null) {
        showMessage(context, problem, error: true);
        return;
      }
      setState(() => _newImage = bytes);
    } catch (_) {
      if (mounted) showMessage(context, 'Could not open the photo. Check the photo permission and try again.', error: true);
    }
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _saving = true);
    try {
      await Api.saveOrganizerProfile(
        name: _name.text.trim(),
        email: _email.text.trim(),
        city: _city.text.trim(),
        profileImage: _newImage == null ? null : base64Encode(_newImage!),
      );
      if (!mounted) return;
      if (widget.editing) {
        showMessage(context, 'Profile updated');
        Navigator.pop(context, true);
      } else {
        await AppFlow.refreshAndRoute(preferredRole: 'organizer');
      }
    } on ApiException catch (e) {
      if (mounted) showMessage(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    Widget body;
    if (_loading) {
      body = const LoadingView();
    } else if (_loadError != null) {
      body = StateView.error(_loadError!, onRetry: _load);
    } else {
      body = Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Center(
              child: GestureDetector(
                onTap: _pickImage,
                child: Stack(
                  children: [
                    ClipOval(
                      child: SizedBox(
                        width: 104,
                        height: 104,
                        child: _newImage != null
                            ? Image.memory(_newImage!, fit: BoxFit.cover)
                            : StoredImage(_storedImage, placeholderIcon: Icons.person),
                      ),
                    ),
                    const Positioned(
                      right: 0,
                      bottom: 0,
                      child: CircleAvatar(
                        radius: 16,
                        backgroundColor: AppColors.navy,
                        child: Icon(Icons.camera_alt, size: 16, color: Colors.white),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 6),
            const Center(child: Text('Profile photo (optional)', style: TextStyle(color: Colors.black54))),
            const SizedBox(height: 20),
            TextFormField(
              controller: _name,
              textCapitalization: TextCapitalization.words,
              maxLength: 120,
              decoration: fieldDecoration('Name or organisation', icon: Icons.person).copyWith(counterText: ''),
              validator: (v) => Validators.requiredText(v ?? '', 'Name'),
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              decoration: fieldDecoration('Email', icon: Icons.email),
              validator: (v) => Validators.email(v ?? ''),
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _city,
              textCapitalization: TextCapitalization.words,
              maxLength: 120,
              decoration: fieldDecoration('City', icon: Icons.location_city).copyWith(counterText: ''),
              validator: (v) => Validators.requiredText(v ?? '', 'City'),
            ),
            const SizedBox(height: 24),
            PrimaryButton(label: widget.editing ? 'Save changes' : 'Continue', loading: _saving, onPressed: _save),
            if (!widget.editing) ...[
              const SizedBox(height: 8),
              Center(
                child: TextButton(
                  onPressed: _saving ? null : () => AppFlow.signOut(),
                  child: const Text('Sign out', style: TextStyle(color: AppColors.navy)),
                ),
              ),
            ],
          ],
        ),
      );
    }
    return Scaffold(
      appBar: appBar(widget.editing ? 'Edit profile' : 'Organiser profile', showBack: widget.editing),
      body: SafeArea(child: body),
    );
  }
}
