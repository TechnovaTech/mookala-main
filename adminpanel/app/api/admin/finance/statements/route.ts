import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { csvResponse, fail, ok } from '@/lib/http';
import { SERVICES } from '@/lib/ledger';
import { GST_TREATMENT_TEXT, getFinanceSettings } from '../settings/store';
import { STATEMENT_TIMEZONE, buildStatement, istStamp, ledgerFilter, parsePeriod, type Figures } from './build';

export const dynamic = 'force-dynamic';

const ENTRY_LIMIT = 20000;

const PAYEE_LABEL: Record<string, string> = {
  organizer: 'Organiser',
  artist: 'Artist',
  instructor: 'Instructor',
  cinema: 'Cinema',
  advertiser: 'Advertiser',
};

const TYPE_LABEL: Record<string, string> = {
  payment: 'Payment',
  commission: 'Commission',
  gst: 'GST',
  gateway_fee: 'Gateway fee',
  refund: 'Refund',
  refund_deduction: 'Refund deduction kept',
  settlement: 'Payout',
  adjustment: 'Adjustment',
};

const FIGURE_COLUMNS: { key: keyof Figures; label: string }[] = [
  { key: 'payments', label: 'Payments' },
  { key: 'gross', label: 'Gross' },
  { key: 'commission', label: 'Commission' },
  { key: 'gstOnCommission', label: 'GST on commission' },
  { key: 'gatewayFees', label: 'Gateway fees' },
  { key: 'refunds', label: 'Refunds' },
  { key: 'refundDeductions', label: 'Refund deductions kept' },
  { key: 'netPayable', label: 'Net payable to payees' },
  { key: 'netRevenue', label: 'Net revenue (gross less refunds)' },
  { key: 'gstOnSales', label: 'GST collected on sales' },
  { key: 'settled', label: 'Paid out in the period' },
];

function cell(value: any): string {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  // Neutralise spreadsheet formula injection, but leave plain negative numbers alone.
  if (/^[=+\-@]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = "'" + text;
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function line(...values: any[]): string {
  return values.map(cell).join(',');
}

function money(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

function figureCells(figures: Figures): string[] {
  return FIGURE_COLUMNS.map((c) => (c.key === 'payments' ? String(figures[c.key]) : money(figures[c.key])));
}

/**
 * GET /api/admin/finance/statements?from=YYYY-MM-DD&to=YYYY-MM-DD[&service=]
 *
 * The commission statement for a period (whole days in India time): one line
 * per service and one per payee, with the same totals worked out a second
 * time from the raw ledger entries.
 *
 * `&format=csv&kind=services|payees|service` downloads it. `kind=service`
 * needs `service` and lists every ledger entry of that service. Every
 * download is written to the activity log.
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'finance:view');
  if (!check.ok) return check.response;

  const params = request.nextUrl.searchParams;
  const period = parsePeriod((params.get('from') || '').trim() || null, (params.get('to') || '').trim() || null);
  if (typeof period === 'string') return fail(period);

  const service = (params.get('service') || '').trim();
  if (service && !SERVICES.some((s) => s.value === service)) return fail('Unknown service');

  const format = params.get('format') || '';
  const kind = params.get('kind') || 'services';
  if (format && format !== 'csv') return fail('Unknown format');
  if (format === 'csv' && !['services', 'payees', 'service'].includes(kind)) return fail('Unknown statement');
  if (format === 'csv' && kind === 'service' && !service) return fail('Choose the service for a service statement');

  // Transaction-level view of one figure: the ledger entries behind it.
  if (params.get('view') === 'entries') {
    const type = (params.get('type') || '').trim();
    if (type && !Object.keys(TYPE_LABEL).includes(type)) return fail('Unknown entry type');
    const payeeId = (params.get('payeeId') || '').trim().slice(0, 64);
    const payeeType = (params.get('payeeType') || '').trim().slice(0, 20);
    const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
    const limit = 50;
    try {
      const { db } = await connectToDatabase();
      const filter = ledgerFilter(period, service || null);
      if (type) filter.type = type;
      if (payeeId) {
        filter.payeeId = payeeId;
        if (payeeType) filter.payeeType = payeeType;
      }
      const collection = db.collection('transactions');
      const [items, total, sum] = await Promise.all([
        collection.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
        collection.countDocuments(filter),
        collection.aggregate([{ $match: filter }, { $group: { _id: null, paise: { $sum: { $round: [{ $multiply: ['$amount', 100] }, 0] } } } }]).toArray(),
      ]);
      return ok({
        items: items.map((e) => ({
          _id: String(e._id),
          reference: e.reference,
          type: e.type,
          service: e.service,
          amount: e.amount,
          payeeType: e.payeeType || null,
          payeeId: e.payeeId || null,
          payeeName: e.payeeName || null,
          bookingId: e.bookingId || null,
          parentReference: e.parentReference || null,
          description: e.description || '',
          ratePercent: e.ruleSnapshot?.ratePercent ?? null,
          createdAt: e.createdAt,
        })),
        total,
        sum: (Number(sum[0]?.paise) || 0) / 100,
        page,
        limit,
      });
    } catch (error) {
      console.error('Statement entries failed:', error);
      return fail('Failed to load the ledger entries', 500);
    }
  }

  try {
    const { db } = await connectToDatabase();
    const [statement, settings] = await Promise.all([buildStatement(db, period, service || null), getFinanceSettings(db)]);
    const generatedAt = new Date();

    if (format !== 'csv') {
      return ok({
        period: { from: period.fromDay, to: period.toDay, label: period.label, timezone: STATEMENT_TIMEZONE },
        service: service || null,
        generatedAt,
        gstNumber: settings.gstNumber,
        gstLegalName: settings.gstLegalName,
        gstTreatmentText: GST_TREATMENT_TEXT,
        ...statement,
      });
    }

    const serviceLabel = SERVICES.find((s) => s.value === service)?.label || '';
    const title =
      kind === 'payees'
        ? 'Commission statement by payee'
        : kind === 'service'
          ? `Commission statement: ${serviceLabel}`
          : 'Commission statement by service';

    const lines: string[] = [
      line('Statement', title + (service && kind !== 'service' ? ` (${serviceLabel} only)` : '')),
      line('Period', period.label),
      line('Time zone', STATEMENT_TIMEZONE),
      line('Generated at', istStamp(generatedAt)),
      line('Generated by', check.admin.email || ''),
      line('Platform GST number', settings.gstNumber || 'Not configured'),
    ];
    if (settings.gstLegalName) lines.push(line('Registered name', settings.gstLegalName));
    lines.push(line('GST treatment', GST_TREATMENT_TEXT));
    lines.push(line('Entries counted', 'Successful ledger entries only'));
    lines.push('');

    let rowCount = 0;
    const figureHeader = FIGURE_COLUMNS.map((c) => c.label);

    if (kind === 'payees') {
      lines.push(line('Payee type', 'Payee', 'Payee ID', ...figureHeader));
      for (const row of statement.payees) {
        lines.push(line(PAYEE_LABEL[row.payeeType] || row.payeeType, row.payeeName || '', row.payeeId, ...figureCells(row)));
      }
      rowCount = statement.payees.length;
      lines.push('');
      lines.push(line('Payees listed', String(rowCount)));
      lines.push(line('Note', 'Sales the platform makes for itself have no payee and are not listed here.'));
    } else {
      lines.push(line('Service', ...figureHeader));
      for (const row of statement.services) lines.push(line(row.label, ...figureCells(row)));
      lines.push(line('TOTAL', ...figureCells(statement.total)));
      rowCount = statement.services.length;
    }

    lines.push('');
    lines.push(line('Check', 'The same totals added up from the raw ledger entries, one by one'));
    lines.push(line('', ...figureHeader));
    lines.push(line('Statement total', ...figureCells(statement.total)));
    lines.push(line('Raw ledger total', ...figureCells(statement.raw)));
    lines.push(line('Result', statement.matches ? 'The two totals are equal' : 'THE TOTALS DIFFER: do not rely on this statement'));
    lines.push(line('Ledger entries counted', String(statement.total.entries)));
    for (const row of statement.excluded) {
      lines.push(line('Not counted', `${row.count} entries with status "${row.status}"`, money(row.amount)));
    }

    if (kind === 'service') {
      const entries = await db
        .collection('transactions')
        .find(ledgerFilter(period, service))
        .sort({ createdAt: 1, _id: 1 })
        .limit(ENTRY_LIMIT + 1)
        .toArray();
      const shown = entries.slice(0, ENTRY_LIMIT);
      lines.push('');
      lines.push(line('Transactions', `${shown.length} ledger entries` + (entries.length > ENTRY_LIMIT ? ` (first ${ENTRY_LIMIT} only: narrow the period)` : '')));
      lines.push(
        line('Date (India time)', 'Ledger reference', 'Type', 'Amount', 'Payee type', 'Payee', 'Payee ID', 'Booking ID', 'Customer phone', 'Payment reference', 'Gateway payment ID', 'Commission rate %', 'Description')
      );
      for (const e of shown) {
        lines.push(
          line(
            istStamp(new Date(e.createdAt)),
            e.reference,
            TYPE_LABEL[String(e.type)] || e.type,
            money(Number(e.amount) || 0),
            PAYEE_LABEL[String(e.payeeType)] || e.payeeType || '',
            e.payeeName || '',
            e.payeeId || '',
            e.bookingId || '',
            e.customerPhone || '',
            e.parentReference || '',
            e.gatewayPaymentId || '',
            e.ruleSnapshot?.ratePercent ?? '',
            e.description || ''
          )
        );
      }
      rowCount = shown.length;
    }

    await logAudit({
      admin: check.admin,
      action: 'export',
      module: 'finance',
      entityType: 'commission-statement',
      entityId: kind === 'service' ? service : kind,
      entityLabel: title,
      meta: {
        kind,
        service: service || null,
        from: period.fromDay,
        to: period.toDay,
        timezone: STATEMENT_TIMEZONE,
        rows: rowCount,
        gross: statement.total.gross,
        commission: statement.total.commission,
        matchesRawLedger: statement.matches,
      },
      request,
    });

    const stamp = `${period.fromDay || 'start'}-to-${period.toDay || 'today'}`;
    const name = kind === 'service' ? `commission-statement-${service}-${stamp}.csv` : `commission-statement-by-${kind === 'payees' ? 'payee' : 'service'}-${stamp}.csv`;
    return csvResponse(lines.join('\r\n'), name);
  } catch (error) {
    console.error('Commission statement failed:', error);
    return fail('Failed to build the statement', 500);
  }
}
