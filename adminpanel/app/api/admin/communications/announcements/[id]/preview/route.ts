import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { fail, ok, toObjectId } from '@/lib/http';
import {
  ANNOUNCEMENT_VARIABLES,
  channelReach,
  countAudience,
  findTemplate,
  getChannelConfig,
  isChannel,
  loadRecipientBatch,
  maskAddress,
  messageBlocker,
  renderTemplate,
  resolveAudience,
  variablesOfTemplate,
  type Channel,
} from '@/lib/notifications';
import { audienceFiltersOf } from '../../../_lib/announcements';

export const dynamic = 'force-dynamic';

/**
 * Preview of an announcement: the exact number of recipients the audience
 * matches now, how many of them each chosen channel can reach, and the
 * message rendered for one real sample recipient (address masked).
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

    const parts = await resolveAudience(db, announcement.audience, null, audienceFiltersOf(announcement));
    if (typeof parts === 'string') return fail(parts);
    const audience = await countAudience(db, parts);
    const channelList = ((announcement.channels || []) as string[]).filter(isChannel) as Channel[];
    const reach = await channelReach(db, parts, channelList);

    const sample = (await loadRecipientBatch(db, parts, null, 1)).recipients[0] || null;
    const variables = {
      title: announcement.title,
      message: announcement.message,
      name: sample?.name || (sample ? (sample.type === 'user' ? 'Customer' : sample.type === 'artist' ? 'Artist' : 'Organiser') : '(recipient name)'),
      city: sample ? sample.city : '(recipient city)',
    };

    const channels = [];
    for (const channel of channelList) {
      const template = await findTemplate(db, announcement.templateKey, channel);
      const blocker = messageBlocker(await getChannelConfig(db, channel));
      const unknown = template ? variablesOfTemplate(template).filter((name) => !ANNOUNCEMENT_VARIABLES.includes(name)) : [];
      const subject = template ? renderTemplate(template.subject || '', variables) : { text: '', missing: [] };
      const body = template ? renderTemplate(template.body || '', variables) : { text: '', missing: [] };
      const missing = Array.from(new Set([...subject.missing, ...body.missing]));
      const counts = reach.find((r) => r.channel === channel);
      channels.push({
        channel,
        template: template
          ? {
              name: template.name,
              status: template.status,
              whatsappTemplateName: template.whatsappTemplateName || null,
              dltTemplateId: template.dltTemplateId || null,
            }
          : null,
        templateProblem: !template
          ? `No ${channel} template has the key "${announcement.templateKey}"`
          : template.status !== 'approved'
          ? `The ${channel} template "${announcement.templateKey}" is ${String(template.status).replace(/_/g, ' ')}, not approved`
          : unknown.length
          ? `The template uses ${unknown.map((n) => `{{${n}}}`).join(', ')}, which an announcement cannot fill`
          : null,
        subject: subject.text,
        body: body.text,
        missingForSample: missing,
        recipients: counts?.recipients ?? 0,
        devices: counts?.devices ?? null,
        canSend: !blocker,
        problem: blocker,
      });
    }

    return ok({
      announcement: {
        id: String(announcement._id),
        title: announcement.title,
        status: announcement.status,
        priority: announcement.priority,
        scheduledFor: announcement.scheduledFor || null,
      },
      audience,
      sample: sample
        ? {
            type: sample.type,
            name: sample.name || null,
            city: sample.city || null,
            phone: maskAddress(sample.phone),
            email: maskAddress(sample.email),
          }
        : null,
      channels,
    });
  } catch (error) {
    console.error('Announcement preview failed:', error);
    return fail('Failed to build the preview', 500);
  }
}
