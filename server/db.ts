import { and, desc, eq, lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  keyActivations,
  licenseKeys,
  KeyStatus,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) {
      const value = user[field] ?? null;
      values[field] = value;
      updateSet[field] = value;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export function getKeyStatus(key: { status: KeyStatus; usedCount: number; maxUses: number; expiresAt: Date | null }, now = new Date()): KeyStatus {
  if (key.status === "revoked") return "revoked";
  if (key.expiresAt && key.expiresAt.getTime() <= now.getTime()) return "expired";
  if (key.usedCount >= key.maxUses) return "exhausted";
  if (key.usedCount > 0) return "active";
  return "unactivated";
}

export async function listLicenseKeys() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select().from(licenseKeys).orderBy(desc(licenseKeys.createdAt));
}

export async function getLicenseKeyById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.select().from(licenseKeys).where(eq(licenseKeys.id, id)).limit(1);
  return result[0];
}

export async function getLicenseKeyByCode(keyCode: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.select().from(licenseKeys).where(eq(licenseKeys.key, keyCode)).limit(1);
  return result[0];
}

export async function createLicenseKey(input: {
  key: string;
  label?: string | null;
  maxUses: number;
  expiresAt?: Date | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(licenseKeys).values({
    key: input.key,
    label: input.label ?? null,
    maxUses: input.maxUses,
    usedCount: 0,
    status: "unactivated",
    expiresAt: input.expiresAt ?? null,
  });
  return getLicenseKeyByCode(input.key);
}

export async function updateLicenseKey(
  id: number,
  input: { label?: string | null; maxUses?: number; expiresAt?: Date | null; status?: KeyStatus },
) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(licenseKeys).set({ ...input, updatedAt: new Date() }).where(eq(licenseKeys.id, id));
  return getLicenseKeyById(id);
}

export async function deleteLicenseKey(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(keyActivations).where(eq(keyActivations.keyId, id));
  await db.delete(licenseKeys).where(eq(licenseKeys.id, id));
}

export async function listKeyActivations(keyId?: number, limit = 100) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const query = db.select().from(keyActivations).orderBy(desc(keyActivations.createdAt)).limit(limit);
  if (keyId) return query.where(eq(keyActivations.keyId, keyId));
  return query;
}

export async function activateLicenseKey(input: {
  key: string;
  fingerprint: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.transaction(async tx => {
    const found = await tx.select().from(licenseKeys).where(eq(licenseKeys.key, input.key)).limit(1);
    const key = found[0];
    if (!key) return { ok: false as const, reason: "invalid" as const };

    const currentStatus = getKeyStatus(key);
    if (currentStatus === "revoked") return { ok: false as const, reason: "revoked" as const };
    if (currentStatus === "expired") return { ok: false as const, reason: "expired" as const };
    if (currentStatus === "exhausted") return { ok: false as const, reason: "exhausted" as const };

    const existing = await tx
      .select()
      .from(keyActivations)
      .where(and(eq(keyActivations.keyId, key.id), eq(keyActivations.fingerprint, input.fingerprint)))
      .limit(1);
    if (existing[0]) {
      return { ok: true as const, reason: "already_active" as const, key, activation: existing[0] };
    }

    const nextCount = key.usedCount + 1;
    const nextStatus: KeyStatus = nextCount >= key.maxUses ? "exhausted" : "active";
    await tx
      .update(licenseKeys)
      .set({
        usedCount: sql`${licenseKeys.usedCount} + 1`,
        status: nextStatus,
        activatedAt: key.activatedAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(licenseKeys.id, key.id), lt(licenseKeys.usedCount, key.maxUses)));

    const inserted = await tx.insert(keyActivations).values({
      keyId: key.id,
      fingerprint: input.fingerprint,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    });
    const activationId = Number((inserted as any)?.[0]?.insertId ?? 0);
    const latest = await tx.select().from(licenseKeys).where(eq(licenseKeys.id, key.id)).limit(1);
    return {
      ok: true as const,
      reason: "activated" as const,
      key: latest[0] ?? key,
      activationId,
    };
  });
}
