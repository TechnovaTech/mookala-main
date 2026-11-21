import 'package:flutter/material.dart';

import '../widgets/common.dart';
import 'event_media_upload_screen.dart';

/// Step 2 of creating an event: description, terms and the photography contact.
class EventDetailsScreen extends StatefulWidget {
  const EventDetailsScreen({super.key, required this.eventData, this.venue});

  final Map<String, dynamic> eventData;

  /// The venue picked in step 1 (with its seating plan), when it came from the list.
  final Map<String, dynamic>? venue;

  @override
  State<EventDetailsScreen> createState() => _EventDetailsScreenState();
}

class _EventDetailsScreenState extends State<EventDetailsScreen> {
  final _formKey = GlobalKey<FormState>();
  final _description = TextEditingController();
  final _terms = TextEditingController();
  final _photography = TextEditingController();

  @override
  void dispose() {
    _description.dispose();
    _terms.dispose();
    _photography.dispose();
    super.dispose();
  }

  void _continue() {
    if (!_formKey.currentState!.validate()) return;
    final data = Map<String, dynamic>.from(widget.eventData)
      ..['description'] = _description.text.trim()
      ..['terms'] = _terms.text.trim()
      ..['photographyContact'] = _photography.text.trim();
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => EventMediaUploadScreen(eventData: data, venue: widget.venue)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: appBar('Create event · 2 of 4'),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const SectionTitle('About the event'),
              TextFormField(
                controller: _description,
                maxLines: 6,
                maxLength: 5000,
                decoration: fieldDecoration('Description *', hint: 'What will happen, who performs, what to expect'),
                validator: (v) => (v ?? '').trim().length < 20 ? 'Write at least a couple of sentences (20 characters)' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _terms,
                maxLines: 4,
                maxLength: 5000,
                decoration: fieldDecoration('Terms & conditions (optional)', hint: 'Entry rules, age limits, what is not allowed'),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _photography,
                maxLength: 200,
                decoration: fieldDecoration('Photography contact (optional)',
                        hint: 'Name and phone of the photographer', icon: Icons.camera_alt_outlined)
                    .copyWith(counterText: ''),
                validator: (v) => null,
              ),
              const SizedBox(height: 20),
              PrimaryButton(label: 'Continue', onPressed: _continue),
            ],
          ),
        ),
      ),
    );
  }
}
