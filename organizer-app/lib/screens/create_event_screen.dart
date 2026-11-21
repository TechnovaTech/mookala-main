import 'package:flutter/material.dart';

import '../logic/event_logic.dart';
import '../logic/validators.dart';
import '../services/api.dart';
import '../services/api_client.dart';
import '../widgets/common.dart';
import 'event_details_screen.dart';

/// Step 1 of creating an event: what, where, when, who.
/// Nothing is saved until the last step sends `POST /events`.
class CreateEventScreen extends StatefulWidget {
  const CreateEventScreen({super.key});

  @override
  State<CreateEventScreen> createState() => _CreateEventScreenState();
}

class _CreateEventScreenState extends State<CreateEventScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _venueName = TextEditingController();
  final _address = TextEditingController();
  final _city = TextEditingController();
  final _onlineLink = TextEditingController();
  final _videoLink = TextEditingController();
  final _accessInstructions = TextEditingController();

  bool _loading = true;
  String? _loadError;
  List<Map<String, dynamic>> _categories = [];
  List<String> _languages = [];
  List<Map<String, dynamic>> _venues = [];
  List<Map<String, dynamic>> _artists = [];
  String? _artistsError;

  String? _category;
  List<String> _subCategoryOptions = [];
  final Set<String> _subCategories = {};
  final Set<String> _selectedLanguages = {};
  String _locationType = 'venue';
  Map<String, dynamic>? _venue;
  bool _customVenue = false;
  String _platform = 'youtube';
  DateTime? _startDate;
  TimeOfDay? _startTime;
  DateTime? _endDate;
  TimeOfDay? _endTime;
  final List<Map<String, dynamic>> _selectedArtists = [];
  final List<Map<String, String>> _staff = [];
  String? _formError;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in [_name, _venueName, _address, _city, _onlineLink, _videoLink, _accessInstructions]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final results = await Future.wait([Api.categories(), Api.languages(), Api.venues()]);
      List<Map<String, dynamic>> artists = [];
      String? artistsError;
      try {
        artists = await Api.artists();
      } on ApiException catch (e) {
        artistsError = e.message; // artists are optional: the form still works
      }
      if (!mounted) return;
      setState(() {
        _categories = (results[0] as List<Map<String, dynamic>>)
            .where((c) => (c['name'] ?? '').toString().trim().isNotEmpty)
            .toList();
        _languages = results[1] as List<String>;
        _venues = results[2] as List<Map<String, dynamic>>;
        _artists = artists;
        _artistsError = artistsError;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _loadError = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _onCategoryChanged(String? name) {
    final match = _categories.where((c) => c['name'] == name);
    final subs = <String>[];
    if (match.isNotEmpty && match.first['subCategories'] is List) {
      for (final sub in match.first['subCategories'] as List) {
        final label = sub is Map ? (sub['name'] ?? '').toString().trim() : sub.toString().trim();
        if (label.isNotEmpty) subs.add(label);
      }
    }
    setState(() {
      _category = name;
      _subCategoryOptions = subs;
      _subCategories.clear();
    });
  }

  Future<void> _pickMany(String title, List<String> options, Set<String> selected) async {
    final working = {...selected};
    final result = await showDialog<Set<String>>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setDialog) => AlertDialog(
          title: Text(title),
          content: SizedBox(
            width: double.maxFinite,
            child: ListView(
              shrinkWrap: true,
              children: [
                for (final option in options)
                  CheckboxListTile(
                    dense: true,
                    value: working.contains(option),
                    title: Text(option),
                    activeColor: AppColors.navy,
                    onChanged: (v) => setDialog(() => v == true ? working.add(option) : working.remove(option)),
                  ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')),
            TextButton(onPressed: () => Navigator.pop(dialogContext, working), child: const Text('Done')),
          ],
        ),
      ),
    );
    if (result == null || !mounted) return;
    setState(() {
      selected
        ..clear()
        ..addAll(result);
    });
  }

  Future<void> _pickDate(bool start) async {
    final now = DateTime.now();
    final first = start ? DateTime(now.year, now.month, now.day) : (_startDate ?? DateTime(now.year, now.month, now.day));
    final current = start ? _startDate : _endDate;
    final picked = await showDatePicker(
      context: context,
      initialDate: current != null && !current.isBefore(first) ? current : first,
      firstDate: first,
      lastDate: DateTime(now.year + 3),
    );
    if (picked == null || !mounted) return;
    setState(() => start ? _startDate = picked : _endDate = picked);
  }

  Future<void> _pickTime(bool start) async {
    final picked = await showTimePicker(
      context: context,
      initialTime: (start ? _startTime : _endTime) ?? const TimeOfDay(hour: 18, minute: 0),
    );
    if (picked == null || !mounted) return;
    setState(() => start ? _startTime = picked : _endTime = picked);
  }

  Future<void> _pickVenue() async {
    final picked = await showModalBottomSheet<Object>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) => _VenuePicker(venues: _venues),
    );
    if (picked == null || !mounted) return;
    setState(() {
      if (picked is Map<String, dynamic>) {
        _venue = picked;
        _customVenue = false;
      } else {
        _venue = null;
        _customVenue = true;
      }
    });
  }

  Future<void> _pickArtists() async {
    final chosen = _selectedArtists.map((a) => a['_id'].toString()).toSet();
    final result = await showModalBottomSheet<Set<String>>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) => _ArtistPicker(artists: _artists, selected: chosen),
    );
    if (result == null || !mounted) return;
    setState(() {
      _selectedArtists
        ..clear()
        ..addAll(_artists.where((a) => result.contains(a['_id'].toString())));
    });
  }

  Future<void> _addStaff() async {
    final staff = await showDialog<Map<String, String>>(
      context: context,
      builder: (_) => _StaffDialog(existingEmails: _staff.map((s) => s['email']!.toLowerCase()).toSet()),
    );
    if (staff == null || !mounted) return;
    setState(() => _staff.add(staff));
  }

  String _timeText(TimeOfDay? t) => t == null ? '' : EventLogic.formatTime(t.hour, t.minute);
  String _dateText(DateTime? d) => d == null ? '' : EventLogic.formatDate(d);

  String? _validateAll() {
    if (_category == null) return 'Choose a category';
    if (_subCategoryOptions.isNotEmpty && _subCategories.isEmpty) return 'Choose at least one sub category';
    if (_selectedLanguages.isEmpty) return 'Choose at least one language';
    if (_locationType == 'venue' && _venue == null && !_customVenue) return 'Choose the venue';
    return EventLogic.validateSchedule(
      startDate: _dateText(_startDate),
      startTime: _timeText(_startTime),
      endDate: _dateText(_endDate),
      endTime: _timeText(_endTime),
    );
  }

  void _continue() {
    final fieldsOk = _formKey.currentState!.validate();
    final problem = _validateAll();
    setState(() => _formError = fieldsOk ? problem : 'Please fix the highlighted fields');
    if (!fieldsOk || problem != null) return;

    final data = <String, dynamic>{
      'name': _name.text.trim(),
      'category': _category,
      'subCategories': _subCategories.toList(),
      'languages': _selectedLanguages.toList(),
      'locationType': _locationType,
      'artists': _selectedArtists.map((a) => a['_id'].toString()).toList(),
      'scannerStaff': _staff,
      'startDate': _dateText(_startDate),
      'startTime': _timeText(_startTime),
      'endDate': _dateText(_endDate),
      'endTime': _timeText(_endTime),
      'timezone': 'Asia/Kolkata',
    };

    Map<String, dynamic>? venueForTickets;
    if (_locationType == 'venue') {
      if (_venue != null) {
        final location = _venue!['location'] is Map ? _venue!['location'] as Map : const {};
        final name = (_venue!['name'] ?? '').toString();
        data['venue'] = _venue!['_id'].toString();
        // `name` is read by the booking flow, `venue` by the artist routes.
        data['location'] = {
          'name': name,
          'venue': name,
          'address': (location['address'] ?? '').toString(),
          'city': (location['city'] ?? '').toString(),
          'state': (location['state'] ?? '').toString(),
        };
        venueForTickets = _venue;
      } else {
        data['location'] = {
          'name': _venueName.text.trim(),
          'venue': _venueName.text.trim(),
          'address': _address.text.trim(),
          'city': _city.text.trim(),
        };
      }
    } else if (_locationType == 'online') {
      data['onlineDetails'] = {
        'link': _onlineLink.text.trim(),
        'accessInstructions': _accessInstructions.text.trim(),
      };
    } else {
      data['recordedDetails'] = {
        'platform': _platform,
        'videoLink': _videoLink.text.trim(),
        'accessInstructions': _accessInstructions.text.trim(),
      };
    }

    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => EventDetailsScreen(eventData: data, venue: venueForTickets)),
    );
  }

  Widget _typeOption(String type, IconData icon, String title, String subtitle) {
    final selected = _locationType == type;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: BorderSide(color: selected ? AppColors.navy : Colors.grey.shade300, width: selected ? 2 : 1),
      ),
      child: ListTile(
        leading: Icon(icon, color: selected ? AppColors.navy : Colors.black45),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(subtitle),
        trailing: selected ? const Icon(Icons.check_circle, color: AppColors.navy) : null,
        onTap: () => setState(() => _locationType = type),
      ),
    );
  }

  Widget _pickerField(String label, String value, IconData icon, VoidCallback onTap, {VoidCallback? onClear}) {
    return InkWell(
      onTap: onTap,
      child: InputDecorator(
        decoration: fieldDecoration(label, icon: icon).copyWith(
          suffixIcon: onClear != null && value.isNotEmpty
              ? IconButton(icon: const Icon(Icons.clear, size: 18), onPressed: onClear)
              : null,
        ),
        child: Text(value.isEmpty ? 'Select' : value, style: TextStyle(color: value.isEmpty ? Colors.black45 : Colors.black87)),
      ),
    );
  }

  Widget _chips(Iterable<String> values) => Wrap(
        spacing: 6,
        runSpacing: -6,
        children: [for (final v in values) Chip(label: Text(v), visualDensity: VisualDensity.compact)],
      );

  List<Widget> _locationFields() {
    if (_locationType == 'venue') {
      final location = _venue?['location'] is Map ? _venue!['location'] as Map : const {};
      return [
        _pickerField(
          'Venue *',
          _venue != null
              ? '${_venue!['name']}${(location['city'] ?? '').toString().isEmpty ? '' : ', ${location['city']}'}'
              : (_customVenue ? 'My venue is not in the list' : ''),
          Icons.location_on,
          _pickVenue,
        ),
        if (_venue != null && _venue!['seatConfig'] is Map)
          const Padding(
            padding: EdgeInsets.only(top: 6),
            child: Text('This venue has a seating plan: you can price tickets by seat block.',
                style: TextStyle(color: Colors.black54, fontSize: 12)),
          ),
        if (_customVenue) ...[
          const SizedBox(height: 12),
          TextFormField(
            controller: _venueName,
            maxLength: 150,
            decoration: fieldDecoration('Venue name *').copyWith(counterText: ''),
            validator: (v) => Validators.requiredText(v ?? '', 'Venue name'),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _address,
            maxLength: 300,
            decoration: fieldDecoration('Address *').copyWith(counterText: ''),
            validator: (v) => Validators.requiredText(v ?? '', 'Address'),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _city,
            maxLength: 100,
            decoration: fieldDecoration('City *').copyWith(counterText: ''),
            validator: (v) => Validators.requiredText(v ?? '', 'City'),
          ),
        ],
      ];
    }
    if (_locationType == 'online') {
      return [
        TextFormField(
          controller: _onlineLink,
          keyboardType: TextInputType.url,
          decoration: fieldDecoration('Joining link *', hint: 'https://…', icon: Icons.link,
              helper: 'The link attendees use to join (Zoom, Google Meet, YouTube Live…).'),
          validator: (v) => Validators.url(v ?? '', label: 'Joining link'),
        ),
        const SizedBox(height: 12),
        TextFormField(
          controller: _accessInstructions,
          maxLines: 2,
          maxLength: 500,
          decoration: fieldDecoration('Joining instructions (optional)'),
        ),
      ];
    }
    return [
      DropdownButtonFormField<String>(
        initialValue: _platform,
        decoration: fieldDecoration('Platform', icon: Icons.ondemand_video),
        items: const [
          DropdownMenuItem(value: 'youtube', child: Text('YouTube')),
          DropdownMenuItem(value: 'vimeo', child: Text('Vimeo')),
          DropdownMenuItem(value: 'others', child: Text('Other')),
        ],
        onChanged: (v) => setState(() => _platform = v ?? 'youtube'),
      ),
      const SizedBox(height: 12),
      TextFormField(
        controller: _videoLink,
        keyboardType: TextInputType.url,
        decoration: fieldDecoration('Video link *', hint: 'https://…', icon: Icons.link),
        validator: (v) => Validators.url(v ?? '', label: 'Video link'),
      ),
      const SizedBox(height: 12),
      TextFormField(
        controller: _accessInstructions,
        maxLines: 2,
        maxLength: 500,
        decoration: fieldDecoration('Access instructions (optional)'),
      ),
    ];
  }

  Widget _form() {
    return Form(
      key: _formKey,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const SectionTitle('Basics'),
          TextFormField(
            controller: _name,
            maxLength: 150,
            textCapitalization: TextCapitalization.words,
            decoration: fieldDecoration('Event name *', icon: Icons.event).copyWith(counterText: ''),
            validator: (v) => Validators.requiredText(v ?? '', 'Event name'),
          ),
          const SizedBox(height: 12),
          if (_categories.isEmpty)
            const InfoBanner('No event categories are set up on Mookalaa yet, so an event cannot be created. '
                'Please contact support.')
          else
            DropdownButtonFormField<String>(
              initialValue: _category,
              isExpanded: true,
              decoration: fieldDecoration('Category *', icon: Icons.category),
              items: [
                for (final c in _categories)
                  DropdownMenuItem(value: c['name'].toString(), child: Text(c['name'].toString())),
              ],
              onChanged: _onCategoryChanged,
            ),
          if (_subCategoryOptions.isNotEmpty) ...[
            const SizedBox(height: 12),
            _pickerField('Sub categories *', _subCategories.join(', '), Icons.label_outline,
                () => _pickMany('Sub categories', _subCategoryOptions, _subCategories)),
          ],
          const SizedBox(height: 12),
          _pickerField('Languages *', _selectedLanguages.join(', '), Icons.language,
              () => _pickMany('Languages', _languages, _selectedLanguages)),
          const SizedBox(height: 20),
          const SectionTitle('Where'),
          _typeOption('venue', Icons.place, 'At a venue', 'People attend in person'),
          _typeOption('online', Icons.videocam, 'Online', 'A live stream or video call'),
          _typeOption('recorded', Icons.play_circle_outline, 'Recorded', 'A video people watch later'),
          const SizedBox(height: 8),
          ..._locationFields(),
          const SizedBox(height: 20),
          const SectionTitle('When'),
          Row(
            children: [
              Expanded(child: _pickerField('Start date *', _dateText(_startDate), Icons.calendar_today, () => _pickDate(true))),
              const SizedBox(width: 10),
              Expanded(child: _pickerField('Start time *', _timeText(_startTime), Icons.access_time, () => _pickTime(true))),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _pickerField('End date', _dateText(_endDate), Icons.calendar_today, () => _pickDate(false),
                    onClear: () => setState(() => _endDate = null)),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _pickerField('End time', _timeText(_endTime), Icons.access_time, () => _pickTime(false),
                    onClear: () => setState(() => _endTime = null)),
              ),
            ],
          ),
          const Padding(
            padding: EdgeInsets.only(top: 6),
            child: Text('All times are India time (IST).', style: TextStyle(color: Colors.black54, fontSize: 12)),
          ),
          const SizedBox(height: 20),
          const SectionTitle('Artists (optional)'),
          if (_artistsError != null)
            InfoBanner('Could not load the artist list: $_artistsError')
          else if (_artists.isEmpty)
            const Text('No approved artists are listed on Mookalaa yet.', style: TextStyle(color: Colors.black54))
          else ...[
            if (_selectedArtists.isNotEmpty) _chips(_selectedArtists.map((a) => (a['name'] ?? 'Artist').toString())),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: _pickArtists,
                icon: const Icon(Icons.person_add_alt, color: AppColors.navy),
                label: Text(_selectedArtists.isEmpty ? 'Invite artists' : 'Change artists',
                    style: const TextStyle(color: AppColors.navy)),
              ),
            ),
            const Text('Invited artists receive a booking request once Mookalaa approves the event.',
                style: TextStyle(color: Colors.black54, fontSize: 12)),
          ],
          const SizedBox(height: 20),
          const SectionTitle('Gate staff (optional)'),
          const Text(
            'Staff sign in with this email and password under "Gate staff login" to scan tickets for this event. '
            'The password is stored securely and cannot be shown again, and gate staff cannot be changed from the app '
            'after the event is created, so note the passwords down now.',
            style: TextStyle(color: Colors.black54, fontSize: 12, height: 1.35),
          ),
          for (var i = 0; i < _staff.length; i++)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.badge_outlined, color: AppColors.navy),
              title: Text(_staff[i]['name']!),
              subtitle: Text(_staff[i]['email']!),
              trailing: IconButton(
                icon: const Icon(Icons.delete_outline, color: Colors.red),
                onPressed: () => setState(() => _staff.removeAt(i)),
              ),
            ),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: _addStaff,
              icon: const Icon(Icons.add, color: AppColors.navy),
              label: const Text('Add gate staff', style: TextStyle(color: AppColors.navy)),
            ),
          ),
          const SizedBox(height: 16),
          if (_formError != null) ...[InfoBanner(_formError!, color: Colors.red), const SizedBox(height: 12)],
          PrimaryButton(label: 'Continue', onPressed: _categories.isEmpty ? null : _continue),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: appBar('Create event · 1 of 4'),
      body: SafeArea(
        child: _loading
            ? const LoadingView()
            : _loadError != null
                ? StateView.error(_loadError!, onRetry: _load)
                : _form(),
      ),
    );
  }
}

class _VenuePicker extends StatefulWidget {
  const _VenuePicker({required this.venues});
  final List<Map<String, dynamic>> venues;

  @override
  State<_VenuePicker> createState() => _VenuePickerState();
}

class _VenuePickerState extends State<_VenuePicker> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final q = _query.trim().toLowerCase();
    final matches = widget.venues.where((v) {
      final location = v['location'] is Map ? v['location'] as Map : const {};
      return q.isEmpty || '${v['name']} ${location['city']} ${location['address']}'.toLowerCase().contains(q);
    }).toList();
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: SizedBox(
          height: MediaQuery.of(context).size.height * 0.75,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(12),
                child: TextField(
                  decoration: fieldDecoration('Search venues', icon: Icons.search),
                  onChanged: (v) => setState(() => _query = v),
                ),
              ),
              Expanded(
                child: ListView(
                  children: [
                    if (matches.isEmpty)
                      const Padding(
                        padding: EdgeInsets.all(20),
                        child: Text('No venue matches.', textAlign: TextAlign.center),
                      ),
                    for (final v in matches)
                      ListTile(
                        leading: const Icon(Icons.location_city, color: AppColors.navy),
                        title: Text((v['name'] ?? '').toString()),
                        subtitle: Text([
                          if (v['location'] is Map) (v['location']['address'] ?? '').toString(),
                          if (v['location'] is Map) (v['location']['city'] ?? '').toString(),
                          if (v['capacity'] != null) 'Capacity ${v['capacity']}',
                        ].where((s) => s.isNotEmpty).join(' · ')),
                        onTap: () => Navigator.pop<Object>(context, v),
                      ),
                    const Divider(),
                    ListTile(
                      leading: const Icon(Icons.edit_location_alt_outlined, color: AppColors.navy),
                      title: const Text('My venue is not in the list'),
                      subtitle: const Text('Type the venue name and address yourself'),
                      onTap: () => Navigator.pop<Object>(context, 'custom'),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ArtistPicker extends StatefulWidget {
  const _ArtistPicker({required this.artists, required this.selected});
  final List<Map<String, dynamic>> artists;
  final Set<String> selected;

  @override
  State<_ArtistPicker> createState() => _ArtistPickerState();
}

class _ArtistPickerState extends State<_ArtistPicker> {
  late final Set<String> _selected = {...widget.selected};
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final q = _query.trim().toLowerCase();
    final matches = widget.artists
        .where((a) => q.isEmpty || '${a['name']} ${a['city']} ${a['genre']}'.toLowerCase().contains(q))
        .toList();
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: SizedBox(
          height: MediaQuery.of(context).size.height * 0.75,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(12),
                child: TextField(
                  decoration: fieldDecoration('Search artists', icon: Icons.search),
                  onChanged: (v) => setState(() => _query = v),
                ),
              ),
              Expanded(
                child: ListView(
                  children: [
                    for (final a in matches)
                      CheckboxListTile(
                        value: _selected.contains(a['_id'].toString()),
                        activeColor: AppColors.navy,
                        secondary: ClipOval(
                          child: StoredImage(a['profileImage'], width: 40, height: 40, placeholderIcon: Icons.person),
                        ),
                        title: Text((a['name'] ?? 'Artist').toString()),
                        subtitle: Text([a['genre'], a['city']]
                            .map((e) => (e ?? '').toString())
                            .where((s) => s.isNotEmpty)
                            .join(' · ')),
                        onChanged: (v) => setState(() {
                          final id = a['_id'].toString();
                          v == true ? _selected.add(id) : _selected.remove(id);
                        }),
                      ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(12),
                child: PrimaryButton(
                  label: 'Done (${_selected.length} selected)',
                  onPressed: () => Navigator.pop(context, _selected),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StaffDialog extends StatefulWidget {
  const _StaffDialog({required this.existingEmails});
  final Set<String> existingEmails;

  @override
  State<_StaffDialog> createState() => _StaffDialogState();
}

class _StaffDialogState extends State<_StaffDialog> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _password = TextEditingController();
  bool _show = false;

  @override
  void dispose() {
    for (final c in [_name, _email, _phone, _password]) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Add gate staff'),
      content: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextFormField(
                controller: _name,
                decoration: const InputDecoration(labelText: 'Name'),
                validator: (v) => Validators.requiredText(v ?? '', 'Name'),
              ),
              TextFormField(
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(labelText: 'Login email'),
                validator: (v) {
                  final problem = Validators.email(v ?? '');
                  if (problem != null) return problem;
                  if (widget.existingEmails.contains(v!.trim().toLowerCase())) return 'This email is already added';
                  return null;
                },
              ),
              TextFormField(
                controller: _phone,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(labelText: 'Phone (optional)'),
                validator: (v) => (v ?? '').trim().isEmpty ? null : Validators.phone(v!),
              ),
              TextFormField(
                controller: _password,
                obscureText: !_show,
                decoration: InputDecoration(
                  labelText: 'Password',
                  helperText: 'At least 6 characters',
                  suffixIcon: IconButton(
                    icon: Icon(_show ? Icons.visibility_off : Icons.visibility),
                    onPressed: () => setState(() => _show = !_show),
                  ),
                ),
                validator: (v) => (v ?? '').length < 6 ? 'Use at least 6 characters' : null,
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        TextButton(
          onPressed: () {
            if (!_formKey.currentState!.validate()) return;
            Navigator.pop(context, {
              'name': _name.text.trim(),
              'email': _email.text.trim(),
              'phone': _phone.text.trim(),
              'password': _password.text,
            });
          },
          child: const Text('Add'),
        ),
      ],
    );
  }
}
