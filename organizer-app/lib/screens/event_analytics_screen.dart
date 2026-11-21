import 'package:flutter/material.dart';

import '../logic/event_logic.dart';
import '../logic/ticket_logic.dart';
import '../services/api.dart';
import '../services/api_client.dart';
import '../widgets/common.dart';

/// Sales and check-ins of one event, matched by event id.
///
/// Sources: `GET /events/{id}` (ticket inventory), `GET /events/{id}/scan-stats`
/// and `GET /bookings?organizerPhone=&eventId=`. There is no payout data in
/// the app, so none is shown.
class EventAnalyticsScreen extends StatefulWidget {
  const EventAnalyticsScreen({super.key, required this.eventId, required this.eventName});

  final String eventId;
  final String eventName;

  @override
  State<EventAnalyticsScreen> createState() => _EventAnalyticsScreenState();
}

class _EventAnalyticsScreenState extends State<EventAnalyticsScreen> {
  bool _loading = true;
  String? _error;
  Map<String, dynamic> _stats = {};
  EventSales? _sales;
  List<Map<String, dynamic>> _tickets = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = _sales == null;
      _error = null;
    });
    try {
      final results = await Future.wait([
        Api.scanStats(widget.eventId),
        Api.eventBookings(widget.eventId),
        Api.event(widget.eventId),
      ]);
      if (!mounted) return;
      final event = results[2] as Map<String, dynamic>;
      setState(() {
        _stats = results[0] as Map<String, dynamic>;
        _sales = EventSales.fromBookings(results[1] as List<Map<String, dynamic>>, widget.eventId);
        _tickets = event['tickets'] is List
            ? (event['tickets'] as List).whereType<Map>().map((t) => Map<String, dynamic>.from(t)).toList()
            : [];
      });
    } on ApiException catch (e) {
      // A failed load is shown as an error, never as zeros.
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Widget _tile(String label, String value, IconData icon, {String? note}) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: AppColors.navy),
            const SizedBox(height: 8),
            Text(value, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: AppColors.navy)),
            Text(label, style: const TextStyle(color: Colors.black54)),
            if (note != null) Text(note, style: const TextStyle(color: Colors.black45, fontSize: 11)),
          ],
        ),
      ),
    );
  }

  Widget _content() {
    final sales = _sales!;
    final total = TicketLogic.countOf(_stats['totalTickets']);
    final sold = TicketLogic.countOf(_stats['soldTickets']);
    final scanned = TicketLogic.countOf(_stats['scannedTickets']);
    final waiting = TicketLogic.countOf(_stats['remainingTickets']);
    final unsold = TicketLogic.countOf(_stats['unsoldTickets']);

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(14),
        children: [
          Text(widget.eventName, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.navy)),
          const SizedBox(height: 10),
          if (_error != null) ...[InfoBanner('Could not refresh: $_error', color: Colors.red), const SizedBox(height: 10)],
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            childAspectRatio: 1.45,
            children: [
              _tile('Tickets sold', '$sold', Icons.confirmation_number_outlined, note: 'of $total on sale'),
              _tile('Checked in', '$scanned', Icons.how_to_reg_outlined, note: '$waiting sold, not yet checked in'),
              _tile('Unsold', '$unsold', Icons.inventory_2_outlined),
              _tile('Bookings', '${sales.bookings}', Icons.receipt_long_outlined,
                  note: '${sales.cancelledBookings} cancelled'),
            ],
          ),
          const SizedBox(height: 8),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Gross ticket sales', style: TextStyle(color: Colors.black54)),
                  Text('₹${TicketLogic.formatAmount(sales.grossSales)}',
                      style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w700, color: AppColors.navy)),
                  const SizedBox(height: 6),
                  const Text(
                    'The value of confirmed and attended bookings. This is not your payout: platform commission, '
                    'taxes, payment gateway fees and refunds are deducted when Mookalaa settles the event. '
                    'Settlement and payout amounts are not available in the app yet.',
                    style: TextStyle(color: Colors.black54, fontSize: 12, height: 1.4),
                  ),
                  if (sales.unverifiedBookings > 0) ...[
                    const SizedBox(height: 8),
                    InfoBanner('${sales.unverifiedBookings} confirmed booking(s) have a payment the gateway never '
                        'verified. They are included above but may not be paid out.'),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
          const SectionTitle('By ticket'),
          if (_tickets.isEmpty) const Text('This event has no tickets.', style: TextStyle(color: Colors.black54)),
          for (final t in _tickets)
            Builder(builder: (_) {
              final quantity = TicketLogic.countOf(t['quantity']);
              final ticketSold = TicketLogic.countOf(t['sold']);
              return Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text((t['name'] ?? '').toString(), style: const TextStyle(fontWeight: FontWeight.w600)),
                          ),
                          Text(TicketLogic.formatPrice(t['price']), style: const TextStyle(color: AppColors.navy)),
                        ],
                      ),
                      const SizedBox(height: 8),
                      LinearProgressIndicator(
                        value: quantity == 0 ? 0 : (ticketSold / quantity).clamp(0, 1).toDouble(),
                        color: AppColors.navy,
                        backgroundColor: Colors.grey.shade200,
                      ),
                      const SizedBox(height: 4),
                      Text('$ticketSold of $quantity sold', style: const TextStyle(color: Colors.black54, fontSize: 12)),
                    ],
                  ),
                ),
              );
            }),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: appBar('Sales & check-ins'),
      body: SafeArea(
        child: _loading
            ? const LoadingView()
            : _sales == null
                ? StateView.error(_error ?? 'Could not load the figures.', onRetry: _load)
                : _content(),
      ),
    );
  }
}
