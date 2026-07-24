// Add these imports at the top
import '../services/api_service.dart';

// Add these state variables after line 33
  List<Map<String, dynamic>> _categories = [];
  List<String> _languages = [];
  String? _selectedCategory;
  String? _selectedLanguage;

// Replace initState method (around line 42)
  @override
  void initState() {
    super.initState();
    _loadData();
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
      setState(() => _languages = List<String>.from(result['languages']));
    }
  }

// Add after Event Name TextField (around line 185) - Add these two dropdowns:
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
            DropdownButtonFormField<String>(
              value: _selectedCategory,
              decoration: InputDecoration(
                hintText: 'Select event category',
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
              items: _categories.map((category) {
                return DropdownMenuItem<String>(
                  value: category['name'],
                  child: Text(category['name']),
                );
              }).toList(),
              onChanged: (value) => setState(() => _selectedCategory = value),
            ),
            const SizedBox(height: 16),
            
            // Language Dropdown
            const Text(
              'Language *',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: Colors.black87,
              ),
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              value: _selectedLanguage,
              decoration: InputDecoration(
                hintText: 'Select event language',
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
              items: _languages.map((language) {
                return DropdownMenuItem<String>(
                  value: language,
                  child: Text(language),
                );
              }).toList(),
              onChanged: (value) => setState(() => _selectedLanguage = value),
            ),

// Update _continueToNextStep method (around line 1050) - Add validation:
    if (_selectedCategory == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select a category')),
      );
      return;
    }
    
    if (_selectedLanguage == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select a language')),
      );
      return;
    }

// Update eventData map (around line 1080) - Add category and language:
    final eventData = {
      'name': _eventNameController.text,
      'category': _selectedCategory,
      'language': _selectedLanguage,
      'locationType': _selectedLocationType,
      'artists': _addedArtists,
      'startDate': _dateController.text,
      'startTime': _timeController.text,
      'endDate': _endDateController.text,
      'endTime': _endTimeController.text,
    };
