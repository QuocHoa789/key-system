import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { parse as parseCookieHeader } from "cookie";
import type { User } from "../../drizzle/schema";
import { ADMIN_SESSION_COOKIE, buildPasswordAdminUser, verifyAdminSession } from "./adminAuth";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  if (!user) {
    const adminToken = parseCookieHeader(opts.req.headers.cookie ?? "")[ADMIN_SESSION_COOKIE];
    if (await verifyAdminSession(adminToken)) user = buildPasswordAdminUser();
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
