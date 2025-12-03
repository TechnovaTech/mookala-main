import 'package:flutter/material.dart';
import '../services/api_service.dart';
import 'profile_screen.dart';
import 'discovery_home_screen.dart';

class PreferencesScreen extends StatefulWidget {
  final String phoneNumber;
  const PreferencesScreen({super.key, required this.phoneNumber});

  @override
  State<PreferencesScreen> createState() => _PreferencesScreenState();
}

class _PreferencesScreenState extends State<PreferencesScreen> {
  List<String> selectedGenres = [];
  List<String> availableGenres = [];
  bool _isLoading = false;
  
  @override
  void initState() {
    super.initState();
    _loadGenres();
  }
  
  void _loadGenres() async {
    final genres = await ApiService.getGenres();
    setState(() {
      availableGenres = genres;
    });
  }

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
              MaterialPageRoute(
                builder: (context) => ProfileScreen(phoneNumber: widget.phoneNumber),
              ),
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
          // Genre Grid
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24.0),
              child: GridView.builder(
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  crossAxisSpacing: 16,
                  mainAxisSpacing: 16,
                  childAspectRatio: 2.5,
                ),
                itemCount: availableGenres.length,
                itemBuilder: (context, index) {
                  final genre = availableGenres[index];
                  final isSelected = selectedGenres.contains(genre);
                  
                  return GestureDetector(
                    onTap: () => toggleGenre(genre),
                    child: Container(
                      decoration: BoxDecoration(
                        color: isSelected ? const Color(0xFF001F3F) : Colors.white,
                        border: Border.all(
                          color: isSelected ? const Color(0xFF001F3F) : Colors.grey.shade300,
                          width: 2,
                        ),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Center(
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              genre,
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w600,
                                color: isSelected ? Colors.white : Colors.black87,
                              ),
                            ),
                            if (isSelected) const SizedBox(width: 8),
                            if (isSelected) const Icon(
                              Icons.check_circle,
                              color: Colors.white,
                              size: 20,
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
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
                    onPressed: selectedGenres.isEmpty || _isLoading ? null : () async {
                      setState(() {
                        _isLoading = true;
                      });
                      
                      final result = await ApiService.updateProfile(
                        phone: widget.phoneNumber,
                        genres: selectedGenres,
                      );
                      
                      setState(() {
                        _isLoading = false;
                      });
                      
                      if (result['success'] == true) {
                        await ApiService.saveUserPhone(widget.phoneNumber);
                        Navigator.pushReplacement(
                          context,
                          MaterialPageRoute(
                            builder: (context) => const DiscoveryHomeScreen(),
                          ),
                        );
                      } else {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text(result['error'] ?? 'Failed to save preferences')),
                        );
                      }
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF001F3F),
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                      elevation: 0,
                    ),
                    child: _isLoading
                        ? const SizedBox(
                            width: 24,
                            height: 24,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                            ),
                          )
                        : const Text(
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