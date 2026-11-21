import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../services/api_client.dart';
import '../services/api_service.dart';
import '../services/session.dart';
import '../widgets/app_theme.dart';
import 'otp_verification_screen.dart';

class PhoneLoginScreen extends StatefulWidget {
  const PhoneLoginScreen({super.key, this.notice});

  /// A message to show on arrival, e.g. why the account was signed out.
  final String? notice;

  @override
  State<PhoneLoginScreen> createState() => _PhoneLoginScreenState();
}

class _PhoneLoginScreenState extends State<PhoneLoginScreen> {
  final TextEditingController _phoneController = TextEditingController();
  bool _isLoading = false;
  bool _rememberMe = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _error = widget.notice;
    _loadRemembered();
  }

  Future<void> _loadRemembered() async {
    final phone = await Session.rememberedPhone();
    if (!mounted || phone == null || phone.isEmpty) return;
    setState(() {
      _phoneController.text = phone;
      _rememberMe = true;
    });
  }

  String _messageFor(ApiException e) {
    if (e.statusCode == 429) {
      final wait = e.retryAfterSeconds;
      return wait == null ? e.message : '${e.message} You can try again in ${_waitText(wait)}.';
    }
    if (e.statusCode == 503) {
      return 'Sign-in by SMS is not available right now. Please try again later.';
    }
    return e.message;
  }

  static String _waitText(int seconds) {
    if (seconds < 60) return '$seconds seconds';
    final minutes = (seconds / 60).ceil();
    return '$minutes ${minutes == 1 ? 'minute' : 'minutes'}';
  }

  Future<void> _sendOtp() async {
    final phone = _phoneController.text.trim();
    if (!RegExp(r'^[1-9]\d{9}$').hasMatch(phone)) {
      setState(() => _error = 'Please enter a valid 10-digit mobile number.');
      return;
    }

    FocusScope.of(context).unfocus();
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final devMode = await ApiService.sendOtp(phone);
      // "Remember me" keeps only the phone number, to pre-fill this screen.
      await Session.setRememberedPhone(_rememberMe ? phone : null);
      if (!mounted) return;
      setState(() => _isLoading = false);
      Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => OTPVerificationScreen(phoneNumber: phone, devMode: devMode)),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _error = _messageFor(e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: navyAppBar('Sign in', showBack: false),
      body: GestureDetector(
        onTap: () => FocusScope.of(context).unfocus(),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Image.asset(
                  'assets/images/login.png',
                  height: 240,
                  fit: BoxFit.contain,
                  errorBuilder: (_, __, ___) => const Icon(Icons.phone_android, size: 80, color: AppColors.navy),
                ),
              ),
              const SizedBox(height: 24),
              const Text('Enter your phone number', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              Text('We will send a verification code by SMS.', style: TextStyle(fontSize: 16, color: Colors.grey.shade600)),
              const SizedBox(height: 24),
              TextField(
                controller: _phoneController,
                keyboardType: TextInputType.phone,
                autofillHints: const [AutofillHints.telephoneNumberNational],
                inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(10)],
                onSubmitted: (_) => _isLoading ? null : _sendOtp(),
                decoration: fieldDecoration('Mobile number', icon: Icons.phone, hint: '10-digit number').copyWith(prefixText: '+91 '),
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(_error!, style: const TextStyle(color: AppColors.danger)),
              ],
              const SizedBox(height: 8),
              CheckboxListTile(
                value: _rememberMe,
                onChanged: (value) => setState(() => _rememberMe = value ?? false),
                activeColor: AppColors.navy,
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                title: const Text('Remember my number on this phone'),
              ),
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: _isLoading ? null : _sendOtp,
                style: primaryButtonStyle(),
                child: _isLoading
                    ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('CONTINUE'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    _phoneController.dispose();
    super.dispose();
  }
}
