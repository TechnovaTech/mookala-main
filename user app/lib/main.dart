import 'package:flutter/material.dart';

import 'config/app_config.dart';
import 'screens/phone_login_screen.dart';
import 'screens/splash_screen.dart';
import 'services/api_client.dart';
import 'services/session.dart';
import 'widgets/app_theme.dart';

final GlobalKey<NavigatorState> appNavigatorKey = GlobalKey<NavigatorState>();
final GlobalKey<ScaffoldMessengerState> appMessengerKey = GlobalKey<ScaffoldMessengerState>();

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  // A 401 on any call made with a session token signs the user out.
  ApiClient.onUnauthorized = () async {
    await Session.clear();
    appNavigatorKey.currentState?.pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const PhoneLoginScreen()),
      (route) => false,
    );
    appMessengerKey.currentState
      ?..hideCurrentSnackBar()
      ..showSnackBar(const SnackBar(content: Text('Your session has expired. Please sign in again.')));
  };

  runApp(const MookalaaApp());
}

class MookalaaApp extends StatelessWidget {
  const MookalaaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: AppConfig.appName,
      debugShowCheckedModeBanner: false,
      navigatorKey: appNavigatorKey,
      scaffoldMessengerKey: appMessengerKey,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: AppColors.navy, primary: AppColors.navy),
        scaffoldBackgroundColor: Colors.white,
        useMaterial3: true,
      ),
      home: const SplashScreen(),
    );
  }
}
