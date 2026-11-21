/// Build-time configuration.
///
/// The backend address is set in exactly one place. Override it for a local or
/// staging backend with:
///   flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3100/api
class AppConfig {
  AppConfig._();

  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://mookala.vercel.app/api',
  );

  /// Every request gives up after this long.
  static const Duration requestTimeout = Duration(seconds: 25);

  /// Event lists carry base64 images and can be slow on mobile data.
  static const Duration listTimeout = Duration(seconds: 45);

  static const String appName = 'Mookalaa';
}
