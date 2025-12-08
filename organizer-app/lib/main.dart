import 'package:flutter/material.dart';
import 'screens/splash_screen.dart';
import 'screens/phone_login_screen.dart';
import 'screens/dashboard_screen.dart';
import 'screens/artist_dashboard_screen.dart';
import 'services/auth_service.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Mookaala organizer-app',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        primarySwatch: Colors.blue,
        useMaterial3: true,
      ),
      home: FutureBuilder<Map<String, String?>>(
        future: AuthService.getUserData(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const SplashScreen();
          }
          
          final userData = snapshot.data;
          final isLoggedIn = userData?['isLoggedIn'] == 'true';
          final role = userData?['role'];
          
          if (isLoggedIn && role != null) {
            if (role == 'artist') {
              return const ArtistDashboardScreen();
            } else {
              return const DashboardScreen();
            }
          }
          
          return const PhoneLoginScreen();
        },
      ),
    );
  }
}
