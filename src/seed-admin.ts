import * as mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

dotenv.config();

async function seed(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  const conn = await mongoose.connect(uri);
  const db = conn.connection.db!;
  const users = db.collection('users');
  const email = 'admin@vepaw.pk';
  const existing = await users.findOne({ email, role: 'admin' });

  if (existing) {
    console.log('Admin user already exists:', email);
  } else {
    const hashed = await bcrypt.hash('admin123', 10);
    await users.insertOne({
      phone: '00000000000',
      name: 'Platform Admin',
      email,
      password: hashed,
      gender: null,
      profilePhoto: null,
      city: 'Lahore',
      area: '',
      fcmToken: null,
      language: 'en',
      role: 'admin',
      pets: [],
      privacy: { locationEnabled: true, showReviews: true, personalised: true },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log('Admin user created:', email, '/ password: admin123');
  }

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
