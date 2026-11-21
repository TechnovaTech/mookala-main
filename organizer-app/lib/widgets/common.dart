import 'package:flutter/material.dart';

import '../utils/image_utils.dart';

class AppColors {
  AppColors._();
  static const navy = Color(0xFF001F3F);
  static const navySoft = Color(0xFF003366);
  static const background = Color(0xFFF5F6F8);
}

void showMessage(BuildContext context, String message, {bool error = false}) {
  final messenger = ScaffoldMessenger.maybeOf(context);
  if (messenger == null) return;
  messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
      content: Text(message),
      backgroundColor: error ? Colors.red.shade700 : null,
      behavior: SnackBarBehavior.floating,
    ));
}

PreferredSizeWidget appBar(String title, {List<Widget>? actions, PreferredSizeWidget? bottom, bool showBack = true}) {
  return AppBar(
    title: Text(title, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 18)),
    backgroundColor: AppColors.navy,
    iconTheme: const IconThemeData(color: Colors.white),
    automaticallyImplyLeading: showBack,
    actions: actions,
    bottom: bottom,
  );
}

class PrimaryButton extends StatelessWidget {
  const PrimaryButton({super.key, required this.label, required this.onPressed, this.loading = false, this.icon});

  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 50,
      child: ElevatedButton(
        onPressed: loading ? null : onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.navy,
          foregroundColor: Colors.white,
          disabledBackgroundColor: AppColors.navy.withValues(alpha: 0.5),
          disabledForegroundColor: Colors.white70,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        ),
        child: loading
            ? const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
              )
            : Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (icon != null) ...[Icon(icon, size: 20), const SizedBox(width: 8)],
                  Flexible(
                    child: Text(label,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                  ),
                ],
              ),
      ),
    );
  }
}

class LoadingView extends StatelessWidget {
  const LoadingView({super.key, this.label});
  final String? label;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const CircularProgressIndicator(color: AppColors.navy),
          if (label != null) ...[const SizedBox(height: 14), Text(label!, style: const TextStyle(color: Colors.black54))],
        ],
      ),
    );
  }
}

/// A centred icon + title + text, used for empty, error and "not available" states.
/// Scrollable so it works inside a RefreshIndicator.
class StateView extends StatelessWidget {
  const StateView({
    super.key,
    required this.icon,
    required this.title,
    this.message,
    this.actionLabel,
    this.onAction,
    this.color,
  });

  factory StateView.error(String message, {VoidCallback? onRetry}) => StateView(
        icon: Icons.error_outline,
        title: 'Something went wrong',
        message: message,
        actionLabel: onRetry == null ? null : 'Try again',
        onAction: onRetry,
        color: Colors.red,
      );

  final IconData icon;
  final String title;
  final String? message;
  final String? actionLabel;
  final VoidCallback? onAction;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: constraints.hasBoundedHeight ? constraints.maxHeight : 0),
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(28),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(icon, size: 56, color: (color ?? AppColors.navy).withValues(alpha: 0.6)),
                  const SizedBox(height: 14),
                  Text(title,
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: AppColors.navy)),
                  if (message != null) ...[
                    const SizedBox(height: 8),
                    Text(message!, textAlign: TextAlign.center, style: const TextStyle(color: Colors.black54, height: 1.4)),
                  ],
                  if (actionLabel != null && onAction != null) ...[
                    const SizedBox(height: 18),
                    OutlinedButton(
                      onPressed: onAction,
                      style: OutlinedButton.styleFrom(foregroundColor: AppColors.navy),
                      child: Text(actionLabel!),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Shows an image stored by the backend (base64, data URL or http link), or
/// a neutral placeholder. Never a stock photo.
class StoredImage extends StatelessWidget {
  const StoredImage(this.source, {super.key, this.fit = BoxFit.cover, this.placeholderIcon = Icons.image_outlined, this.width, this.height});

  final dynamic source;
  final BoxFit fit;
  final IconData placeholderIcon;
  final double? width;
  final double? height;

  Widget _placeholder() => Container(
        width: width,
        height: height,
        color: const Color(0xFFE3E7EC),
        alignment: Alignment.center,
        child: Icon(placeholderIcon, color: Colors.black26, size: 36),
      );

  @override
  Widget build(BuildContext context) {
    if (ImageUtils.isHttpUrl(source)) {
      return Image.network(source as String,
          fit: fit, width: width, height: height, errorBuilder: (_, __, ___) => _placeholder());
    }
    final bytes = ImageUtils.decode(source);
    if (bytes == null) return _placeholder();
    return Image.memory(bytes,
        fit: fit, width: width, height: height, gaplessPlayback: true, errorBuilder: (_, __, ___) => _placeholder());
  }
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(text, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.navy)),
      );
}

class InfoBanner extends StatelessWidget {
  const InfoBanner(this.text, {super.key, this.color = Colors.orange, this.icon = Icons.info_outline});
  final String text;
  final MaterialColor color;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: color.shade50,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: color.shade200),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 18, color: color.shade800),
            const SizedBox(width: 8),
            Expanded(child: Text(text, style: TextStyle(color: color.shade900, height: 1.35))),
          ],
        ),
      );
}

InputDecoration fieldDecoration(String label, {String? hint, IconData? icon, String? helper, Widget? suffix}) {
  return InputDecoration(
    labelText: label,
    hintText: hint,
    helperText: helper,
    helperMaxLines: 3,
    errorMaxLines: 3,
    prefixIcon: icon == null ? null : Icon(icon, color: AppColors.navy),
    suffixIcon: suffix,
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(10),
      borderSide: const BorderSide(color: AppColors.navy, width: 2),
    ),
    filled: true,
    fillColor: Colors.white,
  );
}

/// Asks a yes/no question. Returns true only on confirmation.
Future<bool> confirm(BuildContext context, {required String title, required String message, String yes = 'Yes', bool danger = false}) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actions: [
        TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
        TextButton(
          onPressed: () => Navigator.pop(dialogContext, true),
          child: Text(yes, style: TextStyle(color: danger ? Colors.red : AppColors.navy)),
        ),
      ],
    ),
  );
  return result == true;
}
