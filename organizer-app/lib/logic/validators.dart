/// Input checks shared by the forms. Each returns an error message or null.
class Validators {
  Validators._();

  static final RegExp _aadhaar = RegExp(r'^\d{12}$');
  static final RegExp _pan = RegExp(r'^[A-Z]{5}[0-9]{4}[A-Z]$');
  static final RegExp _email = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$');
  static final RegExp _url = RegExp(r'^https?://[^\s/$.?#].[^\s]*$', caseSensitive: false);

  /// Ten digits, optionally written with +91 / 91 / 0, spaces or dashes.
  static String? normalisePhone(String input) {
    var digits = input.trim().replaceAll(RegExp(r'[\s\-()]'), '');
    if (digits.startsWith('+91')) {
      digits = digits.substring(3);
    } else if (digits.length == 12 && digits.startsWith('91')) {
      digits = digits.substring(2);
    } else if (digits.length == 11 && digits.startsWith('0')) {
      digits = digits.substring(1);
    }
    return RegExp(r'^[6-9]\d{9}$').hasMatch(digits) ? digits : null;
  }

  static String? phone(String input) =>
      normalisePhone(input) == null ? 'Enter a valid 10-digit mobile number' : null;

  /// The server accepts codes of 4 to 8 digits.
  static String? otp(String input) =>
      RegExp(r'^\d{4,8}$').hasMatch(input.trim()) ? null : 'Enter the code you received (4 to 8 digits)';

  static String normaliseAadhaar(String input) => input.replaceAll(RegExp(r'[\s\-]'), '');

  static String? aadhaar(String input) =>
      _aadhaar.hasMatch(normaliseAadhaar(input)) ? null : 'Aadhaar number must be 12 digits';

  static String normalisePan(String input) => input.trim().toUpperCase();

  static String? pan(String input) =>
      _pan.hasMatch(normalisePan(input)) ? null : 'PAN must look like ABCDE1234F';

  static String? email(String input, {bool required = true}) {
    final value = input.trim();
    if (value.isEmpty) return required ? 'Email is required' : null;
    return _email.hasMatch(value) ? null : 'Enter a valid email address';
  }

  static String? requiredText(String input, String label) =>
      input.trim().isEmpty ? '$label is required' : null;

  static String? url(String input, {String label = 'Link', bool required = true}) {
    final value = input.trim();
    if (value.isEmpty) return required ? '$label is required' : null;
    return _url.hasMatch(value) ? null : '$label must start with http:// or https://';
  }
}
