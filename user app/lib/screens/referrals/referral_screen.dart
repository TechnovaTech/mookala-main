import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../services/api_client.dart';
import '../../utils/formats.dart';
import '../../widgets/app_theme.dart';
import 'referral_api.dart';
import 'referral_claim_field.dart';

/// What the running programme gives, in one sentence.
String rewardSentence(ReferralStatus status) {
  if (status.programmeName == null) {
    return 'There is no referral programme running right now, so friends who sign up with your code are not rewarded at the moment.';
  }
  const when = 'when a friend who signs up with your code makes their first paid booking.';
  final mine = status.referrerReward > 0 ? formatRupees(status.referrerReward) : null;
  final theirs = status.refereeReward > 0 ? formatRupees(status.refereeReward) : null;
  if (mine != null && theirs != null) return 'You get a $mine coupon and your friend gets a $theirs coupon $when';
  if (mine != null) return 'You get a $mine coupon $when';
  if (theirs != null) return 'Your friend gets a $theirs coupon $when';
  return 'Friends can sign up with your code. This programme gives no coupon at the moment.';
}

/// "Refer friends": the customer's own code to share, how many friends used
/// it, and (for a new customer) the field to enter a friend's code.
class ReferralScreen extends StatefulWidget {
  const ReferralScreen({super.key});

  @override
  State<ReferralScreen> createState() => _ReferralScreenState();
}

class _ReferralScreenState extends State<ReferralScreen> {
  ReferralStatus? _status;
  String? _error;
  String? _claimMessage;
  bool _loading = true;

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
      final status = await ReferralApi.status();
      if (mounted) {
        setState(() {
          _status = status;
          _loading = false;
        });
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _error = e.message;
          _loading = false;
        });
      }
    }
  }

  Future<void> _copy(String code) async {
    await Clipboard.setData(ClipboardData(text: code));
    if (mounted) showMessage(context, 'Code copied');
  }

  @override
  Widget build(BuildContext context) {
    final status = _status;
    return Scaffold(
      backgroundColor: Colors.grey.shade100,
      appBar: navyAppBar('Refer friends'),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.navy))
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(_error!, textAlign: TextAlign.center, style: TextStyle(color: Colors.grey.shade800)),
                        const SizedBox(height: 12),
                        TextButton(onPressed: _load, child: const Text('Try again')),
                      ],
                    ),
                  ),
                )
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Card(
                      color: Colors.white,
                      surfaceTintColor: Colors.white,
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Your referral code', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                Expanded(
                                  child: SelectableText(
                                    status!.code,
                                    key: const Key('referral-code'),
                                    style: const TextStyle(fontSize: 26, fontWeight: FontWeight.bold, letterSpacing: 2, color: AppColors.navy),
                                  ),
                                ),
                                IconButton(tooltip: 'Copy code', onPressed: () => _copy(status.code), icon: const Icon(Icons.copy)),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Text(rewardSentence(status), key: const Key('referral-reward'), style: TextStyle(color: Colors.grey.shade800)),
                            if (status.conditions.isNotEmpty) ...[
                              const SizedBox(height: 6),
                              Text(status.conditions, style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
                            ],
                          ],
                        ),
                      ),
                    ),
                    Card(
                      color: Colors.white,
                      surfaceTintColor: Colors.white,
                      child: ListTile(
                        leading: const Icon(Icons.people_outline, color: AppColors.navy),
                        title: Text('${status.referred} ${status.referred == 1 ? 'friend' : 'friends'} signed up with your code', key: const Key('referral-count')),
                        subtitle: Text('${status.qualified} made their first paid booking'),
                      ),
                    ),
                    if (status.claimedCode != null)
                      Card(
                        color: Colors.white,
                        surfaceTintColor: Colors.white,
                        child: ListTile(
                          leading: const Icon(Icons.check_circle_outline, color: AppColors.navy),
                          title: Text('You joined with the code ${status.claimedCode}'),
                          subtitle: const Text('Your reward is given after your first paid booking.'),
                        ),
                      )
                    else if (status.canClaim)
                      Card(
                        color: Colors.white,
                        surfaceTintColor: Colors.white,
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              const Text('Joined because of a friend?', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                              const SizedBox(height: 4),
                              Text('Enter their code before your first booking.', style: TextStyle(color: Colors.grey.shade700)),
                              const SizedBox(height: 12),
                              if (_claimMessage != null)
                                Text(_claimMessage!, key: const Key('referral-claim-done'), style: const TextStyle(color: AppColors.navy))
                              else
                                ReferralClaimField(
                                  onClaimed: (message) {
                                    setState(() => _claimMessage = message);
                                    _load();
                                  },
                                ),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
    );
  }
}
