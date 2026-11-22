import 'package:flutter/material.dart';

import '../models/booking.dart';
import '../services/api_client.dart';
import '../services/api_service.dart';
import '../utils/booking_logic.dart';
import '../widgets/app_theme.dart';
import '../widgets/state_views.dart';
import 'support/rate_event_sheet.dart';
import 'support/support_models.dart';
import 'ticket_screen.dart';

/// The customer's bookings from one request (`GET /bookings?userPhone=`),
/// split into Upcoming / Past / Cancelled by the event date and the status.
class MyBookingsScreen extends StatefulWidget {
  const MyBookingsScreen({super.key});

  @override
  State<MyBookingsScreen> createState() => _MyBookingsScreenState();
}

class _MyBookingsScreenState extends State<MyBookingsScreen> {
  bool _loading = true;
  String? _error;
  Map<BookingGroup, List<Booking>> _groups = groupBookings(const [], DateTime.now());

  /// Ratings the customer already gave, by booking id.
  Map<String, MyRating> _ratings = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final bookings = await ApiService.getMyBookings();
      if (!mounted) return;
      setState(() {
        _groups = groupBookings(bookings, DateTime.now());
        _loading = false;
      });
      // Only bookings the customer attended can be rated; ask for their ratings only then.
      if (bookings.any(canRateBooking)) _loadRatings();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.message;
      });
    }
  }

  Future<void> _loadRatings() async {
    try {
      final rows = await ApiService.getMyRatings();
      if (!mounted) return;
      setState(() => _ratings = {for (final row in rows) MyRating.fromJson(row).bookingId: MyRating.fromJson(row)});
    } on ApiException {
      // Without the list the button is still shown; the server refuses a second rating.
    }
  }

  Future<void> _rate(Booking booking) async {
    final message = await showRateEventSheet(context, booking);
    if (message == null || !mounted) return;
    showMessage(context, message);
    _loadRatings();
  }

  Future<void> _open(Booking booking) async {
    final changed = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => TicketScreen(booking: booking)));
    if (changed == true && mounted) _load();
  }

  Widget _tab(BookingGroup group, String emptyTitle, String emptySubtitle) {
    final list = _groups[group]!;
    return RefreshIndicator(
      onRefresh: _load,
      child: list.isEmpty
          ? ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                const SizedBox(height: 80),
                EmptyView(icon: Icons.confirmation_number_outlined, title: emptyTitle, subtitle: emptySubtitle),
              ],
            )
          : ListView.separated(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(16),
              itemCount: list.length,
              separatorBuilder: (_, __) => const SizedBox(height: 12),
              itemBuilder: (_, i) => _BookingTile(
                booking: list[i],
                rating: _ratings[list[i].id],
                onTap: () => _open(list[i]),
                onRate: canRateBooking(list[i]) ? () => _rate(list[i]) : null,
              ),
            ),
    );
  }

  @override
  Widget build(BuildContext context) {
    String count(BookingGroup g) => _loading || _error != null ? '' : ' (${_groups[g]!.length})';
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        backgroundColor: Colors.grey.shade100,
        appBar: navyAppBar(
          'My bookings',
          actions: [IconButton(tooltip: 'Refresh', onPressed: _loading ? null : _load, icon: const Icon(Icons.refresh))],
          bottom: TabBar(
            labelColor: Colors.white,
            unselectedLabelColor: Colors.white70,
            indicatorColor: Colors.white,
            tabs: [
              Tab(text: 'Upcoming${count(BookingGroup.upcoming)}'),
              Tab(text: 'Past${count(BookingGroup.past)}'),
              Tab(text: 'Cancelled${count(BookingGroup.cancelled)}'),
            ],
          ),
        ),
        body: _loading
            ? const LoadingView()
            : _error != null
                ? ErrorView(message: _error!, onRetry: _load)
                : TabBarView(
                    children: [
                      _tab(BookingGroup.upcoming, 'No upcoming bookings', 'Tickets you book will appear here.'),
                      _tab(BookingGroup.past, 'No past bookings', 'Events you have been to will appear here.'),
                      _tab(BookingGroup.cancelled, 'No cancelled bookings', 'Bookings you cancel will appear here.'),
                    ],
                  ),
      ),
    );
  }
}

class _BookingTile extends StatelessWidget {
  const _BookingTile({required this.booking, required this.onTap, this.rating, this.onRate});
  final Booking booking;
  final VoidCallback onTap;

  /// The customer's rating of this booking, when they gave one.
  final MyRating? rating;

  /// Set for a booking the customer attended: opens "Rate this event".
  final VoidCallback? onRate;

  @override
  Widget build(BuildContext context) {
    final when = booking.start;
    final color = bookingStatusColor(booking.status);
    final dateText = when?.label ?? [booking.eventDate, booking.eventTime].where((s) => s.isNotEmpty).join(' • ');
    return Card(
      margin: EdgeInsets.zero,
      color: Colors.white,
      surfaceTintColor: Colors.white,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: Text(booking.title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold))),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
                    child: Text(bookingStatusLabel(booking.status), style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600)),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              if (dateText.isNotEmpty) Text(dateText, style: TextStyle(color: Colors.grey.shade700)),
              if (booking.venue.isNotEmpty) Text(booking.venue, style: TextStyle(color: Colors.grey.shade700)),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      '${booking.totalSeats} ${booking.totalSeats == 1 ? 'ticket' : 'tickets'} • ${booking.priceLabel} • ${paymentStatusLabel(booking.paymentStatus, isFree: booking.isFree)}',
                      style: const TextStyle(fontWeight: FontWeight.w500),
                    ),
                  ),
                  const Icon(Icons.chevron_right, color: Colors.grey),
                ],
              ),
              const SizedBox(height: 2),
              Text('Ref ${booking.reference}', style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
              if (rating != null) ...[
                const SizedBox(height: 8),
                Row(
                  children: [
                    const Icon(Icons.star, size: 18, color: AppColors.warning),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        'You rated this event ${rating!.rating}/5${rating!.statusLabel.isEmpty ? '' : ' • ${rating!.statusLabel}'}',
                        style: TextStyle(color: Colors.grey.shade800),
                      ),
                    ),
                  ],
                ),
              ] else if (onRate != null) ...[
                const SizedBox(height: 8),
                Align(
                  alignment: Alignment.centerLeft,
                  child: OutlinedButton.icon(
                    key: ValueKey('rate-${booking.id}'),
                    onPressed: onRate,
                    icon: const Icon(Icons.star_border, color: AppColors.warning),
                    label: const Text('Rate this event'),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
