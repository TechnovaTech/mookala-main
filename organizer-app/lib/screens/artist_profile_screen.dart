import 'package:flutter/material.dart';
import 'edit_user_profile_screen.dart';
import '../services/auth_service.dart';
import 'dart:convert';
import 'dart:typed_data';
import 'package:image_picker/image_picker.dart';

class ArtistProfileScreen extends StatefulWidget {
  const ArtistProfileScreen({super.key});

  @override
  State<ArtistProfileScreen> createState() => _ArtistProfileScreenState();
}

class _ArtistProfileScreenState extends State<ArtistProfileScreen> {
  Map<String, dynamic> _userProfile = {};
  bool _isLoading = true;
  List<Map<String, dynamic>> _mediaList = [];

  @override
  void initState() {
    super.initState();
    _loadUserProfile();
  }

  Future<void> _loadUserProfile() async {
    final userData = await AuthService.getUserData();
    final phone = userData['phone'];
    final role = userData['role'];
    
    if (phone != null && role != null) {
      final result = await AuthService.getUserProfile(phone, role);
      
      if (result['success'] == true) {
        setState(() {
          _userProfile = result['user'] ?? {};
          _isLoading = false;
        });
      } else {
        setState(() {
          _isLoading = false;
        });
      }
    } else {
      setState(() {
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      body: SingleChildScrollView(
      child: Column(
        children: [
          // Cover Image & Profile Picture
          Stack(
            clipBehavior: Clip.none,
            children: [
              GestureDetector(
                onTap: () => _showImageSourceDialog(context, 'banner'),
                child: Container(
                  height: 200,
                  width: double.infinity,
                  decoration: BoxDecoration(
                    gradient: _userProfile['bannerImage'] == null
                        ? LinearGradient(
                            colors: [Color(0xFF001F3F), Color(0xFF003366)],
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                          )
                        : null,
                    image: _userProfile['bannerImage'] != null
                        ? DecorationImage(
                            image: MemoryImage(base64Decode(_userProfile['bannerImage'])),
                            fit: BoxFit.cover,
                          )
                        : null,
                  ),
                  child: Stack(
                    children: [
                      Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.camera_alt, color: Colors.white54, size: 40),
                            const SizedBox(height: 8),
                            Text(
                              'Tap to change cover',
                              style: TextStyle(color: Colors.white70, fontSize: 12),
                            ),
                          ],
                        ),
                      ),
                      Positioned(
                        top: 16,
                        right: 16,
                        child: Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: Colors.black26,
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Icon(Icons.edit, color: Colors.white, size: 16),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              Positioned(
                bottom: -50,
                left: 20,
                child: GestureDetector(
                  onTap: () => _showImageSourceDialog(context, 'profile'),
                  child: Stack(
                    children: [
                      Container(
                        width: 100,
                        height: 100,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 4),
                          color: Colors.white,
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black26,
                              blurRadius: 8,
                              offset: Offset(0, 2),
                            ),
                          ],
                        ),
                        child: ClipOval(
                          child: _userProfile['profileImage'] != null
                              ? Image.memory(
                                  base64Decode(_userProfile['profileImage']),
                                  width: 100,
                                  height: 100,
                                  fit: BoxFit.cover,
                                )
                              : Container(
                                  width: 100,
                                  height: 100,
                                  color: Colors.grey.shade300,
                                  child: Icon(Icons.person, size: 50, color: Colors.grey.shade600),
                                ),
                        ),
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
                          child: const Icon(Icons.camera_alt, color: Colors.white, size: 14),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 60),
          
          Padding(
            padding: const EdgeInsets.all(20.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Name & Edit Button
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _userProfile['name'] ?? 'Artist Name',
                            style: const TextStyle(
                              fontSize: 24,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          Text(
                            _userProfile['genre'] ?? 'Artist',
                            style: TextStyle(
                              fontSize: 16,
                              color: Colors.grey.shade600,
                            ),
                          ),
                        ],
                      ),
                    ),
                    ElevatedButton.icon(
                      onPressed: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (context) => const EditUserProfileScreen(),
                          ),
                        ).then((_) => _loadUserProfile());
                      },
                      icon: Icon(Icons.edit, size: 16),
                      label: Text('Edit'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Color(0xFF001F3F),
                        foregroundColor: Colors.white,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                
                // Bio Section
                if (_userProfile['bio'] != null && _userProfile['bio'].toString().isNotEmpty)
                  _buildSection(
                    'Bio',
                    _userProfile['bio'],
                  ),
                
                // Genres/Skills
                if (_userProfile['genre'] != null && _userProfile['genre'].toString().isNotEmpty)
                  _buildSection(
                    'Genres & Skills',
                    null,
                    child: Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [_userProfile['genre']]
                          .map((skill) => Chip(
                                label: Text(skill),
                                backgroundColor: const Color(0xFF001F3F).withOpacity(0.1),
                                labelStyle: const TextStyle(color: Color(0xFF001F3F)),
                              ))
                          .toList(),
                    ),
                  ),
                
                
                // Gallery Section
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'Gallery',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            color: Colors.black87,
                          ),
                        ),
                        GestureDetector(
                          onTap: () => _showMediaSourceDialog(context),
                          child: Icon(
                            Icons.add,
                            color: Color(0xFF001F3F),
                            size: 24,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    _userProfile['media'] != null && _userProfile['media'].isNotEmpty
                        ? GridView.builder(
                            shrinkWrap: true,
                            physics: NeverScrollableScrollPhysics(),
                            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                              crossAxisCount: 3,
                              crossAxisSpacing: 8,
                              mainAxisSpacing: 8,
                              childAspectRatio: 1,
                            ),
                            itemCount: _userProfile['media'].length,
                            itemBuilder: (context, index) {
                              final media = _userProfile['media'][index];
                              return Container(
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: media['type'] == 'image'
                                    ? ClipRRect(
                                        borderRadius: BorderRadius.circular(8),
                                        child: Image.memory(
                                          base64Decode(media['data']),
                                          fit: BoxFit.cover,
                                        ),
                                      )
                                    : Container(
                                        decoration: BoxDecoration(
                                          color: Colors.black87,
                                          borderRadius: BorderRadius.circular(8),
                                        ),
                                        child: const Icon(
                                          Icons.play_circle_fill,
                                          color: Colors.white,
                                          size: 30,
                                        ),
                                      ),
                              );
                            },
                          )
                        : Container(
                            height: 120,
                            decoration: BoxDecoration(
                              color: Colors.grey.shade100,
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(color: Colors.grey.shade300),
                            ),
                            child: const Center(
                              child: Text(
                                'No media uploaded yet',
                                style: TextStyle(color: Colors.grey),
                              ),
                            ),
                          ),
                    const SizedBox(height: 24),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
      ),
    );
  }

  Widget _buildSection(String title, String? content, {Widget? child}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: Colors.black87,
          ),
        ),
        const SizedBox(height: 8),
        if (content != null)
          Text(
            content,
            style: TextStyle(
              fontSize: 14,
              color: Colors.grey.shade700,
              height: 1.5,
            ),
          ),
        if (child != null) child,
        const SizedBox(height: 24),
      ],
    );
  }

  void _showImageSourceDialog(BuildContext context, String type) {
    showModalBottomSheet(
      context: context,
      builder: (BuildContext context) {
        return SafeArea(
          child: Wrap(
            children: [
              ListTile(
                leading: Icon(Icons.photo_library),
                title: Text('Gallery'),
                onTap: () {
                  Navigator.pop(context);
                  _pickImage(ImageSource.gallery, type);
                },
              ),
              ListTile(
                leading: Icon(Icons.photo_camera),
                title: Text('Camera'),
                onTap: () {
                  Navigator.pop(context);
                  _pickImage(ImageSource.camera, type);
                },
              ),
            ],
          ),
        );
      },
    );
  }

  void _showMediaSourceDialog(BuildContext context) {
    showModalBottomSheet(
      context: context,
      builder: (BuildContext context) {
        return SafeArea(
          child: Wrap(
            children: [
              ListTile(
                leading: Icon(Icons.photo_library),
                title: Text('Photo Gallery'),
                onTap: () {
                  Navigator.pop(context);
                  _pickImage(ImageSource.gallery, 'media');
                },
              ),
              ListTile(
                leading: Icon(Icons.photo_camera),
                title: Text('Camera'),
                onTap: () {
                  Navigator.pop(context);
                  _pickImage(ImageSource.camera, 'media');
                },
              ),
              ListTile(
                leading: Icon(Icons.videocam),
                title: Text('Video'),
                onTap: () {
                  Navigator.pop(context);
                  _pickVideo();
                },
              ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _pickImage(ImageSource source, String type) async {
    final picker = ImagePicker();
    final pickedFile = await picker.pickImage(source: source);
    
    if (pickedFile != null) {
      final bytes = await pickedFile.readAsBytes();
      final base64Image = base64Encode(bytes);
      
      if (type == 'profile') {
        await _updateProfileImage(base64Image);
      } else if (type == 'banner') {
        await _updateBannerImage(base64Image);
      } else if (type == 'media') {
        await _uploadMedia(base64Image, 'image');
      }
    }
  }

  Future<void> _pickVideo() async {
    final picker = ImagePicker();
    final pickedFile = await picker.pickVideo(source: ImageSource.gallery);
    
    if (pickedFile != null) {
      final bytes = await pickedFile.readAsBytes();
      final base64Video = base64Encode(bytes);
      await _uploadMedia(base64Video, 'video');
    }
  }

  Future<void> _uploadMedia(String base64Data, String type) async {
    final userData = await AuthService.getUserData();
    final phone = userData['phone'];
    final role = userData['role'];
    
    if (phone != null && role != null) {
      final result = await AuthService.uploadMedia({
        'phone': phone,
        'role': role,
        'mediaData': base64Data,
        'mediaType': type,
      });
      
      if (result['success'] == true) {
        _showSnackBar('${type == 'image' ? 'Photo' : 'Video'} uploaded successfully!');
        _loadUserProfile();
      } else {
        _showSnackBar('Failed to upload ${type == 'image' ? 'photo' : 'video'}');
      }
    }
  }

  Future<void> _updateProfileImage(String base64Image) async {
    final userData = await AuthService.getUserData();
    final phone = userData['phone'];
    
    if (phone != null) {
      final result = await AuthService.updateArtistProfile(
        phone,
        _userProfile['name'] ?? '',
        _userProfile['email'] ?? '',
        _userProfile['city'] ?? '',
        _userProfile['bio'] ?? '',
        _userProfile['genre'] ?? '',
        _userProfile['pricing'],
        base64Image,
      );
      
      if (result['success'] == true) {
        _showSnackBar('Profile image updated successfully!');
        _loadUserProfile();
      } else {
        _showSnackBar('Failed to update profile image');
      }
    }
  }

  Future<void> _updateBannerImage(String base64Image) async {
    final userData = await AuthService.getUserData();
    final phone = userData['phone'];
    
    if (phone != null) {
      final result = await AuthService.updateArtistProfile(
        phone,
        _userProfile['name'] ?? '',
        _userProfile['email'] ?? '',
        _userProfile['city'] ?? '',
        _userProfile['bio'] ?? '',
        _userProfile['genre'] ?? '',
        _userProfile['pricing'],
        null, // profileImage
        base64Image, // bannerImage
      );
      
      if (result['success'] == true) {
        _showSnackBar('Cover image updated successfully!');
        _loadUserProfile();
      } else {
        _showSnackBar('Failed to update cover image');
      }
    }
  }

  void _showSnackBar(String message) {
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(message)),
      );
    }
  }

  Widget _buildSourceOption(
    BuildContext context,
    String title,
    IconData icon,
    VoidCallback onTap,
  ) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.grey.shade100,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          children: [
            Icon(icon, size: 32, color: Color(0xFF001F3F)),
            const SizedBox(height: 8),
            Text(
              title,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}