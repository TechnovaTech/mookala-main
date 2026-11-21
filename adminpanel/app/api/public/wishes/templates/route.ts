import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { fail, ok, toObjectId } from '@/lib/http';

export const dynamic = 'force-dynamic';

const TYPES = ['image', 'video', 'audio', 'text'];

/**
 * Greeting templates on sale, for the apps and website: approved templates in
 * an active category, with category, price and preview. Public fields only:
 * no approval details, internal notes or admin names.
 *
 *   ?category=<category id>   only that category
 *   ?type=image|video|audio|text
 *   ?id=<template id>         one template (404 when it is not on sale)
 *   ?page=1&limit=50          limit is capped at 100
 *
 * There is deliberately no public endpoint that creates an order: an order
 * must only be created against a payment verified with the gateway.
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const { db } = await connectToDatabase();

    const categories = await db
      .collection('greetingCategories')
      .find({ status: 'active' }, { projection: { name: 1 } })
      .toArray();
    const categoryName = new Map(categories.map((c) => [String(c._id), String(c.name || '')]));

    const filter: Record<string, any> = { status: 'approved', category: { $in: Array.from(categoryName.keys()) } };

    const category = params.get('category');
    if (category) {
      if (!toObjectId(category)) return fail('Unknown category');
      // A hidden or unknown category has nothing on sale.
      filter.category = categoryName.has(category) ? category : { $in: [] };
    }
    const type = params.get('type');
    if (type) {
      if (!TYPES.includes(type)) return fail('Unknown template type');
      filter.type = type;
    }
    const id = params.get('id');
    if (id) {
      const oid = toObjectId(id);
      if (!oid) return fail('Template not found', 404);
      filter._id = oid;
    }

    const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(params.get('limit') || '50', 10) || 50));

    const [templates, total] = await Promise.all([
      db
        .collection('greetingTemplates')
        .find(filter, { projection: { title: 1, category: 1, occasion: 1, language: 1, type: 1, previewUrl: 1, price: 1 } })
        .sort({ title: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      db.collection('greetingTemplates').countDocuments(filter),
    ]);

    const items = templates.map((template) => ({
      id: String(template._id),
      title: String(template.title || ''),
      categoryId: String(template.category || ''),
      category: categoryName.get(String(template.category)) || '',
      occasion: template.occasion ? String(template.occasion) : '',
      language: template.language ? String(template.language) : '',
      type: String(template.type || ''),
      previewUrl: template.previewUrl ? String(template.previewUrl) : null,
      price: Number(template.price) || 0,
      currency: 'INR',
    }));

    if (id) {
      if (items.length === 0) return fail('Template not found', 404);
      return ok({ template: items[0] });
    }
    return ok({ templates: items, total, page, limit });
  } catch (error) {
    console.error('Public greeting templates failed:', error);
    return fail('Greeting templates are unavailable', 500);
  }
}
