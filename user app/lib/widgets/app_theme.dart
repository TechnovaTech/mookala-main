import 'package:flutter/material.dart';

class AppColors {
  AppColors._();
  static const navy = Color(0xFF001F3F);
  static const green = Color(0xFF2ECC71);
  static const danger = Color(0xFFC62828);
  static const warning = Color(0xFFEF6C00);
}

ButtonStyle primaryButtonStyle() => ElevatedButton.styleFrom(
      backgroundColor: AppColors.navy,
      foregroundColor: Colors.white,
      disabledBackgroundColor: Colors.grey.shade300,
      disabledForegroundColor: Colors.grey.shade600,
      minimumSize: const Size.fromHeight(52),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      elevation: 0,
      textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
    );

InputDecoration fieldDecoration(String label, {IconData? icon, String? hint, String? helper}) => InputDecoration(
      labelText: label,
      hintText: hint,
      helperText: helper,
      prefixIcon: icon == null ? null : Icon(icon),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: AppColors.navy, width: 2),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
    );

PreferredSizeWidget navyAppBar(String title, {List<Widget>? actions, bool showBack = true, PreferredSizeWidget? bottom}) => AppBar(
      backgroundColor: AppColors.navy,
      foregroundColor: Colors.white,
      elevation: 0,
      automaticallyImplyLeading: showBack,
      title: Text(title, style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w600)),
      actions: actions,
      bottom: bottom,
    );

void showMessage(BuildContext context, String message) {
  final messenger = ScaffoldMessenger.maybeOf(context);
  if (messenger == null) return;
  messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}
