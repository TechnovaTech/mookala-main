import { NextRequest } from 'next/server';
import type { ReplayRequest } from '@/lib/approvals';
import * as resourceCollection from '@/app/api/admin/r/[resource]/route';
import * as resourceItem from '@/app/api/admin/r/[resource]/[id]/route';
import * as financeSettings from '@/app/api/admin/finance/settings/route';
import * as platformConfig from '@/app/api/admin/platform/route';
import * as notificationChannels from '@/app/api/admin/communications/channels/route';
import * as adminAccounts from '@/app/api/admin/security/admins/route';
import * as adminAccount from '@/app/api/admin/security/admins/[id]/route';
import * as securitySettings from '@/app/api/admin/security/settings/route';

/**
 * Carries out an approved change by calling the same route handler that
 * would have made it, with the caller's own cookie and the approval id. The
 * handler runs every check again (session, permission, validation) and its
 * gate consumes the approval, so "Carry out now" can never do more than the
 * original request would have done with approval.
 *
 * Only the routes below can be replayed. Server only.
 */

// Each handler takes its own params shape; the dispatcher builds the matching one from the path.
type Handler = (request: NextRequest, context: { params: any }) => Promise<Response> | Response;
type Module = Partial<Record<ReplayRequest['method'], Handler>>;

interface ReplayRoute {
  pattern: RegExp;
  module: Module;
  params: (match: RegExpMatchArray) => Record<string, string>;
  /** Where the handler reads the approval id from in the body. */
  approvalKey: 'approvalId' | '_approvalId';
}

const ROUTES: ReplayRoute[] = [
  { pattern: /^\/api\/admin\/r\/([a-z0-9-]+)$/, module: resourceCollection as Module, params: (m) => ({ resource: m[1] }), approvalKey: '_approvalId' },
  {
    pattern: /^\/api\/admin\/r\/([a-z0-9-]+)\/([a-f0-9]{24})$/,
    module: resourceItem as Module,
    params: (m) => ({ resource: m[1], id: m[2] }),
    approvalKey: '_approvalId',
  },
  { pattern: /^\/api\/admin\/finance\/settings$/, module: financeSettings as Module, params: () => ({}), approvalKey: 'approvalId' },
  { pattern: /^\/api\/admin\/platform$/, module: platformConfig as Module, params: () => ({}), approvalKey: 'approvalId' },
  { pattern: /^\/api\/admin\/communications\/channels$/, module: notificationChannels as Module, params: () => ({}), approvalKey: 'approvalId' },
  { pattern: /^\/api\/admin\/security\/admins$/, module: adminAccounts as Module, params: () => ({}), approvalKey: 'approvalId' },
  { pattern: /^\/api\/admin\/security\/admins\/([a-f0-9]{24})$/, module: adminAccount as Module, params: (m) => ({ id: m[1] }), approvalKey: 'approvalId' },
  { pattern: /^\/api\/admin\/security\/settings$/, module: securitySettings as Module, params: () => ({}), approvalKey: 'approvalId' },
];

/** Headers of the caller's request that the replayed request keeps: who they are and where they are. */
const KEPT_HEADERS = ['cookie', 'authorization', 'user-agent', 'x-forwarded-for', 'x-real-ip', 'host'];

export async function performReplay(
  request: NextRequest,
  replay: ReplayRequest,
  approvalId: string
): Promise<{ status: number; data: any }> {
  const route = ROUTES.find((item) => item.pattern.test(replay.path));
  const handler = route?.module[replay.method];
  if (!route || !handler) {
    return { status: 400, data: { success: false, error: 'This approved change cannot be carried out from the Approvals screen. Save the same change again from its own screen.' } };
  }

  const headers = new Headers({ 'content-type': 'application/json' });
  for (const name of KEPT_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const url = new URL(replay.path, request.nextUrl.origin);
  const inner = new NextRequest(url, {
    method: replay.method,
    headers,
    body: JSON.stringify({ ...(replay.body || {}), [route.approvalKey]: approvalId }),
  });

  const response = await handler(inner, { params: route.params(replay.path.match(route.pattern)!) });
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}
