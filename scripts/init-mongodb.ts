import { getDb, closeDb } from "../server/db";

try {
  const db = await getDb();
  if (!db) throw new Error("MONGODB_URI is not configured");
  console.log(`[MongoDB] Connected to ${db.databaseName}; indexes are ready.`);
} finally {
  await closeDb();
}
