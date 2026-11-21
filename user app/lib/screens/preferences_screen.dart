import 'package:flutter/material.dart';

import '../services/api_client.dart';
import '../services/api_service.dart';
import '../widgets/app_theme.dart';
import '../widgets/state_views.dart';
import 'discovery_home_screen.dart';

/// Favourite genres. Optional: it can always be skipped, and a failed genre
/// list can be retried or skipped, so sign-up never gets stuck here.
class PreferencesScreen extends StatefulWidget {
  const PreferencesScreen({super.key, this.onboarding = false});

  /// True during sign-up (continues to the home screen); false when opened from the profile menu.
  final bool onboarding;

  @override
  State<PreferencesScreen> createState() => _PreferencesScreenState();
}

class _PreferencesScreenState extends State<PreferencesScreen> {
  final Set<String> _selected = {};
  List<String> _genres = [];
  bool _loading = true;
  bool _saving = false;
  String? _error;

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
      final genres = await ApiService.getGenres();
      List<String> mine = [];
      if (!widget.onboarding) {
        final user = await ApiService.getProfile();
        mine = [
          if (user['genres'] is List)
            for (final g in user['genres'] as List)
              if (g is String) g,
        ];
      }
      if (!mounted) return;
      setState(() {
        _genres = genres;
        _selected
          ..clear()
          ..addAll(mine.where(genres.contains));
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.message;
      });
    }
  }

  void _finish() {
    if (widget.onboarding) {
      Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const DiscoveryHomeScreen()), (route) => false);
    } else {
      Navigator.of(context).pop();
    }
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      await ApiService.updateProfile(genres: _selected.toList());
      if (!mounted) return;
      if (!widget.onboarding) showMessage(context, 'Preferences saved.');
      _finish();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      showMessage(context, e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: navyAppBar(
        'Favourite genres',
        showBack: !widget.onboarding,
        actions: [
          if (widget.onboarding)
            TextButton(
              onPressed: _saving ? null : _finish,
              child: const Text('Skip', style: TextStyle(color: Colors.white)),
            ),
        ],
      ),
      body: _loading
          ? const LoadingView()
          : _error != null
              ? Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    ErrorView(message: _error!, onRetry: _load),
                    if (widget.onboarding) TextButton(onPressed: _finish, child: const Text('Skip for now')),
                  ],
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(24, 24, 24, 8),
                      child: Text(
                        'Choose what you like. You can change this later from your profile.',
                        style: TextStyle(fontSize: 15, color: Colors.grey.shade700),
                      ),
                    ),
                    Expanded(
                      child: _genres.isEmpty
                          ? const EmptyView(icon: Icons.music_note_outlined, title: 'No genres are available yet')
                          : SingleChildScrollView(
                              padding: const EdgeInsets.all(24),
                              child: Wrap(
                                spacing: 10,
                                runSpacing: 10,
                                children: [
                                  for (final genre in _genres)
                                    FilterChip(
                                      label: Text(genre),
                                      selected: _selected.contains(genre),
                                      showCheckmark: true,
                                      selectedColor: AppColors.navy,
                                      checkmarkColor: Colors.white,
                                      labelStyle: TextStyle(color: _selected.contains(genre) ? Colors.white : Colors.black87),
                                      onSelected: (on) => setState(() => on ? _selected.add(genre) : _selected.remove(genre)),
                                    ),
                                ],
                              ),
                            ),
                    ),
                    SafeArea(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          children: [
                            ElevatedButton(
                              onPressed: _selected.isEmpty || _saving ? null : _save,
                              style: primaryButtonStyle(),
                              child: _saving
                                  ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                  : Text(_selected.isEmpty ? 'SELECT AT LEAST ONE' : 'SAVE (${_selected.length})'),
                            ),
                            if (widget.onboarding)
                              TextButton(onPressed: _saving ? null : _finish, child: const Text('Skip for now')),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
    );
  }
}
