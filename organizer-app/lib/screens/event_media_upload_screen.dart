import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../logic/validators.dart';
import '../utils/image_utils.dart';
import '../widgets/common.dart';
import 'add_tickets_screen.dart';

/// Step 3 of creating an event: the banner, extra photos and a video link.
///
/// Photos travel inside the event document as base64. Each one is resized on
/// pick (1280 px, JPEG quality 80) and must stay under the server limit of
/// about 1.5 MB; the whole event may be at most 12 MB, so the screen stops at
/// [maxPhotos] photos and [maxTotalChars] of encoded data.
class EventMediaUploadScreen extends StatefulWidget {
  const EventMediaUploadScreen({super.key, required this.eventData, this.venue});

  final Map<String, dynamic> eventData;
  final Map<String, dynamic>? venue;

  static const int maxPhotos = 6;
  static const int maxTotalChars = 9000000;

  @override
  State<EventMediaUploadScreen> createState() => _EventMediaUploadScreenState();
}

class _EventMediaUploadScreenState extends State<EventMediaUploadScreen> {
  final _formKey = GlobalKey<FormState>();
  final _video = TextEditingController();
  Uint8List? _banner;
  final List<Uint8List> _photos = [];
  bool _picking = false;

  @override
  void dispose() {
    _video.dispose();
    super.dispose();
  }

  int get _totalChars =>
      (_banner == null ? 0 : ImageUtils.base64Length(_banner!.length)) +
      _photos.fold(0, (sum, p) => sum + ImageUtils.base64Length(p.length));

  Future<Uint8List?> _pickOne() async {
    if (_picking) return null;
    setState(() => _picking = true);
    try {
      final bytes = await ImageUtils.pick();
      if (bytes == null || !mounted) return null;
      final problem = ImageUtils.sizeProblem(bytes);
      if (problem != null) {
        showMessage(context, problem, error: true);
        return null;
      }
      if (_totalChars + ImageUtils.base64Length(bytes.length) > EventMediaUploadScreen.maxTotalChars) {
        showMessage(context, 'The photos together are too large for one event. Remove a photo or pick a smaller one.',
            error: true);
        return null;
      }
      return bytes;
    } catch (_) {
      if (mounted) showMessage(context, 'Could not open the photo. Check the photo permission and try again.', error: true);
      return null;
    } finally {
      if (mounted) setState(() => _picking = false);
    }
  }

  Future<void> _pickBanner() async {
    final previous = _banner;
    setState(() => _banner = null); // the old banner must not count against the size budget
    final bytes = await _pickOne();
    if (!mounted) return;
    setState(() => _banner = bytes ?? previous);
  }

  Future<void> _addPhoto() async {
    if (_photos.length >= EventMediaUploadScreen.maxPhotos) {
      showMessage(context, 'You can add up to ${EventMediaUploadScreen.maxPhotos} photos.');
      return;
    }
    final bytes = await _pickOne();
    if (bytes == null || !mounted) return;
    setState(() => _photos.add(bytes));
  }

  void _continue() {
    if (!_formKey.currentState!.validate()) return;
    final data = Map<String, dynamic>.from(widget.eventData);
    final video = _video.text.trim();
    data['media'] = {
      'bannerImage': _banner == null ? null : base64Encode(_banner!),
      'promotionalVideo': video.isEmpty ? null : video,
      'images': _photos.map(base64Encode).toList(),
      'videos': <String>[],
    };
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => AddTicketsScreen(eventData: data, venue: widget.venue)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: appBar('Create event · 3 of 4'),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const SectionTitle('Banner'),
              InkWell(
                onTap: _picking ? null : _pickBanner,
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  height: 170,
                  clipBehavior: Clip.antiAlias,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.grey.shade400),
                  ),
                  child: _banner != null
                      ? Stack(
                          fit: StackFit.expand,
                          children: [
                            Image.memory(_banner!, fit: BoxFit.cover),
                            Positioned(
                              right: 6,
                              top: 6,
                              child: CircleAvatar(
                                backgroundColor: Colors.black54,
                                child: IconButton(
                                  icon: const Icon(Icons.close, color: Colors.white, size: 18),
                                  onPressed: () => setState(() => _banner = null),
                                ),
                              ),
                            ),
                          ],
                        )
                      : const Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.add_photo_alternate_outlined, size: 40, color: AppColors.navy),
                            SizedBox(height: 6),
                            Text('Add a banner photo', style: TextStyle(color: AppColors.navy)),
                          ],
                        ),
                ),
              ),
              const SizedBox(height: 6),
              const Text(
                'Optional, but events with a banner look better in the customer app. '
                'Without one, a plain placeholder is shown.',
                style: TextStyle(color: Colors.black54, fontSize: 12),
              ),
              const SizedBox(height: 20),
              SectionTitle('More photos (${_photos.length}/${EventMediaUploadScreen.maxPhotos})'),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (var i = 0; i < _photos.length; i++)
                    Stack(
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: Image.memory(_photos[i], width: 96, height: 96, fit: BoxFit.cover),
                        ),
                        Positioned(
                          right: 0,
                          top: 0,
                          child: InkWell(
                            onTap: () => setState(() => _photos.removeAt(i)),
                            child: const CircleAvatar(
                              radius: 12,
                              backgroundColor: Colors.black54,
                              child: Icon(Icons.close, size: 14, color: Colors.white),
                            ),
                          ),
                        ),
                      ],
                    ),
                  if (_photos.length < EventMediaUploadScreen.maxPhotos)
                    InkWell(
                      onTap: _picking ? null : _addPhoto,
                      child: Container(
                        width: 96,
                        height: 96,
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: Colors.grey.shade400),
                        ),
                        child: const Icon(Icons.add, color: AppColors.navy, size: 30),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 6),
              const Text('Photos are resized to 1280 px before upload.',
                  style: TextStyle(color: Colors.black54, fontSize: 12)),
              const SizedBox(height: 20),
              const SectionTitle('Promotional video'),
              TextFormField(
                controller: _video,
                keyboardType: TextInputType.url,
                decoration: fieldDecoration('Video link (optional)', hint: 'https://youtube.com/…', icon: Icons.link,
                    helper: 'Paste a link to a video hosted elsewhere. Video files cannot be uploaded: '
                        'Mookalaa has no file store for videos yet.'),
                validator: (v) => Validators.url(v ?? '', label: 'Video link', required: false),
              ),
              const SizedBox(height: 24),
              PrimaryButton(label: 'Continue to tickets', onPressed: _continue),
            ],
          ),
        ),
      ),
    );
  }
}
