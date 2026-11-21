import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../widgets/app_theme.dart';

/// Opens a web, mail or phone link outside the app and says so when it cannot.
Future<void> openLink(BuildContext context, String link) async {
  final text = link.trim();
  final uri = Uri.tryParse(text);
  if (text.isEmpty || uri == null || !uri.hasScheme) {
    showMessage(context, 'This link cannot be opened.');
    return;
  }
  var opened = false;
  try {
    opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
  } catch (_) {
    opened = false;
  }
  if (!opened && context.mounted) showMessage(context, 'No app on this phone can open this link.');
}

/// Opens the phone's maps app (or browser) searching for an address.
Future<void> openMapSearch(BuildContext context, String address) {
  final uri = Uri.https('www.google.com', '/maps/search/', {'api': '1', 'query': address});
  return openLink(context, uri.toString());
}

Future<void> shareText(BuildContext context, String text, {String? subject}) async {
  // iPad shows the share sheet as a popover and needs to know where to anchor it.
  final box = context.findRenderObject();
  final origin = box is RenderBox && box.hasSize ? box.localToGlobal(Offset.zero) & box.size : null;
  try {
    await Share.share(text, subject: subject, sharePositionOrigin: origin);
  } catch (_) {
    if (context.mounted) showMessage(context, 'Sharing is not available on this device.');
  }
}
