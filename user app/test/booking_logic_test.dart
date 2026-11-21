import 'package:flutter_test/flutter_test.dart';
import 'package:mookalaa_app/models/booking.dart';
import 'package:mookalaa_app/models/event.dart';
import 'package:mookalaa_app/utils/booking_logic.dart';
import 'package:mookalaa_app/utils/ticket_pdf.dart';

TicketType seated({String name = 'VIP - Block A', String block = 'A', int from = 1, int to = 20, dynamic price = '1500', int sold = 0}) =>
    TicketType.fromJson({'name': name, 'blockName': block, 'startSeat': from, 'endSeat': to, 'quantity': '${to - from + 1}', 'price': price, 'sold': '$sold'});

TicketType general({String name = 'General', dynamic price = '0', String quantity = '50', String sold = '0'}) =>
    TicketType.fromJson({'name': name, 'price': price, 'quantity': quantity, 'sold': sold, 'isSeatWise': false});

Booking booking({String status = 'confirmed', String date = '2026-12-01', String time = '6:30 PM', String payment = 'paid'}) => Booking.fromJson({
      '_id': '6b01784678c24a2daef0abcd',
      'eventId': '6b01784678c24a2daef0befc',
      'eventTitle': 'Recital',
      'eventDate': date,
      'eventTime': time,
      'venue': 'Seed Hall',
      'tickets': [
        {'category': 'General', 'block': '', 'fromSeat': null, 'toSeat': null, 'quantity': 2, 'price': 0, 'totalPrice': 0}
      ],
      'totalSeats': 2,
      'totalPrice': 0,
      'status': status,
      'paymentStatus': payment,
      'isFree': true,
      'bookingDate': '2026-11-21T10:00:00.000Z',
    });

void main() {
  group('ticket parsing', () {
    test('seated ticket reads price text, seats and capacity', () {
      final t = seated(price: '₹1,500.00', sold: 3);
      expect(t.isSeated, isTrue);
      expect(t.price, 1500);
      expect(t.firstSeat, 1);
      expect(t.lastSeat, 20);
      expect(t.remaining, 17);
      expect(t.holdKey, 'A');
    });

    test('general ticket is not seated and free is labelled', () {
      final t = general();
      expect(t.isSeated, isFalse);
      expect(t.priceLabel, 'Free');
      expect(t.remaining, 50);
    });
  });

  group('validateSelection', () {
    final tickets = [seated(), seated(name: 'Normal - Block A', from: 21, to: 100, price: '500.00'), general()];

    test('a default row with no category does not allow Proceed', () {
      expect(validateSelection(tickets, [TicketLineDraft()]), 'Choose a ticket category');
    });

    test('no rows is refused', () {
      expect(validateSelection(tickets, []), isNotNull);
    });

    test('an event without tickets is refused', () {
      expect(validateSelection(const [], [TicketLineDraft(ticketIndex: 0)]), 'This event has no tickets on sale');
    });

    test('seated row needs both seat numbers', () {
      expect(validateSelection(tickets, [TicketLineDraft(ticketIndex: 0, fromSeat: 3)]), contains('first and last seat'));
    });

    test('inverted seat range is refused', () {
      expect(validateSelection(tickets, [TicketLineDraft(ticketIndex: 0, fromSeat: 5, toSeat: 3)]), contains('must not be after'));
    });

    test('seats outside the block are refused', () {
      expect(validateSelection(tickets, [TicketLineDraft(ticketIndex: 0, fromSeat: 18, toSeat: 22)]), contains('between 1 and 20'));
      expect(validateSelection(tickets, [TicketLineDraft(ticketIndex: 1, fromSeat: 20, toSeat: 22)]), contains('between 21 and 100'));
    });

    test('a valid seat range passes', () {
      expect(validateSelection(tickets, [TicketLineDraft(ticketIndex: 0, fromSeat: 3, toSeat: 5)]), isNull);
    });

    test('the same seats twice are refused, different categories in one block are fine', () {
      expect(
        validateSelection(tickets, [
          TicketLineDraft(ticketIndex: 0, fromSeat: 3, toSeat: 5),
          TicketLineDraft(ticketIndex: 0, fromSeat: 5, toSeat: 6),
        ]),
        'The same seats were chosen twice',
      );
      expect(
        validateSelection(tickets, [
          TicketLineDraft(ticketIndex: 0, fromSeat: 3, toSeat: 5),
          TicketLineDraft(ticketIndex: 1, fromSeat: 21, toSeat: 22),
        ]),
        isNull,
      );
    });

    test('general quantity cannot exceed what is left, also across rows', () {
      final few = [general(quantity: '10', sold: '7')];
      expect(validateSelection(few, [TicketLineDraft(ticketIndex: 0, quantity: 4)]), contains('Only 3 tickets are left'));
      expect(
        validateSelection(few, [TicketLineDraft(ticketIndex: 0, quantity: 2), TicketLineDraft(ticketIndex: 0, quantity: 2)]),
        contains('Only 3 tickets are left'),
      );
      expect(validateSelection(few, [TicketLineDraft(ticketIndex: 0, quantity: 3)]), isNull);
    });

    test('a sold out category is refused', () {
      expect(validateSelection([general(quantity: '5', sold: '5')], [TicketLineDraft(ticketIndex: 0)]), contains('sold out'));
    });

    test('more than 100 seats in one booking is refused', () {
      final big = [seated(from: 1, to: 500)];
      expect(validateSelection(big, [TicketLineDraft(ticketIndex: 0, fromSeat: 1, toSeat: 101)]), contains('at most 100 seats'));
    });
  });

  group('price estimate and order lines', () {
    final tickets = [seated(), seated(name: 'Normal - Block A', from: 21, to: 100, price: '500.00'), general()];
    final lines = [
      TicketLineDraft(ticketIndex: 0, fromSeat: 3, toSeat: 5),
      TicketLineDraft(ticketIndex: 1, fromSeat: 21, toSeat: 22),
      TicketLineDraft(ticketIndex: 2, quantity: 4),
    ];

    test('estimate multiplies each price by its seat count', () {
      expect(totalSeats(tickets, lines), 9);
      expect(estimateTotal(tickets, lines), 3 * 1500 + 2 * 500 + 0);
    });

    test('incomplete rows count as zero', () {
      expect(estimateTotal(tickets, [TicketLineDraft(ticketIndex: 0, fromSeat: 3)]), 0);
      expect(estimateTotal(tickets, [TicketLineDraft()]), 0);
    });

    test('order lines carry no price, total, status or id', () {
      final body = orderLines(tickets, lines);
      expect(body[0], {'category': 'VIP - Block A', 'block': 'A', 'fromSeat': 3, 'toSeat': 5, 'quantity': 3});
      expect(body[2], {'category': 'General', 'block': '', 'quantity': 4});
      for (final line in body) {
        expect(line.keys, isNot(contains('price')));
        expect(line.keys, isNot(contains('totalPrice')));
        expect(line.keys, isNot(contains('status')));
        expect(line.keys, isNot(contains('_id')));
      }
    });
  });

  group('booking grouping', () {
    // 25 Nov 2026 12:00 IST
    final now = DateTime.utc(2026, 11, 25, 6, 30);

    test('a confirmed booking for a future event is upcoming', () {
      expect(bookingGroupOf(booking(), now), BookingGroup.upcoming);
    });

    test('a confirmed booking whose event day is over is past, whatever the status says', () {
      expect(bookingGroupOf(booking(date: '2026-11-24'), now), BookingGroup.past);
    });

    test('an event later today is still upcoming until the day ends (India time)', () {
      expect(bookingGroupOf(booking(date: '2026-11-25', time: '9:00 AM'), now), BookingGroup.upcoming);
      // 26 Nov 00:10 IST
      expect(bookingGroupOf(booking(date: '2026-11-25', time: '9:00 AM'), DateTime.utc(2026, 11, 25, 18, 40)), BookingGroup.past);
    });

    test('cancelled bookings get their own group instead of vanishing', () {
      expect(bookingGroupOf(booking(status: 'cancelled'), now), BookingGroup.cancelled);
      expect(bookingGroupOf(booking(status: 'cancelled', date: '2026-01-01'), now), BookingGroup.cancelled);
    });

    test('attended is past; an unreadable date stays upcoming', () {
      expect(bookingGroupOf(booking(status: 'attended'), now), BookingGroup.past);
      expect(bookingGroupOf(booking(date: 'soon'), now), BookingGroup.upcoming);
    });

    test('groupBookings sorts upcoming soonest first', () {
      final groups = groupBookings([booking(date: '2026-12-20'), booking(date: '2026-12-01'), booking(status: 'cancelled')], now);
      expect(groups[BookingGroup.upcoming]!.map((b) => b.eventDate), ['2026-12-01', '2026-12-20']);
      expect(groups[BookingGroup.cancelled]!.length, 1);
      expect(groups[BookingGroup.past], isEmpty);
    });
  });

  group('booking model', () {
    test('QR carries only the server booking id', () {
      expect(booking().qrPayload, '{"bookingId":"6b01784678c24a2daef0abcd"}');
    });

    test('reference is the tail of the server id', () {
      expect(booking().reference, 'AEF0ABCD');
    });

    test('a cancelled booking shows no QR', () {
      expect(booking(status: 'cancelled').showsQr, isFalse);
      expect(booking().showsQr, isTrue);
    });

    test('status and payment labels are honest', () {
      expect(bookingStatusLabel('cancelled'), 'Cancelled');
      expect(bookingStatusLabel('attended'), 'Attended');
      expect(paymentStatusLabel('refund_requested'), 'Refund requested');
      expect(paymentStatusLabel('refunded'), 'Refunded');
      expect(paymentStatusLabel('unverified'), 'Payment not verified');
      expect(paymentStatusLabel('paid', isFree: true), 'Free ticket');
      expect(paymentStatusLabel('paid'), 'Paid');
    });

    test('refund rule sentence', () {
      expect(refundRuleSentence({'minHoursBefore': 72, 'maxHoursBefore': null, 'refundPercent': 80, 'deductionFlat': 0}),
          'More than 72 hours before the event: 80% refund');
      expect(refundRuleSentence({'minHoursBefore': 24, 'maxHoursBefore': 72, 'refundPercent': 50, 'deductionFlat': 20}),
          '24 to 72 hours before the event: 50% refund less ₹20');
    });
  });

  group('ticket PDF', () {
    test('builds a real PDF from the booking', () async {
      final bytes = await buildTicketPdf(booking());
      expect(String.fromCharCodes(bytes.take(4)), '%PDF');
      expect(bytes.length, greaterThan(1000));
    });

    test('text the built-in font cannot draw is made safe', () {
      expect(pdfSafe('General • 2 tickets • Seats A3 – A5'), 'General | 2 tickets | Seats A3 - A5');
      expect(pdfSafe('₹1,500'), 'Rs. 1,500');
      expect(pdfSafe('ગરબા Night'), '???? Night');
    });
  });
}
