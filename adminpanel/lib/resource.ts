import { NextRequest } from 'next/server';
import { ObjectId, type Db } from 'mongodb';
import { connectToDatabase } from './mongodb';
import { requireAdmin } from './auth';
import { can, normaliseRole, type AdminIdentity } from './permissions';
import { diff, logAudit } from './audit';
import { csvResponse, escapeRegex, fail, ok, toCsv, toObjectId } from './http';
import { MATERIAL_TYPES, normaliseMaterials, type FieldDef, type ResourceDef } from './resource-types';
import { getResource } from './resources';
import { approvalIdFrom, getHooks } from './resource-hooks';

/**
 * Generic, permission-checked CRUD used by /api/admin/r/[resource].
 *
 * Every write is validated against the resource definition, checked against
 * the admin's permissions on the server and written to the audit log.
 */

const MAX_LIMIT = 200;
const EXPORT_LIMIT = 5000;

/** Field types stored as plain text, which a regular expression search can match. */
const TEXT_TYPES = new Set(['text', 'textarea', 'email', 'phone', 'url']);

function formFields(def: ResourceDef): FieldDef[] {
  return def.fields.filter((f) => f.form !== false && !f.readOnly);
}

/** Converts and validates one submitted value. Returns [value, error]. */
function coerce(field: FieldDef, input: any): [any, string | null] {
  let raw = input;
  if ((raw === undefined || raw === null || raw === '') && field.default !== undefined) raw = field.default;
  const empty = raw === undefined || raw === null || raw === '';

  if (empty) {
    if (field.required) return [null, `${field.label} is required`];
    if (field.type === 'boolean') return [false, null];
    if (field.type === 'multiselect' || field.type === 'tags' || field.type === 'materials') return [[], null];
    return [null, null];
  }

  switch (field.type) {
    case 'number':
    case 'money':
    case 'percent': {
      const value = typeof raw === 'number' ? raw : parseFloat(String(raw));
      if (!Number.isFinite(value)) return [null, `${field.label} must be a number`];
      if (field.type === 'percent' && (value < 0 || value > 100)) {
        return [null, `${field.label} must be between 0 and 100`];
      }
      if (field.type === 'money' && value < 0) return [null, `${field.label} cannot be negative`];
      if (field.min !== undefined && value < field.min) return [null, `${field.label} must be at least ${field.min}`];
      if (field.max !== undefined && value > field.max) return [null, `${field.label} must be at most ${field.max}`];
      return [value, null];
    }
    case 'boolean':
      return [raw === true || raw === 'true' || raw === 1 || raw === '1', null];
    case 'date':
    case 'datetime': {
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) return [null, `${field.label} is not a valid date`];
      return [date, null];
    }
    case 'select': {
      const value = String(raw);
      if (field.options && !field.options.some((o) => o.value === value)) {
        return [null, `${field.label} has an unknown value`];
      }
      return [value, null];
    }
    case 'multiselect': {
      const list = (Array.isArray(raw) ? raw : String(raw).split(',')).map((v) => String(v).trim()).filter(Boolean);
      if (field.options && list.some((v) => !field.options!.some((o) => o.value === v))) {
        return [null, `${field.label} has an unknown value`];
      }
      if (field.required && list.length === 0) return [null, `${field.label} is required`];
      return [list, null];
    }
    case 'tags': {
      const list = (Array.isArray(raw) ? raw : String(raw).split(','))
        .map((v) => String(v).trim().slice(0, 80))
        .filter(Boolean)
        .slice(0, 50);
      if (field.required && list.length === 0) return [null, `${field.label} is required`];
      return [list, null];
    }
    case 'email': {
      const value = String(raw).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return [null, `${field.label} is not a valid email`];
      return [value, null];
    }
    case 'phone': {
      const value = String(raw).replace(/[\s\-()]/g, '');
      if (!/^\+?\d{7,15}$/.test(value)) return [null, `${field.label} is not a valid phone number`];
      return [value, null];
    }
    case 'url': {
      const value = String(raw).trim();
      if (!/^https?:\/\/\S+$/i.test(value)) return [null, `${field.label} must start with http:// or https://`];
      return [value.slice(0, 2000), null];
    }
    case 'ref':
      return [String(raw).slice(0, 64), null];
    case 'materials': {
      if (!Array.isArray(raw)) return [null, `${field.label} must be a list`];
      if (raw.length > 100) return [null, `${field.label} can hold at most 100 entries`];
      const list = normaliseMaterials(raw).map((m) => ({
        title: m.title.trim().slice(0, 200),
        type: m.type,
        url: m.url.trim().slice(0, 2000),
      }));
      if (list.length !== raw.length) return [null, `${field.label} has an entry that cannot be read`];
      for (let i = 0; i < list.length; i++) {
        const entry = list[i];
        const where = `${field.label}, entry ${i + 1}`;
        if (!entry.title) return [null, `${where}: a title is required`];
        if (!MATERIAL_TYPES.some((t) => t.value === entry.type)) return [null, `${where}: choose video, document or link`];
        if (!/^https?:\/\/\S+$/i.test(entry.url)) return [null, `${where}: the link must start with http:// or https://`];
      }
      if (field.required && list.length === 0) return [null, `${field.label} is required`];
      return [list, null];
    }
    case 'textarea':
      return [String(raw).slice(0, 20000), null];
    default:
      return [String(raw).trim().slice(0, 2000), null];
  }
}

function validate(def: ResourceDef, body: any, partial: boolean) {
  const data: Record<string, any> = {};
  const errors: string[] = [];

  for (const field of formFields(def)) {
    if (partial && !(field.key in body)) continue;
    const [value, error] = coerce(field, body[field.key]);
    if (error) errors.push(error);
    else data[field.key] = value;
  }

  return { data, errors };
}

function serialise(doc: any) {
  if (!doc) return doc;
  return { ...doc, _id: String(doc._id) };
}

/** Fields of this resource the admin may not see (see FieldDef.viewPermission). */
function hiddenFieldsFor(def: ResourceDef, admin: AdminIdentity): string[] {
  return def.fields
    .filter((f) => Array.isArray(f.viewPermission) && f.viewPermission.length > 0 && !f.viewPermission.some((p) => can(admin, p)))
    .map((f) => f.key);
}

/** Removes hidden values from a record (or an audit entry's before/after) before it leaves the server. */
function maskDoc(doc: any, hidden: string[]) {
  if (!doc || hidden.length === 0) return doc;
  const out: Record<string, any> = { ...doc };
  for (const key of hidden) if (key in out) out[key] = null;
  out._hiddenFields = hidden;
  return out;
}

function maskHistory(entry: any, hidden: string[]) {
  if (!entry || hidden.length === 0) return entry;
  const strip = (value: any) => {
    if (!value || typeof value !== 'object') return value;
    const copy: Record<string, any> = { ...value };
    for (const key of hidden) if (key in copy) copy[key] = '[hidden]';
    return copy;
  };
  return { ...entry, before: strip(entry.before), after: strip(entry.after) };
}

async function attachRefs(db: Db, def: ResourceDef, items: any[]) {
  const refFields = def.fields.filter((f) => f.type === 'ref' && f.ref);
  for (const field of refFields) {
    const target = getResource(field.ref!.resource);
    if (!target) continue;
    const ids = Array.from(new Set(items.map((i) => i[field.key]).filter(Boolean)));
    const objectIds = ids.map((id) => toObjectId(id)).filter(Boolean) as ObjectId[];
    if (objectIds.length === 0) continue;
    const found = await db
      .collection(target.collection)
      .find({ _id: { $in: objectIds } }, { projection: { [field.ref!.labelKey]: 1 } })
      .toArray();
    const labels = new Map(found.map((d) => [String(d._id), d[field.ref!.labelKey]]));
    for (const item of items) {
      item._refs = item._refs || {};
      item._refs[field.key] = labels.get(String(item[field.key])) || null;
    }
  }
}

function buildFilter(def: ResourceDef, params: URLSearchParams, hidden: string[] = []) {
  const filter: Record<string, any> = { ...(def.scope || {}) };

  const status = params.get('status');
  if (status && def.status && def.status.options.some((o) => o.value === status)) {
    filter[def.status.key] = status;
  }

  for (const field of def.fields.filter((f) => f.filter)) {
    const value = params.get('f_' + field.key);
    if (value === null || value === '') continue;
    if (field.type === 'boolean') filter[field.key] = value === 'true';
    else if (field.type === 'multiselect' || field.type === 'tags') filter[field.key] = value;
    else filter[field.key] = value;
  }

  const from = params.get('from');
  const to = params.get('to');
  if (from || to) {
    const range: Record<string, Date> = {};
    if (from && !Number.isNaN(new Date(from).getTime())) range.$gte = new Date(from);
    if (to && !Number.isNaN(new Date(to).getTime())) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      range.$lte = end;
    }
    if (Object.keys(range).length) filter.createdAt = range;
  }

  const q = (params.get('q') || '').trim().slice(0, 100);
  if (q) {
    // A field the admin may not see cannot be used to find records either.
    const searchable = def.fields.filter((f) => f.search && !hidden.includes(f.key)).map((f) => f.key);
    // `qk` adds one more field to search, used by reference pickers whose
    // display field is not part of the screen's own free-text search.
    const extraKey = params.get('qk');
    if (extraKey && !searchable.includes(extraKey) && def.fields.some((f) => f.key === extraKey && TEXT_TYPES.has(f.type))) {
      searchable.push(extraKey);
    }
    const regex = { $regex: escapeRegex(q), $options: 'i' };
    if (searchable.length) filter.$or = searchable.map((key) => ({ [key]: regex }));
  }

  return filter;
}

/** Returns a 403 response when the resource is restricted to Super Admins and the caller is not one. */
function superOnlyBlock(def: ResourceDef, admin: AdminIdentity) {
  if (def.superAdminOnly && normaliseRole(admin.role) !== 'super_admin') {
    return fail('Only a Super Admin can open this.', 403);
  }
  return null;
}

function managePerm(def: ResourceDef): string {
  return def.managePermission || `${def.module}:manage`;
}

function viewPerm(def: ResourceDef): string {
  return def.viewPermission || `${def.module}:view`;
}

function labelOf(def: ResourceDef, doc: any): string {
  return String(doc?.[def.labelKey] ?? doc?._id ?? '');
}

/* ------------------------------------------------------------------ */
/* Collection handlers                                                 */
/* ------------------------------------------------------------------ */

export async function listResource(request: NextRequest, name: string) {
  const def = getResource(name);
  if (!def) return fail('Unknown resource', 404);

  const check = await requireAdmin(request, viewPerm(def));
  if (!check.ok) return check.response;
  const blocked = superOnlyBlock(def, check.admin);
  if (blocked) return blocked;

  try {
    const { db } = await connectToDatabase();
    const params = request.nextUrl.searchParams;
    const hidden = hiddenFieldsFor(def, check.admin);
    const filter = buildFilter(def, params, hidden);
    const collection = db.collection(def.collection);

    const sortKey = params.get('sort') || def.defaultSort?.key || 'createdAt';
    const allowedSort = new Set(['createdAt', 'updatedAt', ...def.fields.map((f) => f.key)]);
    const sort: Record<string, 1 | -1> = {
      [allowedSort.has(sortKey) ? sortKey : 'createdAt']:
        params.get('dir') === 'asc' ? 1 : params.get('dir') === 'desc' ? -1 : def.defaultSort?.dir || -1,
    };

    const exportFormat = params.get('export');
    if (exportFormat === 'csv') {
      const rows = await collection.find(filter).sort(sort).limit(EXPORT_LIMIT).toArray();
      await attachRefs(db, def, rows);
      const columns = [
        ...def.fields.filter((f) => !hidden.includes(f.key)).map((f) => ({ key: f.key, label: f.label })),
        ...(def.status ? [{ key: def.status.key, label: 'Status' }] : []),
        { key: 'createdAt', label: 'Created' },
        { key: 'updatedAt', label: 'Updated' },
      ].filter((c, i, all) => all.findIndex((x) => x.key === c.key) === i);

      const flat = rows.map((row) => {
        const out: Record<string, any> = maskDoc({ ...row }, hidden);
        for (const field of def.fields) {
          if (field.type === 'ref' && row._refs?.[field.key]) out[field.key] = row._refs[field.key];
          if (field.type === 'materials') {
            out[field.key] = normaliseMaterials(row[field.key])
              .map((m) => `${m.title || 'Untitled'} [${m.type}] ${m.url}`)
              .join('; ');
          } else if (Array.isArray(out[field.key])) out[field.key] = out[field.key].join('; ');
        }
        return out;
      });

      await logAudit({
        admin: check.admin,
        action: 'export',
        module: def.module,
        entityType: def.name,
        meta: { rows: rows.length, filter: Object.keys(filter) },
        request,
      });

      const stamp = new Date().toISOString().slice(0, 10);
      return csvResponse(toCsv(flat, columns), `${def.name}-${stamp}.csv`);
    }

    const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(params.get('limit') || '25', 10) || 25));

    const [items, total] = await Promise.all([
      collection.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).toArray(),
      collection.countDocuments(filter),
    ]);

    await attachRefs(db, def, items);

    let statusCounts: Record<string, number> = {};
    if (def.status) {
      const scope = { ...(def.scope || {}) };
      const grouped = await collection
        .aggregate([{ $match: scope }, { $group: { _id: `$${def.status.key}`, count: { $sum: 1 } } }])
        .toArray();
      statusCounts = Object.fromEntries(grouped.map((g) => [String(g._id), g.count]));
    }

    return ok({
      items: items.map((item) => serialise(maskDoc(item, hidden))),
      total,
      page,
      limit,
      statusCounts,
      canManage: can(check.admin, managePerm(def)),
      canApprove: can(check.admin, `${def.module}:approve`),
    });
  } catch (error) {
    console.error(`List ${name} failed:`, error);
    return fail('Failed to load records', 500);
  }
}

export async function createResource(request: NextRequest, name: string) {
  const def = getResource(name);
  if (!def) return fail('Unknown resource', 404);
  if (def.canCreate === false) return fail('Records of this type cannot be created here', 405);

  const check = await requireAdmin(request, managePerm(def));
  if (!check.ok) return check.response;
  const blocked = superOnlyBlock(def, check.admin);
  if (blocked) return blocked;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return fail('Invalid request body');

    const { data, errors } = validate(def, body, false);
    if (errors.length) return fail(errors[0], 400, { errors });

    const { db } = await connectToDatabase();
    const now = new Date();
    const doc: Record<string, any> = {
      ...data,
      ...(def.scope || {}),
      ...(def.status ? { [def.status.key]: def.status.initial } : {}),
      createdAt: now,
      updatedAt: now,
      createdBy: check.admin.email || null,
      updatedBy: check.admin.email || null,
    };

    const hooks = getHooks(name);
    if (hooks.beforeCreate) {
      const problem = await hooks.beforeCreate({ db, doc, admin: check.admin, request, body, approvalId: approvalIdFrom(body) });
      // A hook may answer itself, e.g. 202 when the change was sent for a second approver.
      if (problem instanceof Response) return problem;
      if (problem) return fail(problem);
    }

    const result = await db.collection(def.collection).insertOne(doc);

    if (hooks.afterCreate) {
      try {
        await hooks.afterCreate({ db, item: { ...doc, _id: result.insertedId }, admin: check.admin });
      } catch (error) {
        console.error(`afterCreate hook for ${name} failed:`, error);
      }
    }

    await logAudit({
      admin: check.admin,
      action: 'create',
      module: def.module,
      entityType: def.name,
      entityId: String(result.insertedId),
      entityLabel: labelOf(def, doc),
      after: doc,
      // A form that collects its reason in a "changeReason" field (commission and refund rules) does not send `_reason`.
      reason:
        typeof body._reason === 'string' && body._reason.trim()
          ? body._reason
          : typeof doc.changeReason === 'string' && doc.changeReason.trim()
            ? doc.changeReason
            : null,
      request,
    });

    return ok({ id: String(result.insertedId), item: serialise({ ...doc, _id: result.insertedId }) }, { status: 201 });
  } catch (error) {
    console.error(`Create ${name} failed:`, error);
    return fail('Failed to save the record', 500);
  }
}

/* ------------------------------------------------------------------ */
/* Single record handlers                                              */
/* ------------------------------------------------------------------ */

async function load(db: Db, def: ResourceDef, id: string) {
  const oid = toObjectId(id);
  if (!oid) return null;
  return db.collection(def.collection).findOne({ _id: oid, ...(def.scope || {}) });
}

export async function getResourceItem(request: NextRequest, name: string, id: string) {
  const def = getResource(name);
  if (!def) return fail('Unknown resource', 404);

  const check = await requireAdmin(request, viewPerm(def));
  if (!check.ok) return check.response;
  const blocked = superOnlyBlock(def, check.admin);
  if (blocked) return blocked;

  try {
    const { db } = await connectToDatabase();
    const doc = await load(db, def, id);
    if (!doc) return fail(`${def.singular} not found`, 404);

    await attachRefs(db, def, [doc]);

    const history = await db
      .collection('auditLogs')
      .find({ entityType: def.name, entityId: id })
      .sort({ createdAt: -1 })
      .limit(30)
      .toArray();

    const hidden = hiddenFieldsFor(def, check.admin);
    return ok({
      item: serialise(maskDoc(doc, hidden)),
      history: history.map((entry) => serialise(maskHistory(entry, hidden))),
      canManage: can(check.admin, managePerm(def)),
      canApprove: can(check.admin, `${def.module}:approve`),
    });
  } catch (error) {
    console.error(`Get ${name} failed:`, error);
    return fail('Failed to load the record', 500);
  }
}

export async function updateResourceItem(request: NextRequest, name: string, id: string) {
  const def = getResource(name);
  if (!def) return fail('Unknown resource', 404);
  if (def.canEdit === false) return fail('Records of this type cannot be edited', 405);

  const check = await requireAdmin(request, managePerm(def));
  if (!check.ok) return check.response;
  const blocked = superOnlyBlock(def, check.admin);
  if (blocked) return blocked;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return fail('Invalid request body');

    const { db } = await connectToDatabase();
    const existing = await load(db, def, id);
    if (!existing) return fail(`${def.singular} not found`, 404);

    const { data, errors } = validate(def, body, true);
    if (errors.length) return fail(errors[0], 400, { errors });

    const reason = typeof body._reason === 'string' ? body._reason.trim().slice(0, 500) : '';
    const hooks = getHooks(name);
    if (hooks.beforeUpdate) {
      const problem = await hooks.beforeUpdate({ db, existing, changes: data, admin: check.admin, reason, request, body, approvalId: approvalIdFrom(body) });
      if (problem instanceof Response) return problem;
      if (problem) return fail(problem);
    }

    const changes = diff(existing, { ...existing, ...data });
    if (Object.keys(changes.after).length === 0) return ok({ item: serialise(existing), unchanged: true });

    await db
      .collection(def.collection)
      .updateOne({ _id: existing._id }, { $set: { ...data, updatedAt: new Date(), updatedBy: check.admin.email || null } });

    await logAudit({
      admin: check.admin,
      action: 'update',
      module: def.module,
      entityType: def.name,
      entityId: id,
      entityLabel: labelOf(def, { ...existing, ...data }),
      before: changes.before,
      after: changes.after,
      reason: reason || null,
      request,
    });

    const updated = await load(db, def, id);
    return ok({ item: serialise(updated) });
  } catch (error) {
    console.error(`Update ${name} failed:`, error);
    return fail('Failed to save the record', 500);
  }
}

/**
 * PATCH supports two actions:
 *   { status, reason }        -> moves the record through its status workflow
 *   { note }                  -> adds an internal note to the record's history
 */
export async function patchResourceItem(request: NextRequest, name: string, id: string) {
  const def = getResource(name);
  if (!def) return fail('Unknown resource', 404);

  const check = await requireAdmin(request, managePerm(def));
  if (!check.ok) return check.response;
  const blocked = superOnlyBlock(def, check.admin);
  if (blocked) return blocked;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return fail('Invalid request body');

    const { db } = await connectToDatabase();
    const existing = await load(db, def, id);
    if (!existing) return fail(`${def.singular} not found`, 404);

    const collection = db.collection(def.collection);

    if (typeof body.note === 'string' && body.note.trim()) {
      const note = {
        text: body.note.trim().slice(0, 4000),
        by: check.admin.email || null,
        byName: check.admin.name || null,
        at: new Date(),
      };
      await collection.updateOne({ _id: existing._id }, { $push: { notes: note } as any, $set: { updatedAt: new Date() } });
      const noteHooks = getHooks(name);
      if (noteHooks.afterNote) {
        try {
          await noteHooks.afterNote({ db, item: existing, note, admin: check.admin });
        } catch (error) {
          console.error(`afterNote hook for ${name} failed:`, error);
        }
      }
      await logAudit({
        admin: check.admin,
        action: 'note',
        module: def.module,
        entityType: def.name,
        entityId: id,
        entityLabel: labelOf(def, existing),
        after: { note: note.text },
        request,
      });
      return ok({ item: serialise(await load(db, def, id)) });
    }

    if (typeof body.status === 'string') {
      if (!def.status) return fail('This record has no status');
      const next = body.status;
      if (!def.status.options.some((o) => o.value === next)) return fail('Unknown status');

      const previous = existing[def.status.key];
      if (previous === next) return ok({ item: serialise(existing), unchanged: true });

      const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';
      if (def.status.reasonRequired?.includes(next) && !reason) {
        return fail('A reason is required for this change');
      }

      if (def.status.approvalRequired?.includes(next) && !can(check.admin, `${def.module}:approve`)) {
        return fail('This change needs an approver for this module.', 403);
      }

      // Nobody approves their own work, unless nobody else could approve it
      // (otherwise a panel with a single approver could never approve anything).
      if (def.status.approvalRequired?.includes(next) && existing.createdBy && existing.createdBy === check.admin.email) {
        const approvePermission = `${def.module}:approve`;
        const admins = await db
          .collection('admins')
          .find({ status: { $ne: 'disabled' }, email: { $ne: check.admin.email } }, { projection: { role: 1, extraPermissions: 1 } })
          .toArray();
        const otherApprover = admins.some((a) => can({ role: a.role, perms: Array.isArray(a.extraPermissions) ? a.extraPermissions : [] }, approvePermission));
        if (otherApprover) {
          return fail('You created this record, so a different admin who can approve must approve it.', 403);
        }
      }

      const hooks = getHooks(name);
      const extra: Record<string, any> = {};
      if (hooks.beforeStatusChange) {
        const outcome = await hooks.beforeStatusChange({
          db,
          existing,
          from: previous,
          to: next,
          admin: check.admin,
          reason,
          request,
          body,
          approvalId: approvalIdFrom(body),
        });
        if (outcome instanceof Response) return outcome;
        if (typeof outcome === 'string') return fail(outcome, 409);
        if (outcome && typeof outcome === 'object') Object.assign(extra, outcome);
      }

      // `status` in `extra` lets a hook divert the change, e.g. to "awaiting second approval".
      const finalStatus = typeof extra.__status === 'string' ? extra.__status : next;
      delete extra.__status;

      await collection.updateOne(
        { _id: existing._id },
        {
          $set: {
            [def.status.key]: finalStatus,
            statusReason: reason || null,
            statusChangedAt: new Date(),
            statusChangedBy: check.admin.email || null,
            updatedAt: new Date(),
            updatedBy: check.admin.email || null,
            ...extra,
          },
        }
      );

      await logAudit({
        admin: check.admin,
        action: 'status_change',
        module: def.module,
        entityType: def.name,
        entityId: id,
        entityLabel: labelOf(def, existing),
        // Fields a hook stored with the change (e.g. an approved price or a
        // completion date) are part of the same audited change.
        before: {
          [def.status.key]: previous,
          ...Object.fromEntries(Object.keys(extra).map((key) => [key, existing[key] ?? null])),
        },
        after: { [def.status.key]: finalStatus, ...extra },
        reason: reason || null,
        request,
      });

      const updated = await load(db, def, id);
      if (hooks.afterStatusChange) {
        // The status is already saved: a failing follow-up step is logged, not turned into an error.
        try {
          await hooks.afterStatusChange({ db, item: updated, from: previous, to: finalStatus, admin: check.admin });
        } catch (error) {
          console.error(`afterStatusChange hook for ${name} failed:`, error);
        }
      }

      return ok({ item: serialise(updated), status: finalStatus });
    }

    return fail('Nothing to change');
  } catch (error) {
    console.error(`Patch ${name} failed:`, error);
    return fail('Failed to update the record', 500);
  }
}

export async function deleteResourceItem(request: NextRequest, name: string, id: string) {
  const def = getResource(name);
  if (!def) return fail('Unknown resource', 404);
  if (def.canDelete === false) return fail('Records of this type cannot be deleted', 405);

  const check = await requireAdmin(request, managePerm(def));
  if (!check.ok) return check.response;
  const blocked = superOnlyBlock(def, check.admin);
  if (blocked) return blocked;

  try {
    const { db } = await connectToDatabase();
    const existing = await load(db, def, id);
    if (!existing) return fail(`${def.singular} not found`, 404);

    const body = await request.json().catch(() => ({}));
    const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) : '';

    const hooks = getHooks(name);
    if (hooks.beforeDelete) {
      const problem = await hooks.beforeDelete({ db, existing, admin: check.admin, reason, request, body, approvalId: approvalIdFrom(body) });
      if (problem instanceof Response) return problem;
      if (problem) return fail(problem);
    }

    await db.collection(def.collection).deleteOne({ _id: existing._id });

    await logAudit({
      admin: check.admin,
      action: 'delete',
      module: def.module,
      entityType: def.name,
      entityId: id,
      entityLabel: labelOf(def, existing),
      before: existing,
      reason: reason || null,
      request,
    });

    return ok({});
  } catch (error) {
    console.error(`Delete ${name} failed:`, error);
    return fail('Failed to delete the record', 500);
  }
}

export type HookAdmin = AdminIdentity;
