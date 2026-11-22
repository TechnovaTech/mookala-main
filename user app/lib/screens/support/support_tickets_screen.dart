import 'package:flutter/material.dart';

import '../../models/booking.dart';
import '../../services/api_client.dart';
import '../../services/api_service.dart';
import '../../utils/formats.dart';
import '../../widgets/app_theme.dart';
import '../../widgets/state_views.dart';
import 'support_models.dart';

Color _statusColor(SupportTicket ticket) {
  if (ticket.finished) return Colors.green.shade700;
  if (ticket.status == 'waiting_customer') return AppColors.warning;
  return AppColors.navy;
}

/// The customer's tickets and complaints with the replies from support
/// (`GET /public/support/tickets`).
class SupportTicketsScreen extends StatefulWidget {
  const SupportTicketsScreen({super.key});

  @override
  State<SupportTicketsScreen> createState() => _SupportTicketsScreenState();
}

class _SupportTicketsScreenState extends State<SupportTicketsScreen> {
  List<SupportTicket> _tickets = [];
  bool _loading = true;
  String? _error;

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
      final rows = await ApiService.getMySupportTickets();
      if (!mounted) return;
      setState(() {
        _tickets = [for (final row in rows) SupportTicket.fromJson(row)];
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.message;
      });
    }
  }

  Future<void> _raise() async {
    final created = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => const NewTicketScreen()));
    if (created == true && mounted) _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey.shade100,
      appBar: navyAppBar(
        'My support tickets',
        actions: [IconButton(tooltip: 'Refresh', onPressed: _loading ? null : _load, icon: const Icon(Icons.refresh))],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _raise,
        backgroundColor: AppColors.navy,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add_comment_outlined),
        label: const Text('Raise a ticket'),
      ),
      body: _loading
          ? const LoadingView()
          : _error != null
              ? ErrorView(message: _error!, onRetry: _load)
              : RefreshIndicator(
                  onRefresh: _load,
                  child: _tickets.isEmpty
                      ? ListView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          children: const [
                            SizedBox(height: 80),
                            EmptyView(
                              icon: Icons.support_agent,
                              title: 'No tickets yet',
                              subtitle: 'Raise a ticket if something went wrong. Replies from Mookalaa support appear here.',
                            ),
                          ],
                        )
                      : ListView.separated(
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
                          itemCount: _tickets.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 12),
                          itemBuilder: (_, i) => _TicketTile(
                            ticket: _tickets[i],
                            onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => TicketDetailScreen(ticket: _tickets[i]))),
                          ),
                        ),
                ),
    );
  }
}

class _TicketTile extends StatelessWidget {
  const _TicketTile({required this.ticket, required this.onTap});
  final SupportTicket ticket;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = _statusColor(ticket);
    final replies = ticket.replies.length;
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
                  Expanded(child: Text(ticket.subject.isEmpty ? 'Ticket' : ticket.subject, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold))),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
                    child: Text(ticket.statusLabel, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600)),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                '${supportServiceLabel(ticket.service)} • ${formatTimestamp(ticket.createdAt)}',
                style: TextStyle(color: Colors.grey.shade700),
              ),
              const SizedBox(height: 4),
              Text(
                replies == 0 ? 'No reply yet' : '$replies ${replies == 1 ? 'reply' : 'replies'} from support',
                style: TextStyle(color: replies == 0 ? Colors.grey.shade600 : AppColors.navy, fontWeight: replies == 0 ? FontWeight.normal : FontWeight.w600),
              ),
              Text('Ref ${ticket.reference}', style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
            ],
          ),
        ),
      ),
    );
  }
}

/// One ticket with the replies written to the customer.
class TicketDetailScreen extends StatelessWidget {
  const TicketDetailScreen({super.key, required this.ticket});
  final SupportTicket ticket;

  @override
  Widget build(BuildContext context) {
    final color = _statusColor(ticket);
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: navyAppBar(ticket.kind == 'complaint' ? 'Complaint' : 'Ticket'),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(ticket.subject, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
                child: Text(ticket.statusLabel, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600)),
              ),
              Text(supportServiceLabel(ticket.service), style: TextStyle(color: Colors.grey.shade700)),
              Text('Ref ${ticket.reference}', style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
            ],
          ),
          const SizedBox(height: 4),
          Text('Raised ${formatTimestamp(ticket.createdAt)}', style: TextStyle(color: Colors.grey.shade600)),
          if (ticket.description.isNotEmpty) ...[
            const SizedBox(height: 16),
            const Text('What you wrote', style: TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 4),
            Text(ticket.description, style: const TextStyle(height: 1.4)),
          ],
          const SizedBox(height: 20),
          const Text('Replies from support', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          if (ticket.replies.isEmpty)
            Text('No reply yet. You will see the reply here.', style: TextStyle(color: Colors.grey.shade700))
          else
            for (final reply in ticket.replies)
              Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: AppColors.navy.withValues(alpha: 0.06), borderRadius: BorderRadius.circular(10)),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(reply.text, style: const TextStyle(height: 1.4)),
                    const SizedBox(height: 6),
                    Text('${reply.from} • ${formatTimestamp(reply.at)}', style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
                  ],
                ),
              ),
        ],
      ),
    );
  }
}

/// The form to raise a ticket (`POST /public/support/tickets`).
class NewTicketScreen extends StatefulWidget {
  const NewTicketScreen({super.key, this.booking});

  /// A booking the ticket is about, when it is raised from a ticket.
  final Booking? booking;

  @override
  State<NewTicketScreen> createState() => _NewTicketScreenState();
}

class _NewTicketScreenState extends State<NewTicketScreen> {
  final _subject = TextEditingController();
  final _description = TextEditingController();
  String _service = '';
  String _bookingId = '';
  List<Booking> _bookings = [];
  bool _sending = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final booking = widget.booking;
    if (booking != null) {
      _bookingId = booking.id;
      _service = 'ticketing';
      _bookings = [booking];
    } else {
      _loadBookings();
    }
  }

  @override
  void dispose() {
    _subject.dispose();
    _description.dispose();
    super.dispose();
  }

  Future<void> _loadBookings() async {
    try {
      final bookings = await ApiService.getMyBookings();
      if (mounted) setState(() => _bookings = bookings);
    } on ApiException {
      // Choosing a booking is optional; the form works without the list.
    }
  }

  Future<void> _send() async {
    final subject = _subject.text.trim();
    final description = _description.text.trim();
    String? problem;
    if (_service.isEmpty) {
      problem = 'Choose what the ticket is about.';
    } else if (subject.length < 3) {
      problem = 'Write a short subject (at least 3 characters).';
    } else if (description.length < 10) {
      problem = 'Describe the problem in a few words (at least 10 characters).';
    }
    if (problem != null) {
      setState(() => _error = problem);
      return;
    }
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await ApiService.raiseSupportTicket(subject: subject, service: _service, description: description, bookingId: _bookingId);
      if (!mounted) return;
      showMessage(context, 'Your ticket has been sent. Replies appear under My support tickets.');
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _error = e.message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: navyAppBar('Raise a ticket'),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          DropdownButtonFormField<String>(
            key: const ValueKey('ticket-service'),
            initialValue: _service.isEmpty ? null : _service,
            isExpanded: true,
            decoration: fieldDecoration('What is it about?'),
            items: [for (final s in supportServices) DropdownMenuItem(value: s.key, child: Text(s.value))],
            onChanged: _sending ? null : (value) => setState(() => _service = value ?? ''),
          ),
          const SizedBox(height: 16),
          TextField(
            key: const ValueKey('ticket-subject'),
            controller: _subject,
            enabled: !_sending,
            maxLength: 200,
            textInputAction: TextInputAction.next,
            decoration: fieldDecoration('Subject', hint: 'For example: ticket not received'),
          ),
          const SizedBox(height: 8),
          TextField(
            key: const ValueKey('ticket-description'),
            controller: _description,
            enabled: !_sending,
            maxLength: 4000,
            minLines: 4,
            maxLines: 8,
            decoration: fieldDecoration('Describe the problem'),
          ),
          const SizedBox(height: 8),
          if (_bookings.isNotEmpty)
            DropdownButtonFormField<String>(
              key: const ValueKey('ticket-booking'),
              initialValue: _bookingId,
              isExpanded: true,
              decoration: fieldDecoration('Booking (optional)'),
              items: [
                if (widget.booking == null) const DropdownMenuItem(value: '', child: Text('Not about a booking')),
                for (final b in _bookings)
                  DropdownMenuItem(value: b.id, child: Text('${b.title} • Ref ${b.reference}', overflow: TextOverflow.ellipsis)),
              ],
              onChanged: _sending ? null : (value) => setState(() => _bookingId = value ?? ''),
            ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: const TextStyle(color: AppColors.danger)),
          ],
          const SizedBox(height: 20),
          ElevatedButton(
            onPressed: _sending ? null : _send,
            style: primaryButtonStyle(),
            child: Text(_sending ? 'Sending...' : 'Send ticket'),
          ),
          const SizedBox(height: 12),
          Text(
            'Our support team replies here, in the app. You can raise up to 5 tickets a day.',
            style: TextStyle(color: Colors.grey.shade600),
          ),
        ],
      ),
    );
  }
}
