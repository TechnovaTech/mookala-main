/** Server-side hooks for the catalogue resources. */
import type { Db } from 'mongodb';
import { registerHooks } from '../resource-hooks';
import { escapeRegex, toObjectId } from '../http';
import { DEFAULT_GENRES, DEFAULT_LANGUAGES } from './catalogue';

/* ---- cinemas -------------------------------------------------------- */

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;

function cinemaProblem(doc: Record<string, any>): string | void {
  if (doc.gstNumber) {
    doc.gstNumber = String(doc.gstNumber).toUpperCase().replace(/\s/g, '');
    if (!GSTIN.test(doc.gstNumber)) return 'GST number is not valid. It has 15 characters, for example 22AAAAA0000A1Z5.';
  }
  for (const key of ['screens', 'totalSeats']) {
    if (key in doc && doc[key] !== null && !Number.isInteger(doc[key])) return 'Screens and seats must be whole numbers';
  }
}

registerHooks('cinemas', {
  beforeCreate: ({ doc }) => cinemaProblem(doc),
  beforeUpdate: ({ changes }) => cinemaProblem(changes),
  beforeStatusChange: ({ to, admin }) => ({
    reviewedBy: admin.email || null,
    reviewedAt: new Date(),
    ...(to === 'approved' ? { approvedAt: new Date() } : {}),
  }),
});

/* ---- cinema shows --------------------------------------------------- */

async function showProblem(db: Db, merged: Record<string, any>, changed: Record<string, any>): Promise<string | void> {
  if ('cinemaId' in changed) {
    const cinemaId = toObjectId(merged.cinemaId);
    const cinema = cinemaId ? await db.collection('cinemas').findOne({ _id: cinemaId }, { projection: { status: 1 } }) : null;
    if (!cinema) return 'Choose a cinema from the list';
    if (cinema.status === 'rejected' || cinema.status === 'suspended') {
      return 'This cinema is rejected or suspended, so shows cannot be scheduled for it';
    }
  }
  const total = Number(merged.totalSeats) || 0;
  const sold = Number(merged.seatsSold) || 0;
  if (!Number.isInteger(total) || !Number.isInteger(sold)) return 'Seats must be whole numbers';
  if (sold > total) return `Seats sold (${sold}) cannot be more than total seats (${total})`;
}

registerHooks('cinema-shows', {
  beforeCreate: ({ db, doc }) => showProblem(db, doc, doc),
  beforeUpdate: ({ db, existing, changes }) => showProblem(db, { ...existing, ...changes }, changes),
});

/* ---- genres and languages ------------------------------------------- */

function managedList(resource: string, collection: string, defaults: string[]) {
  const duplicate = async (db: Db, name: string, exceptId?: any) => {
    const found = await db.collection(collection).findOne({
      name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' },
      ...(exceptId ? { _id: { $ne: exceptId } } : {}),
    });
    return Boolean(found);
  };

  registerHooks(resource, {
    beforeCreate: async ({ db, doc, admin }) => {
      const name = String(doc.name || '').trim();
      doc.name = name;

      // The apps fall back to the built-in list only while this collection is
      // empty. Copy it in before the first entry so the apps keep every option.
      if ((await db.collection(collection).countDocuments({})) === 0) {
        const now = new Date();
        const seed = defaults
          .filter((entry) => entry.toLowerCase() !== name.toLowerCase())
          .map((entry, index) => ({
            name: entry,
            sortOrder: (index + 1) * 10,
            status: 'active',
            createdAt: now,
            updatedAt: now,
            createdBy: admin.email || null,
            updatedBy: admin.email || null,
            seeded: true,
          }));
        if (seed.length) await db.collection(collection).insertMany(seed);
      }

      if (await duplicate(db, name)) return `"${name}" is already in the list`;
    },
    beforeUpdate: async ({ db, existing, changes }) => {
      if (typeof changes.name === 'string') {
        changes.name = changes.name.trim();
        if (await duplicate(db, changes.name, existing._id)) return `"${changes.name}" is already in the list`;
      }
    },
  });
}

managedList('genres', 'genres', DEFAULT_GENRES);
managedList('languages', 'languages', DEFAULT_LANGUAGES);

export {};
