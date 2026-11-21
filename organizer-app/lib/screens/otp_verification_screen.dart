import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../app_flow.dart';
import '../logic/role_routing.dart';
import '../logic/validators.dart';
import '../services/api.dart';
import '../services/api_client.dart';
import '../services/session.dart';
import '../widgets/common.dart';
import 'phone_login_screen.dart' show otpSendError, formatWait;

/// Step 2 of sign-in: the code is checked by the server, never on the device.
class OTPVerificationScreen extends StatefulWidget {
  const OTPVerificationScreen({
    super.key,
    required this.phone,
    required this.devMode,
    this.sentMessage = '',
    this.initialCooldown = 30,
  });

  final String phone;

  /// True only when the send response said `devMode: true`.
  final bool devMode;
  final String sentMessage;

  /// Seconds before "Resend" is offered (the server allows one send per 30 s).
  final int initialCooldown;

  @override
  State<OTPVerificationScreen> createState() => _OTPVerificationScreenState();
}

class _OTPVerificationScreenState extends State<OTPVerificationScreen> {
  final _codeController = TextEditingController();
  Timer? _timer;
  int _cooldown = 0;
  bool _verifying = false;
  bool _resending = false;
  late bool _devMode = widget.devMode;
  String? _error;
  String? _info;

  @override
  void initState() {
    super.initState();
    _startCooldown(widget.initialCooldown);
  }

  @override
  void dispose() {
    _timer?.cancel();
    _codeController.dispose();
    super.dispose();
  }

  void _startCooldown(int seconds) {
    _timer?.cancel();
    setState(() => _cooldown = seconds);
    if (seconds <= 0) return;
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      setState(() => _cooldown -= 1);
      if (_cooldown <= 0) timer.cancel();
    });
  }

  Future<void> _verify() async {
    final code = _codeController.text.trim();
    final problem = Validators.otp(code);
    if (problem != null) {
      setState(() => _error = problem);
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() {
      _verifying = true;
      _error = null;
      _info = null;
    });
    try {
      final result = await Api.verifyOtp(widget.phone, code);
      final token = (result['token'] ?? '').toString();
      if (token.isEmpty) {
        throw ApiException('The server did not return a session. Please try again.');
      }
      await Session.signIn(token: token, phone: (result['phone'] ?? widget.phone).toString());
      await AppFlow.routeFrom(SessionInfo.fromJson(result));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = _verifyError(e));
      if (e.statusCode == 429) _codeController.clear();
    } finally {
      if (mounted) setState(() => _verifying = false);
    }
  }

  String _verifyError(ApiException e) {
    if (e.statusCode == 400) {
      final left = e.body?['attemptsLeft'];
      if (left is num) {
        return '${e.message} (${left.toInt()} attempt${left == 1 ? '' : 's'} left)';
      }
      return e.message;
    }
    if (e.statusCode == 429) {
      final wait = e.retryAfterSeconds;
      return '${e.message}${wait != null ? ' Wait ${formatWait(wait)}, then' : ''} request a new code.';
    }
    return e.message; // 403 (suspended / blocked) and everything else: the server's words
  }

  Future<void> _resend() async {
    setState(() {
      _resending = true;
      _error = null;
      _info = null;
    });
    try {
      final sent = await Api.sendOtp(widget.phone);
      if (!mounted) return;
      setState(() {
        _devMode = sent['devMode'] == true;
        _info = (sent['message'] ?? 'A new code was sent.').toString();
      });
      _codeController.clear();
      _startCooldown(30);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = otpSendError(e));
      final wait = e.retryAfterSeconds;
      if (e.statusCode == 429 && wait != null) _startCooldown(wait);
    } finally {
      if (mounted) setState(() => _resending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(backgroundColor: Colors.white, foregroundColor: AppColors.navy, elevation: 0),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(child: Image.asset('assets/images/otp.png', height: 180)),
              const SizedBox(height: 20),
              const Text('Enter the code',
                  style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: AppColors.navy)),
              const SizedBox(height: 6),
              Text(
                widget.sentMessage.isNotEmpty ? widget.sentMessage : 'We sent a code to +91 ${widget.phone}.',
                style: const TextStyle(color: Colors.black54, height: 1.4),
              ),
              Text('Number: +91 ${widget.phone}', style: const TextStyle(color: Colors.black54)),
              if (_devMode) ...[
                const SizedBox(height: 12),
                const InfoBanner(
                  'Test server: no SMS is sent. Use the development code 1234.',
                  color: Colors.blue,
                  icon: Icons.developer_mode,
                ),
              ],
              if (_info != null) ...[const SizedBox(height: 12), InfoBanner(_info!, color: Colors.green)],
              const SizedBox(height: 20),
              TextField(
                controller: _codeController,
                autofocus: true,
                keyboardType: TextInputType.number,
                maxLength: 8,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 26, letterSpacing: 10, fontWeight: FontWeight.w600),
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                autofillHints: const [AutofillHints.oneTimeCode],
                onSubmitted: (_) => _verify(),
                decoration: fieldDecoration('One-time code').copyWith(counterText: '', errorText: _error),
              ),
              const SizedBox(height: 20),
              PrimaryButton(label: 'Verify', loading: _verifying, onPressed: _verify),
              const SizedBox(height: 12),
              Center(
                child: _cooldown > 0
                    ? Text('You can request a new code in ${formatWait(_cooldown)}',
                        style: const TextStyle(color: Colors.black54))
                    : TextButton(
                        onPressed: _resending || _verifying ? null : _resend,
                        child: Text(_resending ? 'Sending…' : 'Resend code',
                            style: const TextStyle(color: AppColors.navy, fontWeight: FontWeight.w600)),
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
