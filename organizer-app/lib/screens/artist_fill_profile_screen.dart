import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../app_flow.dart';
import '../logic/validators.dart';
import '../services/api.dart';
import '../services/api_client.dart';
import '../utils/image_utils.dart';
import '../widgets/common.dart';

/// The artist's details form: used once after registration and again for
/// editing. Genres come from `GET /genres`.
class ArtistFillProfileScreen extends StatefulWidget {
  const ArtistFillProfileScreen({super.key, this.editing = false});

  final bool editing;

  @override
  State<ArtistFillProfileScreen> createState() => _ArtistFillProfileScreenState();
}

class _ArtistFillProfileScreenState extends State<ArtistFillProfileScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _bio = TextEditingController();
  final _email = TextEditingController();
  final _city = TextEditingController();
  final _pricing = TextEditingController();
  List<String> _genres = [];
  String? _genre;
  String? _genreError;
  Uint8List? _newImage;
  dynamic _storedImage;
  bool _loading = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in [_name, _bio, _email, _city, _pricing]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _genreError = null;
    });
    Map<String, dynamic> user = {};
    try {
      user = await Api.profile('artist');
    } on ApiException {
      // A new profile has nothing to prefill.
    }
    List<String> genres = [];
    String? genreError;
    try {
      genres = await Api.genres();
    } on ApiException catch (e) {
      genreError = 'Could not load the genre list: ${e.message}';
    }
    if (!mounted) return;
    _name.text = (user['name'] ?? '').toString();
    _bio.text = (user['bio'] ?? '').toString();
    _email.text = (user['email'] ?? '').toString();
    _city.text = (user['city'] ?? '').toString();
    _pricing.text = (user['pricing'] ?? '').toString();
    _storedImage = user['profileImage'];
    final stored = (user['genre'] ?? '').toString().trim();
    setState(() {
      // Keep a stored genre selectable even when the list no longer has it.
      _genres = [...genres, if (stored.isNotEmpty && !genres.contains(stored)) stored];
      _genre = stored.isEmpty ? null : stored;
      _genreError = genreError;
      _loading = false;
    });
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
      await Api.saveArtistProfile({
        'name': _name.text.trim(),
        'bio': _bio.text.trim(),
        'email': _email.text.trim(),
        'city': _city.text.trim(),
        if (_genre != null) 'genre': _genre,
        if (_pricing.text.trim().isNotEmpty) 'pricing': _pricing.text.trim(),
        if (_newImage != null) 'profileImage': base64Encode(_newImage!),
      });
      if (!mounted) return;
      if (widget.editing) {
        showMessage(context, 'Profile updated');
        Navigator.pop(context, true);
      } else {
        await AppFlow.refreshAndRoute(preferredRole: 'artist');
      }
    } on ApiException catch (e) {
      if (mounted) showMessage(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: appBar(widget.editing ? 'Edit profile' : 'Artist profile', showBack: widget.editing),
      body: SafeArea(
        child: _loading
            ? const LoadingView()
            : Form(
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
                      maxLength: 120,
                      textCapitalization: TextCapitalization.words,
                      decoration: fieldDecoration('Stage name', icon: Icons.person).copyWith(counterText: ''),
                      validator: (v) => Validators.requiredText(v ?? '', 'Name'),
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _bio,
                      maxLines: 4,
                      maxLength: 3000,
                      decoration: fieldDecoration('About you', hint: 'What you perform, your experience'),
                      validator: (v) => Validators.requiredText(v ?? '', 'About you'),
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
                      maxLength: 120,
                      textCapitalization: TextCapitalization.words,
                      decoration: fieldDecoration('City', icon: Icons.location_city).copyWith(counterText: ''),
                      validator: (v) => Validators.requiredText(v ?? '', 'City'),
                    ),
                    const SizedBox(height: 14),
                    if (_genres.isNotEmpty)
                      DropdownButtonFormField<String>(
                        initialValue: _genre,
                        isExpanded: true,
                        decoration: fieldDecoration('Genre', icon: Icons.music_note),
                        items: [for (final g in _genres) DropdownMenuItem(value: g, child: Text(g))],
                        onChanged: (v) => setState(() => _genre = v),
                        validator: (v) => v == null ? 'Choose a genre' : null,
                      ),
                    if (_genreError != null) ...[
                      InfoBanner('$_genreError You can save without a genre and set it later.'),
                      TextButton(onPressed: _load, child: const Text('Reload genres')),
                    ],
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _pricing,
                      maxLength: 200,
                      decoration: fieldDecoration('Your fee (optional)', hint: 'For example: ₹25,000 per show')
                          .copyWith(counterText: ''),
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
              ),
      ),
    );
  }
}
