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

    // Register for the chosen role either way. An existing account only
    // exists in one collection, so someone who already signed up as an
    // organizer still needs an artist record created before the admin panel
    // can see them — skipping this was why those requests never arrived.
    // The backend re-issues the OTP for a half-finished signup instead of
    // rejecting it, so this is safe to call on every path.
    final result = await AuthService.registerUser(widget.phoneNumber, role);

    if (result['success'] == true) {
      final verifyResult = await AuthService.verifyOTP(widget.phoneNumber, '1234', role);

      setState(() {
        _isLoading = false;
      });

      if (!mounted) return;

      if (verifyResult['success'] == true) {
        _goToProfile(role);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(verifyResult['error'] ?? 'Verification failed')),
        );
      }
      return;
    }

    setState(() {
      _isLoading = false;
    });

    if (!mounted) return;

    // "Already registered" means the role is fully set up — that is not an
    // error here, just carry on to the profile.
    final error = (result['error'] ?? '').toString();
    if (error.toLowerCase().contains('already registered')) {
      _goToProfile(role);
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(error.isEmpty ? 'Registration failed' : error)),
    );
  }

  void _goToProfile(String role) {
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(
        builder: (context) =>
            role == 'artist' ? const ArtistFillProfileScreen() : const ProfileScreen(),
      ),
    );
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