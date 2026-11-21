import 'package:flutter/material.dart';

import '../logic/event_logic.dart';
import '../services/api.dart';
import '../services/api_client.dart';
import '../widgets/common.dart';
import 'jatra_registration_screen.dart';

/// The organiser's Jatra registrations with their review status.
class JatraListScreen extends StatefulWidget {
  const JatraListScreen({super.key, this.embedded = false});

  /// Shown as a dashboard tab: no Scaffold or AppBar of its own.
  final bool embedded;

  @override
  State<JatraListScreen> createState() => _JatraListScreenState();
}

class _JatraListScreenState extends State<JatraListScreen> {
  List<Map<String, dynamic>>? _jatras;
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = _jatras == null;
      _error = null;
    });
    try {
      final jatras = await Api.myJatras();
      if (!mounted) return;
      setState(() => _jatras = jatras);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _register() async {
    final created = await Navigator.push<bool>(
      context,
      MaterialPageRoute(builder: (_) => const JatraRegistrationScreen()),
    );
    if (created == true && mounted) _load();
  }

  static String _text(dynamic value) => (value ?? '').toString().trim();

  static List<String> _names(dynamic value) =>
      value is List ? value.map(_text).where((e) => e.isNotEmpty).toList() : <String>[];

  /// Dates are stored as "YYYY-MM-DD" by this build; older rows hold "d/m/yyyy".
  static String _when(Map<String, dynamic> jatra) {
    final date = _text(jatra['date']);
    final time = _text(jatra['time']);
    final shown = date.isEmpty ? 'Date not set' : EventLogic.displayDate(date);
    return time.isEmpty ? shown : '$shown, $time';
  }

  Widget _statusChip(String status) {
    final MaterialColor color;
    final String label;
    switch (status) {
      case 'approved':
        color = Colors.green;
        label = 'Approved';
        break;
      case 'rejected':
        color = Colors.red;
        label = 'Rejected';
        break;
      default:
        color = Colors.orange;
        label = 'Waiting for approval';
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.shade50,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.shade200),
      ),
      child: Text(label, style: TextStyle(color: color.shade800, fontSize: 12, fontWeight: FontWeight.w600)),
    );
  }

  Widget _card(Map<String, dynamic> jatra) {
    final status = _text(jatra['status']);
    final reason = _text(jatra['rejectionReason']);
    final description = _text(jatra['description']);
    final artists = _names(jatra['artists']);
    final committee = _names(jatra['committeeMembers']);
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(_text(jatra['name']).isEmpty ? 'Untitled Jatra' : _text(jatra['name']),
                      style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: AppColors.navy)),
                ),
                const SizedBox(width: 8),
                _statusChip(status),
              ],
            ),
            const SizedBox(height: 8),
            Row(children: [
              const Icon(Icons.schedule, size: 16, color: Colors.black54),
              const SizedBox(width: 6),
              Expanded(child: Text(_when(jatra), style: const TextStyle(color: Colors.black87))),
            ]),
            if (_text(jatra['venue']).isNotEmpty) ...[
              const SizedBox(height: 4),
              Row(children: [
                const Icon(Icons.place_outlined, size: 16, color: Colors.black54),
                const SizedBox(width: 6),
                Expanded(child: Text(_text(jatra['venue']), style: const TextStyle(color: Colors.black87))),
              ]),
            ],
            if (description.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(description, style: const TextStyle(color: Colors.black54, height: 1.35)),
            ],
            if (artists.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text('Artists: ${artists.join(', ')}', style: const TextStyle(color: Colors.black87)),
            ],
            if (committee.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text('Committee: ${committee.join(', ')}', style: const TextStyle(color: Colors.black87)),
            ],
            if (status == 'rejected') ...[
              const SizedBox(height: 10),
              InfoBanner(
                reason.isEmpty ? 'Rejected. The reviewer did not give a reason.' : 'Reason for rejection: $reason',
                color: Colors.red,
                icon: Icons.cancel_outlined,
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _registerButton() => Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
        child: PrimaryButton(label: 'Register a Jatra', icon: Icons.add, onPressed: _register),
      );

  Widget _body() {
    final jatras = _jatras;
    final Widget content;
    if (_loading) {
      content = const LoadingView();
    } else if (jatras == null) {
      content = StateView.error(_error ?? 'Could not load your Jatra registrations.', onRetry: _load);
    } else if (jatras.isEmpty) {
      content = RefreshIndicator(
        onRefresh: _load,
        child: const StateView(
          icon: Icons.festival_outlined,
          title: 'No Jatra registered yet',
          message: 'Register a Jatra and follow its approval status here.',
        ),
      );
    } else {
      content = RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          children: [
            if (_error != null) ...[InfoBanner('Could not refresh: $_error'), const SizedBox(height: 12)],
            for (final jatra in jatras) _card(jatra),
          ],
        ),
      );
    }
    return Column(children: [_registerButton(), Expanded(child: content)]);
  }

  @override
  Widget build(BuildContext context) {
    if (widget.embedded) return _body();
    return Scaffold(appBar: appBar('Jatra registrations'), body: SafeArea(child: _body()));
  }
}
