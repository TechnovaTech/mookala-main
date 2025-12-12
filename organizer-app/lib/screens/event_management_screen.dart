import 'package:flutter/material.dart';
import 'edit_event_screen.dart';
import 'jatra_registration_screen.dart';
import 'qr_scanner_screen.dart';
import 'event_details_screen.dart';
import 'profile_screen.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../services/api_service.dart';

class EventManagementScreen extends StatefulWidget {
  const EventManagementScreen({super.key});

  @override
  State<EventManagementScreen> createState() => _EventManagementScreenState();
}

class _EventManagementScreenState extends State<EventManagementScreen> {
  int _selectedIndex = 1; // Events tab selected
  String _selectedLocationType = 'venue'; // Default to venue
  final TextEditingController _locationController = TextEditingController();
  final TextEditingController _addressController = TextEditingController();
  final TextEditingController _cityController = TextEditingController();
  List<Map<String, dynamic>> _locationSuggestions = [];
  bool _showSuggestions = false;
  final String _googleApiKey = 'YOUR_GOOGLE_PLACES_API_KEY'; // Replace with your API key
  final TextEditingController _accessInstructionsController = TextEditingController();
  final TextEditingController _videoLinkController = TextEditingController();
  String _selectedPlatform = 'youtube';
  List<Map<String, dynamic>> _addedArtists = [];
  List<Map<String, dynamic>> _availableArtists = [];
  final TextEditingController _eventNameController = TextEditingController();
  bool _isLoading = false;
  final TextEditingController _dateController = TextEditingController();
  final TextEditingController _timeController = TextEditingController();
  final TextEditingController _endDateController = TextEditingController();
  final TextEditingController _endTimeController = TextEditingController();
  bool _showLocationError = false;
  bool _showEndTime = false;
  List<Map<String, dynamic>> _categories = [];
  List<String> _languages = [];
  String? _selectedCategory;
  List<String> _selectedLanguages = [];

  @override
  void initState() {
    super.initState();
    _loadData();
    WidgetsBinding.instance.addPostFrameCallback((_) => _setCurrentDateTime());
  }
  
  void _setCurrentDateTime() {
    final now = DateTime.now();
    final currentTime = TimeOfDay.now();
    setState(() {
      _dateController.text = '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
      _timeController.text = currentTime.format(context);
    });
  }
  
  Future<void> _loadData() async {
    await Future.wait([_loadArtists(), _loadCategories(), _loadLanguages()]);
  }
  
  Future<void> _loadCategories() async {
    final result = await ApiService.getCategories();
    if (result['success'] == true && result['categories'] != null) {
      setState(() => _categories = List<Map<String, dynamic>>.from(result['categories']));
    }
  }
  
  Future<void> _loadLanguages() async {
    final result = await ApiService.getLanguages();
    if (result['success'] == true && result['languages'] != null) {
      final languages = List<String>.from(result['languages']);
      setState(() => _languages = languages.where((lang) => lang != null && lang.trim().isNotEmpty).toList());
    } else {
      // Fallback to default languages if API fails
      setState(() => _languages = [
        'Hindi', 'English', 'Gujarati', 'Marathi', 'Tamil', 'Telugu', 'Bengali', 'Kannada', 'Malayalam', 'Punjabi'
      ]);
    }
  }

  Future<void> _loadArtists() async {
    try {
      final response = await http.get(
        Uri.parse('http://localhost:3000/api/artists'),
        headers: {'Content-Type': 'application/json'},
      );
      
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        setState(() {
          _availableArtists = List<Map<String, dynamic>>.from(data['artists']);
        });
      }
    } catch (e) {
      print('Error loading artists: $e');
    }
  }

  void _showLanguageSelectionDialog() {
    List<String> tempSelectedLanguages = List.from(_selectedLanguages);
    
    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Select Languages'),
          content: SizedBox(
            width: double.maxFinite,
            height: 400,
            child: _languages.isEmpty
                ? const Center(child: Text('No languages available'))
                : ListView.builder(
                    itemCount: _languages.length,
                    itemBuilder: (context, index) {
                      final language = _languages[index];
                      if (language == null || language.trim().isEmpty) {
                        return const SizedBox.shrink();
                      }
                      final isSelected = tempSelectedLanguages.contains(language);
                      
                      return CheckboxListTile(
                        title: Text(language),
                        value: isSelected,
                        activeColor: const Color(0xFF001F3F),
                        onChanged: (bool? value) {
                          setDialogState(() {
                            if (value == true && !tempSelectedLanguages.contains(language)) {
                              tempSelectedLanguages.add(language);
                            } else if (value == false) {
                              tempSelectedLanguages.remove(language);
                            }
                          });
                        },
                      );
                    },
                  ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () {
                setState(() {
                  _selectedLanguages = tempSelectedLanguages.where((lang) => lang != null && lang.trim().isNotEmpty).toList();
                });
                Navigator.pop(context);
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF001F3F),
                foregroundColor: Colors.white,
              ),
              child: const Text('Done'),
            ),
          ],
        ),
      ),
    );
  }

  void _showAddArtistDialog() {
    final TextEditingController searchController = TextEditingController();
    List<Map<String, dynamic>> filteredArtists = List.from(_availableArtists);
    List<Map<String, dynamic>> tempSelectedArtists = List.from(_addedArtists);
    
    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Select Artists'),
          content: SizedBox(
            width: double.maxFinite,
            height: 400,
            child: Column(
              children: [
                TextField(
                  controller: searchController,
                  decoration: InputDecoration(
                    hintText: 'Search artists...',
                    prefixIcon: const Icon(Icons.search),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  ),
                  onChanged: (value) {
                    setDialogState(() {
                      filteredArtists = _availableArtists.where((artist) {
                        final name = (artist['name'] ?? '').toLowerCase();
                        final genre = (artist['genre'] ?? '').toLowerCase();
                        final search = value.toLowerCase();
                        return name.contains(search) || genre.contains(search);
                      }).toList();
                    });
                  },
                ),
                const SizedBox(height: 16),
                Expanded(
                  child: filteredArtists.isEmpty
                      ? const Center(child: Text('No artists found'))
                      : ListView.builder(
                          itemCount: filteredArtists.length,
                          itemBuilder: (context, index) {
                            final artist = filteredArtists[index];
                            final isSelected = tempSelectedArtists.any((a) => a['_id'] == artist['_id']);
                            
                            return CheckboxListTile(
                              secondary: CircleAvatar(
                                backgroundColor: const Color(0xFF001F3F).withOpacity(0.1),
                                child: const Icon(Icons.person, color: Color(0xFF001F3F), size: 20),
                              ),
                              title: Text(artist['name'] ?? ''),
                              subtitle: Text(artist['genre'] ?? ''),
                              value: isSelected,
                              activeColor: const Color(0xFF001F3F),
                              onChanged: (bool? value) {
                                setDialogState(() {
                                  if (value == true) {
                                    tempSelectedArtists.add(artist);
                                  } else {
                                    tempSelectedArtists.removeWhere((a) => a['_id'] == artist['_id']);
                                  }
                                });
                              },
                            );
                          },
                        ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () {
                setState(() {
                  _addedArtists = tempSelectedArtists;
                });
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('${tempSelectedArtists.length} artist(s) selected')),
                );
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF001F3F),
                foregroundColor: Colors.white,
              ),
              child: const Text('Done'),
            ),
          ],
        ),
      ),
    );
  }
  List<Map<String, dynamic>> events = [
    {
      'title': 'Garba Night 2024',
      'dateTime': 'Oct 15, 2024 • 7:00 PM',
      'status': 'Live',
      'statusColor': Colors.green,
      'attendees': 450,
    },
    {
      'title': 'Diwali Celebration',
      'dateTime': 'Nov 1, 2024 • 6:00 PM',
      'status': 'Upcoming',
      'statusColor': Colors.orange,
      'attendees': 320,
    },
    {
      'title': 'Cultural Festival',
      'dateTime': 'Nov 10, 2024 • 5:00 PM',
      'status': 'Draft',
      'statusColor': Colors.grey,
      'attendees': 0,
    },
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      appBar: AppBar(
        backgroundColor: const Color(0xFF001F3F),
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Text(
          'Event Management',
          style: TextStyle(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Event Name Section
            const Text(
              'Event Name *',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: Colors.black87,
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _eventNameController,
              decoration: InputDecoration(
                hintText: 'Enter the name of your event',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: BorderSide(color: Colors.grey.shade300),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: BorderSide(color: Colors.grey.shade300),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: Color(0xFF001F3F)),
                ),
                contentPadding: const EdgeInsets.all(16),
              ),
            ),
            const SizedBox(height: 16),
            
            // Category Dropdown
            const Text(
              'Category *',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: Colors.black87,
              ),
            ),
            const SizedBox(height: 8),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              decoration: BoxDecoration(
                border: Border.all(color: Colors.grey.shade300),
                borderRadius: BorderRadius.circular(8),
              ),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  value: _selectedCategory,
                  isExpanded: true,
                  hint: const Text('Select event category'),
                  menuMaxHeight: 300,
                  items: _categories.map((category) {
                    return DropdownMenuItem<String>(
                      value: category['name'],
                      child: Text(category['name']),
                    );
                  }).toList(),
                  onChanged: (value) => setState(() => _selectedCategory = value),
                ),
              ),
            ),
            const SizedBox(height: 16),
            
            // Language Selection
            const Text(
              'Languages *',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: Colors.black87,
              ),
            ),
            const SizedBox(height: 8),
            GestureDetector(
              onTap: _showLanguageSelectionDialog,
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  border: Border.all(color: Colors.grey.shade300),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: _selectedLanguages.isEmpty
                          ? const Text(
                              'Select event languages',
                              style: TextStyle(color: Colors.grey),
                            )
                          : Wrap(
                              spacing: 8,
                              runSpacing: 4,
                              children: _selectedLanguages.map((language) {
                                return Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFF001F3F).withOpacity(0.1),
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: Text(
                                    language,
                                    style: const TextStyle(
                                      fontSize: 12,
                                      color: Color(0xFF001F3F),
                                      fontWeight: FontWeight.w500,
                                    ),
                                  ),
                                );
                              }).toList(),
                            ),
                    ),
                    const Icon(Icons.arrow_drop_down, color: Colors.grey),
                  ],
                ),
              ),
            ),
            
            const SizedBox(height: 32),
            
            // Location Section
            const Text(
              'Location',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: Colors.black87,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Choose where your event will take place.',
              style: TextStyle(
                fontSize: 14,
                color: Colors.grey.shade600,
              ),
            ),
            const SizedBox(height: 16),
            
            const Text(
              'Where will your event take place?',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: Colors.black87,
              ),
            ),
            const SizedBox(height: 12),
            
            // Venue Option
            _buildLocationOption(
              'venue',
              Icons.location_on,
              'Venue',
              'Host in-person events with check-in management.',
            ),
            
            // Venue Fields (show immediately after venue option if selected)
            if (_selectedLocationType == 'venue') ...[
              const SizedBox(height: 20),
              _buildLocationAutocompleteField(),
              const SizedBox(height: 16),
              _buildTextField('Address *', _addressController, 'Enter the full address'),
              const SizedBox(height: 16),
              _buildTextField('City *', _cityController, 'Enter city name'),
            ],
            
            const SizedBox(height: 12),
            
            // Online Option
            _buildLocationOption(
              'online',
              Icons.videocam,
              'Online',
              'Host virtual events, sharing access with ticket buyers.',
            ),
            const SizedBox(height: 12),
            
            // Recorded Option
            _buildLocationOption(
              'recorded',
              Icons.play_circle,
              'Recorded events',
              'Provide instant access to pre-recorded content after purchase.',
            ),
            
            // Recorded Fields (show immediately after recorded option if selected)
            if (_selectedLocationType == 'recorded') ...[
              const SizedBox(height: 20),
              const Text(
                'Where is your recorded event hosted? *',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: Colors.black87,
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: _buildPlatformOption('youtube', 'Youtube'),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _buildPlatformOption('vimeo', 'Vimeo'),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _buildPlatformOption('others', 'Others'),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              _buildVideoLinkField(),
              // Only show access instructions for 'others' platform
              if (_selectedPlatform == 'others') ...[
                const SizedBox(height: 20),
                const Text(
                  'Provide instruction to access your event content *',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: Colors.black87,
                  ),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _accessInstructionsController,
                  maxLines: 6,
                  decoration: InputDecoration(
                    hintText: 'Enter steps to access your event video',
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: BorderSide(color: Colors.grey.shade300),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: BorderSide(color: Colors.grey.shade300),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: const BorderSide(color: Color(0xFF001F3F)),
                    ),
                    contentPadding: const EdgeInsets.all(16),
                  ),
                ),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.green.shade50,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.green.shade200),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.info_outline, size: 16, color: Colors.green.shade600),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'People who register for your event will get instant access to your video content.',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.green.shade700,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ] else if (_selectedPlatform == 'youtube' || _selectedPlatform == 'vimeo') ...[
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.green.shade50,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.green.shade200),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.info_outline, size: 16, color: Colors.green.shade600),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'People who register for your event will get instant access to your video content.',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.green.shade700,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
            
            const SizedBox(height: 32),
            
            // Artist Section
            const Text(
              'Artists',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: Colors.black87,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Add artists to your event.',
              style: TextStyle(
                fontSize: 14,
                color: Colors.grey.shade600,
              ),
            ),
            const SizedBox(height: 16),
            
            // Add Artist Button
            GestureDetector(
              onTap: () {
                _showAddArtistDialog();
              },
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  border: Border.all(
                    color: const Color(0xFF001F3F),
                    width: 2,
                  ),
                  borderRadius: BorderRadius.circular(8),
                  color: const Color(0xFF001F3F).withOpacity(0.05),
                ),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: const Color(0xFF001F3F).withOpacity(0.1),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: const Icon(
                        Icons.person_add,
                        size: 20,
                        color: Color(0xFF001F3F),
                      ),
                    ),
                    const SizedBox(width: 12),
                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Add Artist',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          Text(
                            'Add performers to your event.',
                            style: TextStyle(
                              fontSize: 14,
                              color: Colors.grey,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            
            // Added Artists List
            if (_addedArtists.isNotEmpty) ...[
              const SizedBox(height: 16),
              ..._addedArtists.map((artist) => Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.grey.shade300),
                ),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 20,
                      backgroundColor: const Color(0xFF001F3F).withOpacity(0.1),
                      child: const Icon(
                        Icons.person,
                        color: Color(0xFF001F3F),
                        size: 20,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            artist['name'] ?? '',
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          Text(
                            artist['genre'] ?? '',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey.shade600,
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: () {
                        setState(() {
                          _addedArtists.remove(artist);
                        });
                      },
                      icon: const Icon(Icons.close, size: 16),
                      color: Colors.red,
                    ),
                  ],
                ),
              )).toList(),
            ],
            
            const SizedBox(height: 32),
            
            // Date and Time Section
            const Text(
              'Date and time',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: Colors.black87,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Select the event date, time, and timezone.',
              style: TextStyle(
                fontSize: 14,
                color: Colors.grey.shade600,
              ),
            ),
            const SizedBox(height: 16),
            

            
            // Start Date and Time
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Start date *',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: Colors.black87,
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _dateController,
                        readOnly: true,
                        onTap: () async {
                          final date = await showDatePicker(
                            context: context,
                            initialDate: DateTime.now(),
                            firstDate: DateTime.now(),
                            lastDate: DateTime.now().add(const Duration(days: 365)),
                          );
                          if (date != null) {
                            setState(() {
                              _dateController.text = '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
                            });
                          }
                        },
                        decoration: InputDecoration(
                          hintText: '2025-12-02',
                          prefixIcon: const Icon(Icons.calendar_today),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                            borderSide: BorderSide(color: Colors.grey.shade300),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                            borderSide: BorderSide(color: Colors.grey.shade300),
                          ),
                          contentPadding: const EdgeInsets.all(16),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Start time *',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: Colors.black87,
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _timeController,
                        readOnly: true,
                        onTap: () async {
                          final time = await showTimePicker(
                            context: context,
                            initialTime: TimeOfDay.now(),
                          );
                          if (time != null) {
                            setState(() {
                              _timeController.text = time.format(context);
                            });
                          }
                        },
                        decoration: InputDecoration(
                          hintText: '12:00 AM',
                          prefixIcon: const Icon(Icons.access_time),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                            borderSide: BorderSide(color: Colors.grey.shade300),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                            borderSide: BorderSide(color: Colors.grey.shade300),
                          ),
                          contentPadding: const EdgeInsets.all(16),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            
            // Add End Time
            if (!_showEndTime)
              TextButton.icon(
                onPressed: () {
                  final now = DateTime.now();
                  final currentTime = TimeOfDay.now();
                  setState(() {
                    _showEndTime = true;
                    _endDateController.text = '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
                    _endTimeController.text = currentTime.format(context);
                  });
                },
                icon: const Icon(Icons.add, color: Colors.grey),
                label: const Text(
                  'Add end time',
                  style: TextStyle(color: Colors.grey),
                ),
              ),
            
            // End Date and Time (appears when Add end time is clicked)
            if (_showEndTime) ...[
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'End date *',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                            color: Colors.black87,
                          ),
                        ),
                        const SizedBox(height: 8),
                        TextField(
                          controller: _endDateController,
                          readOnly: true,
                          onTap: () async {
                            final date = await showDatePicker(
                              context: context,
                              initialDate: DateTime.now(),
                              firstDate: DateTime.now(),
                              lastDate: DateTime.now().add(const Duration(days: 365)),
                            );
                            if (date != null) {
                              setState(() {
                                _endDateController.text = '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
                              });
                            }
                          },
                          decoration: InputDecoration(
                            hintText: '2025-12-02',
                            prefixIcon: const Icon(Icons.calendar_today),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(8),
                              borderSide: BorderSide(color: Colors.grey.shade300),
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(8),
                              borderSide: BorderSide(color: Colors.grey.shade300),
                            ),
                            contentPadding: const EdgeInsets.all(16),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'End time *',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                            color: Colors.black87,
                          ),
                        ),
                        const SizedBox(height: 8),
                        TextField(
                          controller: _endTimeController,
                          readOnly: true,
                          onTap: () async {
                            final time = await showTimePicker(
                              context: context,
                              initialTime: TimeOfDay.now(),
                            );
                            if (time != null) {
                              setState(() {
                                _endTimeController.text = time.format(context);
                              });
                            }
                          },
                          decoration: InputDecoration(
                            hintText: '12:00 AM',
                            prefixIcon: const Icon(Icons.access_time),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(8),
                              borderSide: BorderSide(color: Colors.grey.shade300),
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(8),
                              borderSide: BorderSide(color: Colors.grey.shade300),
                            ),
                            contentPadding: const EdgeInsets.all(16),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              TextButton.icon(
                onPressed: () {
                  setState(() {
                    _showEndTime = false;
                    _endDateController.clear();
                    _endTimeController.clear();
                  });
                },
                icon: const Icon(Icons.remove, color: Colors.grey),
                label: const Text(
                  'Remove end time',
                  style: TextStyle(color: Colors.grey),
                ),
              ),
            ],
            const SizedBox(height: 16),
            
            // Time Zone
            const Text(
              'Time Zone *',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: Colors.black87,
              ),
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              decoration: InputDecoration(
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: BorderSide(color: Colors.grey.shade300),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: BorderSide(color: Colors.grey.shade300),
                ),
                contentPadding: const EdgeInsets.all(16),
              ),
              value: 'IST (GMT+05:30)',
              items: const [
                DropdownMenuItem(
                  value: 'IST (GMT+05:30)',
                  child: Text('IST (GMT+05:30)'),
                ),
              ],
              onChanged: (value) {},
            ),
            

            
            const SizedBox(height: 32),
            
            // Save Button
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _isLoading ? null : _continueToNextStep,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF001F3F),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
                child: _isLoading
                    ? const CircularProgressIndicator(color: Colors.white)
                    : const Text(
                        'Continue',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                      ),
              ),
            ),
            
            const SizedBox(height: 20),
          ],
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
            case 1: // Events - current screen
              break;
            case 2: // Jatra
              Navigator.pushReplacement(
                context,
                MaterialPageRoute(builder: (context) => const JatraRegistrationScreen()),
              );
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
          BottomNavigationBarItem(icon: Icon(Icons.home), label: 'Home'),
          BottomNavigationBarItem(icon: Icon(Icons.event), label: 'Events'),
          BottomNavigationBarItem(icon: Icon(Icons.festival), label: 'Jatra'),
          BottomNavigationBarItem(icon: Icon(Icons.qr_code_scanner), label: 'Scan'),
        ],
      ),
    );
  }

  Widget _buildActionCard(String title, String subtitle, IconData icon, Color color, VoidCallback onTap) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(12),
      elevation: 2,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: color.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  icon,
                  color: color,
                  size: 32,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                title,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  color: Colors.black87,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 4),
              Text(
                subtitle,
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.grey.shade600,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildLocationOption(String type, IconData icon, String title, String description) {
    bool isSelected = _selectedLocationType == type;
    return GestureDetector(
      onTap: () {
        setState(() {
          _selectedLocationType = type;
        });
      },
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          border: Border.all(
            color: isSelected ? const Color(0xFF001F3F) : Colors.grey.shade300,
            width: isSelected ? 2 : 1,
          ),
          borderRadius: BorderRadius.circular(8),
          color: isSelected ? const Color(0xFF001F3F).withOpacity(0.05) : Colors.white,
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: isSelected ? const Color(0xFF001F3F).withOpacity(0.1) : Colors.grey.shade100,
                borderRadius: BorderRadius.circular(6),
              ),
              child: Icon(
                icon,
                size: 20,
                color: isSelected ? const Color(0xFF001F3F) : Colors.grey.shade600,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    description,
                    style: const TextStyle(
                      fontSize: 14,
                      color: Colors.grey,
                    ),
                  ),
                ],
              ),
            ),
            if (isSelected)
              const Icon(
                Icons.check_circle,
                color: Color(0xFF001F3F),
                size: 20,
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildTextField(String label, TextEditingController controller, String hint) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
            color: Colors.black87,
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: controller,
          decoration: InputDecoration(
            hintText: hint,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: BorderSide(color: Colors.grey.shade300),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: BorderSide(color: Colors.grey.shade300),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: const BorderSide(color: Color(0xFF001F3F)),
            ),
            contentPadding: const EdgeInsets.all(16),
          ),
        ),
      ],
    );
  }

  Widget _buildPlatformOption(String platform, String title) {
    bool isSelected = _selectedPlatform == platform;
    return GestureDetector(
      onTap: () {
        setState(() {
          _selectedPlatform = platform;
          _videoLinkController.clear();
          _accessInstructionsController.clear(); // Clear access instructions when platform changes
        });
      },
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
        decoration: BoxDecoration(
          border: Border.all(
            color: isSelected ? const Color(0xFF001F3F) : Colors.grey.shade300,
            width: isSelected ? 2 : 1,
          ),
          borderRadius: BorderRadius.circular(8),
          color: isSelected ? const Color(0xFF001F3F).withOpacity(0.05) : Colors.white,
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              title,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w500,
                color: isSelected ? const Color(0xFF001F3F) : Colors.black87,
              ),
            ),
            if (isSelected) ...[
              const SizedBox(width: 8),
              const Icon(
                Icons.check_circle,
                color: Color(0xFF001F3F),
                size: 16,
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildVideoLinkField() {
    String label;
    String hint;
    
    switch (_selectedPlatform) {
      case 'youtube':
        label = 'Link of the youtube video *';
        hint = 'ex. https://youtube.com/yourvideo';
        break;
      case 'vimeo':
        label = 'Link of the vimeo video *';
        hint = 'ex. https://vimeo.com/yourvideo';
        break;
      case 'others':
        label = 'Link of the video *';
        hint = 'ex. https://yourplatform.com/yourvideo';
        break;
      default:
        label = 'Video Link *';
        hint = 'Enter video link';
    }
    
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
            color: Colors.black87,
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _videoLinkController,
          decoration: InputDecoration(
            hintText: hint,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: BorderSide(color: Colors.grey.shade300),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: BorderSide(color: Colors.grey.shade300),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: const BorderSide(color: Color(0xFF001F3F)),
            ),
            contentPadding: const EdgeInsets.all(16),
          ),
        ),
      ],
    );
  }

  Widget _buildLocationAutocompleteField() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Location Name *',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
            color: Colors.black87,
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _locationController,
          onChanged: (value) {
            if (value.length > 2) {
              _searchPlaces(value);
            } else {
              setState(() {
                _showSuggestions = false;
                _locationSuggestions.clear();
              });
            }
          },
          decoration: InputDecoration(
            hintText: 'Start typing location name for suggestions',
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: BorderSide(color: Colors.grey.shade300),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: BorderSide(color: Colors.grey.shade300),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: const BorderSide(color: Color(0xFF001F3F)),
            ),
            contentPadding: const EdgeInsets.all(16),
          ),
        ),
        if (_showSuggestions && _locationSuggestions.isNotEmpty)
          Container(
            margin: const EdgeInsets.only(top: 4),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(8),
              boxShadow: [
                BoxShadow(
                  color: Colors.grey.withOpacity(0.2),
                  spreadRadius: 1,
                  blurRadius: 4,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: ListView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: _locationSuggestions.length,
              itemBuilder: (context, index) {
                final suggestion = _locationSuggestions[index];
                return ListTile(
                  leading: const Icon(Icons.location_on, color: Colors.grey),
                  title: Text(
                    suggestion['main_text'] ?? '',
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                  subtitle: Text(
                    suggestion['secondary_text'] ?? '',
                    style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
                  ),
                  onTap: () => _selectPlace(suggestion),
                );
              },
            ),
          ),
        if (_showSuggestions && _locationSuggestions.isNotEmpty)
          Container(
            padding: const EdgeInsets.all(8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                Text(
                  'powered by ',
                  style: TextStyle(fontSize: 10, color: Colors.grey.shade600),
                ),
                Image.network(
                  'https://developers.google.com/maps/documentation/places/web-service/images/powered_by_google_on_white.png',
                  height: 12,
                ),
              ],
            ),
          ),
      ],
    );
  }

  Future<void> _searchPlaces(String query) async {
    if (_googleApiKey == 'YOUR_GOOGLE_PLACES_API_KEY') {
      // Mock data for demonstration
      setState(() {
        _locationSuggestions = [
          {
            'place_id': '1',
            'main_text': 'Hemu Gadhvi Hall Road',
            'secondary_text': 'Rama Krishan Nagar, Rajkot, Gujarat, India',
          },
          {
            'place_id': '2',
            'main_text': 'Hemu Gadhavi Auditorium',
            'secondary_text': 'Tagore Road, Rama Krishan Nagar, Rajkot, Gujarat',
          },
          {
            'place_id': '3',
            'main_text': 'Hemu Raj Gautam',
            'secondary_text': 'Minaura, Uttar Pradesh, India',
          },
        ];
        _showSuggestions = true;
      });
      return;
    }

    try {
      final url = Uri.parse(
        'https://maps.googleapis.com/maps/api/place/autocomplete/json?input=$query&key=$_googleApiKey&components=country:in',
      );
      
      final response = await http.get(url);
      
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        final predictions = data['predictions'] as List;
        
        setState(() {
          _locationSuggestions = predictions.map((prediction) => {
            'place_id': prediction['place_id'],
            'main_text': prediction['structured_formatting']['main_text'],
            'secondary_text': prediction['structured_formatting']['secondary_text'] ?? '',
          }).toList();
          _showSuggestions = true;
        });
      }
    } catch (e) {
      print('Error searching places: $e');
    }
  }

  Future<void> _selectPlace(Map<String, dynamic> place) async {
    _locationController.text = place['main_text'];
    setState(() {
      _showSuggestions = false;
    });

    if (_googleApiKey == 'YOUR_GOOGLE_PLACES_API_KEY') {
      // Mock data for demonstration
      _addressController.text = place['secondary_text'];
      _cityController.text = 'Rajkot';
      return;
    }

    // Get place details to fill address and city
    try {
      final url = Uri.parse(
        'https://maps.googleapis.com/maps/api/place/details/json?place_id=${place['place_id']}&key=$_googleApiKey&fields=formatted_address,address_components',
      );
      
      final response = await http.get(url);
      
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        final result = data['result'];
        
        _addressController.text = result['formatted_address'] ?? '';
        
        // Extract city from address components
        final addressComponents = result['address_components'] as List;
        for (var component in addressComponents) {
          final types = component['types'] as List;
          if (types.contains('locality') || types.contains('administrative_area_level_2')) {
            _cityController.text = component['long_name'];
            break;
          }
        }
      }
    } catch (e) {
      print('Error getting place details: $e');
    }
  }

  void _continueToNextStep() {
    // Validation
    if (_eventNameController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter event name')),
      );
      return;
    }
    
    if (_selectedCategory == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select a category')),
      );
      return;
    }
    
    if (_selectedLanguages.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select at least one language')),
      );
      return;
    }

    if (_selectedLocationType == 'venue' && _locationController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter location details')),
      );
      return;
    }

    if (_selectedLocationType == 'recorded' && _videoLinkController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter video link')),
      );
      return;
    }

    if (_dateController.text.isEmpty || _timeController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select date and time')),
      );
      return;
    }

    // Prepare event data to pass to next screen
    final eventData = {
      'name': _eventNameController.text,
      'category': _selectedCategory,
      'languages': _selectedLanguages,
      'locationType': _selectedLocationType,
      'artists': _addedArtists,
      'startDate': _dateController.text,
      'startTime': _timeController.text,
      'endDate': _endDateController.text,
      'endTime': _endTimeController.text,
    };

    // Add location-specific data
    if (_selectedLocationType == 'venue') {
      eventData['location'] = {
        'name': _locationController.text,
        'address': _addressController.text,
        'city': _cityController.text,
      };
    } else if (_selectedLocationType == 'recorded') {
      eventData['recordedDetails'] = {
        'platform': _selectedPlatform,
        'videoLink': _videoLinkController.text,
        'accessInstructions': _accessInstructionsController.text,
      };
    }

    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => EventDetailsScreen(eventData: eventData),
      ),
    );
  }

  Widget _buildEventItem(String title, String dateTime, String status, Color statusColor, int attendees, int index) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.grey.withOpacity(0.1),
            spreadRadius: 1,
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: Colors.black87,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  dateTime,
                  style: TextStyle(
                    fontSize: 14,
                    color: Colors.grey.shade600,
                  ),
                ),
                if (attendees > 0) ...[
                  const SizedBox(height: 4),
                  Text(
                    '$attendees attendees',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey.shade500,
                    ),
                  ),
                ],
              ],
            ),
          ),
          Column(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: statusColor.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  status,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: statusColor,
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  IconButton(
                    onPressed: () => _editEvent(index),
                    icon: const Icon(Icons.edit, size: 20),
                    color: Colors.blue,
                  ),
                  IconButton(
                    onPressed: () => _deleteEvent(index),
                    icon: const Icon(Icons.delete, size: 20),
                    color: Colors.red,
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  void _navigateToCreateEvent() async {
    final result = await Navigator.push(
      context,
      MaterialPageRoute(builder: (context) => CreateEventScreen(onEventCreated: _addEvent)),
    );
  }

  void _addEvent(Map<String, dynamic> newEvent) {
    setState(() {
      events.add(newEvent);
    });
  }



  void _navigateToSeatingConfig() {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (context) => const SeatingConfigScreen()),
    );
  }



  void _editEvent(int index) async {
    final event = events[index];
    final result = await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => EditEventScreen(
          eventTitle: event['title'],
          eventDate: event['dateTime'],
          eventLocation: 'Event Location',
        ),
      ),
    );
  }

  void _updateEvent(int index, Map<String, dynamic> updatedEvent) {
    setState(() {
      events[index] = updatedEvent;
    });
  }

  void _deleteEvent(int index) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Event'),
        content: Text('Are you sure you want to delete ${events[index]['title']}?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              setState(() {
                events.removeAt(index);
              });
              Navigator.pop(context);
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Event deleted successfully')),
              );
            },
            child: const Text('Delete', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }
}

// Create Event Screen - Multi-step form
class CreateEventScreen extends StatefulWidget {
  final Function(Map<String, dynamic>) onEventCreated;
  
  const CreateEventScreen({super.key, required this.onEventCreated});

  @override
  State<CreateEventScreen> createState() => _CreateEventScreenState();
}

class _CreateEventScreenState extends State<CreateEventScreen> {
  int _currentStep = 0;
  final PageController _pageController = PageController();

  final _basicInfoController = TextEditingController();
  final _venueController = TextEditingController();
  final _artistController = TextEditingController();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF001F3F),
        title: const Text('Create Event', style: TextStyle(color: Colors.white)),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: Column(
        children: [
          // Step Indicator
          Container(
            padding: const EdgeInsets.all(20),
            child: Row(
              children: [
                _buildStepIndicator(0, 'Basic Info'),
                _buildStepLine(),
                _buildStepIndicator(1, 'Venue'),
                _buildStepLine(),
                _buildStepIndicator(2, 'Artists'),
                _buildStepLine(),
                _buildStepIndicator(3, 'Ticketing'),
              ],
            ),
          ),
          
          // Form Content
          Expanded(
            child: PageView(
              controller: _pageController,
              onPageChanged: (index) {
                setState(() {
                  _currentStep = index;
                });
              },
              children: [
                _buildBasicInfoStep(),
                _buildVenueStep(),
                _buildArtistsStep(),
                _buildTicketingStep(),
              ],
            ),
          ),
          
          // Navigation Buttons
          Container(
            padding: const EdgeInsets.all(20),
            child: Row(
              children: [
                if (_currentStep > 0)
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () {
                        _pageController.previousPage(
                          duration: const Duration(milliseconds: 300),
                          curve: Curves.easeInOut,
                        );
                      },
                      child: const Text('Previous'),
                    ),
                  ),
                if (_currentStep > 0) const SizedBox(width: 16),
                Expanded(
                  child: ElevatedButton(
                    onPressed: () {
                      if (_currentStep < 3) {
                        _pageController.nextPage(
                          duration: const Duration(milliseconds: 300),
                          curve: Curves.easeInOut,
                        );
                      } else {
                        _createEvent();
                      }
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF001F3F),
                      foregroundColor: Colors.white,
                    ),
                    child: Text(_currentStep < 3 ? 'Next' : 'Create Event'),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStepIndicator(int step, String title) {
    bool isActive = step <= _currentStep;
    return Column(
      children: [
        Container(
          width: 30,
          height: 30,
          decoration: BoxDecoration(
            color: isActive ? const Color(0xFF001F3F) : Colors.grey.shade300,
            shape: BoxShape.circle,
          ),
          child: Center(
            child: Text(
              '${step + 1}',
              style: TextStyle(
                color: isActive ? Colors.white : Colors.grey.shade600,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        ),
        const SizedBox(height: 4),
        Text(
          title,
          style: TextStyle(
            fontSize: 10,
            color: isActive ? const Color(0xFF001F3F) : Colors.grey.shade600,
          ),
        ),
      ],
    );
  }

  Widget _buildStepLine() {
    return Expanded(
      child: Container(
        height: 2,
        color: Colors.grey.shade300,
        margin: const EdgeInsets.only(bottom: 20),
      ),
    );
  }

  Widget _buildBasicInfoStep() {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Basic Information', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 20),
          TextField(
            controller: _basicInfoController,
            decoration: const InputDecoration(
              labelText: 'Event Name',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            decoration: const InputDecoration(
              labelText: 'Event Description',
              border: OutlineInputBorder(),
            ),
            maxLines: 3,
          ),
          const SizedBox(height: 16),
          TextField(
            decoration: const InputDecoration(
              labelText: 'Event Date',
              border: OutlineInputBorder(),
              suffixIcon: Icon(Icons.calendar_today),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildVenueStep() {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Venue Details', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 20),
          TextField(
            controller: _venueController,
            decoration: const InputDecoration(
              labelText: 'Venue Name',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            decoration: const InputDecoration(
              labelText: 'Address',
              border: OutlineInputBorder(),
            ),
            maxLines: 2,
          ),
          const SizedBox(height: 16),
          TextField(
            decoration: const InputDecoration(
              labelText: 'Capacity',
              border: OutlineInputBorder(),
            ),
            keyboardType: TextInputType.number,
          ),
        ],
      ),
    );
  }

  Widget _buildArtistsStep() {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Artists & Performers', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 20),
          TextField(
            controller: _artistController,
            decoration: const InputDecoration(
              labelText: 'Main Artist',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            decoration: const InputDecoration(
              labelText: 'Supporting Artists',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            decoration: const InputDecoration(
              labelText: 'Performance Duration',
              border: OutlineInputBorder(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTicketingStep() {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Ticketing', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 20),
          TextField(
            decoration: const InputDecoration(
              labelText: 'VIP Price',
              border: OutlineInputBorder(),
              prefixText: '₹ ',
            ),
            keyboardType: TextInputType.number,
          ),
          const SizedBox(height: 16),
          TextField(
            decoration: const InputDecoration(
              labelText: 'Gold Price',
              border: OutlineInputBorder(),
              prefixText: '₹ ',
            ),
            keyboardType: TextInputType.number,
          ),
          const SizedBox(height: 16),
          TextField(
            decoration: const InputDecoration(
              labelText: 'Silver Price',
              border: OutlineInputBorder(),
              prefixText: '₹ ',
            ),
            keyboardType: TextInputType.number,
          ),
        ],
      ),
    );
  }

  void _createEvent() {
    if (_basicInfoController.text.isNotEmpty) {
      final newEvent = {
        'title': _basicInfoController.text,
        'dateTime': 'Dec 1, 2024 • 6:00 PM',
        'status': 'Draft',
        'statusColor': Colors.grey,
        'attendees': 0,
      };
      
      widget.onEventCreated(newEvent);
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Event created successfully!')),
      );
    }
  }
}



// Seating Configuration Screen
class SeatingConfigScreen extends StatefulWidget {
  const SeatingConfigScreen({super.key});

  @override
  State<SeatingConfigScreen> createState() => _SeatingConfigScreenState();
}

class _SeatingConfigScreenState extends State<SeatingConfigScreen> {
  List<Map<String, dynamic>> ticketClasses = [
    {'name': 'VIP', 'price': '₹2000', 'seats': '50 seats', 'color': Colors.purple},
    {'name': 'Gold', 'price': '₹1500', 'seats': '100 seats', 'color': Colors.amber},
    {'name': 'Silver', 'price': '₹1000', 'seats': '200 seats', 'color': Colors.grey},
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF001F3F),
        title: const Text('Seating Configuration', style: TextStyle(color: Colors.white)),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Ticket Classes', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 20),
            ...ticketClasses.asMap().entries.map((entry) {
              int index = entry.key;
              Map<String, dynamic> ticketClass = entry.value;
              return Column(
                children: [
                  _buildTicketClass(
                    ticketClass['name'],
                    ticketClass['price'],
                    ticketClass['seats'],
                    ticketClass['color'],
                    index,
                  ),
                  if (index < ticketClasses.length - 1) const SizedBox(height: 12),
                ],
              );
            }).toList(),
            const SizedBox(height: 32),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () {
                  Navigator.pop(context);
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Seating configuration saved!')),
                  );
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF001F3F),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                ),
                child: const Text('Save Configuration'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTicketClass(String className, String price, String seats, Color color, int index) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: color.withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(Icons.event_seat, color: color),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  className,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  '$price • $seats',
                  style: TextStyle(
                    fontSize: 14,
                    color: Colors.grey.shade600,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            onPressed: () => _editTicketClass(index),
            icon: const Icon(Icons.edit),
            color: Colors.grey.shade600,
          ),
        ],
      ),
    );
  }

  void _editTicketClass(int index) {
    final ticketClass = ticketClasses[index];
    final nameController = TextEditingController(text: ticketClass['name']);
    final priceController = TextEditingController(text: ticketClass['price'].replaceAll('₹', ''));
    final seatsController = TextEditingController(text: ticketClass['seats'].replaceAll(' seats', ''));

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Edit Ticket Class'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameController,
              decoration: const InputDecoration(
                labelText: 'Class Name',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: priceController,
              decoration: const InputDecoration(
                labelText: 'Price',
                border: OutlineInputBorder(),
                prefixText: '₹',
              ),
              keyboardType: TextInputType.number,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: seatsController,
              decoration: const InputDecoration(
                labelText: 'Number of Seats',
                border: OutlineInputBorder(),
              ),
              keyboardType: TextInputType.number,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              setState(() {
                ticketClasses[index] = {
                  'name': nameController.text,
                  'price': '₹${priceController.text}',
                  'seats': '${seatsController.text} seats',
                  'color': ticketClass['color'],
                };
              });
              Navigator.pop(context);
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Ticket class updated successfully!')),
              );
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF001F3F),
              foregroundColor: Colors.white,
            ),
            child: const Text('Update'),
          ),
        ],
      ),
    );
  }
}