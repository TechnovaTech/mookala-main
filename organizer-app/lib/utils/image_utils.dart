import 'dart:convert';
import 'dart:typed_data';

import 'package:image_picker/image_picker.dart';

/// Picking, resizing and decoding images.
class ImageUtils {
  ImageUtils._();

  /// Server limit for one image, measured on the base64 text.
  static const int maxImageChars = 1500000;

  static const double maxDimension = 1280;
  static const int jpegQuality = 80;

  static final ImagePicker _picker = ImagePicker();

  /// Lets the user pick one image, resized to at most 1280 px at JPEG quality 80.
  /// Returns null when the user cancels.
  static Future<Uint8List?> pick({ImageSource source = ImageSource.gallery}) async {
    final file = await _picker.pickImage(
      source: source,
      maxWidth: maxDimension,
      maxHeight: maxDimension,
      imageQuality: jpegQuality,
    );
    if (file == null) return null;
    return file.readAsBytes();
  }

  /// Why these bytes cannot be uploaded, or null when they fit the server limit.
  static String? sizeProblem(Uint8List bytes, {int maxChars = maxImageChars}) {
    if (base64Length(bytes.length) > maxChars) {
      return 'This photo is still larger than the upload limit after resizing '
          '(${(bytes.length / (1024 * 1024)).toStringAsFixed(1)} MB). Please choose a smaller photo.';
    }
    return null;
  }

  /// Length of the base64 text for [byteCount] bytes.
  static int base64Length(int byteCount) => ((byteCount + 2) ~/ 3) * 4;

  /// A data URL the backend accepts for event and profile images.
  static String toDataUrl(Uint8List bytes) => 'data:${mimeOf(bytes)};base64,${base64Encode(bytes)}';

  static String mimeOf(Uint8List bytes) {
    if (bytes.length >= 4 && bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47) {
      return 'image/png';
    }
    if (bytes.length >= 12 && bytes[0] == 0x52 && bytes[1] == 0x49 && bytes[8] == 0x57 && bytes[9] == 0x45) {
      return 'image/webp';
    }
    if (bytes.length >= 3 && bytes[0] == 0x47 && bytes[1] == 0x49 && bytes[2] == 0x46) return 'image/gif';
    return 'image/jpeg';
  }

  /// Decodes a stored image: a data URL or bare base64. Returns null for
  /// anything else (null, http links, corrupt data) instead of throwing.
  static Uint8List? decode(dynamic stored) {
    if (stored is! String) return null;
    var text = stored.trim();
    if (text.isEmpty || text.startsWith('http://') || text.startsWith('https://')) return null;
    if (text.startsWith('data:')) {
      final comma = text.indexOf(',');
      if (comma == -1) return null;
      text = text.substring(comma + 1);
    }
    try {
      final bytes = base64Decode(base64.normalize(text.replaceAll(RegExp(r'\s'), '')));
      return bytes.isEmpty ? null : bytes;
    } catch (_) {
      return null;
    }
  }

  static bool isHttpUrl(dynamic stored) =>
      stored is String && (stored.startsWith('http://') || stored.startsWith('https://'));
}
