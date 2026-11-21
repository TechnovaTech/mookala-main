import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../logic/ticket_logic.dart';
import '../widgets/common.dart';

/// Seat-block pricing for a venue with a seating plan.
///
/// Each block (seats 1..totalSeats) is split into price categories with a seat
/// range each. Ranges are checked before the screen returns: inside the block,
/// first seat not after the last, and no overlap. Returns the seat-wise
/// tickets (possibly empty) through `Navigator.pop`.
class CreateTicketScreen extends StatefulWidget {
  const CreateTicketScreen({
    super.key,
    required this.venueName,
    required this.blocks,
    this.seatingLayoutImage,
    this.existing = const [],
  });

  final String venueName;

  /// `[{ name, type?, totalSeats }]` from the venue's `seatConfig.blocks`.
  final List<Map<String, dynamic>> blocks;
  final dynamic seatingLayoutImage;

  /// Seat-wise tickets the event already has.
  final List<Map<String, dynamic>> existing;

  @override
  State<CreateTicketScreen> createState() => _CreateTicketScreenState();
}

class _Row {
  _Row({String category = '', String start = '', String end = '', String price = '', this.sold = 0})
      : category = TextEditingController(text: category),
        start = TextEditingController(text: start),
        end = TextEditingController(text: end),
        price = TextEditingController(text: price);

  final TextEditingController category;
  final TextEditingController start;
  final TextEditingController end;
  final TextEditingController price;
  final int sold;

  void dispose() {
    category.dispose();
    start.dispose();
    end.dispose();
    price.dispose();
  }
}

class _CreateTicketScreenState extends State<CreateTicketScreen> {
  final Map<String, List<_Row>> _rows = {};
  String? _error;

  @override
  void initState() {
    super.initState();
    for (final block in widget.blocks) {
      final name = block['name'].toString();
      _rows[name] = [
        for (final t in widget.existing)
          if ((t['blockName'] ?? '').toString() == name)
            _Row(
              category: (t['priceType'] ?? '').toString(),
              start: TicketLogic.countOf(t['startSeat']).toString(),
              end: TicketLogic.countOf(t['endSeat']).toString(),
              price: TicketLogic.formatAmount(TicketLogic.priceOf(t['price'])),
              sold: TicketLogic.countOf(t['sold']),
            ),
      ];
    }
  }

  @override
  void dispose() {
    for (final rows in _rows.values) {
      for (final row in rows) {
        row.dispose();
      }
    }
    super.dispose();
  }

  int _seatsOf(Map<String, dynamic> block) => TicketLogic.countOf(block['totalSeats']);

  void _addRow(Map<String, dynamic> block) {
    final name = block['name'].toString();
    final rows = _rows[name]!;
    var next = 1;
    for (final row in rows) {
      final end = int.tryParse(row.end.text) ?? 0;
      if (end >= next) next = end + 1;
    }
    final total = _seatsOf(block);
    setState(() {
      rows.add(_Row(
        category: rows.isEmpty ? (block['type'] ?? '').toString() : '',
        start: next <= total ? next.toString() : '',
        end: next <= total ? total.toString() : '',
      ));
      _error = null;
    });
  }

  void _removeRow(String block, int index) {
    setState(() {
      _rows[block]!.removeAt(index).dispose();
      _error = null;
    });
  }

  void _done() {
    final tickets = <Map<String, dynamic>>[];
    for (final block in widget.blocks) {
      final name = block['name'].toString();
      final rows = _rows[name]!;
      if (rows.isEmpty) continue; // block not on sale
      final ranges = [
        for (final row in rows)
          SeatRange(
            category: row.category.text,
            start: int.tryParse(row.start.text.trim()),
            end: int.tryParse(row.end.text.trim()),
            price: TicketLogic.parsePrice(row.price.text),
          ),
      ];
      final problem = TicketLogic.validateSeatRanges(name, _seatsOf(block), ranges);
      if (problem != null) {
        setState(() => _error = problem);
        return;
      }
      for (final r in ranges) {
        tickets.add(TicketLogic.seatWise(
          category: r.category,
          blockName: name,
          startSeat: r.start!,
          endSeat: r.end!,
          price: r.price!,
        ));
      }
    }
    Navigator.pop(context, tickets);
  }

  void _showLayout() {
    showDialog<void>(
      context: context,
      builder: (dialogContext) => Dialog(
        insetPadding: const EdgeInsets.all(12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Flexible(
              child: InteractiveViewer(
                maxScale: 5,
                child: StoredImage(widget.seatingLayoutImage, fit: BoxFit.contain, placeholderIcon: Icons.broken_image_outlined),
              ),
            ),
            TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Close')),
          ],
        ),
      ),
    );
  }

  Widget _numberField(TextEditingController controller, String label, {bool decimal = false}) {
    return TextField(
      controller: controller,
      keyboardType: decimal ? const TextInputType.numberWithOptions(decimal: true) : TextInputType.number,
      inputFormatters: [
        decimal ? FilteringTextInputFormatter.allow(RegExp(r'[\d.]')) : FilteringTextInputFormatter.digitsOnly,
      ],
      decoration: InputDecoration(labelText: label, isDense: true, border: const OutlineInputBorder()),
      onChanged: (_) {
        if (_error != null) setState(() => _error = null);
      },
    );
  }

  Widget _blockCard(Map<String, dynamic> block) {
    final name = block['name'].toString();
    final rows = _rows[name]!;
    final total = _seatsOf(block);
    final type = (block['type'] ?? '').toString();
    return Card(
      margin: const EdgeInsets.only(bottom: 14),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Block $name${type.isEmpty ? '' : ' · $type'}',
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: AppColors.navy)),
            Text('Seats 1 to $total', style: const TextStyle(color: Colors.black54)),
            if (rows.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text('Not on sale. Add a price category to sell seats in this block.',
                    style: TextStyle(color: Colors.black54)),
              ),
            for (var i = 0; i < rows.length; i++) ...[
              const Divider(height: 22),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: rows[i].category,
                      enabled: rows[i].sold == 0,
                      maxLength: 40,
                      decoration: InputDecoration(
                        labelText: 'Category (VIP, Premium, Normal…)',
                        isDense: true,
                        counterText: '',
                        border: const OutlineInputBorder(),
                        helperText: rows[i].sold > 0 ? '${rows[i].sold} sold: cannot be renamed' : null,
                      ),
                      onChanged: (_) {
                        if (_error != null) setState(() => _error = null);
                      },
                    ),
                  ),
                  IconButton(
                    tooltip: 'Remove',
                    icon: const Icon(Icons.delete_outline, color: Colors.red),
                    onPressed: () => _removeRow(name, i),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(child: _numberField(rows[i].start, 'First seat')),
                  const SizedBox(width: 8),
                  Expanded(child: _numberField(rows[i].end, 'Last seat')),
                  const SizedBox(width: 8),
                  Expanded(child: _numberField(rows[i].price, 'Price ₹', decimal: true)),
                ],
              ),
            ],
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: () => _addRow(block),
                icon: const Icon(Icons.add, color: AppColors.navy),
                label: const Text('Add price category', style: TextStyle(color: AppColors.navy)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final hasLayout = widget.seatingLayoutImage is String && (widget.seatingLayoutImage as String).isNotEmpty;
    return Scaffold(
      appBar: appBar('Seat-block pricing'),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Text(
                    'Venue: ${widget.venueName}. Give each block one or more price categories with a seat range. '
                    'Ranges in a block must not overlap. Use price 0 for free seats.',
                    style: const TextStyle(color: Colors.black54, height: 1.4),
                  ),
                  if (hasLayout)
                    Align(
                      alignment: Alignment.centerLeft,
                      child: TextButton.icon(
                        onPressed: _showLayout,
                        icon: const Icon(Icons.map_outlined, color: AppColors.navy),
                        label: const Text('View seating layout', style: TextStyle(color: AppColors.navy)),
                      ),
                    ),
                  const SizedBox(height: 8),
                  for (final block in widget.blocks) _blockCard(block),
                ],
              ),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                child: InfoBanner(_error!, color: Colors.red),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: PrimaryButton(label: 'Use these seat prices', onPressed: _done),
            ),
          ],
        ),
      ),
    );
  }
}
