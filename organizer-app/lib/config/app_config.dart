/// Build-time configuration.
///
/// Override the backend with
/// `flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3100/api`.
class AppConfig {
  AppConfig._();

  static const String appName = 'Mookalaa Organizer';

  static const String _rawBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://mookala.vercel.app/api',
  );

  /// Base URL of the backend API, without a trailing slash.
  static String get apiBaseUrl => normaliseBaseUrl(_rawBaseUrl);

  static String normaliseBaseUrl(String value) {
    var out = value.trim();
    while (out.endsWith('/')) {
      out = out.substring(0, out.length - 1);
    }
    return out;
  }

  static const Duration requestTimeout = Duration(seconds: 25);

  /// Requests that carry base64 images take longer on mobile networks.
  static const Duration uploadTimeout = Duration(seconds: 90);
}
