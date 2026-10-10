import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  activateLicenseKey,
  createLicenseKey,
  deleteLicenseKey,
  getKeyStatus,
  getLicenseKeyById,
  listKeyActivations,
  listLicenseKeys,
  updateLicenseKey,
} from "./db";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";
import { getSessionCookieOptions } from "./_core/cookies";
import { ADMIN_SESSION_COOKIE, ADMIN_SESSION_MAX_AGE, createAdminSession, isAdminPasswordValid } from "./_core/adminAuth";
import { COOKIE_NAME } from "@shared/const";

const statusSchema = z.enum(["unactivated", "active", "exhausted", "expired", "revoked"]);
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function generateKey() {
  const part = () => randomBytes(4).toString("hex").toUpperCase();
  return `KF-${part()}-${part()}-${part()}`;
}

function publicKeyView(key: NonNullable<Awaited<ReturnType<typeof getLicenseKeyById>>>) {
  return { ...key, status: getKeyStatus(key) };
}

function canAttemptLogin(ip: string) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60_000 });
    return true;
  }
  if (entry.count >= 8) return false;
  entry.count += 1;
  return true;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  admin: router({
    login: publicProcedure
      .input(z.object({ password: z.string().min(1).max(256) }))
      .mutation(async ({ ctx, input }) => {
        const ip = ctx.req.ip ?? "unknown";
        if (!canAttemptLogin(ip)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Quá nhiều lần thử. Vui lòng thử lại sau 15 phút." });
        if (!isAdminPasswordValid(input.password)) throw new TRPCError({ code: "UNAUTHORIZED", message: "Mật khẩu admin không chính xác." });
        const token = await createAdminSession();
        ctx.res.cookie(ADMIN_SESSION_COOKIE, token, {
          ...getSessionCookieOptions(ctx.req),
          maxAge: ADMIN_SESSION_MAX_AGE,
        });
        return { success: true } as const;
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(ADMIN_SESSION_COOKIE, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  keys: router({
    activate: publicProcedure
      .input(z.object({ key: z.string().trim().min(3).max(128), fingerprint: z.string().trim().min(8).max(160) }))
      .mutation(async ({ ctx, input }) => {
        const result = await activateLicenseKey({
          key: input.key.toUpperCase(),
          fingerprint: input.fingerprint,
          ipAddress: ctx.req.ip ?? ctx.req.headers["x-forwarded-for"]?.toString().split(",")[0] ?? null,
          userAgent: ctx.req.headers["user-agent"] ?? null,
        });
        if (result.reason === "invalid") return { ok: false, code: "invalid", message: "Key không tồn tại hoặc đã nhập sai." };
        if (result.reason === "revoked") return { ok: false, code: "revoked", message: "Key đã bị vô hiệu hóa." };
        if (result.reason === "expired") return { ok: false, code: "expired", message: "Key đã hết hạn sử dụng." };
        if (result.reason === "exhausted") return { ok: false, code: "exhausted", message: "Key đã hết lượt kích hoạt." };
        return {
          ok: true,
          code: result.reason,
          message: result.reason === "already_active" ? "Thiết bị này đã được kích hoạt trước đó." : "Kích hoạt thành công. Key đã sẵn sàng.",
          key: publicKeyView(result.key),
        };
      }),
    summary: adminProcedure.query(async () => {
      const keys = await listLicenseKeys();
      const byStatus = { unactivated: 0, active: 0, exhausted: 0, expired: 0, revoked: 0 };
      let totalUses = 0;
      let maxUses = 0;
      for (const key of keys) {
        byStatus[getKeyStatus(key)] += 1;
        totalUses += key.usedCount;
        maxUses += key.maxUses;
      }
      const activations = await listKeyActivations(undefined, 8);
      return {
        total: keys.length,
        byStatus,
        totalUses,
        maxUses,
        activationRate: maxUses ? Math.round((totalUses / maxUses) * 100) : 0,
        recent: activations,
      };
    }),
    list: adminProcedure
      .input(z.object({ search: z.string().optional(), status: statusSchema.optional() }).optional())
      .query(async ({ input }) => {
        const keys = await listLicenseKeys();
        const search = input?.search?.trim().toLowerCase();
        return keys
          .map(key => ({ ...publicKeyView(key) }))
          .filter(key => !search || key.key.toLowerCase().includes(search) || (key.label ?? "").toLowerCase().includes(search))
          .filter(key => !input?.status || key.status === input.status);
      }),
    create: adminProcedure
      .input(z.object({ label: z.string().trim().max(160).optional(), maxUses: z.number().int().min(1).max(100000), durationDays: z.number().int().min(0).max(3650).nullable().optional() }))
      .mutation(async ({ input }) => {
        const durationDays = input.durationDays ?? 0;
        const expiresAt = durationDays > 0 ? new Date(Date.now() + durationDays * 86_400_000) : null;
        const created = await createLicenseKey({ key: generateKey(), label: input.label || null, maxUses: input.maxUses, expiresAt });
        if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Không thể tạo key." });
        return publicKeyView(created);
      }),
    update: adminProcedure
      .input(z.object({ id: z.number().int().positive(), label: z.string().trim().max(160).nullable().optional(), maxUses: z.number().int().min(1).max(100000).optional(), expiresAt: z.string().datetime().nullable().optional() }))
      .mutation(async ({ input }) => {
        const current = await getLicenseKeyById(input.id);
        if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy key." });
        const nextMaxUses = input.maxUses ?? current.maxUses;
        const nextExpiry = input.expiresAt === undefined ? current.expiresAt : input.expiresAt ? new Date(input.expiresAt) : null;
        const nextStatus = current.status === "revoked" ? "revoked" : getKeyStatus({ ...current, maxUses: nextMaxUses, expiresAt: nextExpiry });
        const updated = await updateLicenseKey(input.id, {
          label: input.label,
          maxUses: input.maxUses,
          expiresAt: input.expiresAt === undefined ? undefined : nextExpiry,
          status: nextStatus,
        });
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Không thể cập nhật key." });
        return publicKeyView(updated);
      }),
    revoke: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const updated = await updateLicenseKey(input.id, { status: "revoked" });
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy key." });
        return publicKeyView(updated);
      }),
    remove: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        await deleteLicenseKey(input.id);
        return { success: true } as const;
      }),
    activations: adminProcedure
      .input(z.object({ keyId: z.number().int().positive().optional() }).optional())
      .query(({ input }) => listKeyActivations(input?.keyId)),
  }),
});

export type AppRouter = typeof appRouter;
