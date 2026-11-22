import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:razorpay_flutter/razorpay_flutter.dart';

import '../config/app_config.dart';
import '../models/booking.dart';
import '../models/event.dart';
import '../services/api_client.dart';
import '../services/api_service.dart';
import '../services/session.dart';
import '../utils/booking_logic.dart';
import '../utils/formats.dart';
import '../widgets/app_image.dart';
import '../widgets/app_theme.dart';
import 'ticket_screen.dart';

/// Text colour for coupon savings (dark green, readable on white).
const _savingColor = Color(0xFF2E7D32);

/// Where the booking is in the order -> Checkout -> verify sequence.
enum _Stage {
  /// Choosing tickets.
  selecting,

  /// `POST /payment/order` is running.
  creatingOrder,

  /// The server holds the seats; waiting for the customer to pay.
  awaitingPayment,

  /// Razorpay reported success; `POST /payment/verify` is running (or being retried).
  verifying,

  /// The server answered 202: the bank approved, the capture is not in yet.
  processing,

  /// The payment did not become a ticket. [_failure] says why.
  failed,
}

class _Line {
  _Line(this.draft);
  final TicketLineDraft draft;
  final Key key = UniqueKey();
  final TextEditingController from = TextEditingController();
  final TextEditingController to = TextEditingController();

  void dispose() {
    from.dispose();
    to.dispose();
  }
}

/// Booking, exactly as the backend contract describes it:
///   1. `POST /payment/order` with the chosen tickets only (the server prices them).
///   2. Free event  -> already confirmed, show the ticket.
///      Paid event  -> show the server's amount and the hold countdown, then
///                     open Razorpay Checkout with the server's order.
///   3. `POST /payment/verify` after Checkout succeeds; poll while it is processing.
/// Nothing is ever recorded as paid or confirmed by this app.
class BookingScreen extends StatefulWidget {
  const BookingScreen({super.key, required this.event});

  final EventModel event;

  @override
  State<BookingScreen> createState() => _BookingScreenState();
}

class _BookingScreenState extends State<BookingScreen> {
  late EventModel _event = widget.event;
  final List<_Line> _lines = [];

  PaymentConfig? _config;
  String? _configError;
  String _layoutImage = '';

  _Stage _stage = _Stage.selecting;
  String? _notice; // shown above the button; never a fake success
  String? _failure;

  OrderResult? _order;
  Timer? _holdTimer;
  Duration _holdLeft = Duration.zero;

  Razorpay? _razorpay;
  String? _paymentId;
  String? _signature;
  Timer? _verifyTimer;
  int _verifyAttempts = 0;
  bool _verifyPaused = false;

  /// The coupon box. A coupon is checked against one total; a changed
  /// selection needs a new check. The server checks it again with the order.
  final TextEditingController _couponInput = TextEditingController();
  CouponCheck? _coupon;
  double _couponForAmount = 0;
  String? _couponError;
  bool _couponBusy = false;

  List<TicketType> get _tickets => _event.tickets;

  @override
  void initState() {
    super.initState();
    _layoutImage = _event.seatingLayoutImage;
    _addLine();
    _loadConfig();
    _refreshEvent();
    _loadLayout();
  }

  /* ------------------------------ Loading ------------------------------ */

  Future<void> _loadConfig() async {
    setState(() => _configError = null);
    try {
      final config = await ApiService.getPaymentConfig();
      if (mounted) setState(() => _config = config);
    } on ApiException catch (e) {
      if (mounted) setState(() => _configError = e.message);
    }
  }

  /// Fresh ticket counts. On failure the tickets passed in stay in use and the
  /// server still checks everything when the order is placed.
  Future<void> _refreshEvent() async {
    try {
      final fresh = await ApiService.getEvent(_event.id);
      if (!mounted || fresh.tickets.isEmpty) return;
      setState(() {
        _event = fresh;
        for (final line in _lines) {
          final i = line.draft.ticketIndex;
          if (i != null && i >= fresh.tickets.length) line.draft.ticketIndex = null;
        }
      });
    } on ApiException {
      // Kept quiet on purpose: see above.
    }
  }

  Future<void> _loadLayout() async {
    if (_layoutImage.isNotEmpty || _event.venueName.isEmpty) return;
    try {
      final venue = await ApiService.getVenueByName(_event.venueName);
      final image = venue?['seatingLayoutImage'];
      if (mounted && image is String && image.isNotEmpty) setState(() => _layoutImage = image);
    } on ApiException {
      // The seating picture is optional.
    }
  }

  /* --------------------------- Ticket selection --------------------------- */

  void _addLine() {
    final draft = TicketLineDraft(ticketIndex: _tickets.length == 1 ? 0 : null);
    setState(() => _lines.add(_Line(draft)));
  }

  void _removeLine(_Line line) {
    setState(() => _lines.remove(line));
    line.dispose();
  }

  List<TicketLineDraft> get _drafts => [for (final line in _lines) line.draft];

  String? get _problem => validateSelection(_tickets, _drafts);

  /// The applied coupon, while it still matches the selection.
  CouponCheck? get _activeCoupon {
    final coupon = _coupon;
    if (coupon == null || !coupon.valid) return null;
    return coupon.code.isNotEmpty && _couponForAmount == estimateTotal(_tickets, _drafts) ? coupon : null;
  }

  Future<void> _applyCoupon() async {
    final code = _couponInput.text.trim().toUpperCase();
    final amount = estimateTotal(_tickets, _drafts).toDouble();
    if (code.isEmpty) {
      setState(() => _couponError = 'Enter a coupon code.');
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() {
      _couponBusy = true;
      _couponError = null;
    });
    try {
      final check = await ApiService.validateCoupon(code: code, amount: amount);
      if (!mounted) return;
      setState(() {
        _couponBusy = false;
        if (check.valid) {
          _coupon = check;
          _couponForAmount = amount;
        } else {
          _coupon = null;
          _couponError = check.reason ?? 'This coupon cannot be used.';
        }
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _couponBusy = false;
        _couponError = e.message;
      });
    }
  }

  void _removeCoupon() => setState(() {
        _coupon = null;
        _couponError = null;
      });

  /* ------------------------------- Order ------------------------------- */

  Future<void> _proceed() async {
    if (_problem != null) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _stage = _Stage.creatingOrder;
      _notice = null;
    });

    try {
      final order = await ApiService.createOrder(
        eventId: _event.id,
        tickets: orderLines(_tickets, _drafts),
        couponCode: _activeCoupon?.code,
      );
      if (!mounted) return;

      if (order.isFree) {
        final booking = order.booking;
        if (booking == null) {
          throw ApiException(message: 'The booking was made but could not be shown. Please open My Bookings.');
        }
        _showTicket(booking);
        return;
      }

      if (order.orderId.isEmpty || order.keyId.isEmpty || order.amountPaise <= 0) {
        throw ApiException(message: 'The payment could not be started. Please try again in a moment.');
      }
      setState(() {
        _order = order;
        _stage = _Stage.awaitingPayment;
      });
      _startHoldCountdown(order);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _stage = _Stage.selecting;
        _notice = _orderErrorText(e);
        if (e.code == 'COUPON_NOT_VALID') {
          _coupon = null;
          _couponError = e.message;
        }
      });
      if (e.code == 'SEATS_TAKEN' || e.code == 'SOLD_OUT') _refreshEvent();
    }
  }

  String _orderErrorText(ApiException e) {
    switch (e.code) {
      case 'PAYMENTS_UNAVAILABLE':
        return 'Paid booking is unavailable right now. Please try again later.';
      case 'SEATS_TAKEN':
      case 'SOLD_OUT':
        return '${e.message} Please choose again.';
      case 'GATEWAY_ERROR':
        return 'The payment could not be started. Please try again in a moment.';
      case 'COUPON_NOT_VALID':
        return '${e.message}. The coupon was removed: you can book without it or try another code.';
      default:
        return e.message;
    }
  }

  void _startHoldCountdown(OrderResult order) {
    _holdTimer?.cancel();
    final expiry = order.expiresAt ?? DateTime.now().add(Duration(minutes: _config?.holdMinutes ?? 15));
    void tick() {
      final left = expiry.difference(DateTime.now());
      if (!mounted) return;
      if (left <= Duration.zero && _stage == _Stage.awaitingPayment) {
        _holdTimer?.cancel();
        setState(() {
          _order = null;
          _stage = _Stage.selecting;
          _notice = 'The hold on your seats has ended. Please choose your tickets again.';
        });
        _refreshEvent();
        return;
      }
      setState(() => _holdLeft = left);
    }

    tick();
    _holdTimer = Timer.periodic(const Duration(seconds: 1), (_) => tick());
  }

  void _changeTickets() {
    // The hold simply runs out on the server (or is replaced by the next order).
    _holdTimer?.cancel();
    setState(() {
      _order = null;
      _stage = _Stage.selecting;
      _notice = null;
    });
  }

  /* ------------------------------ Checkout ------------------------------ */

  void _pay() {
    final order = _order;
    if (order == null) return;
    setState(() => _notice = null);

    final razorpay = _razorpay ??= Razorpay()
      ..on(Razorpay.EVENT_PAYMENT_SUCCESS, _onPaymentSuccess)
      ..on(Razorpay.EVENT_PAYMENT_ERROR, _onPaymentError)
      ..on(Razorpay.EVENT_EXTERNAL_WALLET, _onExternalWallet);

    final secondsLeft = _holdLeft.inSeconds;
    try {
      razorpay.open({
        'key': order.keyId,
        'order_id': order.orderId,
        'amount': order.amountPaise,
        'currency': order.currency,
        'name': AppConfig.appName,
        'description': _event.title,
        if (secondsLeft > 30) 'timeout': secondsLeft,
        'prefill': {'contact': Session.phone ?? ''},
        'retry': {'enabled': true, 'max_count': 2},
      });
    } catch (_) {
      setState(() => _notice = 'The payment screen could not be opened on this device.');
    }
  }

  void _onPaymentSuccess(PaymentSuccessResponse response) {
    final order = _order;
    final paymentId = response.paymentId;
    final signature = response.signature;
    if (order == null || paymentId == null || signature == null || !mounted) return;
    _holdTimer?.cancel();
    _paymentId = paymentId;
    _signature = signature;
    _verifyAttempts = 0;
    _verify();
  }

  void _onPaymentError(PaymentFailureResponse response) {
    if (!mounted) return;
    // Closing Checkout is not an error: the hold stays until it runs out.
    final cancelled = response.code == Razorpay.PAYMENT_CANCELLED;
    setState(() {
      _notice = cancelled
          ? 'Payment was not completed. Your seats stay held until the timer ends.'
          : 'The payment did not go through${(response.message ?? '').isNotEmpty ? ': ${response.message}' : '.'} You can try again while the seats are held.';
    });
  }

  void _onExternalWallet(ExternalWalletResponse response) {
    if (!mounted) return;
    setState(() => _notice = 'Finish the payment in ${response.walletName ?? 'your wallet app'}. Your ticket will appear under My Bookings once it is confirmed.');
  }

  /* ------------------------------- Verify ------------------------------- */

  Future<void> _verify() async {
    final order = _order;
    final paymentId = _paymentId;
    final signature = _signature;
    if (order == null || paymentId == null || signature == null) return;

    _verifyTimer?.cancel();
    if (_stage != _Stage.processing) setState(() => _stage = _Stage.verifying);
    setState(() => _verifyPaused = false);
    _verifyAttempts++;

    try {
      final result = await ApiService.verifyPayment(
        bookingId: order.bookingId,
        orderId: order.orderId,
        paymentId: paymentId,
        signature: signature,
      );
      if (!mounted) return;
      if (result.confirmed && result.booking != null) {
        _showTicket(result.booking!);
        return;
      }
      // 202 PAYMENT_PROCESSING: ask again in a few seconds (the call is idempotent).
      setState(() {
        _stage = _Stage.processing;
        _notice = result.message.isNotEmpty ? result.message : 'Your payment is being processed.';
      });
      _scheduleVerify();
    } on ApiException catch (e) {
      if (!mounted) return;
      final retryable = e.isNetwork || e.statusCode == 502 || e.statusCode == 503 || e.statusCode == 504 || e.statusCode == 500;
      if (retryable) {
        // Never call this a failed payment: the money may have been taken.
        setState(() => _notice = 'We are still confirming your payment. Please keep this screen open.');
        _scheduleVerify();
        return;
      }
      String text;
      switch (e.code) {
        case 'SEATS_LOST_REFUND_REQUESTED':
          text = 'Your payment arrived after the seats were released, so they are no longer available. A full refund has been requested.';
          break;
        case 'BAD_SIGNATURE':
        case 'ORDER_MISMATCH':
          text = 'This payment could not be matched to your booking, so no ticket was issued. If money was taken, please contact support with payment reference $paymentId.';
          break;
        case 'PAYMENT_NOT_CAPTURED':
          text = 'The payment was not successful, so no ticket was issued. If money was taken it will be returned by your bank.';
          break;
        default:
          text = '${e.message} If money was taken, please contact support with payment reference $paymentId.';
      }
      setState(() {
        _stage = _Stage.failed;
        _failure = text;
      });
    }
  }

  void _scheduleVerify() {
    // About four minutes of automatic checks, then the customer decides.
    if (_verifyAttempts >= 60) {
      setState(() => _verifyPaused = true);
      return;
    }
    _verifyTimer?.cancel();
    _verifyTimer = Timer(const Duration(seconds: 4), _verify);
  }

  void _showTicket(Booking booking) {
    // Replace everything above the home screen with the ticket, so "back" goes home.
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => TicketScreen(booking: booking, justBooked: true)),
      (route) => route.isFirst,
    );
  }

  /* -------------------------------- UI -------------------------------- */

  @override
  Widget build(BuildContext context) {
    final busyWithMoney = _stage == _Stage.verifying || (_stage == _Stage.processing && !_verifyPaused);
    return PopScope(
      canPop: !busyWithMoney,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) showMessage(context, 'Please wait while your payment is confirmed.');
      },
      child: Scaffold(
        backgroundColor: Colors.grey.shade50,
        appBar: navyAppBar('Book tickets'),
        body: SafeArea(child: _body()),
      ),
    );
  }

  Widget _body() {
    switch (_stage) {
      case _Stage.selecting:
      case _Stage.creatingOrder:
        return _selectionView();
      case _Stage.awaitingPayment:
        return _paymentView();
      case _Stage.verifying:
      case _Stage.processing:
        return _confirmingView();
      case _Stage.failed:
        return _failedView();
    }
  }

  Widget _eventHeader() => Container(
        color: Colors.white,
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(_event.title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            Text(_event.dateLabel, style: TextStyle(color: Colors.grey.shade700)),
            if (_event.placeLabel.isNotEmpty) Text(_event.placeLabel, style: TextStyle(color: Colors.grey.shade700)),
          ],
        ),
      );

  Widget _noticeBox(String text, {Color? color}) => Container(
        width: double.infinity,
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: (color ?? AppColors.warning).withValues(alpha: 0.12), borderRadius: BorderRadius.circular(8)),
        child: Text(text, style: TextStyle(color: color ?? Colors.brown.shade800)),
      );

  Widget _policyCard() {
    final config = _config;
    if (config == null) {
      if (_configError == null) return const SizedBox.shrink();
      return Card(
        color: Colors.white,
        child: ListTile(
          leading: const Icon(Icons.info_outline),
          title: const Text('The cancellation policy could not be loaded'),
          subtitle: Text(_configError!),
          trailing: IconButton(icon: const Icon(Icons.refresh), onPressed: _loadConfig),
        ),
      );
    }
    return Card(
      color: Colors.white,
      surfaceTintColor: Colors.white,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Cancellation and refunds', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
            const SizedBox(height: 8),
            if (config.refundPolicy.isEmpty)
              Text('No refund rule is published. A cancelled paid ticket may not be refunded.', style: TextStyle(color: Colors.grey.shade700))
            else ...[
              for (final rule in config.refundPolicy)
                Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Text('• ${refundRuleSentence(rule)}', style: TextStyle(color: Colors.grey.shade800)),
                ),
              Text('Any other time: no refund.', style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
            ],
          ],
        ),
      ),
    );
  }

  Widget _lineCard(int index, _Line line) {
    final draft = line.draft;
    final ticket = draft.ticketIndex != null && draft.ticketIndex! < _tickets.length ? _tickets[draft.ticketIndex!] : null;
    final problem = ticket == null ? null : validateLine(_tickets, draft);
    final quantity = lineQuantity(_tickets, draft);

    return Card(
      key: line.key,
      color: Colors.white,
      surfaceTintColor: Colors.white,
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text('Tickets ${index + 1}', style: const TextStyle(fontWeight: FontWeight.bold))),
                if (_lines.length > 1)
                  IconButton(
                    tooltip: 'Remove',
                    onPressed: () => _removeLine(line),
                    icon: const Icon(Icons.delete_outline, color: AppColors.danger),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<int>(
              key: ValueKey('${line.key}-${_tickets.length}-${draft.ticketIndex == null}'),
              initialValue: draft.ticketIndex,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Category', border: OutlineInputBorder()),
              items: [
                for (var i = 0; i < _tickets.length; i++)
                  DropdownMenuItem<int>(
                    value: i,
                    enabled: !_tickets[i].isSoldOut,
                    child: Text(
                      '${_tickets[i].name} • ${_tickets[i].priceLabel}${_tickets[i].isSoldOut ? ' • Sold out' : ''}',
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: _tickets[i].isSoldOut ? Colors.grey : null),
                    ),
                  ),
              ],
              onChanged: (value) => setState(() {
                draft.ticketIndex = value;
                draft.fromSeat = null;
                draft.toSeat = null;
                draft.quantity = 1;
                line.from.clear();
                line.to.clear();
              }),
            ),
            if (ticket != null && ticket.isSeated) ...[
              const SizedBox(height: 12),
              Text(
                'Seats ${ticket.blockName}${ticket.firstSeat} to ${ticket.blockName}${ticket.lastSeat}. Enter the first and last seat you want.',
                style: TextStyle(color: Colors.grey.shade700, fontSize: 13),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: line.from,
                      keyboardType: TextInputType.number,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
                      decoration: const InputDecoration(labelText: 'First seat', border: OutlineInputBorder()),
                      onChanged: (value) => setState(() => draft.fromSeat = int.tryParse(value)),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextField(
                      controller: line.to,
                      keyboardType: TextInputType.number,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
                      decoration: const InputDecoration(labelText: 'Last seat', border: OutlineInputBorder()),
                      onChanged: (value) => setState(() => draft.toSeat = int.tryParse(value)),
                    ),
                  ),
                ],
              ),
            ],
            if (ticket != null && !ticket.isSeated) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  const Expanded(child: Text('How many?')),
                  IconButton(
                    onPressed: draft.quantity > 1 ? () => setState(() => draft.quantity--) : null,
                    icon: const Icon(Icons.remove_circle_outline),
                  ),
                  Text('${draft.quantity}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  IconButton(
                    onPressed: draft.quantity < (ticket.remaining ?? maxSeatsPerBooking) && draft.quantity < maxSeatsPerBooking
                        ? () => setState(() => draft.quantity++)
                        : null,
                    icon: const Icon(Icons.add_circle_outline),
                  ),
                ],
              ),
              if (ticket.remaining != null)
                Text('${ticket.remaining} left', style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
            ],
            if (ticket != null && (ticket.isSeated ? (draft.fromSeat != null && draft.toSeat != null) : true)) ...[
              const SizedBox(height: 8),
              if (problem != null)
                Text(problem, style: const TextStyle(color: AppColors.danger, fontSize: 13))
              else
                Text(
                  '$quantity ${quantity == 1 ? 'ticket' : 'tickets'} × ${ticket.priceLabel}',
                  style: const TextStyle(color: AppColors.navy, fontWeight: FontWeight.w600),
                ),
            ],
          ],
        ),
      ),
    );
  }

  void _showLayout() {
    showDialog<void>(
      context: context,
      builder: (dialog) => Dialog(
        insetPadding: const EdgeInsets.all(12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Flexible(child: InteractiveViewer(maxScale: 5, child: AppImage(_layoutImage, fit: BoxFit.contain))),
            TextButton(onPressed: () => Navigator.pop(dialog), child: const Text('Close')),
          ],
        ),
      ),
    );
  }

  Widget _couponBox(double estimate) {
    final coupon = _activeCoupon;
    return Card(
      key: const Key('coupon-box'),
      color: Colors.white,
      surfaceTintColor: Colors.white,
      margin: const EdgeInsets.only(top: 4, bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Have a coupon?', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
            const SizedBox(height: 8),
            if (coupon != null) ...[
              Row(
                children: [
                  const Icon(Icons.local_offer_outlined, color: _savingColor, size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Coupon ${coupon.code} applied${coupon.description.isNotEmpty ? ': ${coupon.description}' : ''}',
                      style: const TextStyle(color: _savingColor, fontWeight: FontWeight.w600),
                    ),
                  ),
                  TextButton(key: const Key('coupon-remove'), onPressed: _removeCoupon, child: const Text('Remove')),
                ],
              ),
              Row(
                children: [
                  const Expanded(child: Text('Discount')),
                  Text('−${formatRupees(coupon.discount)}', key: const Key('coupon-discount'), style: const TextStyle(color: _savingColor)),
                ],
              ),
              const SizedBox(height: 4),
              Row(
                children: [
                  const Expanded(child: Text('New total', style: TextStyle(fontWeight: FontWeight.bold))),
                  Text(
                    coupon.payable == 0 ? 'Free' : formatRupees(coupon.payable),
                    key: const Key('coupon-total'),
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                  ),
                ],
              ),
            ] else
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: TextField(
                      key: const Key('coupon-input'),
                      controller: _couponInput,
                      textCapitalization: TextCapitalization.characters,
                      inputFormatters: [LengthLimitingTextInputFormatter(30)],
                      decoration: const InputDecoration(labelText: 'Coupon code', border: OutlineInputBorder(), isDense: true),
                      onSubmitted: (_) => _applyCoupon(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  OutlinedButton(
                    key: const Key('coupon-apply'),
                    onPressed: _couponBusy ? null : _applyCoupon,
                    child: _couponBusy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Apply'),
                  ),
                ],
              ),
            if (_couponError != null) ...[
              const SizedBox(height: 8),
              Text(_couponError!, key: const Key('coupon-error'), style: const TextStyle(color: AppColors.danger, fontSize: 13)),
            ],
          ],
        ),
      ),
    );
  }

  Widget _selectionView() {
    final creating = _stage == _Stage.creatingOrder;
    final problem = _problem;
    final estimate = estimateTotal(_tickets, _drafts);
    final seats = totalSeats(_tickets, _drafts);
    final paidUnavailable = _config != null && !_config!.enabled && estimate > 0;

    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: EdgeInsets.zero,
            children: [
              _eventHeader(),
              Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (_layoutImage.isNotEmpty)
                      Align(
                        alignment: Alignment.centerLeft,
                        child: TextButton.icon(
                          onPressed: _showLayout,
                          icon: const Icon(Icons.event_seat_outlined),
                          label: const Text('View seating layout'),
                        ),
                      ),
                    if (_tickets.isEmpty)
                      _noticeBox('This event has no tickets on sale.')
                    else ...[
                      for (var i = 0; i < _lines.length; i++) _lineCard(i, _lines[i]),
                      if (_lines.length < maxLinesPerBooking && _tickets.length > 1)
                        Align(
                          alignment: Alignment.centerLeft,
                          child: TextButton.icon(
                            onPressed: creating ? null : _addLine,
                            icon: const Icon(Icons.add),
                            label: const Text('Add another category'),
                          ),
                        ),
                    ],
                    const SizedBox(height: 8),
                    if (estimate > 0 && problem == null && Session.isSignedIn) _couponBox(estimate),
                    _policyCard(),
                  ],
                ),
              ),
            ],
          ),
        ),
        Container(
          color: Colors.white,
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (paidUnavailable) _noticeBox('Paid booking is unavailable right now. Please try again later.'),
              if (_notice != null) _noticeBox(_notice!, color: AppColors.danger),
              if (problem == null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    children: [
                      Expanded(child: Text('$seats ${seats == 1 ? 'ticket' : 'tickets'}', style: TextStyle(color: Colors.grey.shade700))),
                      // Flexible: with a coupon the text is longer and must still fit a small phone at a large font size.
                      Flexible(
                        flex: 3,
                        child: Text(
                          estimate == 0
                              ? 'Free'
                              : _activeCoupon != null
                                  ? 'Estimated ${_activeCoupon!.payable == 0 ? 'free' : formatRupees(_activeCoupon!.payable)} with coupon'
                                  : 'Estimated ${formatRupees(estimate)}',
                          textAlign: TextAlign.end,
                          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                        ),
                      ),
                    ],
                  ),
                )
              else if (_tickets.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(problem, style: TextStyle(color: Colors.grey.shade700)),
                ),
              ElevatedButton(
                onPressed: problem != null || creating ? null : _proceed,
                style: primaryButtonStyle(),
                child: creating
                    ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : Text(
                        estimate == 0 && problem == null
                            ? 'CONFIRM FREE BOOKING'
                            : _activeCoupon?.payable == 0
                                ? 'CONFIRM BOOKING WITH COUPON'
                                : 'PROCEED',
                      ),
              ),
              if (estimate > 0 && problem == null)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    'The exact amount is confirmed on the next step, before you pay.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _paymentView() {
    final order = _order!;
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: EdgeInsets.zero,
            children: [
              _eventHeader(),
              Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Card(
                      color: Colors.white,
                      surfaceTintColor: Colors.white,
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Your seats are held', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                            const SizedBox(height: 6),
                            Row(
                              children: [
                                const Icon(Icons.timer_outlined, color: AppColors.warning),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    'Pay within ${formatCountdown(_holdLeft)}',
                                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppColors.warning),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Text('After that the seats are released for other people.', style: TextStyle(color: Colors.grey.shade700)),
                            const Divider(height: 28),
                            for (final draft in _drafts)
                              if (draft.ticketIndex != null)
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 4),
                                  child: Text(
                                    _tickets[draft.ticketIndex!].isSeated
                                        ? '${_tickets[draft.ticketIndex!].name}: seats ${draft.fromSeat}–${draft.toSeat}'
                                        : '${_tickets[draft.ticketIndex!].name}: ${draft.quantity}',
                                  ),
                                ),
                            const SizedBox(height: 8),
                            if (order.couponCode != null) ...[
                              Row(
                                children: [
                                  const Expanded(child: Text('Tickets')),
                                  Text(formatRupees(order.listPrice)),
                                ],
                              ),
                              Row(
                                children: [
                                  Expanded(child: Text('Coupon ${order.couponCode}', style: const TextStyle(color: _savingColor))),
                                  Text('−${formatRupees(order.discount)}', key: const Key('pay-coupon-discount'), style: const TextStyle(color: _savingColor)),
                                ],
                              ),
                              const SizedBox(height: 4),
                            ],
                            Row(
                              children: [
                                const Expanded(child: Text('Amount to pay', style: TextStyle(fontSize: 16))),
                                Text(formatRupees(order.totalPrice > 0 ? order.totalPrice : order.amountPaise / 100),
                                    style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: AppColors.navy)),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    _policyCard(),
                  ],
                ),
              ),
            ],
          ),
        ),
        Container(
          color: Colors.white,
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_notice != null) _noticeBox(_notice!),
              ElevatedButton(
                onPressed: _pay,
                style: primaryButtonStyle(),
                child: Text('PAY ${formatRupees(order.totalPrice > 0 ? order.totalPrice : order.amountPaise / 100)}'),
              ),
              TextButton(onPressed: _changeTickets, child: const Text('Change tickets')),
            ],
          ),
        ),
      ],
    );
  }

  Widget _confirmingView() {
    final processing = _stage == _Stage.processing;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (!_verifyPaused) const CircularProgressIndicator(color: AppColors.navy) else const Icon(Icons.hourglass_bottom, size: 48, color: AppColors.warning),
            const SizedBox(height: 20),
            Text(
              processing ? 'Payment processing' : 'Confirming your payment',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Text(
              _verifyPaused
                  ? 'Your payment is still being processed by the bank. The ticket will appear under My Bookings as soon as it is confirmed. You do not need to pay again.'
                  : (_notice ?? 'Please keep this screen open. This usually takes a few seconds.'),
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey.shade700),
            ),
            if (_verifyPaused) ...[
              const SizedBox(height: 20),
              ElevatedButton(
                onPressed: () {
                  _verifyAttempts = 0;
                  _verify();
                },
                style: primaryButtonStyle(),
                child: const Text('CHECK AGAIN'),
              ),
              TextButton(onPressed: () => Navigator.of(context).popUntil((route) => route.isFirst), child: const Text('Back to home')),
            ],
          ],
        ),
      ),
    );
  }

  Widget _failedView() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 56, color: AppColors.danger),
            const SizedBox(height: 16),
            const Text('No ticket was issued', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Text(_failure ?? '', textAlign: TextAlign.center, style: TextStyle(color: Colors.grey.shade800)),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: () {
                setState(() {
                  _order = null;
                  _paymentId = null;
                  _signature = null;
                  _failure = null;
                  _notice = null;
                  _stage = _Stage.selecting;
                });
                _refreshEvent();
              },
              style: primaryButtonStyle(),
              child: const Text('CHOOSE TICKETS AGAIN'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    _holdTimer?.cancel();
    _verifyTimer?.cancel();
    _razorpay?.clear();
    _couponInput.dispose();
    for (final line in _lines) {
      line.dispose();
    }
    super.dispose();
  }
}
