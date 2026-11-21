import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../logic/ticket_logic.dart';
import '../services/api.dart';
import '../services/api_client.dart';
import '../services/session.dart';
import '../widgets/common.dart';
import 'create_ticket_screen.dart';

/// Tickets of an event.
///
/// As the last step of creating an event it sends `POST /events`. Opened for an
/// event that already exists (`eventData['_id']` set) it only replaces the
/// ticket list with `PATCH /events/{id}`, the one change the backend accepts
/// from the app. The server keeps every `sold` count itself.
class AddTicketsScreen extends StatefulWidget {
  const AddTicketsScreen({super.key, required this.eventData, this.venue});

  final Map<String, dynamic> eventData;

  /// The venue with its seating plan, when known.
  final Map<String, dynamic>? venue;

  @override
  State<AddTicketsScreen> createState() => _AddTicketsScreenState();
}

class _AddTicketsScreenState extends State<AddTicketsScreen> {
  List<Map<String, dynamic>> _tickets = [];
  Map<String, dynamic>? _venue;
  bool _saving = false;
  bool _dirty = false;

  String? get _existingId {
    final id = (widget.eventData['_id'] ?? '').toString().trim();
    return id.isEmpty ? null : id;
  }

  bool get _existing => _existingId != null;

  List<Map<String, dynamic>> get _blocks {
    final config = _venue?['seatConfig'];
    if (config is! Map || config['blocks'] is! List) return [];
    return (config['blocks'] as List)
        .whereType<Map>()
        .map((b) => Map<String, dynamic>.from(b))
        .where((b) => (b['name'] ?? '').toString().trim().isNotEmpty && TicketLogic.countOf(b['totalSeats']) > 0)
        .toList();
  }

  @override
  void initState() {
    super.initState();
    _venue = widget.venue;
    final stored = widget.eventData['tickets'];
    if (stored is List) {
      _tickets = stored.whereType<Map>().map((t) => Map<String, dynamic>.from(t)).toList();
    }
    if (_venue == null && _existing) _findVenue();
  }

  /// For an existing event the seating plan is looked up from the venue list.
  Future<void> _findVenue() async {
    final venueId = (widget.eventData['venue'] ?? '').toString();
    final location = widget.eventData['location'];
    final venueName = location is Map ? (location['name'] ?? '').toString().trim().toLowerCase() : '';
    if (venueId.isEmpty && venueName.isEmpty) return;
    try {
      final venues = await Api.venues();
      if (!mounted) return;
      for (final v in venues) {
        if ((venueId.isNotEmpty && v['_id'] == venueId) ||
            (venueName.isNotEmpty && (v['name'] ?? '').toString().trim().toLowerCase() == venueName)) {
          setState(() => _venue = v);
          return;
        }
      }
    } on ApiException {
      // Without the seating plan only quantities and prices can be edited.
    }
  }

  Future<void> _editGeneral({int? index}) async {
    final current = index == null ? null : _tickets[index];
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (_) => _GeneralTicketDialog(
        ticket: current,
        otherKeys: {
          for (var i = 0; i < _tickets.length; i++)
            if (i != index) TicketLogic.keyOf(_tickets[i]),
        },
      ),
    );
    if (result == null || !mounted) return;
    setState(() {
      if (index == null) {
        _tickets.add(result);
      } else {
        _tickets[index] = result;
      }
      _dirty = true;
    });
  }

  Future<void> _editSeatPricing() async {
    final seatWise = _tickets.where((t) => t['isSeatWise'] == true).toList();
    final result = await Navigator.push<List<Map<String, dynamic>>>(
      context,
      MaterialPageRoute(
        builder: (_) => CreateTicketScreen(
          venueName: (_venue?['name'] ?? '').toString(),
          blocks: _blocks,
          seatingLayoutImage: _venue?['seatingLayoutImage'],
          existing: seatWise,
        ),
      ),
    );
    if (result == null || !mounted) return;
    final soldByKey = {for (final t in seatWise) TicketLogic.keyOf(t): t['sold']};
    setState(() {
      _tickets = [
        ..._tickets.where((t) => t['isSeatWise'] != true),
        for (final t in result) {...t, if (soldByKey[TicketLogic.keyOf(t)] != null) 'sold': soldByKey[TicketLogic.keyOf(t)]},
      ];
      _dirty = true;
    });
  }

  Future<void> _remove(int index) async {
    final ticket = _tickets[index];
    final sold = TicketLogic.countOf(ticket['sold']);
    final ok = await confirm(
      context,
      title: 'Remove ticket',
      message: sold > 0
          ? '"${ticket['name']}" already has $sold sold. The server will refuse to save the event without it. Remove it from this list anyway?'
          : 'Remove "${ticket['name']}"?',
      yes: 'Remove',
      danger: true,
    );
    if (!ok || !mounted) return;
    setState(() {
      _tickets.removeAt(index);
      _dirty = true;
    });
  }

  Future<void> _save() async {
    final problem = TicketLogic.validateList(_tickets);
    if (problem != null) {
      showMessage(context, problem, error: true);
      return;
    }
    setState(() => _saving = true);
    try {
      final tickets = TicketLogic.listForServer(_tickets);
      if (_existing) {
        final message = await Api.updateTickets(_existingId!, tickets);
        if (!mounted) return;
        showMessage(context, message);
        Navigator.pop(context, true);
      } else {
        final payload = Map<String, dynamic>.from(widget.eventData)
          ..['organizerPhone'] = Session.phone
          ..['organizerRole'] = Session.role ?? 'organizer'
          ..['tickets'] = tickets;
        await Api.createEvent(payload);
        if (!mounted) return;
        await showDialog<void>(
          context: context,
          barrierDismissible: false,
          builder: (dialogContext) => AlertDialog(
            title: const Text('Event submitted'),
            content: const Text(
              'Your event was sent to the Mookalaa team for approval. It appears in your events as '
              '"Waiting for approval" and goes on sale once it is approved.',
            ),
            actions: [TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('OK'))],
          ),
        );
        if (!mounted) return;
        Navigator.of(context).popUntil((route) => route.isFirst);
      }
    } on ApiException catch (e) {
      // 409: a sold ticket would be removed or shrunk; 413: the photos are too large. The server's words are shown.
      if (mounted) showMessage(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Widget _ticketCard(int index) {
    final t = _tickets[index];
    final sold = TicketLogic.countOf(t['sold']);
    final seatWise = t['isSeatWise'] == true;
    final details = [
      '${TicketLogic.countOf(t['quantity'])} tickets',
      if (seatWise && t['startSeat'] != null) 'Block ${t['blockName']} · seats ${t['startSeat']}-${t['endSeat']}',
      if (_existing) '$sold sold',
    ].join(' · ');
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        leading: Icon(seatWise ? Icons.event_seat : Icons.confirmation_number_outlined, color: AppColors.navy),
        title: Text((t['name'] ?? '').toString(), style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(details),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(TicketLogic.formatPrice(t['price']),
                style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.navy)),
            IconButton(
              tooltip: 'Edit',
              icon: const Icon(Icons.edit_outlined, size: 20),
              onPressed: _saving
                  ? null
                  : () => seatWise && _blocks.isNotEmpty ? _editSeatPricing() : _editGeneral(index: index),
            ),
            IconButton(
              tooltip: 'Remove',
              icon: const Icon(Icons.delete_outline, size: 20, color: Colors.red),
              onPressed: _saving ? null : () => _remove(index),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final hasBlocks = _blocks.isNotEmpty;
    final capacity = TicketLogic.countOf(_venue?['capacity']);
    final total = TicketLogic.totalQuantity(_tickets);
    return PopScope(
      canPop: !_dirty || !_existing,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        final navigator = Navigator.of(context);
        final leave = await confirm(context,
            title: 'Discard changes?', message: 'Your ticket changes have not been saved.', yes: 'Discard', danger: true);
        if (leave) navigator.pop();
      },
      child: Scaffold(
        appBar: appBar(_existing ? 'Tickets' : 'Create event · 4 of 4'),
        body: SafeArea(
          child: Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Text(
                      _existing
                          ? 'Tickets of "${widget.eventData['name'] ?? 'this event'}". Saving replaces the ticket list of '
                              'this event. Tickets that already have sales cannot be removed, renamed or reduced below '
                              'what is sold.'
                          : 'Add the tickets customers can buy. An event needs at least one ticket.',
                      style: const TextStyle(color: Colors.black54, height: 1.4),
                    ),
                    const SizedBox(height: 14),
                    if (_tickets.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 28),
                        child: Column(
                          children: [
                            Icon(Icons.confirmation_number_outlined, size: 48, color: Colors.black26),
                            SizedBox(height: 8),
                            Text('No tickets yet', style: TextStyle(color: Colors.black54)),
                          ],
                        ),
                      ),
                    for (var i = 0; i < _tickets.length; i++) _ticketCard(i),
                    if (capacity > 0 && total > capacity)
                      InfoBanner('These tickets add up to $total, more than the venue capacity of $capacity.'),
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      onPressed: _saving ? null : () => _editGeneral(),
                      icon: const Icon(Icons.add),
                      label: const Text('Add a ticket (no seat numbers)'),
                      style: OutlinedButton.styleFrom(foregroundColor: AppColors.navy),
                    ),
                    if (hasBlocks)
                      OutlinedButton.icon(
                        onPressed: _saving ? null : _editSeatPricing,
                        icon: const Icon(Icons.event_seat),
                        label: Text(_tickets.any((t) => t['isSeatWise'] == true)
                            ? 'Edit seat-block pricing'
                            : 'Price by seat block (${_venue?['name']})'),
                        style: OutlinedButton.styleFrom(foregroundColor: AppColors.navy),
                      ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                child: PrimaryButton(
                  label: _existing ? 'Save tickets' : 'Submit event for approval',
                  loading: _saving,
                  onPressed: _tickets.isEmpty ? null : _save,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _GeneralTicketDialog extends StatefulWidget {
  const _GeneralTicketDialog({this.ticket, required this.otherKeys});
  final Map<String, dynamic>? ticket;
  final Set<String> otherKeys;

  @override
  State<_GeneralTicketDialog> createState() => _GeneralTicketDialogState();
}

class _GeneralTicketDialogState extends State<_GeneralTicketDialog> {
  late final _name = TextEditingController(text: (widget.ticket?['name'] ?? '').toString());
  late final _price = TextEditingController(
      text: widget.ticket == null ? '' : TicketLogic.formatAmount(TicketLogic.priceOf(widget.ticket!['price'])));
  late final _quantity = TextEditingController(
      text: widget.ticket == null ? '' : TicketLogic.countOf(widget.ticket!['quantity']).toString());
  String? _error;

  int get _sold => TicketLogic.countOf(widget.ticket?['sold']);

  /// A seat-wise ticket edited here (no seating plan available): only its price changes.
  bool get _seatWise => widget.ticket?['isSeatWise'] == true;

  @override
  void dispose() {
    _name.dispose();
    _price.dispose();
    _quantity.dispose();
    super.dispose();
  }

  void _done() {
    final problem =
        TicketLogic.validateGeneral(name: _name.text, priceText: _price.text, quantityText: _quantity.text);
    if (problem != null) {
      setState(() => _error = problem);
      return;
    }
    final quantity = TicketLogic.parseQuantity(_quantity.text)!;
    if (quantity < _sold) {
      setState(() => _error = '$_sold tickets are already sold, so the quantity cannot be lower than $_sold.');
      return;
    }
    final price = TicketLogic.parsePrice(_price.text)!;
    Map<String, dynamic> result;
    if (widget.ticket != null) {
      result = Map<String, dynamic>.from(widget.ticket!)..['price'] = price;
      if (!_seatWise) {
        result['name'] = _name.text.trim();
        result['quantity'] = quantity.toString();
        if (_sold == 0) result['priceType'] = _name.text.trim();
      }
    } else {
      result = TicketLogic.general(name: _name.text, price: price, quantity: quantity);
    }
    if (widget.otherKeys.contains(TicketLogic.keyOf(result))) {
      setState(() => _error = 'Another ticket is already called "${_name.text.trim()}".');
      return;
    }
    Navigator.pop(context, result);
  }

  @override
  Widget build(BuildContext context) {
    final lockName = _sold > 0 || _seatWise;
    return AlertDialog(
      title: Text(widget.ticket == null ? 'Add ticket' : 'Edit ticket'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: _name,
              enabled: !lockName,
              maxLength: 60,
              textCapitalization: TextCapitalization.words,
              decoration: InputDecoration(
                labelText: 'Ticket name',
                hintText: 'General, VIP, Early bird…',
                counterText: '',
                helperText: _sold > 0 ? 'Cannot be renamed: $_sold already sold' : null,
              ),
            ),
            TextField(
              controller: _price,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[\d.]'))],
              decoration: const InputDecoration(labelText: 'Price (₹)', hintText: '500 or 499.50', helperText: '0 for a free ticket'),
            ),
            TextField(
              controller: _quantity,
              enabled: !_seatWise,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: InputDecoration(
                labelText: 'Quantity',
                helperText: _seatWise ? 'Set by the seat range' : null,
              ),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Text(_error!, style: TextStyle(color: Colors.red.shade700)),
              ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        TextButton(onPressed: _done, child: Text(widget.ticket == null ? 'Add' : 'Save')),
      ],
    );
  }
}
