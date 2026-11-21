import 'package:flutter/material.dart';

import '../models/event.dart';
import 'app_image.dart';
import 'app_theme.dart';

/// The one event card of the app. Every field is optional on a live event, so
/// each line is only drawn when there is something real to show.
class EventCard extends StatelessWidget {
  const EventCard({super.key, required this.event, required this.onTap, this.width, this.imageHeight = 150});

  final EventModel event;
  final VoidCallback onTap;

  /// Set for horizontal lists; null fills the available width.
  final double? width;
  final double imageHeight;

  Widget _line(IconData icon, String text) => Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Row(
          children: [
            Icon(icon, size: 14, color: Colors.grey.shade600),
            const SizedBox(width: 6),
            Expanded(
              child: Text(text, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13, color: Colors.grey.shade700)),
            ),
          ],
        ),
      );

  @override
  Widget build(BuildContext context) {
    final place = event.placeLabel;
    final price = event.priceLabel;
    return SizedBox(
      width: width,
      child: Card(
        margin: EdgeInsets.zero,
        clipBehavior: Clip.antiAlias,
        elevation: 1.5,
        color: Colors.white,
        surfaceTintColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        child: InkWell(
          onTap: onTap,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Stack(
                children: [
                  AppImage(event.image, height: imageHeight, width: double.infinity, placeholderIcon: Icons.event),
                  if (event.category.isNotEmpty)
                    Positioned(
                      left: 8,
                      top: 8,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.65), borderRadius: BorderRadius.circular(12)),
                        child: Text(event.category, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600)),
                      ),
                    ),
                ],
              ),
              Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(event.title, maxLines: width == null ? 2 : 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
                    _line(Icons.calendar_today, event.dateLabel),
                    if (place.isNotEmpty) _line(Icons.location_on_outlined, place),
                    if (price.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(price, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: AppColors.navy)),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
