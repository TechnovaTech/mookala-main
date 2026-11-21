import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../widgets/app_theme.dart';

/// The backend refuses an image above about 1.5 MB after base64.
const int maxUploadBase64Chars = 1500000;

class PickedPhoto {
  PickedPhoto(this.bytes) : base64 = base64Encode(bytes);
  final Uint8List bytes;

  /// Raw base64 (no `data:` prefix): the form this app uploads.
  final String base64;
}

/// Lets the person take or choose a photo. It is resized before upload
/// (longest side 1280 px, JPEG quality 80). Returns null when nothing was chosen.
Future<PickedPhoto?> pickPhoto(BuildContext context) async {
  final source = await showModalBottomSheet<ImageSource>(
    context: context,
    backgroundColor: Colors.white,
    builder: (sheet) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            leading: const Icon(Icons.photo_library_outlined),
            title: const Text('Choose from gallery'),
            onTap: () => Navigator.pop(sheet, ImageSource.gallery),
          ),
          ListTile(
            leading: const Icon(Icons.photo_camera_outlined),
            title: const Text('Take a photo'),
            onTap: () => Navigator.pop(sheet, ImageSource.camera),
          ),
        ],
      ),
    ),
  );
  if (source == null) return null;

  try {
    final file = await ImagePicker().pickImage(source: source, maxWidth: 1280, maxHeight: 1280, imageQuality: 80);
    if (file == null) return null;
    final photo = PickedPhoto(await file.readAsBytes());
    if (photo.base64.length > maxUploadBase64Chars) {
      if (context.mounted) showMessage(context, 'This photo is still too large after resizing. Please choose another one.');
      return null;
    }
    return photo;
  } catch (_) {
    if (context.mounted) {
      showMessage(context, 'The photo could not be opened. Please allow access to your photos or camera and try again.');
    }
    return null;
  }
}
