import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/painting.dart';

/// Images reach the app as a web address, a `data:` URL, raw base64 (what the
/// apps upload) or a bundled asset path. This turns any of them into bytes or
/// an [ImageProvider], and never throws.
Uint8List? decodeImageBytes(String? source) {
  if (source == null) return null;
  var text = source.trim();
  if (text.isEmpty) return null;
  if (text.startsWith('data:')) {
    if (!text.startsWith('data:image')) return null;
    final comma = text.indexOf(',');
    if (comma == -1) return null;
    text = text.substring(comma + 1);
  } else if (text.startsWith('http://') || text.startsWith('https://') || text.startsWith('assets/')) {
    return null;
  }
  try {
    final bytes = base64Decode(base64.normalize(text.replaceAll(RegExp(r'\s'), '')));
    return bytes.isEmpty ? null : bytes;
  } catch (_) {
    return null;
  }
}

ImageProvider? imageProviderFor(String? source) {
  if (source == null) return null;
  final text = source.trim();
  if (text.isEmpty) return null;
  if (text.startsWith('http://') || text.startsWith('https://')) return NetworkImage(text);
  if (text.startsWith('assets/')) return AssetImage(text);
  final bytes = decodeImageBytes(text);
  return bytes == null ? null : MemoryImage(bytes);
}

bool isVideoSource(String? source, [String? mediaType]) {
  if (mediaType == 'video') return true;
  return source != null && source.trimLeft().startsWith('data:video');
}
