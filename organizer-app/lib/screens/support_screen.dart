import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../services/api.dart';
import '../services/api_client.dart';
import '../widgets/common.dart';

/// Help & Support: the contacts and policy links published by the backend
/// (`GET /public/platform`). Nothing here is hardcoded.
class SupportScreen extends StatefulWidget {
  const SupportScreen({super.key});

  @override
  State<SupportScreen> createState() => _SupportScreenState();
}

class _SupportScreenState extends State<SupportScreen> {
  late Future<Map<String, dynamic>> _future = Api.platform();

  void _reload() => setState(() => _future = Api.platform());

  Widget _row(BuildContext context, IconData icon, String label, String value) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        leading: Icon(icon, color: AppColors.navy),
        title: Text(label, style: const TextStyle(fontSize: 13, color: Colors.black54)),
        subtitle: SelectableText(value, style: const TextStyle(fontSize: 16, color: Colors.black87)),
        trailing: IconButton(
          tooltip: 'Copy',
          icon: const Icon(Icons.copy, size: 20),
          onPressed: () async {
            await Clipboard.setData(ClipboardData(text: value));
            if (context.mounted) showMessage(context, '$label copied');
          },
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: appBar('Help & Support'),
      body: FutureBuilder<Map<String, dynamic>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) return const LoadingView();
          if (snapshot.hasError) {
            final error = snapshot.error;
            return StateView.error(error is ApiException ? error.message : 'Could not load the support contacts.',
                onRetry: _reload);
          }
          final data = snapshot.data ?? {};
          final support = data['support'] is Map ? Map<String, dynamic>.from(data['support'] as Map) : <String, dynamic>{};
          final links = data['policyLinks'] is Map ? Map<String, dynamic>.from(data['policyLinks'] as Map) : <String, dynamic>{};
          String text(dynamic v) => (v ?? '').toString().trim();

          final rows = <Widget>[
            if (text(support['email']).isNotEmpty) _row(context, Icons.email_outlined, 'Email', text(support['email'])),
            if (text(support['phone']).isNotEmpty) _row(context, Icons.phone_outlined, 'Phone', text(support['phone'])),
            if (text(support['address']).isNotEmpty)
              _row(context, Icons.location_on_outlined, 'Address', text(support['address'])),
          ];
          const linkLabels = {
            'terms': 'Terms of use',
            'privacy': 'Privacy policy',
            'refund': 'Refund policy',
            'cancellation': 'Cancellation policy',
          };
          final linkRows = <Widget>[
            for (final entry in linkLabels.entries)
              if (text(links[entry.key]).isNotEmpty) _row(context, Icons.link, entry.value, text(links[entry.key])),
          ];

          if (rows.isEmpty && linkRows.isEmpty) {
            return const StateView(
              icon: Icons.support_agent,
              title: 'No support contacts yet',
              message: 'Mookalaa has not published its support contacts. Please check again later.',
            );
          }
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (rows.isNotEmpty) ...[
                SectionTitle('Contact ${text(data['name']).isEmpty ? 'Mookalaa' : text(data['name'])}'),
                ...rows,
              ],
              if (linkRows.isNotEmpty) ...[const SizedBox(height: 12), const SectionTitle('Policies'), ...linkRows],
            ],
          );
        },
      ),
    );
  }
}
