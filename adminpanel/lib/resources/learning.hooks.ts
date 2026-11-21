/** Server-side rules for the learning resources. */
import crypto from 'crypto';
import type { Db } from 'mongodb';
import { registerHooks } from '../resource-hooks';
import { toObjectId } from '../http';
import { logAudit } from '../audit';

async function findById(db: Db, collection: string, id: unknown) {
  const oid = toObjectId(id);
  return oid ? db.collection(collection).findOne({ _id: oid }) : null;
}

/* ---------------------------- courses ----------------------------- */

async function courseRefsProblem(db: Db, values: Record<string, any>): Promise<string | null> {
  if ('category' in values && !(await findById(db, 'courseCategories', values.category))) {
    return 'The selected category does not exist.';
  }
  if ('instructor' in values && !(await findById(db, 'instructors', values.instructor))) {
    return 'The selected instructor does not exist.';
  }
  return null;
}

registerHooks('courses', {
  async beforeCreate({ db, doc }) {
    const problem = await courseRefsProblem(db, doc);
    if (problem) return problem;
    doc.approvedPrice = null;
    doc.priceApprovedBy = null;
    doc.priceApprovedAt = null;
  },

  async beforeUpdate({ db, existing, changes, admin, reason }) {
    const problem = await courseRefsProblem(db, changes);
    if (problem) return problem;

    // An approved course must keep a verified instructor.
    if (existing.status === 'approved' && 'instructor' in changes && changes.instructor !== existing.instructor) {
      const instructor = await findById(db, 'instructors', changes.instructor);
      if (!instructor || instructor.status !== 'verified') {
        return 'This course is approved, so its instructor must be verified. Verify the new instructor first.';
      }
    }

    // The price of an approved course is live: a change needs a written reason
    // and counts as a new price approval by the admin making it.
    if (existing.status === 'approved' && 'price' in changes && Number(changes.price) !== Number(existing.price)) {
      if (reason.trim().length < 5) {
        return 'This course is approved. Changing its price needs a reason: type it in "Reason for this change".';
      }
      changes.approvedPrice = changes.price;
      changes.priceApprovedBy = admin.email || null;
      changes.priceApprovedAt = new Date();
    }
  },

  async beforeStatusChange({ db, existing, to, admin }) {
    if (to !== 'approved') return;
    const instructor = await findById(db, 'instructors', existing.instructor);
    if (!instructor) return 'This course has no instructor on record. Pick an instructor before approving it.';
    if (instructor.status !== 'verified') {
      return `This course cannot be approved because its instructor (${instructor.name}) is not verified. Verify the instructor first.`;
    }
    const price = Number(existing.price);
    if (!Number.isFinite(price) || price < 0) return 'Set the course price before approving it.';
    // Approving the course approves its current price.
    return { approvedPrice: price, priceApprovedBy: admin.email || null, priceApprovedAt: new Date() };
  },
});

/* A record that others point at is not deleted from under them. */

registerHooks('courses', {
  async beforeDelete({ db, existing }) {
    const enrolments = await db.collection('enrolments').countDocuments({ course: String(existing._id) });
    if (enrolments > 0) {
      return `This course has ${enrolments} enrolment${enrolments === 1 ? '' : 's'}, so it cannot be deleted. Change its status to "Archived" instead.`;
    }
  },
});

registerHooks('instructors', {
  async beforeDelete({ db, existing }) {
    const courses = await db.collection('courses').countDocuments({ instructor: String(existing._id) });
    if (courses > 0) {
      return `This instructor teaches ${courses} course${courses === 1 ? '' : 's'}, so the record cannot be deleted. Suspend the instructor instead, or move the courses first.`;
    }
  },
});

registerHooks('course-categories', {
  async beforeDelete({ db, existing }) {
    const courses = await db.collection('courses').countDocuments({ category: String(existing._id) });
    if (courses > 0) {
      return `${courses} course${courses === 1 ? ' is' : 's are'} in this category, so it cannot be deleted. Hide it instead, or move the courses first.`;
    }
  },
});

/* ----------------------- course applications ---------------------- */

async function applicationRefsProblem(db: Db, values: Record<string, any>): Promise<string | null> {
  if (values.category && !(await findById(db, 'courseCategories', values.category))) {
    return 'The selected category does not exist.';
  }
  if (values.instructor && !(await findById(db, 'instructors', values.instructor))) {
    return 'The selected instructor record does not exist.';
  }
  return null;
}

registerHooks('course-applications', {
  async beforeCreate({ db, doc }) {
    const problem = await applicationRefsProblem(db, doc);
    if (problem) return problem;
    doc.priceApprovedBy = null;
    doc.createdCourse = null;
  },

  async beforeUpdate({ db, existing, changes }) {
    const problem = await applicationRefsProblem(db, changes);
    if (problem) return problem;
    if (existing.status === 'approved') {
      for (const key of ['approvedPrice', 'proposedPrice', 'instructor', 'category', 'mode', 'proposedTitle']) {
        if (key in changes && JSON.stringify(changes[key] ?? null) !== JSON.stringify(existing[key] ?? null)) {
          return 'This application is approved and its course has been created. Change the title, price, category, mode or instructor on the Courses screen instead.';
        }
      }
    }
  },

  async beforeStatusChange({ db, existing, to, admin, reason }) {
    if (to !== 'approved') return;
    if (existing.createdCourse) {
      return 'This application was approved before and its course already exists on the Courses screen.';
    }

    const instructor = existing.instructor ? await findById(db, 'instructors', existing.instructor) : null;
    if (!instructor) {
      return 'Pick the instructor record before approving. If the applicant is new, add them on the Instructors screen first.';
    }
    const category = existing.category ? await findById(db, 'courseCategories', existing.category) : null;
    if (!category) return 'Pick the category before approving.';
    if (existing.mode !== 'live' && existing.mode !== 'recorded') return 'Set the proposed mode (live or recorded) before approving.';

    const proposed = typeof existing.proposedPrice === 'number' ? existing.proposedPrice : null;
    const chosen = typeof existing.approvedPrice === 'number' ? existing.approvedPrice : proposed;
    if (chosen === null || !Number.isFinite(chosen) || chosen < 0) {
      return 'There is no price to approve. Enter the price proposed by the instructor, or a price to approve, then approve again.';
    }
    if (proposed !== null && chosen !== proposed && reason.trim().length < 5) {
      return `The price to approve (₹${chosen}) is different from the price the instructor proposed (₹${proposed}). Give a reason for the change.`;
    }

    // The approved application becomes a draft course carrying the approved
    // price. It still goes through course approval before students can enrol.
    const now = new Date();
    const course = {
      title: existing.proposedTitle,
      category: String(category._id),
      instructor: String(instructor._id),
      language: null,
      level: null,
      duration: null,
      mode: existing.mode,
      price: chosen,
      approvedPrice: null,
      priceApprovedBy: null,
      priceApprovedAt: null,
      certificateOffered: true,
      previewUrl: null,
      tags: [],
      description: existing.pitch || null,
      syllabus: null,
      materials: [],
      status: 'draft',
      sourceApplication: String(existing._id),
      createdAt: now,
      updatedAt: now,
      createdBy: admin.email || null,
      updatedBy: admin.email || null,
    };
    const inserted = await db.collection('courses').insertOne(course);
    await logAudit({
      admin,
      action: 'create',
      module: 'learning',
      entityType: 'courses',
      entityId: String(inserted.insertedId),
      entityLabel: course.title,
      after: course,
      reason: `Created by approving course application "${existing.proposedTitle}"`,
    });

    return { approvedPrice: chosen, priceApprovedBy: admin.email || null, createdCourse: String(inserted.insertedId) };
  },
});

/* --------------------------- enrolments --------------------------- */

registerHooks('students', {
  async beforeCreate({ db, doc }) {
    const course = await findById(db, 'courses', doc.course);
    if (!course) return 'The selected course does not exist.';
    if (course.status !== 'approved') return 'Students can only be enrolled in an approved course.';
    const duplicate = await db.collection('enrolments').findOne({
      course: String(course._id),
      studentPhone: doc.studentPhone,
      status: { $in: ['enrolled', 'in_progress', 'completed'] },
    });
    if (duplicate) return `This phone number is already enrolled in "${course.title}" (${duplicate.studentName}).`;
    doc.course = String(course._id);
    doc.enrolmentLabel = `${doc.studentName} · ${course.title}`;
    doc.completedOn = null;
  },

  async beforeUpdate({ db, existing, changes }) {
    const courseId = 'course' in changes ? changes.course : existing.course;
    const course = await findById(db, 'courses', courseId);
    if (!course) return 'The selected course does not exist.';
    if ('course' in changes && changes.course !== existing.course) {
      if (course.status !== 'approved') return 'Students can only be enrolled in an approved course.';
      const issued = await db.collection('certificates').countDocuments({ enrolment: String(existing._id), status: 'issued' });
      if (issued > 0) return 'A certificate has been issued for this enrolment, so its course cannot be changed.';
    }
    const name = 'studentName' in changes ? changes.studentName : existing.studentName;
    changes.enrolmentLabel = `${name} · ${course.title}`;

    if (existing.status === 'completed' && 'progressPercent' in changes && Number(changes.progressPercent) < 100 && !existing.statusReason) {
      return 'This enrolment is marked completed. Change its status first if the student has not finished.';
    }
  },

  beforeStatusChange({ existing, to, reason }) {
    if (to === 'completed') {
      const progress = Number(existing.progressPercent) || 0;
      if (progress < 100 && !reason) {
        return `Progress is ${progress}%. Set progress to 100% first, or give a reason for marking this enrolment completed early.`;
      }
      return { completedOn: new Date() };
    }
    // Leaving "completed" clears the completion date.
    if (existing.status === 'completed') return { completedOn: null };
  },

  async beforeDelete({ db, existing }) {
    const certificates = await db.collection('certificates').countDocuments({ enrolment: String(existing._id) });
    if (certificates > 0) {
      return 'A certificate was issued for this enrolment, so it cannot be deleted. The certificate register must keep pointing at it.';
    }
  },
});

/* -------------------------- certificates -------------------------- */

let certificateIndexReady = false;

async function ensureCertificateIndex(db: Db) {
  if (certificateIndexReady) return;
  await db.collection('certificates').createIndex({ certificateNumber: 1 }, { unique: true });
  certificateIndexReady = true;
}

/** e.g. MKL-2026-7K3QX9PD. The alphabet leaves out 0, O, 1 and I, which are easy to misread. */
function newCertificateNumber(): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = crypto.randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i++) code += alphabet[bytes[i] % alphabet.length];
  return `MKL-${new Date().getFullYear()}-${code}`;
}

registerHooks('certificates', {
  async beforeCreate({ db, doc }) {
    const enrolment = await findById(db, 'enrolments', doc.enrolment);
    if (!enrolment) return 'The selected enrolment does not exist.';
    if (enrolment.status !== 'completed') {
      return 'A certificate can only be issued for a completed enrolment. Mark the enrolment completed on the Students screen first.';
    }

    const course = await findById(db, 'courses', enrolment.course);
    if (course && course.certificateOffered === false) {
      return `"${course.title}" does not offer a certificate. Turn on "Certificate on completion" on the course first.`;
    }

    const already = await db.collection('certificates').findOne({ enrolment: String(enrolment._id), status: 'issued' });
    if (already) return `This enrolment already has certificate ${already.certificateNumber}. Revoke it before issuing another.`;

    await ensureCertificateIndex(db);
    let number = newCertificateNumber();
    for (let attempt = 0; attempt < 5; attempt++) {
      if (!(await db.collection('certificates').findOne({ certificateNumber: number }))) break;
      number = newCertificateNumber();
    }

    doc.certificateNumber = number;
    doc.enrolment = String(enrolment._id);
    doc.course = enrolment.course;
    doc.studentName = enrolment.studentName;
    if (!doc.issuedOn) doc.issuedOn = new Date();
  },

  beforeUpdate({ existing, changes }) {
    if ('enrolment' in changes && changes.enrolment !== existing.enrolment) {
      return 'A certificate cannot be moved to another enrolment. Revoke this one and issue a new certificate.';
    }
  },

  async beforeStatusChange({ db, existing, to }) {
    if (to !== 'issued') return;
    // Re-issuing a revoked certificate follows the same rules as a new one.
    const enrolment = await findById(db, 'enrolments', existing.enrolment);
    if (!enrolment || enrolment.status !== 'completed') {
      return 'This certificate cannot be re-issued because the enrolment is no longer marked completed.';
    }
    const other = await db
      .collection('certificates')
      .findOne({ enrolment: existing.enrolment, status: 'issued', _id: { $ne: existing._id } });
    if (other) return `This enrolment already has certificate ${other.certificateNumber}.`;
  },
});

/* ------------------------------------------------------------------ */
/* Ledger entries for recorded course fees                             */
/* ------------------------------------------------------------------ */

/**
 * A course fee recorded on an enrolment is written to the ledger with the
 * instructor as the payee, so Finance can see it and settle the instructor.
 */
async function enrolmentPayee(db: any, enrolment: any) {
  const { ObjectId } = await import('mongodb');
  const asId = (value: any) => (ObjectId.isValid(String(value || '')) ? new ObjectId(String(value)) : null);
  const courseId = asId(enrolment.course);
  const course = courseId ? await db.collection('courses').findOne({ _id: courseId }, { projection: { title: 1, instructor: 1 } }) : null;
  const instructorId = asId(course?.instructor);
  const instructor = instructorId
    ? await db.collection('instructors').findOne({ _id: instructorId }, { projection: { name: 1 } })
    : null;
  return { course, instructor };
}

registerHooks('students', {
  async afterCreate({ db, item, admin }) {
    const { recordManualPayment } = await import('../recorded-payments');
    const { course, instructor } = await enrolmentPayee(db, item);
    if (!instructor) return;
    await recordManualPayment(db, {
      key: `enrolment:${item._id}`,
      service: 'learning',
      amount: Number(item.amountPaid) || 0,
      payeeType: 'instructor',
      payeeId: String(instructor._id),
      payeeName: instructor.name || null,
      customerPhone: item.studentPhone || null,
      description: `Course fee: ${course?.title || 'course'} (${item.studentName || 'student'})`,
      createdBy: admin.email || null,
    });
  },

  async afterStatusChange({ db, item, to, admin }) {
    if (to !== 'refunded') return;
    const { recordManualRefund } = await import('../recorded-payments');
    await recordManualRefund(db, `enrolment:${item._id}`, `Course fee refunded (${item.studentName || 'student'})`, admin.email || null);
  },
});
