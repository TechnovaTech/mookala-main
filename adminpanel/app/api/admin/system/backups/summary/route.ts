import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin, roleOf } from '@/lib/auth';
import { fail, ok } from '@/lib/http';

export const dynamic = 'force-dynamic';

const DAY = 24 * 60 * 60 * 1000;
const BACKUP_MAX_AGE_DAYS = 7;
const RESTORE_TEST_MAX_AGE_DAYS = 90;

/**
 * Last recorded backup and restore test, from the backup log. A logical export
 * is not a restorable backup, so it never counts as "last successful backup".
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'system:view');
  if (!check.ok) return check.response;

  try {
    const { db } = await connectToDatabase();
    const collection = db.collection('backupRecords');
    const isSuperAdmin = roleOf(check.admin) === 'super_admin';

    const [lastBackup, lastFailed, lastRestoreTest, lastExport, total] = await Promise.all([
      collection.find({ status: 'completed', type: { $in: ['atlas_snapshot', 'manual'] } }).sort({ takenAt: -1 }).limit(1).next(),
      collection.find({ status: 'failed', type: { $in: ['atlas_snapshot', 'manual'] } }).sort({ takenAt: -1 }).limit(1).next(),
      collection.find({ restoreTested: true, restoreTestedAt: { $ne: null } }).sort({ restoreTestedAt: -1 }).limit(1).next(),
      collection.find({ type: 'logical_export' }).sort({ takenAt: -1 }).limit(1).next(),
      collection.countDocuments({}),
    ]);

    // Where a backup is kept is restore information: Super Admins only.
    const shape = (doc: any) =>
      doc
        ? {
            id: String(doc._id),
            takenAt: doc.takenAt || null,
            type: doc.type || null,
            scope: doc.scope || null,
            size: doc.size || null,
            takenBy: doc.takenBy || null,
            status: doc.status || null,
            restoreTestedAt: doc.restoreTestedAt || null,
            ...(isSuperAdmin ? { reference: doc.reference || null } : {}),
          }
        : null;

    const now = Date.now();
    const age = (value: any) => (value ? Math.floor((now - new Date(value).getTime()) / DAY) : null);
    const backupAge = age(lastBackup?.takenAt);
    const restoreAge = age(lastRestoreTest?.restoreTestedAt);

    const warnings: { level: 'warning' | 'critical'; text: string }[] = [];
    if (!lastBackup) {
      warnings.push({ level: 'critical', text: 'No completed backup has ever been recorded here. Check the Atlas console and record the latest snapshot.' });
    } else if (backupAge !== null && backupAge > BACKUP_MAX_AGE_DAYS) {
      warnings.push({ level: 'critical', text: `The last recorded backup is ${backupAge} days old. No completed backup has been recorded in the last ${BACKUP_MAX_AGE_DAYS} days.` });
    }
    if (!lastRestoreTest) {
      warnings.push({ level: 'warning', text: 'No restore test has ever been recorded. A backup that has never been restored is not known to work.' });
    } else if (restoreAge !== null && restoreAge > RESTORE_TEST_MAX_AGE_DAYS) {
      warnings.push({ level: 'warning', text: `The last restore test was ${restoreAge} days ago. No restore test has been recorded in the last ${RESTORE_TEST_MAX_AGE_DAYS} days.` });
    }
    if (lastFailed && (!lastBackup || new Date(lastFailed.takenAt).getTime() > new Date(lastBackup.takenAt).getTime())) {
      warnings.push({ level: 'critical', text: 'The most recent recorded backup failed and no completed backup has been recorded since.' });
    }

    return ok({
      lastBackup: shape(lastBackup),
      lastBackupAgeDays: backupAge,
      lastRestoreTest: shape(lastRestoreTest),
      lastRestoreTestAgeDays: restoreAge,
      lastExport: shape(lastExport),
      totalRecords: total,
      warnings,
      limits: { backupMaxAgeDays: BACKUP_MAX_AGE_DAYS, restoreTestMaxAgeDays: RESTORE_TEST_MAX_AGE_DAYS },
      isSuperAdmin,
    });
  } catch (error) {
    console.error('Backup summary failed:', error);
    return fail('Could not load the backup summary', 500);
  }
}
