import { MongoClient, type Collection, type Db } from "mongodb";
import type {
  InsertUser,
  KeyActivation,
  KeyStatus,
  LicenseKey,
  User,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

type Counter = { _id: string; value: number };

let client: MongoClient | null = null;
let databasePromise: Promise<Db> | null = null;
let indexesReady: Promise<void> | null = null;

async function ensureIndexes(db: Db) {
  await Promise.all([
    db.collection<User>("users").createIndex({ openId: 1 }, { unique: true }),
    db.collection<LicenseKey>("licenseKeys").createIndex({ key: 1 }, { unique: true }),
    db.collection<LicenseKey>("licenseKeys").createIndex({ status: 1, createdAt: -1 }),
    db.collection<KeyActivation>("keyActivations").createIndex({ keyId: 1, createdAt: -1 }),
    db.collection<KeyActivation>("keyActivations").createIndex({ fingerprint: 1 }),
    db.collection<KeyActivation>("keyActivations").createIndex({ keyId: 1, fingerprint: 1 }, { unique: true }),
  ]);
}

export async function getDb(): Promise<Db | null> {
  if (!ENV.mongodbUri) return null;
  if (!databasePromise) {
    client = new MongoClient(ENV.mongodbUri, {
      appName: "keyforge",
      maxPoolSize: 20,
      serverSelectionTimeoutMS: 8_000,
      connectTimeoutMS: 8_000,
    });
    databasePromise = client.connect().then(async connected => {
      const db = connected.db(ENV.mongodbDbName || undefined);
      indexesReady = ensureIndexes(db);
      await indexesReady;
      return db;
    }).catch(error => {
      databasePromise = null;
      client = null;
      console.error("[Database] MongoDB connection failed:", error instanceof Error ? error.message : error);
      throw error;
    });
  }
  return databasePromise;
}

export async function closeDb() {
  await client?.close();
  client = null;
  databasePromise = null;
  indexesReady = null;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("MongoDB is not configured. Set MONGODB_URI.");
  if (indexesReady) await indexesReady;
  return db;
}

async function nextId(db: Db, sequence: string) {
  const result = await db.collection<Counter>("counters").findOneAndUpdate(
    { _id: sequence },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: "after" },
  );
  if (!result) throw new Error(`Could not allocate id for ${sequence}`);
  return result.value;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await requireDb();
  const now = new Date();
  const values: User = {
    id: user.id ?? await nextId(db, "users"),
    openId: user.openId,
    name: user.name ?? null,
    email: user.email ?? null,
    loginMethod: user.loginMethod ?? null,
    role: user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user"),
    createdAt: user.createdAt ?? now,
    updatedAt: now,
    lastSignedIn: user.lastSignedIn ?? now,
  };
  await db.collection<User>("users").updateOne(
    { openId: user.openId },
    { $set: { ...values, updatedAt: now }, $setOnInsert: { createdAt: values.createdAt } },
    { upsert: true },
  );
}

export async function getUserByOpenId(openId: string) {
  const db = await requireDb();
  return db.collection<User>("users").findOne({ openId });
}

export function getKeyStatus(key: Pick<LicenseKey, "status" | "usedCount" | "maxUses" | "expiresAt">, now = new Date()): KeyStatus {
  if (key.status === "revoked") return "revoked";
  if (key.expiresAt && key.expiresAt.getTime() <= now.getTime()) return "expired";
  if (key.usedCount >= key.maxUses) return "exhausted";
  if (key.usedCount > 0) return "active";
  return "unactivated";
}

export async function listLicenseKeys() {
  const db = await requireDb();
  return db.collection<LicenseKey>("licenseKeys").find({}).sort({ createdAt: -1 }).toArray();
}

export async function getLicenseKeyById(id: number): Promise<LicenseKey | null> {
  const db = await requireDb();
  return db.collection<LicenseKey>("licenseKeys").findOne({ id });
}

export async function getLicenseKeyByCode(keyCode: string): Promise<LicenseKey | null> {
  const db = await requireDb();
  return db.collection<LicenseKey>("licenseKeys").findOne({ key: keyCode });
}

export async function createLicenseKey(input: { key: string; label?: string | null; maxUses: number; expiresAt?: Date | null }): Promise<LicenseKey> {
  const db = await requireDb();
  const now = new Date();
  const key: LicenseKey = {
    id: await nextId(db, "licenseKeys"),
    key: input.key,
    label: input.label ?? null,
    maxUses: input.maxUses,
    usedCount: 0,
    status: "unactivated",
    expiresAt: input.expiresAt ?? null,
    activatedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.collection<LicenseKey>("licenseKeys").insertOne(key);
  return key;
}

export async function updateLicenseKey(id: number, input: { label?: string | null; maxUses?: number; expiresAt?: Date | null; status?: KeyStatus }): Promise<LicenseKey | null> {
  const db = await requireDb();
  await db.collection<LicenseKey>("licenseKeys").updateOne({ id }, { $set: { ...input, updatedAt: new Date() } });
  return getLicenseKeyById(id);
}

export async function deleteLicenseKey(id: number) {
  const db = await requireDb();
  await db.collection<KeyActivation>("keyActivations").deleteMany({ keyId: id });
  await db.collection<LicenseKey>("licenseKeys").deleteOne({ id });
}

export async function listKeyActivations(keyId?: number, limit = 100) {
  const db = await requireDb();
  const filter = keyId ? { keyId } : {};
  return db.collection<KeyActivation>("keyActivations").find(filter).sort({ createdAt: -1 }).limit(limit).toArray();
}

export async function getActivationByDevice(keyId: number, deviceId: string) {
  const db = await requireDb();
  return db.collection<KeyActivation>("keyActivations").findOne({ keyId, fingerprint: deviceId });
}

export async function touchActivation(id: number) {
  const db = await requireDb();
  await db.collection<KeyActivation>("keyActivations").updateOne({ id }, { $set: { lastSeenAt: new Date() } });
}

export async function activateLicenseKey(input: { key: string; fingerprint: string; ipAddress?: string | null; userAgent?: string | null }) {
  const db = await requireDb();
  const keys = db.collection<LicenseKey>("licenseKeys");
  const activations = db.collection<KeyActivation>("keyActivations");
  const key = await keys.findOne({ key: input.key });
  if (!key) return { ok: false as const, reason: "invalid" as const };

  const currentStatus = getKeyStatus(key);
  if (currentStatus === "revoked") return { ok: false as const, reason: "revoked" as const };
  if (currentStatus === "expired") return { ok: false as const, reason: "expired" as const };
  if (currentStatus === "exhausted") return { ok: false as const, reason: "exhausted" as const };

  const existing = await activations.findOne({ keyId: key.id, fingerprint: input.fingerprint });
  if (existing) return { ok: true as const, reason: "already_active" as const, key, activation: existing };

  const nextCount = key.usedCount + 1;
  const nextStatus: KeyStatus = nextCount >= key.maxUses ? "exhausted" : "active";
  const updated = await keys.findOneAndUpdate(
    { id: key.id, usedCount: { $lt: key.maxUses }, status: { $ne: "revoked" } },
    { $inc: { usedCount: 1 }, $set: { status: nextStatus, activatedAt: key.activatedAt ?? new Date(), updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!updated) {
    const latest = await keys.findOne({ id: key.id });
    return { ok: false as const, reason: getKeyStatus(latest ?? key) === "expired" ? "expired" as const : "exhausted" as const };
  }

  const activation: KeyActivation = {
    id: await nextId(db, "keyActivations"),
    keyId: key.id,
    fingerprint: input.fingerprint,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    createdAt: new Date(),
  };
  try {
    await activations.insertOne(activation);
  } catch (error: unknown) {
    if ((error as { code?: number }).code === 11000) {
      const duplicate = await activations.findOne({ keyId: key.id, fingerprint: input.fingerprint });
      return { ok: true as const, reason: "already_active" as const, key: updated, activation: duplicate ?? activation };
    }
    throw error;
  }
  return { ok: true as const, reason: "activated" as const, key: updated, activationId: activation.id };
}
