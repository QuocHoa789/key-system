export const keyStatuses = ["unactivated", "active", "exhausted", "expired", "revoked"] as const;

export type KeyStatus = (typeof keyStatuses)[number];
export type UserRole = "user" | "admin";

export interface User {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
}

export type InsertUser = Partial<User> & Pick<User, "openId">;

export interface LicenseKey {
  id: number;
  key: string;
  label: string | null;
  maxUses: number;
  usedCount: number;
  status: KeyStatus;
  expiresAt: Date | null;
  activatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type InsertLicenseKey = Omit<LicenseKey, "id" | "createdAt" | "updatedAt">;

export interface KeyActivation {
  id: number;
  keyId: number;
  fingerprint: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export type InsertKeyActivation = Omit<KeyActivation, "id" | "createdAt">;
