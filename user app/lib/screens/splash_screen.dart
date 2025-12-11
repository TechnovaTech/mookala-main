import 'package:flutter/material.dart';
import 'phone_login_screen.dart';
import 'discovery_home_screen.dart';
import '../services/api_service.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    _checkUserSession();
  }
  
  Future<void> _checkUserSession() async {
    await Future.delayed(const Duration(seconds: 3));
    
    final userPhone = await ApiService.getUserPhone();
    
    if (mounted) {
      if (userPhone != null) {
        // User is logged in, go to home
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (context) => const DiscoveryHomeScreen()),
        );
      } else {
        // User not logged in, go to login
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (context) => const PhoneLoginScreen()),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Image.asset(
              'assets/images/logo image.png',
              width: 400,
              height: 400,
              fit: BoxFit.contain,
              errorBuilder: (context, error, stackTrace) {
                return Container(
                  width: 200,
                  height: 200,
                  decoration: BoxDecoration(
                    color: const Color(0xFF001F3F),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Icon(
                    Icons.event,
                    size: 100,
                    color: Colors.white,
                  ),
                );
              },
            ),
            const SizedBox(height: 20),


          ],
        ),
      ),
    );
  }
}