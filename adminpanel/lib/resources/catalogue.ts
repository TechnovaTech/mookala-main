import type { FieldDef, ResourceDef } from '../resource-types';

/**
 * Venue, cinema and catalogue lists (requirements sections 5 and 8).
 *
 * Events, venues, categories, banners, sponsored ads and hire professionals
 * have their own screens and routes because the apps read them directly. The
 * lists below are managed entirely through the generic resource screens.
 */

/** Used by /api/genres only while the `genres` collection is empty. */
export const DEFAULT_GENRES = [
  'Rock',
  'Pop',
  'Hip Hop',
  'Jazz',
  'Classical',
  'Electronic',
  'Country',
  'R&B',
  'Reggae',
  'Folk',
  'Blues',
  'Punk',
  'Metal',
  'Indie',
  'Alternative',
];

/** Used by /api/languages only while the `languages` collection is empty. */
export const DEFAULT_LANGUAGES = [
  'Hindi',
  'Bengali',
  'Telugu',
  'Marathi',
  'Tamil',
  'Urdu',
  'Gujarati',
  'Kannada',
  'Odia',
  'Malayalam',
  'Punjabi',
  'Assamese',
  'Maithili',
  'Sanskrit',
  'Konkani',
  'Nepali',
  'Manipuri',
  'Sindhi',
  'Dogri',
  'Kashmiri',
  'Santali',
  'Bodo',
  'English',
];

const CINEMA_NOTE =
  'The mobile apps and website do not sell cinema tickets yet, so nothing creates these records automatically. They are entered and maintained here by the operations team.';

const listFields: FieldDef[] = [
  { key: 'name', label: 'Name', type: 'text', required: true, list: true, search: true },
  {
    key: 'sortOrder',
    label: 'Display order',
    type: 'number',
    min: 0,
    default: 100,
    list: true,
    help: 'Lower numbers are shown first. Entries with the same number are sorted by name.',
  },
];

const listStatus = {
  key: 'status',
  initial: 'active',
  options: [
    { value: 'active', label: 'Active', tone: 'green' as const },
    { value: 'inactive', label: 'Hidden', tone: 'gray' as const },
  ],
};

export const catalogueResources: ResourceDef[] = [
  {
    name: 'cinemas',
    collection: 'cinemas',
    module: 'venues',
    title: 'Cinemas',
    subtitle: 'Cinema halls and their owners, with listing approval',
    singular: 'Cinema',
    labelKey: 'name',
    fields: [
      { key: 'name', label: 'Cinema name', type: 'text', required: true, list: true, search: true },
      { key: 'ownerName', label: 'Owner name', type: 'text', required: true, list: true, search: true },
      { key: 'ownerPhone', label: 'Owner phone', type: 'phone', required: true, list: true, search: true },
      { key: 'ownerEmail', label: 'Owner email', type: 'email', search: true },
      { key: 'city', label: 'City', type: 'text', required: true, list: true, search: true },
      { key: 'state', label: 'State', type: 'text', required: true },
      { key: 'address', label: 'Address', type: 'textarea', required: true },
      { key: 'screens', label: 'Number of screens', type: 'number', required: true, min: 1, max: 100, list: true },
      { key: 'totalSeats', label: 'Total seats', type: 'number', required: true, min: 1, list: true },
      { key: 'gstNumber', label: 'GST number', type: 'text', search: true, placeholder: '22AAAAA0000A1Z5' },
    ],
    status: {
      key: 'status',
      initial: 'pending',
      options: [
        { value: 'pending', label: 'Pending review', tone: 'amber' },
        { value: 'approved', label: 'Approved', tone: 'green' },
        { value: 'rejected', label: 'Rejected', tone: 'red' },
        { value: 'suspended', label: 'Suspended', tone: 'gray' },
      ],
      reasonRequired: ['rejected', 'suspended'],
    },
    defaultSort: { key: 'createdAt', dir: -1 },
    emptyHint: 'No cinemas have been added yet. Use "Add" to record a cinema hall and its owner.',
    sourceNote: CINEMA_NOTE,
  },
  {
    name: 'cinema-shows',
    collection: 'cinemaShows',
    module: 'venues',
    title: 'Cinema Shows',
    subtitle: 'Show schedule, ticket categories, pricing and seat inventory for each cinema',
    singular: 'Show',
    labelKey: 'title',
    fields: [
      {
        key: 'cinemaId',
        label: 'Cinema',
        type: 'ref',
        ref: { resource: 'cinemas', labelKey: 'name' },
        required: true,
        list: true,
        filter: true,
      },
      { key: 'title', label: 'Film or show title', type: 'text', required: true, list: true, search: true },
      { key: 'language', label: 'Language', type: 'text', list: true, search: true },
      { key: 'screen', label: 'Screen', type: 'text', required: true, list: true, placeholder: 'Screen 1' },
      { key: 'showAt', label: 'Show date and time', type: 'datetime', required: true, list: true },
      {
        key: 'ticketCategories',
        label: 'Ticket categories',
        type: 'textarea',
        help: 'One per line, for example "Gold - 250" and "Silver - 180".',
      },
      { key: 'basePrice', label: 'Base price', type: 'money', required: true, list: true },
      { key: 'totalSeats', label: 'Total seats', type: 'number', required: true, min: 1, list: true },
      { key: 'seatsSold', label: 'Seats sold', type: 'number', min: 0, default: 0, list: true },
    ],
    status: {
      key: 'status',
      initial: 'scheduled',
      options: [
        { value: 'scheduled', label: 'Scheduled', tone: 'blue' },
        { value: 'cancelled', label: 'Cancelled', tone: 'red' },
        { value: 'completed', label: 'Completed', tone: 'green' },
      ],
      reasonRequired: ['cancelled'],
    },
    defaultSort: { key: 'showAt', dir: -1 },
    emptyHint: 'No shows have been scheduled. Add a cinema first, then add its shows here.',
    sourceNote: CINEMA_NOTE + ' Seats sold is typed in from the cinema\'s own figures; it is not updated by bookings.',
  },
  {
    name: 'genres',
    collection: 'genres',
    module: 'categories',
    title: 'Genres',
    subtitle: 'Music genres offered to users and artists in the apps',
    singular: 'Genre',
    labelKey: 'name',
    fields: listFields,
    status: listStatus,
    defaultSort: { key: 'sortOrder', dir: 1 },
    emptyHint:
      'This list is empty, so the apps are showing the built-in list of 15 genres. Adding the first genre copies that built-in list here so nothing disappears from the apps; you can then rename, hide or delete entries.',
  },
  {
    name: 'languages',
    collection: 'languages',
    module: 'categories',
    title: 'Languages',
    subtitle: 'Languages an organiser can choose for an event',
    singular: 'Language',
    labelKey: 'name',
    fields: listFields,
    status: listStatus,
    defaultSort: { key: 'sortOrder', dir: 1 },
    emptyHint:
      'This list is empty, so the apps are showing the built-in list of 23 languages. Adding the first language copies that built-in list here so nothing disappears from the apps; you can then rename, hide or delete entries.',
  },
];
