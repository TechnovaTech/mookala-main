import 'package:flutter/material.dart';

import '../app_flow.dart';
import '../logic/event_logic.dart';
import '../logic/ticket_logic.dart';
import '../services/api.dart';
import '../services/api_client.dart';
import '../widgets/common.dart';
import 'add_tickets_screen.dart';
import 'create_event_screen.dart';
import 'event_analytics_screen.dart';
import 'jatra_list_screen.dart';
import 'kyc_verification_screen.dart';
import 'ticket_scanner_screen.dart';
import 'user_profile_screen.dart';
import 'view_event_screen.dart';

/// The organiser's home: KYC gate, then My events / Jatra / Scan.
class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  // KYC
  bool _kycLoading = true;
  String? _kycError;
  String _kycStatus = 'not_submitted';
  String _rejectionNotes = '';

  // Events
  bool _eventsLoading = false;
  String? _eventsError;
  List<Map<String, dynamic>> _events = [];
  String _filter = 'all';
  String _query = '';
  final _searchController = TextEditingController();

  int _tab = 0;

  static const _filters = {
    'all': 'All',
    'pending': 'Waiting',
    'approved': 'Approved',
    'rejected': 'Rejected',
    'past': 'Past',
  };

  @override
  void initState() {
    super.initState();
    _loadKyc();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadKyc() async {
    setState(() {
      _kycLoading = true;
      _kycError = null;
    });
    try {
      final data = await Api.kycStatus('organizer');
      if (!mounted) return;
      setState(() {
        _kycStatus = (data['kycStatus'] ?? 'not_submitted').toString();
        _rejectionNotes = (data['rejectionNotes'] ?? '').toString().trim();
      });
      if (_kycStatus == 'approved') _loadEvents();
    } on ApiException catch (e) {
      if (mounted) setState(() => _kycError = e.message);
    } finally {
      if (mounted) setState(() => _kycLoading = false);
    }
  }

  Future<void> _loadEvents() async {
    setState(() {
      _eventsLoading = _events.isEmpty;
      _eventsError = null;
    });
    try {
      final events = await Api.myEvents();
      if (!mounted) return;
      setState(() => _events = events);
    } on ApiException catch (e) {
      if (mounted) setState(() => _eventsError = e.message);
    } finally {
      if (mounted) setState(() => _eventsLoading = false);
    }
  }

  List<Map<String, dynamic>> get _visibleEvents {
    return _events.where((e) {
      final status = EventLogic.statusOf(e);
      final past = status == 'approved' && EventLogic.isPast(e);
      final matchesFilter = switch (_filter) {
        'pending' => status == 'pending',
        'approved' => status == 'approved' && !past,
        'rejected' => status == 'rejected',
        'past' => past,
        _ => true,
      };
      return matchesFilter && EventLogic.matchesSearch(e, _query);
    }).toList();
  }

  Future<void> _open(Widget screen) async {
    await Navigator.push(context, MaterialPageRoute(builder: (_) => screen));
    if (mounted && _kycStatus == 'approved') _loadEvents();
  }

  Future<void> _openKyc() async {
    await Navigator.push(context, MaterialPageRoute(builder: (_) => const KYCVerificationScreen()));
    if (mounted) _loadKyc();
  }

  Future<void> _delete(Map<String, dynamic> event) async {
    final id = (event['_id'] ?? '').toString();
    final ok = await confirm(
      context,
      title: 'Delete event',
      message: 'Delete "${event['name']}"? This cannot be undone. An event with confirmed bookings cannot be deleted.',
      yes: 'Delete',
      danger: true,
    );
    if (!ok || !mounted) return;
    try {
      await Api.deleteEvent(id);
      if (!mounted) return;
      showMessage(context, 'Event deleted');
      setState(() => _events.removeWhere((e) => e['_id'] == id));
    } on ApiException catch (e) {
      if (mounted) showMessage(context, e.message, error: true); // 409 carries the server's explanation
    }
  }

  // ---- KYC gate -----------------------------------------------------------

  Widget _kycGate() {
    final IconData icon;
    final String title;
    final String message;
    String? action;
    switch (_kycStatus) {
      case 'rejected':
        icon = Icons.cancel_outlined;
        title = 'KYC rejected';
        message = _rejectionNotes.isEmpty
            ? 'Your documents were rejected. Please submit them again.'
            : 'Your documents were rejected.\n\nReviewer\'s note: $_rejectionNotes';
        action = 'Resubmit KYC';
      case 'pending':
        icon = Icons.hourglass_top;
        title = 'KYC under review';
        message = 'Your documents are with the Mookalaa team. You can create events once they are approved. '
            'Pull down to check again.';
      default:
        icon = Icons.assignment_ind_outlined;
        title = 'Complete your KYC';
        message = 'Submit your Aadhaar and PAN so Mookalaa can verify you. You can create events after approval.';
        action = 'Submit KYC';
    }
    return RefreshIndicator(
      onRefresh: _loadKyc,
      child: StateView(
        icon: icon,
        title: title,
        message: message,
        actionLabel: action ?? 'Check again',
        onAction: action == null ? _loadKyc : _openKyc,
        color: _kycStatus == 'rejected' ? Colors.red : Colors.orange,
      ),
    );
  }

  // ---- Events tab ---------------------------------------------------------

  Color _statusColor(Map<String, dynamic> event) {
    switch (EventLogic.statusOf(event)) {
      case 'approved':
        return Colors.green.shade700;
      case 'rejected':
        return Colors.red.shade700;
      default:
        return Colors.orange.shade800;
    }
  }

  Widget _eventCard(Map<String, dynamic> event) {
    final media = event['media'];
    final banner = media is Map ? media['bannerImage'] : null;
    final status = EventLogic.statusOf(event);
    final sold = TicketLogic.totalSold(event['tickets']);
    final total = TicketLogic.totalQuantity(event['tickets']);
    final reason = (event['rejectionReason'] ?? '').toString().trim();
    final id = (event['_id'] ?? '').toString();
    final name = (event['name'] ?? 'Untitled event').toString();

    return Card(
      margin: const EdgeInsets.only(bottom: 14),
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: InkWell(
        onTap: () => _open(ViewEventScreen(eventId: id)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              height: 130,
              width: double.infinity,
              child: StoredImage(banner, placeholderIcon: Icons.event),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 10, 4, 4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(name,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.navy)),
                        const SizedBox(height: 4),
                        Text(EventLogic.displaySchedule(event), style: const TextStyle(color: Colors.black54)),
                        Text(EventLogic.placeOf(event),
                            maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.black54)),
                      ],
                    ),
                  ),
                  PopupMenuButton<String>(
                    onSelected: (value) {
                      switch (value) {
                        case 'view':
                          _open(ViewEventScreen(eventId: id));
                        case 'tickets':
                          _open(AddTicketsScreen(eventData: event));
                        case 'analytics':
                          _open(EventAnalyticsScreen(eventId: id, eventName: name));
                        case 'scan':
                          _open(TicketScannerScreen(eventId: id, eventName: name));
                        case 'delete':
                          _delete(event);
                      }
                    },
                    itemBuilder: (_) => [
                      const PopupMenuItem(value: 'view', child: Text('View event')),
                      const PopupMenuItem(value: 'tickets', child: Text('Edit tickets')),
                      const PopupMenuItem(value: 'analytics', child: Text('Sales & check-ins')),
                      if (status == 'approved') const PopupMenuItem(value: 'scan', child: Text('Scan tickets')),
                      const PopupMenuItem(value: 'delete', child: Text('Delete event', style: TextStyle(color: Colors.red))),
                    ],
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: _statusColor(event).withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(EventLogic.statusLabel(event),
                            style: TextStyle(color: _statusColor(event), fontWeight: FontWeight.w600, fontSize: 12)),
                      ),
                      const Spacer(),
                      Text(total == 0 ? 'No tickets' : '$sold of $total sold',
                          style: const TextStyle(color: Colors.black54, fontSize: 13)),
                    ],
                  ),
                  if (status == 'rejected' && reason.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text('Reason: $reason', style: TextStyle(color: Colors.red.shade700, fontSize: 13)),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _eventsTab() {
    if (_eventsLoading) return const LoadingView(label: 'Loading your events…');
    if (_eventsError != null && _events.isEmpty) {
      return RefreshIndicator(onRefresh: _loadEvents, child: StateView.error(_eventsError!, onRetry: _loadEvents));
    }
    if (_events.isEmpty) {
      return RefreshIndicator(
        onRefresh: _loadEvents,
        child: StateView(
          icon: Icons.event_available,
          title: 'No events yet',
          message: 'Create your first event. It is reviewed by Mookalaa before it goes on sale.',
          actionLabel: 'Create event',
          onAction: () => _open(const CreateEventScreen()),
        ),
      );
    }
    final visible = _visibleEvents;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 4),
          child: TextField(
            controller: _searchController,
            onChanged: (v) => setState(() => _query = v),
            decoration: InputDecoration(
              hintText: 'Search your events',
              prefixIcon: const Icon(Icons.search),
              suffixIcon: _query.isEmpty
                  ? null
                  : IconButton(
                      icon: const Icon(Icons.clear),
                      onPressed: () {
                        _searchController.clear();
                        setState(() => _query = '');
                      },
                    ),
              filled: true,
              fillColor: Colors.white,
              isDense: true,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide.none),
            ),
          ),
        ),
        SizedBox(
          height: 46,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            children: [
              for (final entry in _filters.entries)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 3),
                  child: ChoiceChip(
                    label: Text(entry.value),
                    selected: _filter == entry.key,
                    onSelected: (_) => setState(() => _filter = entry.key),
                  ),
                ),
            ],
          ),
        ),
        if (_eventsError != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            child: InfoBanner('Could not refresh: $_eventsError', color: Colors.red),
          ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _loadEvents,
            child: visible.isEmpty
                ? StateView(
                    icon: Icons.search_off,
                    title: 'Nothing matches',
                    message: _query.isNotEmpty
                        ? 'No event matches "$_query" in "${_filters[_filter]}".'
                        : 'You have no events under "${_filters[_filter]}".',
                    actionLabel: 'Show all events',
                    onAction: () {
                      _searchController.clear();
                      setState(() {
                        _filter = 'all';
                        _query = '';
                      });
                    },
                  )
                : ListView.builder(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(14, 8, 14, 90),
                    itemCount: visible.length,
                    itemBuilder: (_, i) => _eventCard(visible[i]),
                  ),
          ),
        ),
      ],
    );
  }

  // ---- Scan tab -----------------------------------------------------------

  Widget _scanTab() {
    if (_eventsLoading) return const LoadingView();
    final approved = _events.where((e) => EventLogic.statusOf(e) == 'approved').toList();
    if (_eventsError != null && _events.isEmpty) {
      return StateView.error(_eventsError!, onRetry: _loadEvents);
    }
    if (approved.isEmpty) {
      return RefreshIndicator(
        onRefresh: _loadEvents,
        child: const StateView(
          icon: Icons.qr_code_scanner,
          title: 'No event to scan for',
          message: 'Tickets can be scanned for events that Mookalaa has approved.',
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _loadEvents,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(14),
        children: [
          const Text('Choose the event you are scanning tickets for:',
              style: TextStyle(color: Colors.black54, height: 1.4)),
          const SizedBox(height: 10),
          for (final event in approved)
            Card(
              child: ListTile(
                leading: const Icon(Icons.qr_code_scanner, color: AppColors.navy),
                title: Text((event['name'] ?? '').toString(), style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text('${EventLogic.displaySchedule(event)}\n${EventLogic.placeOf(event)}'),
                isThreeLine: true,
                trailing: const Icon(Icons.chevron_right),
                onTap: () => _open(TicketScannerScreen(
                  eventId: (event['_id'] ?? '').toString(),
                  eventName: (event['name'] ?? '').toString(),
                )),
              ),
            ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final approved = !_kycLoading && _kycError == null && _kycStatus == 'approved';
    Widget body;
    if (_kycLoading) {
      body = const LoadingView();
    } else if (_kycError != null) {
      body = StateView.error(_kycError!, onRetry: _loadKyc);
    } else if (!approved) {
      body = _kycGate();
    } else {
      body = IndexedStack(
        index: _tab,
        children: [_eventsTab(), const JatraListScreen(embedded: true), _scanTab()],
      );
    }

    return Scaffold(
      appBar: appBar(
        const ['My events', 'Jatra', 'Scan tickets'][approved ? _tab : 0],
        showBack: false,
        actions: [
          IconButton(
            tooltip: 'Account',
            icon: const Icon(Icons.account_circle_outlined),
            onPressed: () async {
              await Navigator.push(context, MaterialPageRoute(builder: (_) => const UserProfileScreen()));
              if (mounted && !approved) _loadKyc();
            },
          ),
          if (!approved)
            IconButton(tooltip: 'Sign out', icon: const Icon(Icons.logout), onPressed: () => AppFlow.signOut()),
        ],
      ),
      body: SafeArea(child: body),
      floatingActionButton: approved && _tab == 0 && _events.isNotEmpty
          ? FloatingActionButton.extended(
              onPressed: () => _open(const CreateEventScreen()),
              backgroundColor: AppColors.navy,
              foregroundColor: Colors.white,
              icon: const Icon(Icons.add),
              label: const Text('Create event'),
            )
          : null,
      bottomNavigationBar: approved
          ? BottomNavigationBar(
              currentIndex: _tab,
              selectedItemColor: AppColors.navy,
              onTap: (i) => setState(() => _tab = i),
              items: const [
                BottomNavigationBarItem(icon: Icon(Icons.event), label: 'Events'),
                BottomNavigationBarItem(icon: Icon(Icons.festival), label: 'Jatra'),
                BottomNavigationBarItem(icon: Icon(Icons.qr_code_scanner), label: 'Scan'),
              ],
            )
          : null,
    );
  }
}
