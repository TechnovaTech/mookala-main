import type { ResourceDef } from '../resource-types';

/**
 * Artist management (requirements section 4).
 *
 * Artist categories and subcategories: a subcategory is a category with a
 * parent. An artist is placed in a category from the artist's own page, which
 * stores the category id in `artists.categoryId` and records the old and new
 * value in the activity log.
 */
export const artistsResources: ResourceDef[] = [
  {
    name: 'artist-categories',
    collection: 'artistCategories',
    module: 'artists',
    title: 'Artist Categories',
    subtitle: 'Categories and subcategories used to group artists for discovery',
    singular: 'Category',
    labelKey: 'name',
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, list: true, search: true },
      {
        key: 'parentId',
        label: 'Parent category',
        type: 'ref',
        ref: { resource: 'artist-categories', labelKey: 'name' },
        list: true,
        filter: true,
        help: 'Leave empty for a top-level category. Choose a parent to make this a subcategory.',
      },
      { key: 'description', label: 'Description', type: 'textarea', search: true },
      {
        key: 'displayOrder',
        label: 'Display order',
        type: 'number',
        default: 0,
        min: 0,
        list: true,
        help: 'Lower numbers are listed first.',
      },
    ],
    status: {
      key: 'status',
      initial: 'active',
      options: [
        { value: 'active', label: 'Active', tone: 'green' },
        { value: 'hidden', label: 'Hidden', tone: 'gray' },
      ],
    },
    defaultSort: { key: 'displayOrder', dir: 1 },
    // Artists point at a category by id, so a category is hidden rather than deleted.
    canDelete: false,
    emptyHint: 'No artist categories yet. Add the first one, then assign artists to it from each artist\'s page.',
  },
];
