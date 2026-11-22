import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../services/api_client.dart';
import '../../widgets/app_theme.dart';
import 'referral_api.dart';

/// "Have a friend's code?": a text field and a button that enters the code
/// once. [onClaimed] receives the server's message.
class ReferralClaimField extends StatefulWidget {
  const ReferralClaimField({super.key, required this.onClaimed, this.buttonLabel = 'Apply'});

  final ValueChanged<String> onClaimed;
  final String buttonLabel;

  @override
  State<ReferralClaimField> createState() => _ReferralClaimFieldState();
}

class _ReferralClaimFieldState extends State<ReferralClaimField> {
  final TextEditingController _code = TextEditingController();
  bool _busy = false;
  String? _error;

  Future<void> _submit() async {
    final code = _code.text.trim().toUpperCase();
    if (code.isEmpty) {
      setState(() => _error = 'Enter your friend\'s code.');
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final message = await ReferralApi.claim(code);
      if (!mounted) return;
      setState(() => _busy = false);
      widget.onClaimed(message);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = e.message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: TextField(
                key: const Key('referral-claim-input'),
                controller: _code,
                textCapitalization: TextCapitalization.characters,
                inputFormatters: [LengthLimitingTextInputFormatter(12)],
                decoration: const InputDecoration(labelText: 'Friend\'s referral code', border: OutlineInputBorder(), isDense: true),
                onSubmitted: (_) => _submit(),
              ),
            ),
            const SizedBox(width: 8),
            OutlinedButton(
              key: const Key('referral-claim-apply'),
              onPressed: _busy ? null : _submit,
              child: _busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : Text(widget.buttonLabel),
            ),
          ],
        ),
        if (_error != null) ...[
          const SizedBox(height: 8),
          Text(_error!, key: const Key('referral-claim-error'), style: const TextStyle(color: AppColors.danger, fontSize: 13)),
        ],
      ],
    );
  }

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }
}
