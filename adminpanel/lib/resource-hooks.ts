import type { Db } from 'mongodb';
import type { NextRequest } from 'next/server';
import type { AdminIdentity } from './permissions';

/**
 * Server-only behaviour attached to a resource. Kept apart from the resource
 * definitions because those are plain data that is also sent to the browser.
 *
 * A hook that returns a string rejects the action with that message.
 *
 * A `before*` hook may also return a ready `Response` (for example the 202
 * "sent for approval" answer from lib/approvals.ts). Nothing is written and
 * that response is sent back as it is.
 *
 * Every `before*` hook also receives the incoming `request`, the parsed
 * request `body` and the `approvalId` sent with it (`_approvalId` in the body),
 * so a hook can hold a change for a second approver and recognise the
 * approved re-submission. These three are optional so existing hooks keep
 * working unchanged.
 */
export interface HookRequestContext {
  request?: NextRequest;
  body?: Record<string, any> | null;
  approvalId?: string | null;
}

export type HookOutcome = string | Response | void;

export interface ResourceHooks {
  beforeCreate?: (ctx: { db: Db; doc: Record<string, any>; admin: AdminIdentity } & HookRequestContext) => Promise<HookOutcome> | HookOutcome;
  /** Runs after a new record has been saved. Failures are logged and never undo the save. */
  afterCreate?: (ctx: { db: Db; item: any; admin: AdminIdentity }) => Promise<void> | void;
  beforeUpdate?: (
    ctx: {
      db: Db;
      existing: any;
      changes: Record<string, any>;
      admin: AdminIdentity;
      reason: string;
    } & HookRequestContext
  ) => Promise<HookOutcome> | HookOutcome;
  /**
   * May return extra fields to store with the status change. Returning
   * `{ __status: 'x' }` stores status "x" instead of the requested one.
   */
  beforeStatusChange?: (
    ctx: {
      db: Db;
      existing: any;
      from: string;
      to: string;
      admin: AdminIdentity;
      reason: string;
    } & HookRequestContext
  ) => Promise<HookOutcome | Record<string, any>> | HookOutcome | Record<string, any>;
  /** Runs before a record is deleted. Returning a string refuses the deletion. */
  beforeDelete?: (ctx: { db: Db; existing: any; admin: AdminIdentity; reason: string } & HookRequestContext) => Promise<HookOutcome> | HookOutcome;
  afterStatusChange?: (ctx: { db: Db; item: any; from: string; to: string; admin: AdminIdentity }) => Promise<void> | void;
}

const registry: Record<string, ResourceHooks> = {};

export function registerHooks(name: string, hooks: ResourceHooks) {
  registry[name] = { ...(registry[name] || {}), ...hooks };
}

export function getHooks(name: string): ResourceHooks {
  return registry[name] || {};
}

/** The approval id sent with a re-submission of a held change, or null. */
export function approvalIdFrom(body: any): string | null {
  const value = body && typeof body === 'object' ? body._approvalId : null;
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 40) : null;
}
