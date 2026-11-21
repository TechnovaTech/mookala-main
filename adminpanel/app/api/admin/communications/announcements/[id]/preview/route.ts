import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { fail, ok, toObjectId } from '@/lib/http';
import { countAudience, findTemplate, getChannelConfig, isChannel, messageBlocker, renderTemplate, resolveAudience } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

/**
 * Preview of an announcement: the real number of recipients, and for each
 * chosen channel the template that would be used, the rendered message and
 * whether the channel can actually send.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'communications:view');
  if (!check.ok) return check.response;

  const oid = toObjectId(params.id);
  if (!oid) return fail('Invalid announcement id');

  try {
    const { db } = await connectToDatabase();
    const announcement = await db.collection('announcements').findOne({ _id: oid });
    if (!announcement) return fail('Announcement not found', 404);

    const parts = await resolveAudience(db, announcement.audience);
    if (typeof parts === 'string') return fail(parts);
    const audience = await countAudience(db, parts);

    const variables = { title: announcement.title, message: announcement.message, name: '(recipient name)' };
    const channels = [];
    for (const channel of (announcement.channels || []).filter(isChannel)) {
      const template = await findTemplate(db, announcement.templateKey, channel);
      const blocker = messageBlocker(await getChannelConfig(db, channel));
      channels.push({
        channel,
        template: template ? { name: template.name, status: template.status } : null,
        templateProblem: !template
          ? `No ${channel} template has the key "${announcement.templateKey}"`
          : template.status !== 'approved'
          ? `The ${channel} template "${announcement.templateKey}" is not approved`
          : null,
        subject: template ? renderTemplate(template.subject || '', variables).text : '',
        body: template ? renderTemplate(template.body || '', variables).text : '',
        canSend: !blocker,
        problem: blocker,
      });
    }

    return ok({
      announcement: { id: String(announcement._id), title: announcement.title, status: announcement.status, priority: announcement.priority },
      audience,
      channels,
    });
  } catch (error) {
    console.error('Announcement preview failed:', error);
    return fail('Failed to build the preview', 500);
  }
}
