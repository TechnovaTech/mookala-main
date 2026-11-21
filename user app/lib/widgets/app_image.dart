import 'package:flutter/material.dart';

import '../utils/image_source.dart';

/// Shows an image given as a web address, `data:` URL, raw base64 or asset
/// path. A missing or broken image becomes a neutral placeholder: it never
/// throws and never shows a stock photo in place of the real one.
class AppImage extends StatefulWidget {
  const AppImage(
    this.source, {
    super.key,
    this.fit = BoxFit.cover,
    this.width,
    this.height,
    this.placeholderIcon = Icons.image_outlined,
  });

  final String? source;
  final BoxFit fit;
  final double? width;
  final double? height;
  final IconData placeholderIcon;

  @override
  State<AppImage> createState() => _AppImageState();
}

class _AppImageState extends State<AppImage> {
  ImageProvider? _provider;

  @override
  void initState() {
    super.initState();
    _provider = imageProviderFor(widget.source);
  }

  @override
  void didUpdateWidget(AppImage oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Decoding base64 is not free: only redo it when the source changed.
    if (oldWidget.source != widget.source) _provider = imageProviderFor(widget.source);
  }

  Widget _placeholder() => Container(
        width: widget.width,
        height: widget.height,
        color: Colors.grey.shade200,
        alignment: Alignment.center,
        child: Icon(widget.placeholderIcon, color: Colors.grey.shade500, size: 32),
      );

  @override
  Widget build(BuildContext context) {
    final provider = _provider;
    if (provider == null) return _placeholder();
    return Image(
      image: provider,
      fit: widget.fit,
      width: widget.width,
      height: widget.height,
      gaplessPlayback: true,
      errorBuilder: (_, __, ___) => _placeholder(),
    );
  }
}

/// A round avatar that falls back to an icon.
class AppAvatar extends StatelessWidget {
  const AppAvatar(this.source, {super.key, this.radius = 24});
  final String? source;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return ClipOval(
      child: SizedBox(
        width: radius * 2,
        height: radius * 2,
        child: AppImage(source, placeholderIcon: Icons.person),
      ),
    );
  }
}
