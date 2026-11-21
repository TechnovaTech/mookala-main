import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { csvResponse, fail, ok, toCsv } from '@/lib/http';
import { money, percent, rangeIsInvalid, readRange, round2, today } from '../_lib/report';

export const dynamic = 'force-dynamic';

/**
 * Learning report: enrolments, completions and revenue by course and by
 * category, counted from the `enrolments` collection.
 *
 * The date range selects enrolments by their "Enrolled on" date. A completion
 * is one of those enrolments whose status is now "completed". Revenue is the
 * "Amount paid" recorded on those enrolments, leaving out refunded ones.
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'learning:view');
  if (!check.ok) return check.response;
  if (rangeIsInvalid(request)) return fail('The date range is not valid.');

  try {
    const { db } = await connectToDatabase();
    const range = readRange(request);

    const [enrolments, courses, categories, instructors, certificates] = await Promise.all([
      db
        .collection('enrolments')
        .find(range.condition ? { enrolledOn: range.condition } : {})
        .project({ course: 1, status: 1, amountPaid: 1 })
        .toArray(),
      db.collection('courses').find({}).project({ title: 1, category: 1, instructor: 1, status: 1 }).toArray(),
      db.collection('courseCategories').find({}).project({ name: 1 }).toArray(),
      db.collection('instructors').find({}).project({ name: 1, status: 1 }).toArray(),
      db
        .collection('certificates')
        .find(range.condition ? { issuedOn: range.condition } : {})
        .project({ status: 1 })
        .toArray(),
    ]);

    const courseById = new Map(courses.map((c) => [String(c._id), c]));
    const categoryName = new Map(categories.map((c) => [String(c._id), c.name]));
    const instructorName = new Map(instructors.map((i) => [String(i._id), i.name]));

    interface Row {
      enrolments: number;
      completions: number;
      dropped: number;
      refunded: number;
      revenue: number;
    }
    const empty = (): Row => ({ enrolments: 0, completions: 0, dropped: 0, refunded: 0, revenue: 0 });
    const perCourse = new Map<string, Row>();
    const perCategory = new Map<string, Row>();
    const total = empty();
    const teaching = new Set<string>();

    for (const enrolment of enrolments) {
      const courseId = String(enrolment.course || '');
      const course = courseById.get(courseId);
      const categoryId = course ? String(course.category || '') : '';
      if (course?.instructor) teaching.add(String(course.instructor));

      for (const row of [
        perCourse.get(courseId) || perCourse.set(courseId, empty()).get(courseId)!,
        perCategory.get(categoryId) || perCategory.set(categoryId, empty()).get(categoryId)!,
        total,
      ]) {
        row.enrolments += 1;
        if (enrolment.status === 'completed') row.completions += 1;
        if (enrolment.status === 'dropped') row.dropped += 1;
        if (enrolment.status === 'refunded') row.refunded += 1;
        else row.revenue += money(enrolment.amountPaid);
      }
    }

    const finish = (row: Row) => ({
      ...row,
      revenue: round2(row.revenue),
      completionRate: percent(row.completions, row.enrolments),
    });

    const byCourse = Array.from(perCourse.entries())
      .map(([id, row]) => {
        const course = courseById.get(id);
        return {
          courseId: id,
          course: course?.title || 'Deleted course',
          category: course ? categoryName.get(String(course.category)) || 'No category' : '—',
          instructor: course ? instructorName.get(String(course.instructor)) || 'No instructor' : '—',
          ...finish(row),
        };
      })
      .sort((a, b) => b.enrolments - a.enrolments || a.course.localeCompare(b.course));

    const byCategory = Array.from(perCategory.entries())
      .map(([id, row]) => ({ categoryId: id, category: categoryName.get(id) || 'No category', ...finish(row) }))
      .sort((a, b) => b.enrolments - a.enrolments || a.category.localeCompare(b.category));

    const exportKind = request.nextUrl.searchParams.get('export');
    if (exportKind === 'courses' || exportKind === 'categories') {
      await logAudit({
        admin: check.admin,
        action: 'export',
        module: 'learning',
        entityType: 'learning-report',
        meta: { report: exportKind, from: range.from, to: range.to },
        request,
      });
      const shared = [
        { key: 'enrolments', label: 'Enrolments' },
        { key: 'completions', label: 'Completions' },
        { key: 'completionRate', label: 'Completion rate %' },
        { key: 'dropped', label: 'Dropped' },
        { key: 'refunded', label: 'Refunded' },
        { key: 'revenue', label: 'Revenue' },
      ];
      if (exportKind === 'courses') {
        return csvResponse(
          toCsv(byCourse, [
            { key: 'course', label: 'Course' },
            { key: 'category', label: 'Category' },
            { key: 'instructor', label: 'Instructor' },
            ...shared,
          ]),
          `learning-by-course-${today()}.csv`
        );
      }
      return csvResponse(toCsv(byCategory, [{ key: 'category', label: 'Category' }, ...shared]), `learning-by-category-${today()}.csv`);
    }

    return ok({
      range: { from: range.from, to: range.to },
      totals: {
        ...finish(total),
        instructorsWithEnrolments: teaching.size,
        verifiedInstructors: instructors.filter((i) => i.status === 'verified').length,
        approvedCourses: courses.filter((c) => c.status === 'approved').length,
        certificatesIssued: certificates.filter((c) => c.status === 'issued').length,
        certificatesRevoked: certificates.filter((c) => c.status === 'revoked').length,
      },
      byCourse,
      byCategory,
    });
  } catch (error) {
    console.error('Learning report failed:', error);
    return fail('Failed to build the learning report', 500);
  }
}
