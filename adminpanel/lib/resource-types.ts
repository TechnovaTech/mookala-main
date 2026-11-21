/**
 * Shared, serialisable description of an admin "resource": one MongoDB
 * collection with a list, a detail view, create/edit, a status workflow,
 * filters and export. The same definition drives the generic API
 * (/api/admin/r/[resource]) and the generic screen (components/ResourcePage).
 *
 * Definitions must stay plain data, with no functions, because they are sent
 * to the browser. Server-only behaviour lives in lib/resource-hooks.ts.
 */

import type { Module } from './permissions';

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'money'
  | 'percent'
  | 'select'
  | 'multiselect'
  | 'tags'
  | 'date'
  | 'datetime'
  | 'boolean'
  | 'email'
  | 'phone'
  | 'url'
  | 'ref'
  /** An ordered list of learning materials, each { title, type, url }. */
  | 'materials';

export const MATERIAL_TYPES: Option[] = [
  { value: 'video', label: 'Video', tone: 'purple' },
  { value: 'document', label: 'Document', tone: 'blue' },
  { value: 'link', label: 'Link', tone: 'gray' },
];

export interface Material {
  title: string;
  type: string;
  url: string;
}

/**
 * Reads a stored `materials` value. Older records hold a bare list of links;
 * each of those becomes an untitled material of type "link".
 */
export function normaliseMaterials(value: unknown): Material[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === 'string') return { title: '', type: 'link', url: entry };
      if (entry && typeof entry === 'object') {
        const e = entry as Record<string, unknown>;
        return { title: String(e.title ?? ''), type: String(e.type ?? 'link'), url: String(e.url ?? '') };
      }
      return null;
    })
    .filter(Boolean) as Material[];
}

export type Tone = 'gray' | 'green' | 'amber' | 'red' | 'blue' | 'purple';

export interface Option {
  value: string;
  label: string;
  tone?: Tone;
}

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  /**
   * Personal or financial data that not every role reading this screen may
   * see. An admin needs at least one of these permissions to see the value;
   * otherwise it is removed on the server from lists, details, history and
   * exports, and cannot be searched. Example: ['users:view', 'finance:view'].
   */
  viewPermission?: string[];
  required?: boolean;
  options?: Option[];
  /** Show as a column in the list. */
  list?: boolean;
  /** Show in the create/edit form. Defaults to true. */
  form?: boolean;
  /** Offer as a filter above the list (select, boolean and ref fields). */
  filter?: boolean;
  /** Include in the free-text search. */
  search?: boolean;
  /** Set by the server; shown in the detail view but never editable. */
  readOnly?: boolean;
  help?: string;
  placeholder?: string;
  default?: any;
  min?: number;
  max?: number;
  /**
   * For `ref` fields: the resource to pick from and the field to display.
   * `filter` narrows the records offered in the picker, using the list API's
   * own query parameters, e.g. { status: 'approved' } or { f_mode: 'live' }.
   * It only narrows what is offered; rules are enforced by server hooks.
   */
  ref?: { resource: string; labelKey: string; filter?: Record<string, string> };
}

export interface StatusDef {
  key: string;
  options: Option[];
  /** Value given to a new record. */
  initial: string;
  /** Status values that can only be set with a written reason. */
  reasonRequired?: string[];
  /** Status values that need the module's `approve` permission. */
  approvalRequired?: string[];
}

export interface ResourceDef {
  /** URL-safe id, e.g. "coupons". */
  name: string;
  collection: string;
  module: Module;
  title: string;
  subtitle: string;
  singular: string;
  /** Field shown as the record's name in logs and headings. */
  labelKey: string;
  fields: FieldDef[];
  status?: StatusDef;
  defaultSort?: { key: string; dir: 1 | -1 };
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  /** Always applied to list queries, e.g. { kind: 'complaint' }. Also set on create. */
  scope?: Record<string, string | number | boolean>;
  /**
   * Permission needed to change these records when it is not `<module>:manage`.
   * Example: advertiser invoices live in the ads module, but only Finance records payments.
   */
  managePermission?: string;
  /** Permission needed to read these records when it is not `<module>:view`. */
  viewPermission?: string;
  /** Only a Super Admin may read or change these records. */
  superAdminOnly?: boolean;
  /** Shown when the list is empty. */
  emptyHint?: string;
  /**
   * Explains where the records come from when nothing in the admin panel
   * creates them, e.g. "Created by the mobile app when a user ...".
   */
  sourceNote?: string;
}
