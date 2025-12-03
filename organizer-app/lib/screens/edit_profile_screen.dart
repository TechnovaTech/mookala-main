import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class EditProfileScreen extends StatefulWidget {
  const EditProfileScreen({super.key});

  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  final TextEditingController _nameController = TextEditingController(text: 'John Doe');
  final TextEditingController _titleController = TextEditingController(text: 'Professional Musician');
  final TextEditingController _bioController = TextEditingController(text: 'Passionate musician with 10+ years of experience in classical and contemporary music. Specialized in live performances and studio recordings.');
  final TextEditingController _hourlyRateController = TextEditingController(text: '5000');
  final TextEditingController _eventRateController = TextEditingController(text: '25000');
  
  List<String> _selectedSkills = ['Classical', 'Jazz', 'Pop', 'Guitar', 'Piano'];
  final List<String> _availableSkills = [
    'Classical', 'Jazz', 'Pop', 'Rock', 'Blues', 'Country', 'Electronic',
    'Guitar', 'Piano', 'Drums', 'Violin', 'Vocals', 'Bass', 'Saxophone'
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: const Color(0xFF001F3F),
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Text(
          'Edit Profile',
          style: TextStyle(
            color: Colors.white,
            fontSize: 18,
            fontWeight: FontWeight.w600,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Profile updated successfully!')),
              );
            },
            child: const Text(
              'Save',
              style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Cover Image Section
            _buildLabel('Cover Image'),
            const SizedBox(height: 8),
            GestureDetector(
              onTap: () => _showImageSourceDialog('banner'),
              child: Container(
                height: 150,
                width: double.infinity,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [Color(0xFF001F3F), Color(0xFF003366)],
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                  ),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Stack(
                  children: [
                    Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.camera_alt, color: Colors.white54, size: 30),
                          const SizedBox(height: 8),
                          Text(
                            'Tap to change cover',
                            style: TextStyle(color: Colors.white70, fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),

            // Profile Picture Section
            _buildLabel('Profile Picture'),
            const SizedBox(height: 8),
            Center(
              child: GestureDetector(
                onTap: () => _showImageSourceDialog('profile'),
                child: Stack(
                  children: [
                    Container(
                      width: 100,
                      height: 100,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: Colors.grey.shade200,
                        border: Border.all(color: Colors.grey.shade300, width: 2),
                      ),
                      child: Icon(Icons.person, size: 50, color: Colors.grey.shade600),
                    ),
                    Positioned(
                      bottom: 0,
                      right: 0,
                      child: Container(
                        padding: const EdgeInsets.all(6),
                        decoration: BoxDecoration(
                          color: const Color(0xFF001F3F),
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 2),
                        ),
                        child: const Icon(Icons.camera_alt, color: Colors.white, size: 16),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 32),

            // Name Field
            _buildLabel('Full Name'),
            const SizedBox(height: 8),
            _buildTextField(_nameController, 'Enter your full name'),
            const SizedBox(height: 20),

            // Title Field
            _buildLabel('Professional Title'),
            const SizedBox(height: 8),
            _buildTextField(_titleController, 'e.g., Professional Musician'),
            const SizedBox(height: 20),

            // Bio Field
            _buildLabel('Bio'),
            const SizedBox(height: 8),
            _buildTextField(
              _bioController,
              'Tell us about yourself and your musical journey...',
              maxLines: 4,
            ),
            const SizedBox(height: 20),

            // Skills Section
            _buildLabel('Skills & Genres'),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: _availableSkills.map((skill) {
                final isSelected = _selectedSkills.contains(skill);
                return FilterChip(
                  label: Text(skill),
                  selected: isSelected,
                  onSelected: (selected) {
                    setState(() {
                      if (selected) {
                        _selectedSkills.add(skill);
                      } else {
                        _selectedSkills.remove(skill);
                      }
                    });
                  },
                  selectedColor: Color(0xFF001F3F).withOpacity(0.2),
                  checkmarkColor: Color(0xFF001F3F),
                );
              }).toList(),
            ),
            const SizedBox(height: 20),

            // Pricing Section
            _buildLabel('Pricing'),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Hourly Rate',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                          color: Colors.grey.shade700,
                        ),
                      ),
                      const SizedBox(height: 4),
                      _buildTextField(
                        _hourlyRateController,
                        'Per hour',
                        keyboardType: TextInputType.number,
                        prefixText: '₹ ',
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Event Rate',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                          color: Colors.grey.shade700,
                        ),
                      ),
                      const SizedBox(height: 4),
                      _buildTextField(
                        _eventRateController,
                        'Per event',
                        keyboardType: TextInputType.number,
                        prefixText: '₹ ',
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLabel(String text) {
    return Text(
      text,
      style: const TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.w600,
        color: Colors.black87,
      ),
    );
  }

  Widget _buildTextField(
    TextEditingController controller,
    String hintText, {
    int maxLines = 1,
    TextInputType? keyboardType,
    String? prefixText,
  }) {
    return TextField(
      controller: controller,
      maxLines: maxLines,
      keyboardType: keyboardType,
      decoration: InputDecoration(
        hintText: hintText,
        hintStyle: TextStyle(color: Colors.grey.shade500),
        prefixText: prefixText,
        prefixStyle: const TextStyle(
          color: Colors.black87,
          fontWeight: FontWeight.w500,
        ),
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
          borderSide: const BorderSide(color: Color(0xFF001F3F), width: 2),
        ),
        contentPadding: const EdgeInsets.all(16),
      ),
    );
  }

  void _showImageSourceDialog(String type) {
    showModalBottomSheet(
      context: context,
      builder: (context) => Container(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Select ${type == 'profile' ? 'Profile Picture' : 'Cover Image'}',
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(
                  child: _buildSourceOption(
                    'Camera',
                    Icons.camera_alt,
                    () {
                      Navigator.pop(context);
                      _pickFromCamera(type);
                    },
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: _buildSourceOption(
                    'Gallery',
                    Icons.photo_library,
                    () {
                      Navigator.pop(context);
                      _pickFromGallery(type);
                    },
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSourceOption(String title, IconData icon, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: Colors.grey.shade100,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          children: [
            Icon(icon, size: 40, color: Color(0xFF001F3F)),
            const SizedBox(height: 8),
            Text(
              title,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _pickFromCamera(String type) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Camera functionality for $type image')),
    );
  }

  void _pickFromGallery(String type) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Gallery functionality for $type image')),
    );
  }

  @override
  void dispose() {
    _nameController.dispose();
    _titleController.dispose();
    _bioController.dispose();
    _hourlyRateController.dispose();
    _eventRateController.dispose();
    super.dispose();
  }
}