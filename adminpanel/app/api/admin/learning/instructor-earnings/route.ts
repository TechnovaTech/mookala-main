import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { logAudit } from '@/lib/audit';
import { csvResponse, fail, ok, toCsv, toObjectId } from '@/lib/http';
import { computeCharges, getCommissionRule, type CommissionRule } from '@/lib/ledger';
import { money, rangeIsInvalid, readRange, round2, today } from '../_lib/report';

export const dynamic = 'force-dynamic';

/**
 * Instructor earnings statement, worked out from the `enrolments` collection.
 *
 * Per instructor: what was recorded as collected on enrolments in their
 * courses, what sits on refunded enrolments, and a CALCULATION of the
 * commission, GST and gateway fee that would apply under the commission rule
 * for the "learning" service that is active today. Nothing here is a ledger
 * entry and nothing is paid from here: learning payments are entered by the
 * team and are not in the finance ledger.
 *
 * Settlement columns are read from `settlements` where payeeType is "instructor"
 * and are returned only to an admin with 'settlements:view'. The commission
 * rule and the calculated commission, GST, gateway fee and net columns are
 * finance figures: they are returned only to an admin with 'finance:view'
 * (`canSeeCharges`); for anyone else they are null and left out of the CSV.
 *
 *   ?from=YYYY-MM-DD&to=YYYY-MM-DD   enrolments by their "Enrolled on" date
 *   ?export=csv                      the summary, one row per instructor
 *   ?instructor=<id>                 the statement lines of one instructor
 *   ?instructor=<id>&export=csv      those lines as a file
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'learning:view');
  if (!check.ok) return check.response;
  if (rangeIsInvalid(request)) return fail('The date range is not valid.');

  try {
    const { db } = await connectToDatabase();
    const params = request.nextUrl.searchParams;
    const range = readRange(request);
    const canSeeSettlements = can(check.admin, 'settlements:view');
    const canSeeCharges = can(check.admin, 'finance:view');
    const wantCsv = params.get('export') === 'csv';

    const instructorParam = params.get('instructor');
    if (instructorParam !== null && !toObjectId(instructorParam)) return fail('This is not a valid instructor.');

    const [instructors, courses, enrolments, settlements, rule] = await Promise.all([
      db.collection('instructors').find({}).project({ name: 1, status: 1 }).sort({ name: 1 }).toArray(),
      db.collection('courses').find({}).project({ instructor: 1, title: 1 }).toArray(),
      db
        .collection('enrolments')
        .find(range.condition ? { enrolledOn: range.condition } : {})
        .project({ course: 1, status: 1, amountPaid: 1, studentName: 1, enrolledOn: 1 })
        .sort({ enrolledOn: 1 })
        .toArray(),
      canSeeSettlements
        ? db.collection('settlements').find({ payeeType: 'instructor' }).project({ payeeId: 1, netAmount: 1, status: 1 }).toArray()
        : Promise.resolve([] as any[]),
      canSeeCharges ? getCommissionRule(db, 'learning') : Promise.resolve(null),
    ]);

    const ruleSummary = rule ? describeRule(rule) : null;
    const courseById = new Map(courses.map((c) => [String(c._id), c]));

    const rows = new Map(
      instructors.map((i) => [
        String(i._id),
        {
          instructorId: String(i._id),
          name: i.name as string,
          status: i.status as string,
          courses: 0,
          enrolments: 0,
          amountCollected: 0,
          refundedEnrolments: 0,
          refundedAmount: 0,
          netCollected: 0,
          commission: 0,
          gst: 0,
          gatewayFee: 0,
          netAfterCharges: 0,
          settlements: 0,
          settledPaid: 0,
          settledAwaiting: 0,
        },
      ])
    );

    for (const course of courses) {
      const row = rows.get(String(course.instructor || ''));
      if (row) row.courses += 1;
    }

    const lines: Record<string, any>[] = [];

    for (const enrolment of enrolments) {
      const course = courseById.get(String(enrolment.course || ''));
      const instructorId = String(course?.instructor || '');
      const row = rows.get(instructorId);
      if (!row) continue;

      const amount = money(enrolment.amountPaid);
      const refunded = enrolment.status === 'refunded';
      // Charges are worked out per enrolment, as they would be per payment,
      // because a minimum or maximum fee applies to each payment separately.
      const charges = !refunded && amount > 0 && rule ? computeCharges(amount, rule) : null;

      row.enrolments += 1;
      row.amountCollected += amount;
      if (refunded) {
        row.refundedEnrolments += 1;
        row.refundedAmount += amount;
      } else {
        row.netCollected += amount;
        if (charges) {
          row.commission += charges.commission;
          row.gst += charges.gst;
          row.gatewayFee += charges.gatewayFee;
          row.netAfterCharges += charges.net;
        }
      }

      if (instructorParam && instructorId === instructorParam) {
        lines.push({
          enrolmentId: String(enrolment._id),
          studentName: enrolment.studentName || '',
          course: course?.title || '',
          enrolledOn: enrolment.enrolledOn ? new Date(enrolment.enrolledOn).toISOString().slice(0, 10) : '',
          status: enrolment.status || '',
          amountPaid: round2(amount),
          refunded: refunded ? 'yes' : 'no',
          countedAmount: refunded ? 0 : round2(amount),
          commission: charges ? charges.commission : rule && !refunded ? 0 : null,
          gst: charges ? charges.gst : rule && !refunded ? 0 : null,
          gatewayFee: charges ? charges.gatewayFee : rule && !refunded ? 0 : null,
          netAfterCharges: charges ? charges.net : rule && !refunded ? 0 : null,
        });
      }
    }

    for (const settlement of settlements) {
      const row = rows.get(String(settlement.payeeId || ''));
      if (!row) continue;
      row.settlements += 1;
      if (settlement.status === 'paid') row.settledPaid += money(settlement.netAmount);
      else if (settlement.status !== 'failed') row.settledAwaiting += money(settlement.netAmount);
    }

    const list = Array.from(rows.values()).map((row) => ({
      ...row,
      amountCollected: round2(row.amountCollected),
      refundedAmount: round2(row.refundedAmount),
      netCollected: round2(row.netCollected),
      // With no rule there is no calculation: null, never an assumed zero.
      commission: rule ? round2(row.commission) : null,
      gst: rule ? round2(row.gst) : null,
      gatewayFee: rule ? round2(row.gatewayFee) : null,
      netAfterCharges: rule ? round2(row.netAfterCharges) : null,
      settledPaid: round2(row.settledPaid),
      settledAwaiting: round2(row.settledAwaiting),
    }));
    // Instructors with enrolments first, then by name.
    list.sort((a, b) => b.enrolments - a.enrolments || String(a.name || '').localeCompare(String(b.name || '')));

    const ruleText = ruleSummary ? ruleSummary.text : 'No rule configured';
    const calc = (label: string) => `${label} (calculation, ${ruleSummary ? 'rule: ' + ruleSummary.text : 'no rule configured'})`;

    if (instructorParam) {
      const instructor = list.find((row) => row.instructorId === instructorParam);
      if (!instructor) return fail('Instructor not found', 404);

      if (wantCsv) {
        await logAudit({
          admin: check.admin,
          action: 'export',
          module: 'learning',
          entityType: 'instructor-earnings-statement',
          entityId: instructorParam,
          entityLabel: instructor.name,
          meta: { rows: lines.length, from: range.from, to: range.to, rule: ruleText },
          request,
        });
        return csvResponse(
          toCsv(lines, [
            { key: 'studentName', label: 'Student' },
            { key: 'course', label: 'Course' },
            { key: 'enrolledOn', label: 'Enrolled on' },
            { key: 'status', label: 'Enrolment status' },
            { key: 'amountPaid', label: 'Amount recorded as paid' },
            { key: 'refunded', label: 'Refunded' },
            { key: 'countedAmount', label: 'Amount counted (0 when refunded)' },
            ...(canSeeCharges
              ? [
                  { key: 'commission', label: calc('Commission') },
                  { key: 'gst', label: calc('GST on commission') },
                  { key: 'gatewayFee', label: calc('Gateway fee') },
                  { key: 'netAfterCharges', label: calc('Net after charges') },
                ]
              : []),
          ]),
          `instructor-statement-${instructorParam}-${today()}.csv`
        );
      }
      return ok({ instructor, lines, rule: ruleSummary, range: { from: range.from, to: range.to }, canSeeSettlements, canSeeCharges });
    }

    if (wantCsv) {
      await logAudit({
        admin: check.admin,
        action: 'export',
        module: 'learning',
        entityType: 'instructor-earnings',
        meta: { rows: list.length, from: range.from, to: range.to, rule: ruleText },
        request,
      });
      return csvResponse(
        toCsv(list, [
          { key: 'instructorId', label: 'Instructor id (payee id for Finance)' },
          { key: 'name', label: 'Instructor' },
          { key: 'status', label: 'Status' },
          { key: 'courses', label: 'Courses' },
          { key: 'enrolments', label: 'Enrolments' },
          { key: 'amountCollected', label: 'Amount collected' },
          { key: 'refundedEnrolments', label: 'Refunded enrolments' },
          { key: 'refundedAmount', label: 'Amount on refunded enrolments' },
          { key: 'netCollected', label: 'Collected less refunded' },
          ...(canSeeCharges
            ? [
                { key: 'commission', label: calc('Commission') },
                { key: 'gst', label: calc('GST on commission') },
                { key: 'gatewayFee', label: calc('Gateway fee') },
                { key: 'netAfterCharges', label: calc('Net after charges') },
              ]
            : []),
          ...(canSeeSettlements
            ? [
                { key: 'settlements', label: 'Settlements' },
                { key: 'settledPaid', label: 'Settlements paid (net)' },
                { key: 'settledAwaiting', label: 'Settlements not yet paid (net)' },
              ]
            : []),
        ]),
        `instructor-earnings-${today()}.csv`
      );
    }

    return ok({ instructors: list, rule: ruleSummary, range: { from: range.from, to: range.to }, canSeeSettlements, canSeeCharges });
  } catch (error) {
    console.error('Instructor earnings failed:', error);
    return fail('Failed to load instructor earnings', 500);
  }
}

function describeRule(rule: CommissionRule) {
  const parts = [`${rule.ratePercent || 0}% commission`];
  if (rule.minFee != null && rule.minFee > 0) parts.push(`minimum ₹${rule.minFee}`);
  if (rule.maxFee != null && rule.maxFee > 0) parts.push(`maximum ₹${rule.maxFee}`);
  parts.push(`${rule.gstPercent || 0}% GST on commission`);
  parts.push(`${rule.gatewayFeePercent || 0}% gateway fee`);
  return {
    id: String(rule._id),
    ratePercent: rule.ratePercent || 0,
    minFee: rule.minFee ?? null,
    maxFee: rule.maxFee ?? null,
    gstPercent: rule.gstPercent || 0,
    gatewayFeePercent: rule.gatewayFeePercent || 0,
    effectiveFrom: rule.effectiveFrom,
    text: parts.join(', '),
  };
}
