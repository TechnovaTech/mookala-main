/**
 * Creates the first Super Admin account.
 *
 *   MONGODB_URI=... DATABASE_NAME=... ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/init-admin.js
 *
 * - MONGODB_URI and DATABASE_NAME are read from the environment, or from
 *   .env.local when they are not already set.
 * - ADMIN_EMAIL and ADMIN_PASSWORD must be supplied. There is no default
 *   password.
 * - The account is created only when no admin with that email exists. An
 *   existing admin is never changed: its password, role and status are left
 *   exactly as they are. Use "Reset password" in Security > Admins & Roles for
 *   an existing account.
 * - ADMIN_NAME is optional.
 */
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

const envFile = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
  }
}

const uri = process.env.MONGODB_URI;
const dbName = process.env.DATABASE_NAME;
const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || '';
const name = (process.env.ADMIN_NAME || 'Super Admin').trim();

/** The same rules as lib/password.ts. */
function passwordProblem(value) {
  if (value.length < 10) return 'ADMIN_PASSWORD must be at least 10 characters long.';
  if (value.length > 128) return 'ADMIN_PASSWORD is too long.';
  if (!/[a-z]/.test(value) || !/[A-Z]/.test(value)) return 'ADMIN_PASSWORD must contain both upper and lower case letters.';
  if (!/[0-9]/.test(value)) return 'ADMIN_PASSWORD must contain a number.';
  if (!/[^A-Za-z0-9]/.test(value)) return 'ADMIN_PASSWORD must contain a symbol.';
  return null;
}

async function main() {
  const missing = [];
  if (!uri) missing.push('MONGODB_URI');
  if (!dbName) missing.push('DATABASE_NAME');
  if (!email) missing.push('ADMIN_EMAIL');
  if (!password) missing.push('ADMIN_PASSWORD');
  if (missing.length) {
    console.error(`Nothing was changed. Set ${missing.join(', ')} and run the script again.`);
    process.exit(1);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    console.error('Nothing was changed. ADMIN_EMAIL is not a valid email address.');
    process.exit(1);
  }
  const problem = passwordProblem(password);
  if (problem) {
    console.error(`Nothing was changed. ${problem}`);
    process.exit(1);
  }

  const isLocal = /^mongodb:\/\/(127\.0\.0\.1|localhost)/.test(uri);
  const host = uri.replace(/\/\/[^@/]*@/, '//').replace(/\?.*$/, '');
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(dbName);
    const admins = db.collection('admins');

    await admins.createIndex({ email: 1 }, { unique: true });
    const existing = await admins.findOne({ email }, { projection: { role: 1, status: 1 } });

    if (existing) {
      console.log(
        `Admin ${email} already exists in database "${dbName}" (role: ${existing.role || 'none'}, status: ${existing.status || 'active'}). Nothing was changed; its password was not touched.`
      );
      return;
    }

    const now = new Date();
    await admins.insertOne({
      email,
      name,
      password: await bcrypt.hash(password, 12),
      role: 'super_admin',
      status: 'active',
      // On a shared or production database the first sign-in must replace this password.
      mustChangePassword: !isLocal,
      twoFactorEnabled: false,
      createdAt: now,
      updatedAt: now,
    });

    console.log(`Created Super Admin ${email} in database "${dbName}" at ${host}.`);
    if (!isLocal) console.log('The account must choose a new password at its first sign-in.');
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error('Nothing more was changed. ' + error.message);
  process.exit(1);
});
