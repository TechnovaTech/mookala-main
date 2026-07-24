import 'package:flutter/material.dart';
import 'qr_scanner_screen.dart';
import 'event_management_screen.dart';
import '../services/api_service.dart';

class JatraRegistrationScreen extends StatefulWidget {
  const JatraRegistrationScreen({super.key});

  @override
  State<JatraRegistrationScreen> createState() => _JatraRegistrationScreenState();
}

class _JatraRegistrationScreenState extends State<JatraRegistrationScreen> {
  final _formKey = GlobalKey<FormState>();
  int _selectedIndex = 2; // Jatra tab selected
  final TextEditingController _jatraNameController = TextEditingController();
  final TextEditingController _venueController = TextEditingController();
  final TextEditingController _dateController = TextEditingController();
  final TextEditingController _timeController = TextEditingController();
  final TextEditingController _descriptionController = TextEditingController();
  
  List<String> _selectedArtists = [];
  List<String> _selectedCommitteeMembers = [];
  
  List<String> _availableArtists = [];
  bool _loadingArtists = true;

  @override
  void initState() {
    super.initState();
    _loadArtists();
  }

  Future<void> _loadArtists() async {
    final artists = await ApiService.getArtistsList();
    if (!mounted) return;
    setState(() {
      _availableArtists = artists
          .map((a) => (a['name'] ?? '').toString())
          .where((n) => n.isNotEmpty)
          .toList();
      _loadingArtists = false;
    });
  }

  void _addCommitteeMemberDialog() {
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Add Committee Member'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(
            hintText: 'Name - Role (e.g. Suresh - President)',
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () {
              final text = controller.text.trim();
              if (text.isNotEmpty) {
                setState(() => _selectedCommitteeMembers.add(text));
              }
              Navigator.pop(context);
            },
            child: const Text('Add'),
          ),
        ],
      ),
    );
  }

  void _selectDate() async {
    final date = await showDatePicker(
      context: context,
      initialDate: DateTime.now(),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (date != null) {
      _dateController.text = '${date.day}/${date.month}/${date.year}';
    }
  }

  void _selectTime() async {
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.now(),
    );
    if (time != null) {
      _timeController.text = time.format(context);
    }
  }

  void _showSelectionDialog(String title, List<String> items, List<String> selected) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Select $title'),
        content: SizedBox(
          width: double.maxFinite,
          child: ListView.builder(
            shrinkWrap: true,
            itemCount: items.length,
            itemBuilder: (context, index) {
              final item = items[index];
              return CheckboxListTile(
                title: Text(item),
                value: selected.contains(item),
                onChanged: (bool? value) {
                  setState(() {
                    if (value == true) {
                      selected.add(item);
                    } else {
                      selected.remove(item);
                    }
                  });
                  Navigator.pop(context);
                  _showSelectionDialog(title, items, selected);
                },
              );
            },
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Done'),
          ),
        ],
      ),
    );
  }

  Future<void> _submitRegistration() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedArtists.isEmpty || _selectedCommitteeMembers.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select artists and add committee members')),
      );
      return;
    }

    // Loading spinner
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => const Center(child: CircularProgressIndicator()),
    );

    final result = await ApiService.registerJatra(
      name: _jatraNameController.text.trim(),
      venue: _venueController.text.trim(),
      date: _dateController.text.trim(),
      time: _timeController.text.trim(),
      description: _descriptionController.text.trim(),
      artists: _selectedArtists,
      committeeMembers: _selectedCommitteeMembers,
    );

    if (!mounted) return;
    Navigator.pop(context); // close loading spinner
    final ok = result['success'] == true;

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        icon: Icon(ok ? Icons.check_circle : Icons.error,
            color: ok ? Colors.green : Colors.red, size: 48),
        title: Text(ok ? 'Success!' : 'Failed'),
        content: Text(ok
            ? (result['message']?.toString() ??
                'Jatra registered successfully!\nYou will be notified about approval status.')
            : (result['error']?.toString() ?? 'Could not register jatra')),
        actions: [
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context); // close result dialog
              if (ok) Navigator.pop(context); // go back
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF001F3F),
              foregroundColor: Colors.white,
            ),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      appBar: AppBar(
        backgroundColor: const Color(0xFF001F3F),
        elevation: 0,
        title: const Text(
          'Jatra Registration',
          style: TextStyle(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.w600,
          ),
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: Form(
        key: _formKey,
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Jatra Name
              TextFormField(
                controller: _jatraNameController,
                decoration: InputDecoration(
                  labelText: 'Jatra Name',
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                  filled: true,
                  fillColor: Colors.white,
                ),
                validator: (value) => value?.isEmpty == true ? 'Enter jatra name' : null,
              ),
              const SizedBox(height: 16),
              
              // Venue
              TextFormField(
                controller: _venueController,
                decoration: InputDecoration(
                  labelText: 'Venue',
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                  filled: true,
                  fillColor: Colors.white,
                ),
                validator: (value) => value?.isEmpty == true ? 'Enter venue' : null,
              ),
              const SizedBox(height: 16),
              
              // Date and Time
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _dateController,
                      readOnly: true,
                      onTap: _selectDate,
                      decoration: InputDecoration(
                        labelText: 'Date',
                        suffixIcon: const Icon(Icons.calendar_today),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                        filled: true,
                        fillColor: Colors.white,
                      ),
                      validator: (value) => value?.isEmpty == true ? 'Select date' : null,
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: TextFormField(
                      controller: _timeController,
                      readOnly: true,
                      onTap: _selectTime,
                      decoration: InputDecoration(
                        labelText: 'Time',
                        suffixIcon: const Icon(Icons.access_time),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                        filled: true,
                        fillColor: Colors.white,
                      ),
                      validator: (value) => value?.isEmpty == true ? 'Select time' : null,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),
              
              // Artists Selection
              const Text(
                'Select Artists',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              GestureDetector(
                onTap: _loadingArtists
                    ? null
                    : () => _showSelectionDialog('Artists', _availableArtists, _selectedArtists),
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    border: Border.all(color: Colors.grey.shade300),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    _loadingArtists
                        ? 'Loading artists...'
                        : _selectedArtists.isEmpty
                            ? 'Tap to select artists'
                            : '${_selectedArtists.length} artists selected',
                    style: TextStyle(
                      color: _selectedArtists.isEmpty ? Colors.grey.shade600 : Colors.black,
                    ),
                  ),
                ),
              ),
              if (_selectedArtists.isNotEmpty) ...[
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  children: _selectedArtists.map((artist) => Chip(
                    label: Text(artist.split(' - ')[0]),
                    onDeleted: () => setState(() => _selectedArtists.remove(artist)),
                  )).toList(),
                ),
              ],
              const SizedBox(height: 24),
              
              // Committee Members Selection
              const Text(
                'Select Committee Members',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              GestureDetector(
                onTap: _addCommitteeMemberDialog,
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    border: Border.all(color: Colors.grey.shade300),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    _selectedCommitteeMembers.isEmpty
                        ? 'Tap to add committee members'
                        : '${_selectedCommitteeMembers.length} members selected',
                    style: TextStyle(
                      color: _selectedCommitteeMembers.isEmpty ? Colors.grey.shade600 : Colors.black,
                    ),
                  ),
                ),
              ),
              if (_selectedCommitteeMembers.isNotEmpty) ...[
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  children: _selectedCommitteeMembers.map((member) => Chip(
                    label: Text(member.split(' - ')[0]),
                    onDeleted: () => setState(() => _selectedCommitteeMembers.remove(member)),
                  )).toList(),
                ),
              ],
              const SizedBox(height: 24),
              
              // Description
              TextFormField(
                controller: _descriptionController,
                maxLines: 4,
                decoration: InputDecoration(
                  labelText: 'Description',
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                  filled: true,
                  fillColor: Colors.white,
                ),
              ),
              const SizedBox(height: 32),
              
              // Submit Button
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _submitRegistration,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF001F3F),
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                  child: const Text(
                    'Register Jatra',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Colors.white),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
      bottomNavigationBar: BottomNavigationBar(
        type: BottomNavigationBarType.fixed,
        backgroundColor: Colors.white,
        selectedItemColor: const Color(0xFF001F3F),
        unselectedItemColor: Colors.grey.shade600,
        currentIndex: _selectedIndex,
        onTap: (index) {
          setState(() {
            _selectedIndex = index;
          });
          
          switch (index) {
            case 0: // Home
              Navigator.pop(context);
              break;
            case 1: // Events
              Navigator.pushReplacement(
                context,
                MaterialPageRoute(builder: (context) => const EventManagementScreen()),
              );
              break;
            case 2: // Jatra - current screen
              break;
            case 3: // Scan
              Navigator.pushReplacement(
                context,
                MaterialPageRoute(builder: (context) => const QRScannerScreen()),
              );
              break;
          }
        },
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.home),
            label: 'Home',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.event),
            label: 'Events',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.festival),
            label: 'Jatra',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.qr_code_scanner),
            label: 'Scan',
          ),
        ],
      ),
    );
  }
}