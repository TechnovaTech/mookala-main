import 'dart:async';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:video_player/video_player.dart';

import '../services/api_service.dart';
import '../utils/image_source.dart';
import '../utils/links.dart';
import 'app_image.dart';
import 'app_theme.dart';

/// A banner or ad from `/banners` or `/ads`.
class Promo {
  Promo({
    required this.id,
    required this.title,
    required this.media,
    required this.isVideo,
    required this.link,
    required this.sponsor,
    required this.seconds,
    this.campaignId = '',
    this.couponCode = '',
  });

  factory Promo.fromJson(Map<String, dynamic> json) {
    final media = json['image'] is String ? json['image'] as String : '';
    final duration = json['duration'] is num ? (json['duration'] as num).toInt() : 0;
    return Promo(
      id: (json['_id'] ?? '').toString(),
      title: json['title'] is String ? (json['title'] as String).trim() : '',
      media: media,
      isVideo: isVideoSource(media, json['mediaType'] is String ? json['mediaType'] as String : null),
      link: json['link'] is String ? (json['link'] as String).trim() : '',
      sponsor: json['sponsor'] is String ? (json['sponsor'] as String).trim() : '',
      seconds: duration > 0 ? duration : 5,
      campaignId: json['campaignId'] is String ? (json['campaignId'] as String).trim() : '',
      couponCode: json['couponCode'] is String ? (json['couponCode'] as String).trim() : '',
    );
  }

  final String id;
  final String title;
  final String media;
  final bool isVideo;
  final String link;
  final String sponsor;

  /// How long the slide stays before the carousel moves on.
  final int seconds;

  /// Set when the slide is an advertiser campaign, whose views and taps are
  /// reported to the server. Empty for ordinary banners and ads.
  final String campaignId;

  /// The coupon a promotion advertises, entered at checkout. Empty when none.
  final String couponCode;

  /// The sponsor without the "· code X" the server appends for older app
  /// versions, since the code has its own badge here.
  String get sponsorLabel {
    final suffix = ' · code $couponCode';
    return couponCode.isNotEmpty && sponsor.endsWith(suffix) ? sponsor.substring(0, sponsor.length - suffix.length) : sponsor;
  }
}

/// Reports advertiser campaign views and taps. A view is reported once per
/// campaign for as long as the app stays open; every tap is reported.
class PromoTracker {
  PromoTracker._();

  static final Set<String> _viewed = <String>{};

  /// Replaced in tests to capture what would be sent.
  static Future<void> Function(String campaignId, {required bool click}) send = ApiService.trackAd;

  static void viewed(Promo item) {
    if (item.campaignId.isEmpty || !_viewed.add(item.campaignId)) return;
    send(item.campaignId, click: false);
  }

  static void tapped(Promo item) {
    if (item.campaignId.isEmpty) return;
    send(item.campaignId, click: true);
  }

  /// For tests: forgets which campaigns were already viewed.
  static void reset() => _viewed.clear();
}

/// Swipeable banners / ads. A slide with a link opens it; one without a link
/// is not tappable.
class PromoCarousel extends StatefulWidget {
  const PromoCarousel({super.key, required this.items, this.height = 170, this.showSponsor = false});

  final List<Promo> items;
  final double height;
  final bool showSponsor;

  @override
  State<PromoCarousel> createState() => _PromoCarouselState();
}

class _PromoCarouselState extends State<PromoCarousel> {
  final PageController _controller = PageController();
  Timer? _timer;
  int _index = 0;
  ScrollPosition? _pageScroll;
  double _screenHeight = 0;

  @override
  void initState() {
    super.initState();
    _schedule();
    _reportAfterFrame();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // The carousel sits in a scrolling page: a slide below the fold has not
    // been shown yet, so visibility is checked again whenever the page scrolls.
    final position = Scrollable.maybeOf(context)?.position;
    if (position != _pageScroll) {
      _pageScroll?.removeListener(_reportIfVisible);
      _pageScroll = position;
      position?.addListener(_reportIfVisible);
    }
  }

  void _reportAfterFrame() {
    WidgetsBinding.instance.addPostFrameCallback((_) => _reportIfVisible());
  }

  /// Reports the current slide as viewed when it is an advertiser campaign and
  /// at least half of the carousel is on screen.
  void _reportIfVisible() {
    if (!mounted || widget.items.isEmpty) return;
    final item = widget.items[_index % widget.items.length];
    if (item.campaignId.isEmpty) return;
    final box = context.findRenderObject();
    if (box is! RenderBox || !box.attached || !box.hasSize || _screenHeight <= 0) return;
    final top = box.localToGlobal(Offset.zero).dy;
    final visible = math.min(top + box.size.height, _screenHeight) - math.max(top, 0.0);
    if (visible >= box.size.height / 2) PromoTracker.viewed(item);
  }

  void _schedule() {
    _timer?.cancel();
    if (widget.items.length < 2) return;
    final seconds = widget.items[_index % widget.items.length].seconds;
    _timer = Timer(Duration(seconds: seconds), () {
      if (!mounted || !_controller.hasClients) return;
      final next = (_index + 1) % widget.items.length;
      _controller.animateToPage(next, duration: const Duration(milliseconds: 400), curve: Curves.easeInOut);
    });
  }

  @override
  void didUpdateWidget(PromoCarousel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.items.length != widget.items.length) {
      _index = 0;
      _schedule();
    }
    _reportAfterFrame();
  }

  @override
  void dispose() {
    _pageScroll?.removeListener(_reportIfVisible);
    _timer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final items = widget.items;
    _screenHeight = MediaQuery.sizeOf(context).height;
    if (items.isEmpty) return const SizedBox.shrink();
    return Column(
      children: [
        SizedBox(
          height: widget.height,
          child: PageView.builder(
            controller: _controller,
            itemCount: items.length,
            onPageChanged: (i) {
              setState(() => _index = i);
              _schedule();
              _reportIfVisible();
            },
            itemBuilder: (context, i) {
              final item = items[i];
              final slide = ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    if (item.isVideo) PromoVideo(source: item.media, title: item.title) else AppImage(item.media, placeholderIcon: Icons.campaign_outlined),
                    if (widget.showSponsor && item.sponsor.isNotEmpty)
                      Positioned(
                        left: 8,
                        bottom: 8,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.6), borderRadius: BorderRadius.circular(10)),
                          child: Text('Ad • ${item.sponsorLabel}', style: const TextStyle(color: Colors.white, fontSize: 11)),
                        ),
                      ),
                    if (item.couponCode.isNotEmpty)
                      Positioned(
                        left: 8,
                        top: 8,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.6), borderRadius: BorderRadius.circular(10)),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.local_offer_outlined, color: Colors.white, size: 12),
                              const SizedBox(width: 4),
                              Text('Code ${item.couponCode}', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600)),
                            ],
                          ),
                        ),
                      ),
                    if (item.link.isNotEmpty)
                      Positioned(
                        right: 8,
                        bottom: 8,
                        child: Container(
                          padding: const EdgeInsets.all(6),
                          decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.6), shape: BoxShape.circle),
                          child: const Icon(Icons.open_in_new, color: Colors.white, size: 14),
                        ),
                      ),
                  ],
                ),
              );
              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: item.link.isEmpty
                    ? slide
                    : Semantics(
                        button: true,
                        label: item.title,
                        child: GestureDetector(
                          onTap: () {
                            PromoTracker.tapped(item);
                            openLink(context, item.link);
                          },
                          child: slide,
                        ),
                      ),
              );
            },
          ),
        ),
        if (items.length > 1)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (var i = 0; i < items.length; i++)
                  Container(
                    width: i == _index ? 16 : 6,
                    height: 6,
                    margin: const EdgeInsets.symmetric(horizontal: 2),
                    decoration: BoxDecoration(
                      color: i == _index ? AppColors.navy : Colors.grey.shade400,
                      borderRadius: BorderRadius.circular(3),
                    ),
                  ),
              ],
            ),
          ),
      ],
    );
  }
}

/// A muted, looping video slide. The admin panel stores videos as `data:` URLs,
/// which the player cannot read directly, so they are written to a temporary
/// file first. If the video cannot be played the slide shows its title instead.
class PromoVideo extends StatefulWidget {
  const PromoVideo({super.key, required this.source, required this.title});
  final String source;
  final String title;

  @override
  State<PromoVideo> createState() => _PromoVideoState();
}

class _PromoVideoState extends State<PromoVideo> {
  VideoPlayerController? _controller;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _prepare();
  }

  Future<void> _prepare() async {
    try {
      final source = widget.source.trim();
      VideoPlayerController controller;
      if (source.startsWith('http://') || source.startsWith('https://')) {
        controller = VideoPlayerController.networkUrl(Uri.parse(source));
      } else {
        final data = UriData.parse(source);
        final extension = data.mimeType.contains('webm') ? 'webm' : 'mp4';
        final dir = await getTemporaryDirectory();
        final file = File('${dir.path}/promo_${source.length}_${source.hashCode}.$extension');
        if (!file.existsSync()) await file.writeAsBytes(data.contentAsBytes(), flush: true);
        controller = VideoPlayerController.file(file);
      }
      await controller.initialize();
      await controller.setLooping(true);
      await controller.setVolume(0);
      if (!mounted) {
        await controller.dispose();
        return;
      }
      setState(() => _controller = controller);
      await controller.play();
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    if (controller != null && controller.value.isInitialized) {
      return FittedBox(
        fit: BoxFit.cover,
        clipBehavior: Clip.hardEdge,
        child: SizedBox(width: controller.value.size.width, height: controller.value.size.height, child: VideoPlayer(controller)),
      );
    }
    return Container(
      color: Colors.grey.shade200,
      alignment: Alignment.center,
      padding: const EdgeInsets.all(16),
      child: _failed
          ? Text(widget.title.isEmpty ? 'This video cannot be played on this device.' : widget.title,
              textAlign: TextAlign.center, style: TextStyle(color: Colors.grey.shade700))
          : const CircularProgressIndicator(color: AppColors.navy),
    );
  }
}
