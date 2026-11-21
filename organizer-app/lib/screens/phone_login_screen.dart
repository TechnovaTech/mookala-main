import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../logic/validators.dart';
import '../services/api.dart';
import '../services/api_client.dart';
import '../widgets/common.dart';
import 'otp_verification_screen.dart';
import 'staff_login_screen.dart';

/// Step 1 of sign-in: the phone number. The server sends the code.
class PhoneLoginScreen extends StatefulWidget {
  const PhoneLoginScreen({super.key, this.notice});

  /// Shown once at the top, for example after a session expired.
  final String? notice;

  @override
  State<PhoneLoginScreen> createState() => _PhoneLoginScreenState();
}

class _PhoneLoginScreenState extends State<PhoneLoginScreen> {
  final _phoneController = TextEditingController();
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    _phoneController.dispose();
    super.dispose();
  }

  Future<void> _sendCode() async {
    final phone = Validators.normalisePhone(_phoneController.text);
    if (phone == null) {
      setState(() => _error = 'Enter a valid 10-digit mobile number');
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final sent = await Api.sendOtp(phone);
      if (!mounted) return;
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => OTPVerificationScreen(
            phone: phone,
            devMode: sent['devMode'] == true,
            sentMessage: (sent['message'] ?? '').toString(),
          ),
        ),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      // A code was sent moments ago: let the user enter it instead of blocking.
      if (e.statusCode == 429 && e.retryAfterSeconds != null) {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => OTPVerificationScreen(
              phone: phone,
              devMode: false,
              sentMessage: e.message,
              initialCooldown: e.retryAfterSeconds!,
            ),
          ),
        );
      } else {
        setState(() => _error = otpSendError(e));
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 12),
              Center(child: Image.asset('assets/images/login.png', height: 210)),
              const SizedBox(height: 24),
              const Text('Sign in',
                  style: TextStyle(fontSize: 26, fontWeight: FontWeight.bold, color: AppColors.navy)),
              const SizedBox(height: 6),
              const Text('For organisers and artists. We will send a one-time code to your mobile number.',
                  style: TextStyle(color: Colors.black54, height: 1.4)),
              const SizedBox(height: 20),
              if (widget.notice != null) ...[InfoBanner(widget.notice!), const SizedBox(height: 16)],
              TextField(
                controller: _phoneController,
                keyboardType: TextInputType.phone,
                maxLength: 10,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                onSubmitted: (_) => _sendCode(),
                decoration: fieldDecoration('Mobile number', icon: Icons.phone).copyWith(
                  prefixText: '+91 ',
                  counterText: '',
                  errorText: _error,
                ),
              ),
              const SizedBox(height: 20),
              PrimaryButton(label: 'Send code', loading: _sending, onPressed: _sendCode),
              const SizedBox(height: 28),
              const Divider(),
              Center(
                child: TextButton.icon(
                  onPressed: () => Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => const StaffLoginScreen()),
                  ),
                  icon: const Icon(Icons.qr_code_scanner, color: AppColors.navy),
                  label: const Text('Gate staff login', style: TextStyle(color: AppColors.navy)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A clear sentence for a failed `POST /public/otp/send`.
String otpSendError(ApiException e) {
  if (e.statusCode == 429) {
    final wait = e.retryAfterSeconds;
    return wait == null ? e.message : '${e.message} Try again in ${formatWait(wait)}.';
  }
  if (e.statusCode == 503) {
    return 'Sign-in codes cannot be sent right now (the SMS service is not available). ${e.message}';
  }
  return e.message;
}

String formatWait(int seconds) {
  if (seconds < 60) return '$seconds second${seconds == 1 ? '' : 's'}';
  final minutes = (seconds / 60).ceil();
  return '$minutes minute${minutes == 1 ? '' : 's'}';
}
