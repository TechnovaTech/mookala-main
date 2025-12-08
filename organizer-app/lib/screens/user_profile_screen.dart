import 'package:flutter/material.dart';
import 'dart:convert';
import 'edit_user_profile_screen.dart';
import 'dashboard_screen.dart';
import 'artist_dashboard_screen.dart';
import 'phone_login_screen.dart';
import '../services/auth_service.dart';

class UserProfileScreen extends StatefulWidget {
  const UserProfileScreen({super.key});

  @override
  State<UserProfileScreen> createState() => _UserProfileScreenState();
}

class _UserProfileScreenState extends State<UserProfileScreen> {
  Map<String, dynamic> _userProfile = {};
  bool _isLoading = true;
  String _userPhone = '';

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
      setState(() {
        _userPhone = phone;
      });
      
      final result = await AuthService.getUserProfile(phone, role);
      
      if (result['success'] == true && result['user'] != null) {
        setState(() {
          _userProfile = result['user'];
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
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: const Color(0xFF001F3F),
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () async {
            final userData = await AuthService.getUserData();
            final role = userData['role'];
            
            if (role == 'artist') {
              Navigator.pushReplacement(
                context,
                MaterialPageRoute(builder: (context) => const ArtistDashboardScreen()),
              );
            } else {
              Navigator.pushReplacement(
                context,
                MaterialPageRoute(builder: (context) => const DashboardScreen()),
              );
            }
          },
        ),
        title: const Text(
          'Profile',
          style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w600),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.edit, color: Colors.white),
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (context) => const EditUserProfileScreen()),
              ).then((_) {
                _loadUserProfile();
              });
            },
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    const SizedBox(height: 20),
                    
                    // Profile Avatar
                    Container(
                      width: 120,
                      height: 120,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.grey.shade300, width: 2),
                      ),
                      child: _userProfile['profileImage'] != null
                          ? ClipOval(
                              child: Image.memory(
                                base64Decode(_userProfile['profileImage']),
                                fit: BoxFit.cover,
                                width: 120,
                                height: 120,
                              ),
                            )
                          : Container(
                              decoration: BoxDecoration(
                                color: Colors.grey.shade200,
                                shape: BoxShape.circle,
                              ),
                              child: Icon(
                                Icons.person,
                                size: 60,
                                color: Colors.grey.shade600,
                              ),
                            ),
                    ),
                    const SizedBox(height: 24),
                    
                    // Name
                    Text(
                      _userProfile['name'] ?? 'No Name',
                      style: const TextStyle(
                        color: Colors.black,
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 8),
                    
                    // Phone
                    Text(
                      _userPhone,
                      style: TextStyle(
                        color: Colors.grey.shade600,
                        fontSize: 16,
                      ),
                    ),
                    const SizedBox(height: 32),
                    
                    // Profile Details Card
                    Card(
                      elevation: 2,
                      child: Padding(
                        padding: const EdgeInsets.all(20),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Profile Details',
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 16),
                            _buildDetailRow('Email', _userProfile['email'] ?? 'Not provided'),
                            _buildDetailRow('City', _userProfile['city'] ?? 'Not provided'),
                            if (_userProfile['bio'] != null)
                              _buildDetailRow('Bio', _userProfile['bio']),
                            if (_userProfile['genre'] != null)
                              _buildDetailRow('Genre', _userProfile['genre']),
                            if (_userProfile['pricing'] != null)
                              _buildDetailRow('Pricing', _userProfile['pricing']),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 32),
              
                    // Menu Options
                    _buildMenuOption(context, Icons.feedback, 'Feedback', const Color(0xFF00BCD4)),
                    _buildMenuOption(context, Icons.help_outline, 'Help & Support', const Color(0xFF2196F3)),
                    _buildMenuOption(context, Icons.apps, 'Event Discovery App', const Color(0xFF4CAF50)),
                    _buildMenuOption(context, Icons.logout, 'Log out', const Color(0xFF9C27B0)),
                    const SizedBox(height: 20),
                  ],
                ),
              ),
            ),

    );
  }

  Widget _buildMenuOption(BuildContext context, IconData icon, String title, Color iconColor) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 0, vertical: 4),
        leading: Container(
          padding: const EdgeInsets.all(6),
          decoration: BoxDecoration(
            color: iconColor.withOpacity(0.1),
            borderRadius: BorderRadius.circular(6),
          ),
          child: Icon(icon, color: iconColor, size: 18),
        ),
        title: Text(
          title,
          style: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w500,
            color: Colors.black87,
          ),
        ),
        trailing: Icon(Icons.arrow_forward_ios, size: 14, color: Colors.grey.shade400),
        onTap: () => _handleMenuTap(context, title),
      ),
    );
  }
  
  void _handleMenuTap(BuildContext context, String title) {
    if (title == 'Log out') {
      _showLogoutDialog(context);
    }
  }
  
  void _showLogoutDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('Logout'),
          content: const Text('Are you sure you want to logout?'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel'),
            ),
            TextButton(
              onPressed: () async {
                Navigator.of(context).pop();
                await AuthService.logout();
                Navigator.pushAndRemoveUntil(
                  context,
                  MaterialPageRoute(builder: (context) => const PhoneLoginScreen()),
                  (route) => false,
                );
              },
              child: const Text('Logout', style: TextStyle(color: Colors.red)),
            ),
          ],
        );
      },
    );
  }

  Widget _buildDetailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 80,
            child: Text(
              '$label:',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w500,
                color: Colors.grey.shade600,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                fontSize: 14,
                color: Colors.black87,
              ),
            ),
          ),
        ],
      ),
    );
  }
}