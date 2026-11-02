// Platform values are read at use time. Secrets stay in the deployment environment.
export const ENV = {
  get appId() { return process.env.MANUS_PROJECT_ID ?? ""; },
  get cookieSecret() { return process.env.MANUS_JWT_SECRET ?? ""; },
  get adminPassword() { return process.env.ADMIN_PASSWORD ?? ""; },
  get mongodbUri() { return process.env.MONGODB_URI ?? ""; },
  get mongodbDbName() { return process.env.MONGODB_DB_NAME ?? ""; },
  get corsOrigins() { return process.env.CORS_ORIGINS?.split(",").map(origin => origin.trim()).filter(Boolean) ?? []; },
  get oAuthServerUrl() { return process.env.MANUS_OAUTH_API_URL ?? ""; },
  get ownerOpenId() { return process.env.OWNER_OPEN_ID ?? ""; },
  get isProduction() { return process.env.NODE_ENV === "production"; },
  get forgeApiUrl() { return process.env.MANUS_API_URL ?? ""; },
  get forgeApiKey() { return process.env.MANUS_API_KEY ?? ""; },
};
