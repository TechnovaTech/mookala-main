import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../services/api_client.dart';
import '../services/api_service.dart';
import '../services/session.dart';
import '../widgets/app_theme.dart';
import 'discovery_home_screen.dart';
import 'profile_screen.dart';

/// Gap the server enforces between two codes for one phone.
const int _resendGapSeconds = 30;

class OTPVerificationScreen extends StatefulWidget {
  const OTPVerificationScreen({super.key, required this.phoneNumber, required this.devMode});

  final String phoneNumber;

  /// True only when the send response said `devMode: true`.
  final bool devMode;

  @override
  State<OTPVerificationScreen> createState() => _OTPVerificationScreenState();
}

class _OTPVerificationScreenState extends State<OTPVerificationScreen> {
  final TextEditingController _codeController = TextEditingController();
  Timer? _timer;
  bool _isVerifying = false;
  bool _isResending = false;
  bool _mustRequestNewCode = false;
  late bool _devMode = widget.devMode;
  int _secondsLeft = _resendGapSeconds;
  String? _error;
  String? _info;

  @override
  void initState() {
    super.initState();
    _startCooldown(_resendGapSeconds);
  }

  void _startCooldown(int seconds) {
    _timer?.cancel();
    setState(() => _secondsLeft = seconds);
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return timer.cancel();
      setState(() => _secondsLeft = _secondsLeft > 0 ? _secondsLeft - 1 : 0);
      if (_secondsLeft == 0) timer.cancel();
    });
  }

  bool get _codeLooksComplete => RegExp(r'^\d{4,8}$').hasMatch(_codeController.text.trim());

  Future<void> _verify() async {
    final code = _codeController.text.trim();
    if (!_codeLooksComplete) {
      setState(() => _error = 'Enter the code from the SMS (4 to 8 digits).');
      return;
    }

    FocusScope.of(context).unfocus();
    setState(() {
      _isVerifying = true;
      _error = null;
      _info = null;
    });

    try {
      // 1. Check the code. The session token is stored as soon as this succeeds.
      if (!Session.isSignedIn || Session.phone != widget.phoneNumber) {
        await ApiService.verifyOtp(widget.phoneNumber, code);
      }
      // 2. Make sure the customer record exists and learn whether it is complete.
      final complete = await ApiService.ensureUserProfile();
      if (!mounted) return;
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => complete ? const DiscoveryHomeScreen() : const ProfileScreen()),
        (route) => false,
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      var message = e.message;
      var needNewCode = false;
      if (e.statusCode == 400 && e.attemptsLeft != null) {
        final left = e.attemptsLeft!;
        message = left > 0
            ? '${e.message}. $left ${left == 1 ? 'attempt' : 'attempts'} left.'
            : '${e.message}. Please request a new code.';
        needNewCode = left <= 0;
      } else if (e.statusCode == 429) {
        message = '${e.message} Please request a new code.';
        needNewCode = true;
      } else if (e.statusCode == 503) {
        message = 'Sign-in by SMS is not available right now. Please try again later.';
      }
      setState(() {
        _isVerifying = false;
        _error = message;
        _mustRequestNewCode = needNewCode;
        if (needNewCode) _codeController.clear();
      });
    }
  }

  Future<void> _resend() async {
    setState(() {
      _isResending = true;
      _error = null;
      _info = null;
    });
    try {
      final devMode = await ApiService.sendOtp(widget.phoneNumber);
      if (!mounted) return;
      setState(() {
        _isResending = false;
        _devMode = devMode;
        _mustRequestNewCode = false;
        _info = 'A new code has been sent.';
        _codeController.clear();
      });
      _startCooldown(_resendGapSeconds);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _isResending = false;
        _error = e.statusCode == 503 ? 'Sign-in by SMS is not available right now. Please try again later.' : e.message;
      });
      // The server says exactly how long to wait: count that down.
      final wait = e.retryAfterSeconds;
      if (e.statusCode == 429 && wait != null && wait > 0) _startCooldown(wait);
    }
  }

  String get _resendLabel {
    if (_secondsLeft <= 0) return 'Resend code';
    final m = _secondsLeft ~/ 60;
    final s = _secondsLeft % 60;
    return m > 0 ? 'Resend code in $m:${s.toString().padLeft(2, '0')}' : 'Resend code in ${s}s';
  }

  @override
  Widget build(BuildContext context) {
    final canResend = _secondsLeft <= 0 && !_isResending && !_isVerifying;
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: navyAppBar('Verify code'),
      body: GestureDetector(
        onTap: () => FocusScope.of(context).unfocus(),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Image.asset(
                  'assets/images/otp.png',
                  height: 200,
                  fit: BoxFit.contain,
                  errorBuilder: (_, __, ___) => const Icon(Icons.sms_outlined, size: 80, color: AppColors.navy),
                ),
              ),
              const SizedBox(height: 24),
              const Text('Enter the verification code', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              Text('Sent by SMS to +91 ${widget.phoneNumber}', style: TextStyle(fontSize: 16, color: Colors.grey.shade600)),
              if (_devMode) ...[
                const SizedBox(height: 12),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: Colors.amber.shade100, borderRadius: BorderRadius.circular(8)),
                  child: const Text('Test server: no SMS is sent. Use the code 1234.'),
                ),
              ],
              const SizedBox(height: 24),
              TextField(
                controller: _codeController,
                autofocus: true,
                enabled: !_isVerifying,
                keyboardType: TextInputType.number,
                autofillHints: const [AutofillHints.oneTimeCode],
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 26, letterSpacing: 8, fontWeight: FontWeight.w600),
                inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(8)],
                onChanged: (_) => setState(() {}),
                onSubmitted: (_) => _isVerifying || _mustRequestNewCode ? null : _verify(),
                decoration: fieldDecoration('Code', hint: '4 to 8 digits'),
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(_error!, style: const TextStyle(color: AppColors.danger)),
              ],
              if (_info != null) ...[
                const SizedBox(height: 12),
                Text(_info!, style: TextStyle(color: Colors.green.shade800)),
              ],
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: _isVerifying || _mustRequestNewCode || !_codeLooksComplete ? null : _verify,
                style: primaryButtonStyle(),
                child: _isVerifying
                    ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('VERIFY'),
              ),
              const SizedBox(height: 12),
              Center(
                child: TextButton(
                  onPressed: canResend ? _resend : null,
                  child: _isResending
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : Text(_resendLabel),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    _timer?.cancel();
    _codeController.dispose();
    super.dispose();
  }
}
