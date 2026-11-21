import 'package:flutter/material.dart';

import '../app_flow.dart';
import '../logic/role_routing.dart';
import '../services/api_client.dart';
import '../services/session.dart';
import '../widgets/common.dart';

/// Choose which role to use. Lists the roles the phone already holds, the
/// ones it can still register for, and explains any suspended role.
class RoleSelectionScreen extends StatefulWidget {
  const RoleSelectionScreen({super.key, required this.info, this.notice, this.switching = false});

  final SessionInfo info;
  final String? notice;

  /// Opened from "Switch role" in a profile screen (shows a back arrow).
  final bool switching;

  @override
  State<RoleSelectionScreen> createState() => _RoleSelectionScreenState();
}

class _RoleSelectionScreenState extends State<RoleSelectionScreen> {
  String? _busyRole;

  static const _titles = {'organizer': 'Organiser', 'artist': 'Artist'};
  static const _descriptions = {
    'organizer': 'Create events, sell tickets and scan them at the gate.',
    'artist': 'Receive booking requests, manage your profile and followers.',
  };
  static const _icons = {'organizer': Icons.event, 'artist': Icons.music_note};

  Future<void> _choose(String role) async {
    setState(() => _busyRole = role);
    try {
      await AppFlow.useRole(role, widget.info);
    } on ApiException catch (e) {
      if (!mounted) return;
      showMessage(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _busyRole = null);
    }
  }

  Widget _roleCard(String role) {
    final info = widget.info;
    final restriction = info.restrictions[role];
    final profile = info.profiles[role];
    final isActive = widget.switching && Session.role == role;

    String status;
    if (restriction != null) {
      status = restriction;
    } else if (profile == null) {
      status = 'Not registered yet. Tap to register this phone as ${_titles[role]!.toLowerCase()}.';
    } else if (profileIncomplete(profile)) {
      status = 'Registration not finished. Tap to continue.';
    } else {
      final name = (profile['name'] ?? '').toString();
      final kyc = (profile['kycStatus'] ?? 'not_submitted').toString();
      const kycText = {
        'not_submitted': 'KYC not submitted',
        'pending': 'KYC under review',
        'approved': 'KYC approved',
        'rejected': 'KYC rejected',
      };
      status = '$name · ${kycText[kyc] ?? kyc}${isActive ? ' · in use' : ''}';
    }

    final disabled = restriction != null || _busyRole != null;
    return Card(
      margin: const EdgeInsets.only(bottom: 14),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: isActive ? AppColors.navy : Colors.transparent, width: 1.5),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        enabled: restriction == null,
        leading: CircleAvatar(
          backgroundColor: restriction != null ? Colors.grey.shade300 : AppColors.navy,
          child: Icon(restriction != null ? Icons.block : _icons[role], color: Colors.white),
        ),
        title: Text(_titles[role]!, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 17)),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text('${_descriptions[role]}\n$status',
              style: TextStyle(color: restriction != null ? Colors.red.shade700 : Colors.black54, height: 1.35)),
        ),
        isThreeLine: true,
        trailing: _busyRole == role
            ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5))
            : const Icon(Icons.chevron_right),
        onTap: disabled ? null : () => _choose(role),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final hasAny = widget.info.roles.isNotEmpty;
    return Scaffold(
      appBar: appBar(widget.switching ? 'Switch role' : 'Choose your role', showBack: widget.switching),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text(
              hasAny
                  ? 'This phone number (+91 ${Session.phone ?? ''}) can be used as:'
                  : 'How do you want to use Mookalaa with +91 ${Session.phone ?? ''}?',
              style: const TextStyle(fontSize: 15, color: Colors.black87, height: 1.4),
            ),
            const SizedBox(height: 16),
            if (widget.notice != null) ...[InfoBanner(widget.notice!, color: Colors.red), const SizedBox(height: 16)],
            for (final role in appRoles) _roleCard(role),
            if (!widget.switching)
              Center(
                child: TextButton(
                  onPressed: _busyRole != null ? null : () => AppFlow.signOut(),
                  child: const Text('Use a different number', style: TextStyle(color: AppColors.navy)),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
