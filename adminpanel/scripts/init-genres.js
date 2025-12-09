const { MongoClient } = require('mongodb');

const uri = 'mongodb://localhost:27017';
const dbName = 'mookalaa';

const genres = [
  'Rock', 'Pop', 'Hip Hop', 'Jazz', 'Classical', 'Electronic',
  'Country', 'R&B', 'Reggae', 'Folk', 'Blues', 'Punk',
  'Metal', 'Indie', 'Alternative', 'Bollywood', 'Punjabi'
];

async function initGenres() {
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    const db = client.db(dbName);
    
    await db.collection('genres').deleteMany({});
    
    const genreDocuments = genres.map(name => ({
      name,
      createdAt: new Date()
    }));
    
    await db.collection('genres').insertMany(genreDocuments);
    
    console.log('Genres initialized successfully');
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.close();
  }
}

initGenres();