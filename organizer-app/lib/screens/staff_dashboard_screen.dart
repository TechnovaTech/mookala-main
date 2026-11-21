import 'package:flutter/material.dart';

import '../logic/event_logic.dart';
import '../logic/ticket_logic.dart';
import '../services/api.dart';
import '../services/api_client.dart';
import '../services/session.dart';
import '../widgets/common.dart';
import 'phone_login_screen.dart';
import 'ticket_scanner_screen.dart';

/// Gate staff home: live check-in numbers of their event and the scanner.
class StaffDashboardScreen extends StatefulWidget {
  const StaffDashboardScreen({super.key, required this.eventData, required this.staffData});

  final Map<String, dynamic> eventData;
  final Map<String, dynamic> staffData;

  @override
  State<StaffDashboardScreen> createState() => _StaffDashboardScreenState();
}

class _StaffDashboardScreenState extends State<StaffDashboardScreen> {
  int _tab = 0;
  Map<String, dynamic>? _stats;
  String? _error;
  bool _loading = true;

  String get _eventId => (widget.eventData['_id'] ?? '').toString();
  String get _eventName {
    final name = (widget.eventData['name'] ?? '').toString().trim();
    return name.isEmpty ? 'Event' : name;
  }

  @override
  void initState() {
    super.initState();
    _loadStats();
  }

  Future<void> _loadStats() async {
    if (_stats == null) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final stats = await Api.scanStats(_eventId);
      if (!mounted) return;
      setState(() {
        _stats = stats;
        _error = null;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _logout() async {
    final yes = await confirm(context, title: 'Sign out', message: 'Sign out of gate staff mode on this phone?', yes: 'Sign out');
    if (!yes) return;
    await Session.clearStaff();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const PhoneLoginScreen()), (_) => false);
  }

  Widget _statCard(String label, dynamic value, IconData icon, MaterialColor color) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade300),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: color.shade700),
          const SizedBox(height: 6),
          Text(TicketLogic.countOf(value).toString(),
              style: const TextStyle(fontSize: 26, fontWeight: FontWeight.bold, color: AppColors.navy)),
          Text(label, style: const TextStyle(color: Colors.black54, fontSize: 13)),
        ],
      ),
    );
  }

  Widget _header() {
    final staffName = (widget.staffData['name'] ?? '').toString().trim();
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: AppColors.navy, borderRadius: BorderRadius.circular(12)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(_eventName, style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
          const SizedBox(height: 6),
          Row(children: [
            const Icon(Icons.schedule, color: Colors.white70, size: 16),
            const SizedBox(width: 6),
            Expanded(child: Text(EventLogic.displaySchedule(widget.eventData), style: const TextStyle(color: Colors.white70))),
          ]),
          const SizedBox(height: 4),
          Row(children: [
            const Icon(Icons.place_outlined, color: Colors.white70, size: 16),
            const SizedBox(width: 6),
            Expanded(child: Text(EventLogic.placeOf(widget.eventData), style: const TextStyle(color: Colors.white70))),
          ]),
          if (staffName.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text('Signed in as $staffName', style: const TextStyle(color: Colors.white, fontSize: 13)),
          ],
        ],
      ),
    );
  }

  Widget _overview() {
    final stats = _stats;
    return RefreshIndicator(
      onRefresh: _loadStats,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          _header(),
          const SizedBox(height: 16),
          if (_loading && stats == null)
            const Padding(padding: EdgeInsets.all(40), child: LoadingView(label: 'Loading check-in numbers…'))
          else if (stats == null)
            Column(children: [
              InfoBanner('Could not load the check-in numbers: ${_error ?? 'unknown error'}',
                  color: Colors.red, icon: Icons.error_outline),
              const SizedBox(height: 10),
              OutlinedButton.icon(onPressed: _loadStats, icon: const Icon(Icons.refresh), label: const Text('Try again')),
            ])
          else ...[
            if (_error != null) ...[
              InfoBanner('These numbers may be out of date. The last refresh failed: $_error'),
              const SizedBox(height: 10),
            ],
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              childAspectRatio: 1.45,
              children: [
                _statCard('Checked in', stats['scannedTickets'], Icons.how_to_reg, Colors.green),
                _statCard('Sold, not yet checked in', stats['remainingTickets'], Icons.hourglass_bottom, Colors.orange),
                _statCard('Tickets sold', stats['soldTickets'], Icons.confirmation_number, Colors.blue),
                _statCard('Unsold', stats['unsoldTickets'], Icons.inventory_2_outlined, Colors.grey),
              ],
            ),
            const SizedBox(height: 12),
            Text('Total tickets on sale: ${TicketLogic.countOf(stats['totalTickets'])}',
                style: const TextStyle(color: Colors.black54)),
          ],
          const SizedBox(height: 20),
          PrimaryButton(label: 'Scan tickets', icon: Icons.qr_code_scanner, onPressed: () => setState(() => _tab = 1)),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: appBar(
        _tab == 0 ? 'Gate staff' : 'Scan tickets',
        showBack: false,
        actions: [
          IconButton(tooltip: 'Refresh', icon: const Icon(Icons.refresh), onPressed: _loadStats),
          IconButton(tooltip: 'Sign out', icon: const Icon(Icons.logout), onPressed: _logout),
        ],
      ),
      body: SafeArea(
        child: _tab == 0
            ? _overview()
            : TicketScannerScreen(eventId: _eventId, eventName: _eventName, onScanned: _loadStats, embedded: true),
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _tab,
        selectedItemColor: AppColors.navy,
        onTap: (index) {
          setState(() => _tab = index);
          if (index == 0) _loadStats();
        },
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.dashboard_outlined), label: 'Overview'),
          BottomNavigationBarItem(icon: Icon(Icons.qr_code_scanner), label: 'Scan'),
        ],
      ),
    );
  }
}
