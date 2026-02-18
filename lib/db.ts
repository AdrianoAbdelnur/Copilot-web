import mongoose from 'mongoose';

const DATABASE_URL = process.env.DATABASE_URL;

let cached = (global as any).mongoose;
if (!cached) cached = (global as any).mongoose = { conn: null, promise: null };

export async function connectDB() {
  if (!DATABASE_URL) throw new Error('Missing DATABASE_URL');
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose.connect(DATABASE_URL, { bufferCommands: false });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

