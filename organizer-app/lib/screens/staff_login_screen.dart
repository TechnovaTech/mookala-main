import 'package:flutter/material.dart';

import '../services/api.dart';
import '../services/api_client.dart';
import '../services/session.dart';
import '../widgets/common.dart';
import 'staff_dashboard_screen.dart';

/// Gate staff sign in with the email and password the organiser gave them.
class StaffLoginScreen extends StatefulWidget {
  const StaffLoginScreen({super.key});

  @override
  State<StaffLoginScreen> createState() => _StaffLoginScreenState();
}

class _StaffLoginScreenState extends State<StaffLoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _hidePassword = true;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await Api.staffLogin(_email.text.trim(), _password.text);
      final event = data['event'];
      if (event is! Map || (event['_id'] ?? '').toString().isEmpty) {
        throw ApiException('The server did not return the event for this login. Please try again.');
      }
      final eventData = Map<String, dynamic>.from(event);
      eventData['_id'] = eventData['_id'].toString();
      final staffData = data['staff'] is Map ? Map<String, dynamic>.from(data['staff'] as Map) : <String, dynamic>{};
      await Session.saveStaff(eventData, staffData);
      if (!mounted) return;
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => StaffDashboardScreen(eventData: eventData, staffData: staffData)),
        (_) => false,
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        if (e.statusCode == 401) {
          _error = 'Wrong email or password. Use the login the event organiser gave you.';
        } else if (e.isNetwork) {
          _error = e.message;
        } else {
          _error = 'Could not sign in because of a server problem (${e.message}). '
              'Your email and password were not checked. Please try again.';
        }
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: appBar('Gate staff login'),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: [
              const SizedBox(height: 12),
              const Icon(Icons.qr_code_scanner, size: 72, color: AppColors.navy),
              const SizedBox(height: 12),
              const Text(
                'Sign in with the email and password the event organiser created for you.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.black54, height: 1.4),
              ),
              const SizedBox(height: 24),
              if (_error != null) ...[InfoBanner(_error!, color: Colors.red, icon: Icons.error_outline), const SizedBox(height: 16)],
              TextFormField(
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                autocorrect: false,
                textInputAction: TextInputAction.next,
                decoration: fieldDecoration('Email', icon: Icons.email),
                validator: (v) => (v ?? '').trim().isEmpty ? 'Enter your email' : null,
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _password,
                obscureText: _hidePassword,
                onFieldSubmitted: (_) => _login(),
                decoration: fieldDecoration(
                  'Password',
                  icon: Icons.lock,
                  suffix: IconButton(
                    tooltip: _hidePassword ? 'Show password' : 'Hide password',
                    icon: Icon(_hidePassword ? Icons.visibility : Icons.visibility_off),
                    onPressed: () => setState(() => _hidePassword = !_hidePassword),
                  ),
                ),
                validator: (v) => (v ?? '').isEmpty ? 'Enter your password' : null,
              ),
              const SizedBox(height: 24),
              PrimaryButton(label: 'Sign in', loading: _loading, onPressed: _login),
            ],
          ),
        ),
      ),
    );
  }
}
