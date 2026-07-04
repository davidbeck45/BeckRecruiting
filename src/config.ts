import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 3000),
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:3000",
  databasePath: process.env.DATABASE_PATH ?? "./data/beckrecruiting.db",
  cfbdApiKey: process.env.CFBD_API_KEY ?? "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  emailProvider: (process.env.EMAIL_PROVIDER ?? "console") as "console" | "resend",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "Beck Recruiting <dev@localhost>",
};
