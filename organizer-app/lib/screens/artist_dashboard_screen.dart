import 'package:flutter/material.dart';

import '../app_flow.dart';
import '../logic/ticket_logic.dart';
import '../services/api.dart';
import '../services/api_client.dart';
import '../services/session.dart';
import '../widgets/common.dart';
import 'artist_bookings_screen.dart';
import 'artist_calendar_screen.dart';
import 'artist_followers_screen.dart';
import 'artist_payments_screen.dart';
import 'artist_profile_screen.dart';
import 'kyc_verification_screen.dart';

/// The artist's home. Everything is behind KYC approval, and each KYC state
/// (not submitted / under review / rejected) offers its own next action.
class ArtistDashboardScreen extends StatefulWidget {
  const ArtistDashboardScreen({super.key});

  @override
  State<ArtistDashboardScreen> createState() => _ArtistDashboardScreenState();
}

class _ArtistDashboardScreenState extends State<ArtistDashboardScreen> {
  bool _loadingKyc = true;
  String? _kycError;
  String _kycStatus = 'not_submitted';
  String _rejectionNotes = '';
  bool _switching = false;

  int _tab = 0;
  final _homeKey = GlobalKey<_ArtistHomeState>();

  @override
  void initState() {
    super.initState();
    _loadKyc();
  }

  Future<void> _loadKyc() async {
    setState(() {
      _loadingKyc = true;
      _kycError = null;
    });
    try {
      final data = await Api.kycStatus('artist');
      if (!mounted) return;
      setState(() {
        _kycStatus = (data['kycStatus'] ?? 'not_submitted').toString();
        _rejectionNotes = (data['rejectionNotes'] ?? '').toString().trim();
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _kycError = e.message);
    } finally {
      if (mounted) setState(() => _loadingKyc = false);
    }
  }

  Future<void> _openKyc() async {
    await Navigator.push(context, MaterialPageRoute(builder: (_) => const KYCVerificationScreen()));
    if (mounted) _loadKyc();
  }

  Future<void> _switchRole() async {
    if (_switching) return;
    setState(() => _switching = true);
    try {
      await AppFlow.openRoleSwitcher(context);
    } on ApiException catch (e) {
      if (mounted) showMessage(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _switching = false);
    }
  }

  Future<void> _signOut() async {
    final sure = await confirm(context, title: 'Sign out', message: 'Sign out of this device?', yes: 'Sign out', danger: true);
    if (sure) await AppFlow.signOut();
  }

  /// Shown instead of the dashboard until KYC is approved. Always offers
  /// "Switch role" and "Sign out" so nobody is stuck here.
  Widget _gate() {
    Widget state;
    if (_loadingKyc) {
      state = const LoadingView();
    } else if (_kycError != null) {
      state = StateView.error(_kycError!, onRetry: _loadKyc);
    } else if (_kycStatus == 'rejected') {
      state = StateView(
        icon: Icons.cancel_outlined,
        title: 'KYC rejected',
        message: _rejectionNotes.isEmpty
            ? 'Your documents were not accepted. The reviewer did not leave a note. Please check them and submit again.'
            : 'Your documents were not accepted.\n\nReviewer\'s note: $_rejectionNotes',
        actionLabel: 'Resubmit documents',
        onAction: _openKyc,
        color: Colors.red,
      );
    } else if (_kycStatus == 'pending') {
      state = RefreshIndicator(
        onRefresh: _loadKyc,
        child: StateView(
          icon: Icons.hourglass_top,
          title: 'KYC under review',
          message: 'Your documents are waiting for review by the Mookalaa team. '
              'You can use the app once they are approved. Pull down to check again.',
          actionLabel: 'Check again',
          onAction: _loadKyc,
          color: Colors.orange,
        ),
      );
    } else {
      state = StateView(
        icon: Icons.badge_outlined,
        title: 'Verify your identity',
        message: 'You have not submitted your KYC documents yet. Submit your Aadhaar and PAN to start '
            'receiving booking requests.',
        actionLabel: 'Submit KYC',
        onAction: _openKyc,
      );
    }
    return Scaffold(
      appBar: appBar('Mookalaa Artist', showBack: false),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(child: state),
            const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  TextButton.icon(
                    onPressed: _switching ? null : _switchRole,
                    icon: const Icon(Icons.swap_horiz, color: AppColors.navy),
                    label: Text(_switching ? 'Loading…' : 'Switch role', style: const TextStyle(color: AppColors.navy)),
                  ),
                  TextButton.icon(
                    onPressed: _signOut,
                    icon: Icon(Icons.logout, color: Colors.red.shade700),
                    label: Text('Sign out', style: TextStyle(color: Colors.red.shade700)),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loadingKyc || _kycError != null || _kycStatus != 'approved') return _gate();

    return Scaffold(
      body: IndexedStack(
        index: _tab,
        children: [
          _ArtistHome(key: _homeKey, onOpenTab: (index) => setState(() => _tab = index)),
          ArtistBookingsScreen(embedded: true, onChanged: () => _homeKey.currentState?.reload()),
          const ArtistCalendarScreen(embedded: true),
          const ArtistProfileScreen(embedded: true),
        ],
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _tab,
        type: BottomNavigationBarType.fixed,
        selectedItemColor: AppColors.navy,
        unselectedItemColor: Colors.black45,
        onTap: (index) {
          setState(() => _tab = index);
          if (index == 0) _homeKey.currentState?.reload();
        },
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.home_outlined), activeIcon: Icon(Icons.home), label: 'Home'),
          BottomNavigationBarItem(icon: Icon(Icons.inbox_outlined), activeIcon: Icon(Icons.inbox), label: 'Bookings'),
          BottomNavigationBarItem(
              icon: Icon(Icons.calendar_month_outlined), activeIcon: Icon(Icons.calendar_month), label: 'Calendar'),
          BottomNavigationBarItem(icon: Icon(Icons.person_outline), activeIcon: Icon(Icons.person), label: 'Profile'),
        ],
      ),
    );
  }
}

/// Home tab: real counts from `GET /artist/dashboard-stats`.
class _ArtistHome extends StatefulWidget {
  const _ArtistHome({super.key, required this.onOpenTab});

  /// Switches the dashboard to another bottom tab (1 = Bookings, 2 = Calendar).
  final ValueChanged<int> onOpenTab;

  @override
  State<_ArtistHome> createState() => _ArtistHomeState();
}

class _ArtistHomeState extends State<_ArtistHome> {
  Map<String, dynamic>? _stats;
  String _name = '';
  String? _error;

  @override
  void initState() {
    super.initState();
    reload();
  }

  Future<void> reload() async {
    try {
      final stats = await Api.artistStats();
      if (!mounted) return;
      setState(() {
        _stats = stats;
        _error = null;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    }
    // The greeting is a nicety: the screen works without it.
    try {
      final user = await Api.profile('artist');
      if (!mounted) return;
      setState(() => _name = (user['name'] ?? '').toString().trim());
    } on ApiException {
      // keep whatever name is already shown
    }
  }

  Widget _statTile(IconData icon, String label, int value, VoidCallback onTap) {
    return Expanded(
      child: Card(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 8),
            child: Column(
              children: [
                Icon(icon, color: AppColors.navy),
                const SizedBox(height: 8),
                Text('$value',
                    style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: AppColors.navy)),
                const SizedBox(height: 4),
                Text(label, textAlign: TextAlign.center, style: const TextStyle(fontSize: 12, color: Colors.black54)),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _entry(IconData icon, String title, String subtitle, VoidCallback onTap) => Card(
        margin: const EdgeInsets.only(bottom: 10),
        child: ListTile(
          leading: Icon(icon, color: AppColors.navy),
          title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
          subtitle: Text(subtitle),
          trailing: const Icon(Icons.chevron_right),
          onTap: onTap,
        ),
      );

  void _push(Widget screen) {
    Navigator.push(context, MaterialPageRoute(builder: (_) => screen)).then((_) {
      if (mounted) reload();
    });
  }

  @override
  Widget build(BuildContext context) {
    final stats = _stats;
    Widget body;
    if (stats == null) {
      body = _error != null ? StateView.error(_error!, onRetry: reload) : const LoadingView();
    } else {
      final followers = TicketLogic.countOf(stats['followers']);
      final requests = TicketLogic.countOf(stats['bookingRequests']);
      final upcoming = TicketLogic.countOf(stats['upcomingEvents']);
      body = RefreshIndicator(
        onRefresh: reload,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: [
            Text(_name.isEmpty ? 'Welcome' : 'Welcome, $_name',
                style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: AppColors.navy)),
            Text('+91 ${Session.phone ?? ''}', style: const TextStyle(color: Colors.black54)),
            const SizedBox(height: 14),
            if (_error != null) ...[InfoBanner(_error!, color: Colors.red), const SizedBox(height: 12)],
            Row(
              children: [
                _statTile(Icons.inbox_outlined, 'Pending requests', requests, () => widget.onOpenTab(1)),
                _statTile(Icons.event_available_outlined, 'Upcoming events', upcoming, () => widget.onOpenTab(2)),
                _statTile(Icons.people_outline, 'Followers', followers, () => _push(const ArtistFollowersScreen())),
              ],
            ),
            const SizedBox(height: 16),
            if (requests > 0) ...[
              InfoBanner(
                '$requests booking request${requests == 1 ? ' is' : 's are'} waiting for your answer. Open Bookings to accept or decline.',
                color: Colors.blue,
              ),
              const SizedBox(height: 12),
            ],
            _entry(Icons.people_outline, 'Followers', 'People who follow you on Mookalaa',
                () => _push(const ArtistFollowersScreen())),
            _entry(Icons.account_balance_wallet_outlined, 'Earnings', 'Not available in the app yet',
                () => _push(const ArtistPaymentsScreen())),
          ],
        ),
      );
    }
    return Scaffold(
      appBar: appBar('Mookalaa Artist', showBack: false),
      body: SafeArea(child: body),
    );
  }
}
