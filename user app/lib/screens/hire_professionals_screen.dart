import 'package:flutter/material.dart';

import '../services/api_client.dart';
import '../services/api_service.dart';
import '../utils/links.dart';
import '../widgets/app_image.dart';
import '../widgets/app_theme.dart';
import '../widgets/state_views.dart';

/// Photographers or videographers from `/professionals`, with a request form
/// that posts to `/hire-requests`.
class HireProfessionalsScreen extends StatefulWidget {
  const HireProfessionalsScreen({super.key, required this.type});

  /// 'photographer' or 'videographer'
  final String type;

  @override
  State<HireProfessionalsScreen> createState() => _HireProfessionalsScreenState();
}

class _HireProfessionalsScreenState extends State<HireProfessionalsScreen> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _pros = [];

  String get _noun => widget.type == 'videographer' ? 'videographer' : 'photographer';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await ApiService.getProfessionals(widget.type);
      if (!mounted) return;
      setState(() {
        _pros = list;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.message;
      });
    }
  }

  Future<void> _openForm(Map<String, dynamic> pro) async {
    final sent = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _HireForm(pro: pro, type: widget.type),
    );
    if (sent != null && mounted) showMessage(context, sent);
  }

  String _s(Map<String, dynamic> pro, String key) => pro[key] is String ? (pro[key] as String).trim() : (pro[key]?.toString() ?? '');

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey.shade100,
      appBar: navyAppBar('Hire a $_noun'),
      body: _loading
          ? const LoadingView()
          : _error != null
              ? ErrorView(message: _error!, onRetry: _load)
              : RefreshIndicator(
                  onRefresh: _load,
                  child: _pros.isEmpty
                      ? ListView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          children: [
                            const SizedBox(height: 80),
                            EmptyView(icon: Icons.camera_alt_outlined, title: 'No ${_noun}s are listed yet', subtitle: 'Please check again later.'),
                          ],
                        )
                      : ListView.separated(
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: const EdgeInsets.all(16),
                          itemCount: _pros.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 12),
                          itemBuilder: (context, i) {
                            final pro = _pros[i];
                            final facts = [
                              if (_s(pro, 'city').isNotEmpty) _s(pro, 'city'),
                              if (_s(pro, 'experience').isNotEmpty) '${_s(pro, 'experience')} experience',
                              if (_s(pro, 'price').isNotEmpty) _s(pro, 'price'),
                            ];
                            return Card(
                              margin: EdgeInsets.zero,
                              color: Colors.white,
                              surfaceTintColor: Colors.white,
                              child: Padding(
                                padding: const EdgeInsets.all(16),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        AppAvatar(_s(pro, 'image'), radius: 28),
                                        const SizedBox(width: 12),
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            children: [
                                              Text(_s(pro, 'name').isEmpty ? 'Professional' : _s(pro, 'name'),
                                                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                                              if (facts.isNotEmpty) Text(facts.join(' • '), style: TextStyle(color: Colors.grey.shade700)),
                                            ],
                                          ),
                                        ),
                                      ],
                                    ),
                                    if (_s(pro, 'bio').isNotEmpty) ...[
                                      const SizedBox(height: 10),
                                      Text(_s(pro, 'bio'), maxLines: 4, overflow: TextOverflow.ellipsis),
                                    ],
                                    const SizedBox(height: 12),
                                    Row(
                                      children: [
                                        if (_s(pro, 'portfolio').isNotEmpty)
                                          Expanded(
                                            child: OutlinedButton(
                                              onPressed: () => openLink(context, _s(pro, 'portfolio')),
                                              child: const Text('Portfolio'),
                                            ),
                                          ),
                                        if (_s(pro, 'portfolio').isNotEmpty) const SizedBox(width: 12),
                                        Expanded(
                                          child: ElevatedButton(
                                            onPressed: () => _openForm(pro),
                                            style: ElevatedButton.styleFrom(backgroundColor: AppColors.navy, foregroundColor: Colors.white),
                                            child: const Text('Send request'),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                            );
                          },
                        ),
                ),
    );
  }
}

class _HireForm extends StatefulWidget {
  const _HireForm({required this.pro, required this.type});
  final Map<String, dynamic> pro;
  final String type;

  @override
  State<_HireForm> createState() => _HireFormState();
}

class _HireFormState extends State<_HireForm> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  late final _city = TextEditingController(text: (widget.pro['city'] ?? '').toString());
  final _message = TextEditingController();
  DateTime? _date;
  bool _sending = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    // Pre-fill the customer's own name; a failure just leaves the field empty.
    ApiService.getProfile().then((user) {
      if (mounted && _name.text.isEmpty) _name.text = (user['name'] ?? '').toString();
    }).catchError((Object _) {});
  }

  @override
  void dispose() {
    _name.dispose();
    _city.dispose();
    _message.dispose();
    super.dispose();
  }

  String get _dateText {
    final d = _date;
    if (d == null) return '';
    return '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  }

  Future<void> _send() async {
    if (!_formKey.currentState!.validate()) return;
    if (_date == null) {
      setState(() => _error = 'Please choose the date of your event.');
      return;
    }
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final message = await ApiService.createHireRequest(
        professionalId: (widget.pro['_id'] ?? '').toString(),
        professionalName: (widget.pro['name'] ?? '').toString(),
        type: widget.type,
        userName: _name.text.trim(),
        eventDate: _dateText,
        city: _city.text.trim(),
        message: _message.text.trim(),
      );
      if (mounted) Navigator.of(context).pop(message);
    } on ApiException catch (e) {
      // The sheet stays open with what was typed, and says the request was not sent.
      if (mounted) {
        setState(() {
          _sending = false;
          _error = 'Your request was not sent. ${e.message}';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(left: 20, right: 20, top: 20, bottom: MediaQuery.of(context).viewInsets.bottom + 20),
      child: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Request ${(widget.pro['name'] ?? '').toString()}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppColors.navy)),
              const SizedBox(height: 4),
              Text('The Mookalaa team will contact you about this request.', style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
              const SizedBox(height: 16),
              TextFormField(
                controller: _name,
                textCapitalization: TextCapitalization.words,
                decoration: fieldDecoration('Your name'),
                validator: (v) => (v ?? '').trim().isEmpty ? 'Please enter your name' : null,
              ),
              const SizedBox(height: 12),
              InkWell(
                onTap: () async {
                  final now = DateTime.now();
                  final picked = await showDatePicker(
                    context: context,
                    firstDate: DateTime(now.year, now.month, now.day),
                    lastDate: DateTime(now.year + 2, now.month, now.day),
                    initialDate: _date ?? now,
                  );
                  if (picked != null) setState(() => _date = picked);
                },
                child: InputDecorator(
                  decoration: fieldDecoration('Event date', icon: Icons.calendar_today),
                  child: Text(_date == null ? 'Choose a date' : _dateText),
                ),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _city,
                textCapitalization: TextCapitalization.words,
                decoration: fieldDecoration('City'),
                validator: (v) => (v ?? '').trim().isEmpty ? 'Please enter the city' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(controller: _message, maxLines: 3, maxLength: 2000, decoration: fieldDecoration('What do you need?')),
              if (_error != null) Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(_error!, style: const TextStyle(color: AppColors.danger))),
              ElevatedButton(
                onPressed: _sending ? null : _send,
                style: primaryButtonStyle(),
                child: _sending
                    ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('SEND REQUEST'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
