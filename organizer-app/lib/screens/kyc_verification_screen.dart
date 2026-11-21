import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../app_flow.dart';
import '../logic/validators.dart';
import '../services/api.dart';
import '../services/api_client.dart';
import '../services/session.dart';
import '../utils/image_utils.dart';
import '../widgets/common.dart';

/// KYC for the active role. What is shown depends on the server's status:
///   not_submitted  the form
///   pending        "under review"
///   rejected       the admin's notes and the form again
///   approved       done
class KYCVerificationScreen extends StatefulWidget {
  const KYCVerificationScreen({super.key, this.firstTime = false});

  /// Part of the signup flow (no back arrow; "Do this later" goes to the dashboard).
  final bool firstTime;

  @override
  State<KYCVerificationScreen> createState() => _KYCVerificationScreenState();
}

class _KYCVerificationScreenState extends State<KYCVerificationScreen> {
  final _formKey = GlobalKey<FormState>();
  final _aadhaar = TextEditingController();
  final _pan = TextEditingController();
  Uint8List? _aadhaarImage;
  Uint8List? _panImage;

  bool _loading = true;
  bool _submitting = false;
  String? _loadError;
  String _status = 'not_submitted';
  bool _canSubmit = true;
  String _rejectionNotes = '';
  String? _imageError;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _aadhaar.dispose();
    _pan.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final data = await Api.kycStatus();
      if (!mounted) return;
      setState(() {
        _status = (data['kycStatus'] ?? 'not_submitted').toString();
        _canSubmit = data['canSubmit'] == true;
        _rejectionNotes = (data['rejectionNotes'] ?? '').toString().trim();
        if (_aadhaar.text.isEmpty) _aadhaar.text = (data['aadharId'] ?? '').toString();
        if (_pan.text.isEmpty) _pan.text = (data['panId'] ?? '').toString();
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _loadError = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _pick(bool aadhaar) async {
    try {
      final bytes = await ImageUtils.pick();
      if (bytes == null || !mounted) return;
      final problem = ImageUtils.sizeProblem(bytes);
      if (problem != null) {
        showMessage(context, problem, error: true);
        return;
      }
      setState(() {
        if (aadhaar) {
          _aadhaarImage = bytes;
        } else {
          _panImage = bytes;
        }
        _imageError = null;
      });
    } catch (_) {
      if (mounted) showMessage(context, 'Could not open the photo. Check the photo permission and try again.', error: true);
    }
  }

  Future<void> _submit() async {
    final valid = _formKey.currentState!.validate();
    final resubmit = _status == 'rejected';
    // Documents are needed for a first submission; on a resubmission the
    // server keeps a photo that is not replaced.
    if (!resubmit && (_aadhaarImage == null || _panImage == null)) {
      setState(() => _imageError = 'Add a photo of both documents');
      return;
    }
    if (!valid) return;

    setState(() => _submitting = true);
    try {
      final result = await Api.submitKyc(
        aadharId: Validators.normaliseAadhaar(_aadhaar.text),
        panId: Validators.normalisePan(_pan.text),
        aadharImage: _aadhaarImage == null ? null : base64Encode(_aadhaarImage!),
        panImage: _panImage == null ? null : base64Encode(_panImage!),
        resubmit: resubmit,
      );
      if (!mounted) return;
      showMessage(context, (result['message'] ?? 'KYC documents submitted').toString());
      if (widget.firstTime) {
        await AppFlow.refreshAndRoute();
      } else {
        Navigator.pop(context, true);
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      showMessage(context, e.message, error: true); // includes the 413 "too large" and 409 "already approved" messages
      if (e.statusCode == 409) _load();
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _toDashboard() {
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => AppFlow.dashboardFor(Session.role ?? 'organizer')),
      (_) => false,
    );
  }

  Widget _documentTile(String label, Uint8List? image, VoidCallback onTap) {
    return InkWell(
      onTap: _submitting ? null : onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        height: 130,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: Colors.grey.shade400),
        ),
        clipBehavior: Clip.antiAlias,
        child: image != null
            ? Stack(
                fit: StackFit.expand,
                children: [
                  Image.memory(image, fit: BoxFit.cover),
                  Align(
                    alignment: Alignment.bottomCenter,
                    child: Container(
                      width: double.infinity,
                      color: Colors.black54,
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Text('$label · tap to change',
                          textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 12)),
                    ),
                  ),
                ],
              )
            : Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.add_a_photo_outlined, color: AppColors.navy, size: 30),
                  const SizedBox(height: 6),
                  Text(label, style: const TextStyle(color: AppColors.navy)),
                ],
              ),
      ),
    );
  }

  Widget _form() {
    final rejected = _status == 'rejected';
    return Form(
      key: _formKey,
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          if (rejected) ...[
            InfoBanner(
              _rejectionNotes.isEmpty
                  ? 'Your KYC was rejected. The reviewer did not leave a note. Please check your documents and submit again.'
                  : 'Your KYC was rejected. Reviewer\'s note: $_rejectionNotes',
              color: Colors.red,
              icon: Icons.cancel_outlined,
            ),
            const SizedBox(height: 16),
          ] else ...[
            const Text(
              'Mookalaa verifies every organiser and artist before they can use the app. '
              'Enter your Aadhaar and PAN numbers and add a clear photo of each document.',
              style: TextStyle(color: Colors.black54, height: 1.4),
            ),
            const SizedBox(height: 16),
          ],
          TextFormField(
            controller: _aadhaar,
            keyboardType: TextInputType.number,
            maxLength: 14,
            inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[\d\s]'))],
            decoration: fieldDecoration('Aadhaar number', hint: '12 digits', icon: Icons.badge_outlined)
                .copyWith(counterText: ''),
            validator: (v) => Validators.aadhaar(v ?? ''),
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _pan,
            textCapitalization: TextCapitalization.characters,
            maxLength: 10,
            inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[a-zA-Z0-9]'))],
            decoration: fieldDecoration('PAN', hint: 'ABCDE1234F', icon: Icons.credit_card).copyWith(counterText: ''),
            validator: (v) => Validators.pan(v ?? ''),
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(child: _documentTile('Aadhaar photo', _aadhaarImage, () => _pick(true))),
              const SizedBox(width: 12),
              Expanded(child: _documentTile('PAN photo', _panImage, () => _pick(false))),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            rejected
                ? 'Add new photos to replace the ones you sent before. A photo you do not replace is kept.'
                : 'Photos are resized before upload.',
            style: const TextStyle(color: Colors.black54, fontSize: 12),
          ),
          if (_imageError != null)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(_imageError!, style: TextStyle(color: Colors.red.shade700)),
            ),
          const SizedBox(height: 24),
          PrimaryButton(
            label: rejected ? 'Resubmit documents' : 'Submit for verification',
            loading: _submitting,
            onPressed: _submit,
          ),
          if (widget.firstTime) ...[
            const SizedBox(height: 8),
            Center(
              child: TextButton(
                onPressed: _submitting ? null : _toDashboard,
                child: const Text('Do this later', style: TextStyle(color: AppColors.navy)),
              ),
            ),
          ],
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    Widget body;
    if (_loading) {
      body = const LoadingView();
    } else if (_loadError != null) {
      body = StateView.error(_loadError!, onRetry: _load);
    } else if (_status == 'approved') {
      body = StateView(
        icon: Icons.verified,
        title: 'KYC approved',
        message: 'Your documents are verified.',
        actionLabel: widget.firstTime ? 'Continue' : null,
        onAction: widget.firstTime ? _toDashboard : null,
        color: Colors.green,
      );
    } else if (_status == 'pending' || !_canSubmit) {
      body = RefreshIndicator(
        onRefresh: _load,
        child: StateView(
          icon: Icons.hourglass_top,
          title: 'KYC under review',
          message: 'Your documents were submitted and are waiting for review by the Mookalaa team. '
              'Pull down to check again.',
          actionLabel: widget.firstTime ? 'Continue' : 'Check again',
          onAction: widget.firstTime ? _toDashboard : _load,
          color: Colors.orange,
        ),
      );
    } else {
      body = _form();
    }
    return Scaffold(
      appBar: appBar('KYC verification', showBack: !widget.firstTime),
      body: SafeArea(child: body),
    );
  }
}
