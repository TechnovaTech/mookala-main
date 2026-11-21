/** Server-side hooks for the artists resources. */
import { registerHooks } from '../resource-hooks';
import { escapeRegex, toObjectId } from '../http';

async function nameTaken(db: any, name: string, exceptId?: any): Promise<boolean> {
  const filter: Record<string, any> = { name: { $regex: '^' + escapeRegex(name.trim()) + '$', $options: 'i' } };
  if (exceptId) filter._id = { $ne: exceptId };
  return Boolean(await db.collection('artistCategories').findOne(filter, { projection: { _id: 1 } }));
}

async function checkParent(db: any, parentId: unknown, selfId?: any): Promise<string | void> {
  if (parentId === undefined || parentId === null || parentId === '') return;
  const oid = toObjectId(String(parentId));
  if (!oid) return 'The parent category is not valid.';
  if (selfId && String(selfId) === String(oid)) return 'A category cannot be its own parent.';
  const parent = await db.collection('artistCategories').findOne({ _id: oid }, { projection: { parentId: 1 } });
  if (!parent) return 'The parent category does not exist.';
  // Two levels only: categories and subcategories.
  if (parent.parentId) return 'Choose a top-level category as the parent. Subcategories cannot have their own subcategories.';
  if (selfId) {
    const children = await db.collection('artistCategories').countDocuments({ parentId: String(selfId) });
    if (children > 0) return 'This category has subcategories, so it cannot become a subcategory itself.';
  }
}

registerHooks('artist-categories', {
  async beforeCreate({ db, doc }) {
    if (typeof doc.name === 'string' && (await nameTaken(db, doc.name))) {
      return 'A category with this name already exists.';
    }
    return checkParent(db, doc.parentId);
  },
  async beforeUpdate({ db, existing, changes }) {
    if (typeof changes.name === 'string' && (await nameTaken(db, changes.name, existing._id))) {
      return 'A category with this name already exists.';
    }
    if ('parentId' in changes) return checkParent(db, changes.parentId, existing._id);
  },
});

export {};
