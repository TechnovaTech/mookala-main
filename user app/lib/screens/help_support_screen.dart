import 'package:flutter/material.dart';

import '../services/api_client.dart';
import '../services/api_service.dart';
import '../utils/formats.dart';
import '../utils/links.dart';
import '../widgets/app_theme.dart';
import '../widgets/state_views.dart';

/// Help and policies: the support contacts from `/public/platform` and the
/// published policies from `/public/policies`.
class HelpSupportScreen extends StatefulWidget {
  const HelpSupportScreen({super.key});

  @override
  State<HelpSupportScreen> createState() => _HelpSupportScreenState();
}

class _HelpSupportScreenState extends State<HelpSupportScreen> {
  PlatformInfo? _platform;
  List<Map<String, dynamic>> _policies = [];
  bool _loading = true;
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
      final platform = await ApiService.getPlatform();
      final policies = await ApiService.getPolicies();
      if (!mounted) return;
      setState(() {
        _platform = platform;
        _policies = policies;
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

  static String _policyName(String type) {
    switch (type) {
      case 'terms':
        return 'Terms of use';
      case 'privacy':
        return 'Privacy policy';
      case 'refund':
        return 'Refund policy';
      case 'cancellation':
        return 'Cancellation policy';
      case 'community':
        return 'Community guidelines';
      default:
        return type.replaceAll('_', ' ');
    }
  }

  Widget _heading(String text) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
        child: Text(text, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
      );

  @override
  Widget build(BuildContext context) {
    final p = _platform;
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: navyAppBar('Help and policies'),
      body: _loading
          ? const LoadingView()
          : _error != null || p == null
              ? ErrorView(message: _error ?? 'Help could not be loaded.', onRetry: _load)
              : ListView(
                  children: [
                    _heading('Contact support'),
                    if (p.supportEmail.isEmpty && p.supportPhone.isEmpty && p.supportAddress.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(horizontal: 16),
                        child: Text('Support contact details have not been published yet.'),
                      ),
                    if (p.supportEmail.isNotEmpty)
                      ListTile(
                        leading: const Icon(Icons.email_outlined),
                        title: Text(p.supportEmail),
                        subtitle: const Text('Send an email'),
                        onTap: () => openLink(context, Uri(scheme: 'mailto', path: p.supportEmail).toString()),
                      ),
                    if (p.supportPhone.isNotEmpty)
                      ListTile(
                        leading: const Icon(Icons.phone_outlined),
                        title: Text(p.supportPhone),
                        subtitle: const Text('Call'),
                        onTap: () => openLink(context, Uri(scheme: 'tel', path: p.supportPhone.replaceAll(' ', '')).toString()),
                      ),
                    if (p.supportAddress.isNotEmpty)
                      ListTile(leading: const Icon(Icons.location_on_outlined), title: Text(p.supportAddress)),
                    _heading('Policies'),
                    if (_policies.isEmpty && p.policyLinks.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(horizontal: 16),
                        child: Text('No policy has been published yet.'),
                      ),
                    for (final policy in _policies)
                      ListTile(
                        leading: const Icon(Icons.description_outlined),
                        title: Text((policy['title'] ?? '').toString().isNotEmpty ? policy['title'].toString() : _policyName((policy['type'] ?? '').toString())),
                        subtitle: (policy['version'] ?? '').toString().isEmpty ? null : Text('Version ${policy['version']}'),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => Navigator.push(
                          context,
                          MaterialPageRoute(builder: (_) => PolicyScreen(type: (policy['type'] ?? '').toString(), title: (policy['title'] ?? '').toString())),
                        ),
                      ),
                    // A policy that is only available as a web page.
                    for (final link in p.policyLinks.entries)
                      if (!_policies.any((policy) => policy['type'] == link.key))
                        ListTile(
                          leading: const Icon(Icons.open_in_new),
                          title: Text(_policyName(link.key)),
                          subtitle: const Text('Opens in your browser'),
                          onTap: () => openLink(context, link.value),
                        ),
                    const SizedBox(height: 24),
                  ],
                ),
    );
  }
}

/// The text of one published policy (`GET /public/policies/{type}`).
class PolicyScreen extends StatefulWidget {
  const PolicyScreen({super.key, required this.type, required this.title});
  final String type;
  final String title;

  @override
  State<PolicyScreen> createState() => _PolicyScreenState();
}

class _PolicyScreenState extends State<PolicyScreen> {
  Map<String, dynamic>? _policy;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _policy = null;
      _error = null;
    });
    try {
      final policy = await ApiService.getPolicy(widget.type);
      if (mounted) setState(() => _policy = policy);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.statusCode == 404 ? 'This policy is not published at the moment.' : e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final policy = _policy;
    final effective = policy == null ? '' : formatTimestamp(policy['effectiveDate']);
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: navyAppBar(widget.title.isEmpty ? 'Policy' : widget.title),
      body: _error != null
          ? ErrorView(message: _error!, onRetry: _load)
          : policy == null
              ? const LoadingView()
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Text((policy['title'] ?? widget.title).toString(), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 4),
                    Text(
                      [
                        if ((policy['version'] ?? '').toString().isNotEmpty) 'Version ${policy['version']}',
                        if (effective.isNotEmpty) 'Effective $effective',
                      ].join(' • '),
                      style: TextStyle(color: Colors.grey.shade600),
                    ),
                    const SizedBox(height: 16),
                    SelectableText((policy['body'] ?? '').toString(), style: const TextStyle(height: 1.5)),
                  ],
                ),
    );
  }
}
