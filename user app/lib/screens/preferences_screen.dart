import 'package:flutter/material.dart';
import 'profile_screen.dart';
import 'discovery_home_screen.dart';

class PreferencesScreen extends StatefulWidget {
  const PreferencesScreen({super.key});

  @override
  State<PreferencesScreen> createState() => _PreferencesScreenState();
}

class _PreferencesScreenState extends State<PreferencesScreen> {
  List<String> selectedGenres = [];
  
  final List<Map<String, dynamic>> genres = [
    {'name': 'Music', 'image': 'assets/images/concert.jpg'},
    {'name': 'Theatre', 'image': 'assets/images/theatre.jpg'},
    {'name': 'Folk', 'image': 'assets/images/folk.jpg'},
  ];

  void toggleGenre(String genre) {
    setState(() {
      if (selectedGenres.contains(genre)) {
        selectedGenres.remove(genre);
      } else {
        selectedGenres.add(genre);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: const Color(0xFF001F3F),
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () {
            Navigator.pushReplacement(
              context,
              MaterialPageRoute(builder: (context) => const ProfileScreen()),
            );
          },
        ),
        title: const Text(
          'Preferences',
          style: TextStyle(
            color: Colors.white,
            fontSize: 18,
            fontWeight: FontWeight.w600,
          ),
        ),
        centerTitle: false,

      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 20),
                // Title
                const Text(
                  'Select favorite genres',
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                    color: Colors.black87,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Choose your interests for personalized feeds',
                  style: TextStyle(
                    fontSize: 16,
                    color: Colors.grey.shade600,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 30),
          // Genre Column
          Expanded(
            child: Column(
              children: genres.map((genre) {
                final isSelected = selectedGenres.contains(genre['name']);
                
                return GestureDetector(
                  onTap: () => toggleGenre(genre['name']),
                  child: Container(
                    width: double.infinity,
                    height: 80,
                    margin: const EdgeInsets.only(bottom: 16),
                    decoration: BoxDecoration(
                      color: isSelected ? const Color(0xFF001F3F) : Colors.white,
                      border: Border.all(
                        color: isSelected ? const Color(0xFF001F3F) : Colors.grey.shade300,
                        width: 2,
                      ),
                    ),
                    child: Stack(
                      children: [
                        // Background Image
                        ClipRect(
                          child: Image.asset(
                            genre['image'],
                            width: double.infinity,
                            height: 80,
                            fit: BoxFit.cover,
                            errorBuilder: (context, error, stackTrace) {
                              return Container(
                                color: Colors.grey.shade200,
                                child: Icon(
                                  Icons.image_not_supported,
                                  color: Colors.grey.shade400,
                                ),
                              );
                            },
                          ),
                        ),
                        // Overlay
                        Container(
                          width: double.infinity,
                          height: 80,
                          color: isSelected 
                              ? const Color(0xFF001F3F).withOpacity(0.8)
                              : Colors.black.withOpacity(0.3),
                        ),
                        // Text
                        Positioned(
                          left: 24,
                          top: 0,
                          bottom: 0,
                          child: Center(
                            child: Text(
                              genre['name'],
                              style: const TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.bold,
                                color: Colors.white,
                              ),
                            ),
                          ),
                        ),
                        // Selection indicator
                        if (isSelected)
                          const Positioned(
                            right: 24,
                            top: 0,
                            bottom: 0,
                            child: Center(
                              child: Icon(
                                Icons.check_circle,
                                color: Colors.white,
                                size: 24,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              children: [
                // Selected count
                if (selectedGenres.isNotEmpty)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    decoration: BoxDecoration(
                      color: const Color(0xFF001F3F).withOpacity(0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          Icons.check_circle,
                          color: const Color(0xFF001F3F),
                          size: 20,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          '${selectedGenres.length} genres selected',
                          style: TextStyle(
                            color: const Color(0xFF001F3F),
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                const SizedBox(height: 20),
                // Continue Button
                SizedBox(
                  width: double.infinity,
                  height: 56,
                  child: ElevatedButton(
                    onPressed: selectedGenres.isEmpty ? null : () {
                      Navigator.pushReplacement(
                        context,
                        MaterialPageRoute(
                          builder: (context) => const DiscoveryHomeScreen(),
                        ),
                      );
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF001F3F),
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                      elevation: 0,
                    ),
                    child: const Text(
                      'SAVE PREFERENCES',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 1,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}