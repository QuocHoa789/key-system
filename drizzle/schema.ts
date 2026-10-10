import { index, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const licenseKeys = mysqlTable(
  "licenseKeys",
  {
    id: int("id").autoincrement().primaryKey(),
    key: varchar("key", { length: 128 }).notNull().unique(),
    label: varchar("label", { length: 160 }),
    maxUses: int("maxUses").notNull().default(1),
    usedCount: int("usedCount").notNull().default(0),
    status: mysqlEnum("status", ["unactivated", "active", "exhausted", "expired", "revoked"])
      .notNull()
      .default("unactivated"),
    expiresAt: timestamp("expiresAt"),
    activatedAt: timestamp("activatedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    statusIdx: index("licenseKeys_status_idx").on(table.status),
    createdIdx: index("licenseKeys_created_idx").on(table.createdAt),
  }),
);

export const keyActivations = mysqlTable(
  "keyActivations",
  {
    id: int("id").autoincrement().primaryKey(),
    keyId: int("keyId").notNull(),
    fingerprint: varchar("fingerprint", { length: 160 }).notNull(),
    ipAddress: varchar("ipAddress", { length: 64 }),
    userAgent: text("userAgent"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    keyIdx: index("keyActivations_key_idx").on(table.keyId),
    fingerprintIdx: index("keyActivations_fingerprint_idx").on(table.fingerprint),
    createdIdx: index("keyActivations_created_idx").on(table.createdAt),
  }),
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type LicenseKey = typeof licenseKeys.$inferSelect;
export type InsertLicenseKey = typeof licenseKeys.$inferInsert;
export type KeyActivation = typeof keyActivations.$inferSelect;
export type InsertKeyActivation = typeof keyActivations.$inferInsert;
export type KeyStatus = LicenseKey["status"];
