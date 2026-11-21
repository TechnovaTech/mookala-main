/**
 * Creates a Super Admin for local development and testing.
 *
 *   MONGODB_URI=... DATABASE_NAME=... ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/seed-local.js
 *
 * Reads .env.local when the variables are not already set. It refuses to run
 * against a remote database unless ALLOW_REMOTE_SEED=true is passed, so it
 * cannot overwrite a production admin by accident.
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

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const dbName = process.env.DATABASE_NAME || 'mookalaa';
const email = (process.env.ADMIN_EMAIL || 'admin@mookalaa.com').toLowerCase();
const password = process.env.ADMIN_PASSWORD;

async function main() {
  const isLocal = /^mongodb:\/\/(127\.0\.0\.1|localhost)/.test(uri);
  if (!isLocal && process.env.ALLOW_REMOTE_SEED !== 'true') {
    console.error('Refusing to seed a remote database. Pass ALLOW_REMOTE_SEED=true if this is intended.');
    process.exit(1);
  }
  if (!password) {
    console.error('Set ADMIN_PASSWORD to the password the admin should sign in with.');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  await db.collection('admins').createIndex({ email: 1 }, { unique: true });
  const existing = await db.collection('admins').findOne({ email });

  if (existing) {
    console.log(`Admin ${email} already exists. Nothing was changed.`);
  } else {
    await db.collection('admins').insertOne({
      email,
      name: 'Super Admin',
      password: await bcrypt.hash(password, 12),
      role: 'super_admin',
      status: 'active',
      mustChangePassword: !isLocal,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log(`Created Super Admin ${email} in database "${dbName}".`);
  }

  await client.close();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
