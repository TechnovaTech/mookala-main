import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { CASE_TEAMS } from '@/lib/resources/support';
import { eligibleAssignees, isTeam } from '@/lib/resources/support.hooks';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/support/assignees?team=   (support:view)
 * The admins a case of that team can be assigned to: active admins of the
 * team's role and Super Admins, who can at least open support cases. Without
 * `team`, every team with its list.
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'support:view');
  if (!check.ok) return check.response;

  const team = request.nextUrl.searchParams.get('team') || '';
  if (team && !isTeam(team)) return fail('Unknown team', 400);

  try {
    const { db } = await connectToDatabase();
    const teams = team ? CASE_TEAMS.filter((t) => t.value === team) : CASE_TEAMS;
    const lists = await Promise.all(teams.map(async (t) => ({ team: t.value, label: t.label, assignees: await eligibleAssignees(db, t.value) })));
    return ok({ teams: lists });
  } catch (error) {
    console.error('Support assignees failed:', error);
    return fail('Failed to load the admins', 500);
  }
}
