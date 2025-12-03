import 'package:flutter/material.dart';
import 'profile_screen.dart';
import 'artist_fill_profile_screen.dart';
import 'artist_dashboard_screen.dart';
import 'dashboard_screen.dart';
import 'otp_verification_screen.dart';
import '../services/auth_service.dart';

class UserTypeSelectionScreen extends StatefulWidget {
  final String phoneNumber;
  final bool isExistingUser;
  
  const UserTypeSelectionScreen({
    super.key,
    required this.phoneNumber,
    required this.isExistingUser,
  });

  @override
  State<UserTypeSelectionScreen> createState() => _UserTypeSelectionScreenState();
}

class _UserTypeSelectionScreenState extends State<UserTypeSelectionScreen> {
  bool _isLoading = false;

  void _selectRole(String role) async {
    setState(() {
      _isLoading = true;
    });

    if (widget.isExistingUser) {
      // For existing users, navigate to profile completion
      setState(() {
        _isLoading = false;
      });
      
      if (role == 'artist') {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (context) => const ArtistFillProfileScreen()),
        );
      } else {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (context) => const ProfileScreen()),
        );
      }
    } else {
      // Register new user
      final result = await AuthService.registerUser(widget.phoneNumber, role);
      
      setState(() {
        _isLoading = false;
      });
      
      if (result['success'] == true) {
        // After registration, verify OTP and navigate to profile
        final verifyResult = await AuthService.verifyOTP(widget.phoneNumber, '1234', role);
        
        if (verifyResult['success'] == true) {
          if (role == 'artist') {
            Navigator.pushReplacement(
              context,
              MaterialPageRoute(builder: (context) => const ArtistFillProfileScreen()),
            );
          } else {
            Navigator.pushReplacement(
              context,
              MaterialPageRoute(builder: (context) => const ProfileScreen()),
            );
          }
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(verifyResult['error'] ?? 'Verification failed')),
          );
        }
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(result['error'] ?? 'Registration failed')),
        );
      }
    }
  }

  void _navigateToDashboard(String role) {
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
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              widget.isExistingUser ? 'Welcome Back!' : 'Choose Your Role',
              style: const TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.bold,
                color: Colors.black87,
              ),
            ),
            if (widget.isExistingUser)
              Text(
                'Select your role to continue',
                style: TextStyle(
                  fontSize: 16,
                  color: Colors.grey.shade600,
                ),
              ),
            const SizedBox(height: 60),
            
            // Artist Button
            Container(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _isLoading ? null : () => _selectRole('artist'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF001F3F),
                  padding: const EdgeInsets.symmetric(vertical: 20),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
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
                        'Artist',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
                        ),
                      ),
              ),
            ),
            
            const SizedBox(height: 24),
            
            // Organizer Button
            Container(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _isLoading ? null : () => _selectRole('organizer'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF001F3F),
                  padding: const EdgeInsets.symmetric(vertical: 20),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
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
                        'Organizer',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
                        ),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}