import { timingSafeEqual } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import type { User } from "../../drizzle/schema";
import { ONE_YEAR_MS } from "@shared/const";
import { ENV } from "./env";

export const ADMIN_SESSION_COOKIE = "keyforge_admin_session";
export const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const ADMIN_SESSION_ISSUER = "keyforge-admin";

function secretKey() {
  if (!ENV.cookieSecret) throw new Error("MANUS_JWT_SECRET is unavailable");
  return new TextEncoder().encode(ENV.cookieSecret);
}

export function isAdminPasswordValid(password: string) {
  const configured = ENV.adminPassword;
  if (!configured || !password) return false;
  const providedBuffer = Buffer.from(password);
  const configuredBuffer = Buffer.from(configured);
  return providedBuffer.length === configuredBuffer.length && timingSafeEqual(providedBuffer, configuredBuffer);
}

export async function createAdminSession() {
  return new SignJWT({
    sub: "password-admin",
    appId: ENV.appId,
    role: "admin",
    name: "quochoa",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ADMIN_SESSION_ISSUER)
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + ADMIN_SESSION_TTL_MS) / 1000))
    .sign(secretKey());
}

export async function verifyAdminSession(token: string | undefined | null) {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"], issuer: ADMIN_SESSION_ISSUER });
    return payload.sub === "password-admin" && payload.appId === ENV.appId && payload.role === "admin";
  } catch {
    return false;
  }
}

export function buildPasswordAdminUser(): User {
  const now = new Date();
  return {
    id: -1,
    openId: "password-admin",
    name: "quochoa",
    email: null,
    loginMethod: "password",
    role: "admin",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };
}

// Keep the TTL export explicit for any future cookie rotation code without exposing secrets.
export const ADMIN_SESSION_MAX_AGE = Math.min(ADMIN_SESSION_TTL_MS, ONE_YEAR_MS);
