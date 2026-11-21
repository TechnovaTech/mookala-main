import 'package:flutter/material.dart';

import '../logic/event_logic.dart';
import '../logic/validators.dart';
import '../services/api.dart';
import '../services/api_client.dart';
import '../widgets/common.dart';

/// Registers a Jatra. The registration is created as 'pending' and decided by
/// a Mookalaa admin; its status is shown in the Jatra list.
class JatraRegistrationScreen extends StatefulWidget {
  const JatraRegistrationScreen({super.key});

  @override
  State<JatraRegistrationScreen> createState() => _JatraRegistrationScreenState();
}

class _JatraRegistrationScreenState extends State<JatraRegistrationScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _venue = TextEditingController();
  final _description = TextEditingController();
  DateTime? _date;
  TimeOfDay? _time;
  String? _scheduleError;

  final List<String> _artists = [];
  final List<String> _committee = [];

  List<String> _artistNames = [];
  bool _artistsLoading = true;
  String? _artistsError;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _loadArtists();
  }

  @override
  void dispose() {
    _name.dispose();
    _venue.dispose();
    _description.dispose();
    super.dispose();
  }

  Future<void> _loadArtists() async {
    setState(() {
      _artistsLoading = true;
      _artistsError = null;
    });
    try {
      final artists = await Api.artists();
      if (!mounted) return;
      final names = artists.map((a) => (a['name'] ?? '').toString().trim()).where((n) => n.isNotEmpty).toSet().toList()
        ..sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));
      setState(() => _artistNames = names);
    } on ApiException catch (e) {
      if (mounted) setState(() => _artistsError = e.message);
    } finally {
      if (mounted) setState(() => _artistsLoading = false);
    }
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _date ?? now,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: DateTime(now.year + 3),
    );
    if (picked != null && mounted) setState(() => _date = picked);
  }

  Future<void> _pickTime() async {
    final picked = await showTimePicker(context: context, initialTime: _time ?? const TimeOfDay(hour: 18, minute: 0));
    if (picked != null && mounted) setState(() => _time = picked);
  }

  Future<void> _addText({required String title, required String hint, required List<String> target}) async {
    final controller = TextEditingController();
    final value = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLength: 200,
          textCapitalization: TextCapitalization.words,
          decoration: InputDecoration(hintText: hint),
          onSubmitted: (v) => Navigator.pop(dialogContext, v),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(dialogContext, controller.text), child: const Text('Add')),
        ],
      ),
    );
    final text = (value ?? '').trim();
    if (text.isEmpty || !mounted) return;
    if (target.any((e) => e.toLowerCase() == text.toLowerCase())) {
      showMessage(context, '"$text" is already in the list');
      return;
    }
    setState(() => target.add(text));
  }

  Future<void> _chooseArtists() async {
    final selected = {..._artists};
    final result = await showDialog<Set<String>>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setDialogState) => AlertDialog(
          title: const Text('Artists on Mookalaa'),
          content: SizedBox(
            width: double.maxFinite,
            child: ListView(
              shrinkWrap: true,
              children: [
                for (final name in _artistNames)
                  CheckboxListTile(
                    dense: true,
                    value: selected.contains(name),
                    title: Text(name),
                    onChanged: (checked) => setDialogState(() {
                      if (checked == true) {
                        selected.add(name);
                      } else {
                        selected.remove(name);
                      }
                    }),
                  ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')),
            TextButton(onPressed: () => Navigator.pop(dialogContext, selected), child: const Text('Done')),
          ],
        ),
      ),
    );
    if (result == null || !mounted) return;
    setState(() {
      // Keep names typed by hand, replace the ones chosen from the list.
      _artists.removeWhere((a) => _artistNames.contains(a));
      _artists.addAll(result);
    });
  }

  Future<void> _submit() async {
    final valid = _formKey.currentState!.validate();
    String? scheduleError;
    if (_date == null) {
      scheduleError = 'Choose the date';
    } else if (_time == null) {
      scheduleError = 'Choose the time';
    }
    setState(() => _scheduleError = scheduleError);
    if (!valid || scheduleError != null) return;

    setState(() => _submitting = true);
    try {
      final message = await Api.registerJatra({
        'name': _name.text.trim(),
        'venue': _venue.text.trim(),
        'date': EventLogic.formatDate(_date!),
        'time': EventLogic.formatTime(_time!.hour, _time!.minute),
        'description': _description.text.trim(),
        'artists': _artists,
        'committeeMembers': _committee,
      });
      if (!mounted) return;
      showMessage(context, message);
      Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) showMessage(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Widget _chips(List<String> values) {
    if (values.isEmpty) return const Text('None added', style: TextStyle(color: Colors.black45));
    return Wrap(
      spacing: 8,
      runSpacing: 4,
      children: [
        for (final value in values)
          Chip(
            label: Text(value),
            onDeleted: _submitting ? null : () => setState(() => values.remove(value)),
          ),
      ],
    );
  }

  Widget _pickerTile(String label, String? value, IconData icon, VoidCallback onTap) {
    return InkWell(
      onTap: _submitting ? null : onTap,
      borderRadius: BorderRadius.circular(10),
      child: InputDecorator(
        decoration: fieldDecoration(label, icon: icon),
        child: Text(value ?? 'Choose', style: TextStyle(color: value == null ? Colors.black45 : Colors.black87)),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: appBar('Register a Jatra'),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const InfoBanner(
                'A Jatra registration is reviewed by the Mookalaa team. You can follow its status in the Jatra list.',
                color: Colors.blue,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _name,
                maxLength: 300,
                textCapitalization: TextCapitalization.words,
                decoration: fieldDecoration('Jatra name', icon: Icons.festival).copyWith(counterText: ''),
                validator: (v) => Validators.requiredText(v ?? '', 'Jatra name'),
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _venue,
                maxLength: 300,
                textCapitalization: TextCapitalization.words,
                decoration: fieldDecoration('Venue', hint: 'Ground or place, with the town', icon: Icons.place_outlined)
                    .copyWith(counterText: ''),
                validator: (v) => Validators.requiredText(v ?? '', 'Venue'),
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: _pickerTile('Date', _date == null ? null : EventLogic.displayDate(EventLogic.formatDate(_date!)),
                        Icons.calendar_today, _pickDate),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _pickerTile('Time', _time == null ? null : EventLogic.formatTime(_time!.hour, _time!.minute),
                        Icons.schedule, _pickTime),
                  ),
                ],
              ),
              if (_scheduleError != null)
                Padding(
                  padding: const EdgeInsets.only(top: 6, left: 12),
                  child: Text(_scheduleError!, style: TextStyle(color: Colors.red.shade700, fontSize: 12)),
                ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _description,
                maxLines: 4,
                maxLength: 5000,
                decoration: fieldDecoration('Description (optional)', hint: 'What happens at this Jatra'),
              ),
              const SizedBox(height: 8),
              const SectionTitle('Artists (optional)'),
              _chips(_artists),
              const SizedBox(height: 6),
              if (_artistsError != null)
                InfoBanner('The artist list could not be loaded ($_artistsError). You can still type names.'),
              Wrap(
                spacing: 8,
                children: [
                  if (_artistsLoading)
                    const Padding(
                      padding: EdgeInsets.all(8),
                      child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
                    )
                  else if (_artistsError != null)
                    TextButton.icon(onPressed: _loadArtists, icon: const Icon(Icons.refresh), label: const Text('Reload list'))
                  else if (_artistNames.isNotEmpty)
                    TextButton.icon(
                      onPressed: _submitting ? null : _chooseArtists,
                      icon: const Icon(Icons.playlist_add_check),
                      label: const Text('Choose from Mookalaa artists'),
                    ),
                  TextButton.icon(
                    onPressed: _submitting
                        ? null
                        : () => _addText(title: 'Add an artist', hint: 'Artist or troupe name', target: _artists),
                    icon: const Icon(Icons.add),
                    label: const Text('Type a name'),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              const SectionTitle('Committee members (optional)'),
              _chips(_committee),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: _submitting
                      ? null
                      : () => _addText(
                            title: 'Add a committee member',
                            hint: 'Name - role (for example: Suresh - President)',
                            target: _committee,
                          ),
                  icon: const Icon(Icons.add),
                  label: const Text('Add a member'),
                ),
              ),
              const SizedBox(height: 20),
              PrimaryButton(label: 'Submit for approval', loading: _submitting, onPressed: _submit),
            ],
          ),
        ),
      ),
    );
  }
}
