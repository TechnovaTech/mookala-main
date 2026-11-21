import { registerHooks } from '../resource-hooks';
import { can, type AdminIdentity } from '../permissions';
import { nextRunDue } from '../reporting';
import { getReportInfo, isExportFormat } from './reports';

/** Server-side rules for the `scheduled-reports` resource. */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function checkRecipients(value: unknown): string | void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length === 0) return 'Add at least one recipient email address.';
  if (value.length > 20) return 'A schedule can have at most 20 recipients.';
  const bad = value.find((item) => typeof item !== 'string' || !EMAIL.test(item.trim()));
  if (bad !== undefined) return `"${String(bad).slice(0, 60)}" is not a valid email address.`;
}

/**
 * A schedule generates its report without anyone signed in, so only an admin
 * who may run the report by hand may schedule it.
 */
function checkReport(reportType: unknown, admin: AdminIdentity): string | void {
  const info = getReportInfo(String(reportType || ''));
  if (!info) return 'Choose a report.';
  if (info.permissions.some((permission) => !can(admin, permission))) {
    return `You do not have permission to schedule "${info.label}". It needs: ${info.permissions.join(', ')}.`;
  }
}

registerHooks('scheduled-reports', {
  beforeCreate: ({ doc, admin }) => {
    const reportProblem = checkReport(doc.reportType, admin);
    if (reportProblem) return reportProblem;
    const problem = checkRecipients(doc.recipients);
    if (problem) return problem;
    if (!isExportFormat(doc.format)) return 'Choose a format: Excel, PDF or CSV.';
    doc.recipients = (doc.recipients as string[]).map((item) => item.trim().toLowerCase());
    doc.lastRunAt = null;
    doc.nextRunAt = nextRunDue(String(doc.frequency));
  },
  beforeUpdate: ({ changes, existing, admin }) => {
    // Editing a schedule in any way needs access to the report it generates.
    const reportProblem = checkReport(changes.reportType !== undefined ? changes.reportType : existing.reportType, admin);
    if (reportProblem) return reportProblem;
    const problem = checkRecipients(changes.recipients);
    if (problem) return problem;
    if (Array.isArray(changes.recipients)) {
      changes.recipients = changes.recipients.map((item: string) => item.trim().toLowerCase());
    }
    if (changes.format !== undefined && !isExportFormat(changes.format)) return 'Choose a format: Excel, PDF or CSV.';
    if (changes.frequency !== undefined && changes.frequency !== existing.frequency) {
      changes.nextRunAt = nextRunDue(String(changes.frequency));
    }
  },
});
