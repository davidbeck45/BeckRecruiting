import Fastify from "fastify";
import { coreRoutes } from "./routes/core.js";
import { campaignRoutes } from "./routes/campaigns.js";
import { trackingRoutes } from "./routes/tracking.js";
import { adminRoutes } from "./routes/admin.js";

export function buildServer() {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ ok: true, service: "beck-recruiting" }));

  app.register(coreRoutes);
  app.register(campaignRoutes);
  app.register(trackingRoutes);
  app.register(adminRoutes);

  return app;
}
