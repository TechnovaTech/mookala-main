const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

const uri = 'mongodb+srv://Vercel-Admin-investment-manager:S3lAmtlYEjaYMfPC@investment-manager.otkh4mu.mongodb.net/?retryWrites=true&w=majority';
const dbName = 'mookalaa';

async function initAdmin() {
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    const db = client.db(dbName);
    
    const hashedPassword = await bcrypt.hash('Admin@123', 10);
    
    const admin = {
      email: 'admin@mookalaa.com',
      password: hashedPassword,
      role: 'admin',
      createdAt: new Date()
    };
    
    await db.collection('admins').createIndex({ email: 1 }, { unique: true });
    
    const result = await db.collection('admins').replaceOne(
      { email: admin.email },
      admin,
      { upsert: true }
    );
    
    console.log('Admin user initialized:', result.upsertedId ? 'Created' : 'Updated');
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.close();
  }
}

initAdmin();