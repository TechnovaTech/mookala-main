import { connectToDatabase } from '@/lib/mongodb';
import { fail, ok } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * Greeting categories for the apps and website: active categories only, with
 * the number of templates on sale in each. Public fields only.
 */
export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const [categories, counts] = await Promise.all([
      db
        .collection('greetingCategories')
        .find({ status: 'active' }, { projection: { name: 1, description: 1, sortOrder: 1 } })
        .toArray(),
      db
        .collection('greetingTemplates')
        .aggregate([{ $match: { status: 'approved' } }, { $group: { _id: '$category', count: { $sum: 1 } } }])
        .toArray(),
    ]);
    const onSale = new Map(counts.map((c) => [String(c._id), c.count as number]));

    return ok({
      categories: categories
        .map((category) => ({
          id: String(category._id),
          name: String(category.name || ''),
          description: category.description ? String(category.description) : '',
          sortOrder: typeof category.sortOrder === 'number' ? category.sortOrder : null,
          templates: onSale.get(String(category._id)) || 0,
        }))
        .sort((a, b) => (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name)),
    });
  } catch (error) {
    console.error('Public greeting categories failed:', error);
    return fail('Greeting categories are unavailable', 500);
  }
}
