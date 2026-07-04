// Engagement tracking endpoints embedded in outbound emails:
//   GET /t/o/:token.gif -> open pixel (signal only; Apple MPP inflates opens)
//   GET /t/c/:token     -> film-link click, redirects to the athlete's film (the money metric)
//   GET /t/u/:token     -> coach opt-out; suppresses the address globally (CAN-SPAM)
import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { PIXEL_GIF } from "../outreach/tracking.js";

function messageByToken(token: string) {
  return db
    .prepare(
      `SELECT m.id, m.athlete_id, c.email AS coach_email, a.film_url
       FROM messages m
       JOIN coaches c ON c.id = m.coach_id
       JOIN athletes a ON a.id = m.athlete_id
       WHERE m.token = ?`
    )
    .get(token) as { id: number; athlete_id: number; coach_email: string; film_url: string | null } | undefined;
}

function recordEvent(messageId: number, type: string, meta: Record<string, unknown>) {
  db.prepare(`INSERT INTO message_events (message_id, type, meta) VALUES (?, ?, ?)`).run(
    messageId,
    type,
    JSON.stringify(meta)
  );
}

export async function trackingRoutes(app: FastifyInstance) {
  app.get("/t/o/:token.gif", async (req, reply) => {
    const { token } = req.params as { token: string };
    const msg = messageByToken(token);
    if (msg) recordEvent(msg.id, "open", { ua: req.headers["user-agent"] ?? null });
    return reply.header("Content-Type", "image/gif").header("Cache-Control", "no-store").send(PIXEL_GIF);
  });

  app.get("/t/c/:token", async (req, reply) => {
    const { token } = req.params as { token: string };
    const msg = messageByToken(token);
    if (!msg) return reply.code(404).send({ error: "unknown link" });
    recordEvent(msg.id, "click", { ua: req.headers["user-agent"] ?? null });
    return reply.redirect(msg.film_url ?? "https://www.hudl.com", 302);
  });

  app.get("/t/u/:token", async (req, reply) => {
    const { token } = req.params as { token: string };
    const msg = messageByToken(token);
    if (!msg) return reply.code(404).send({ error: "unknown link" });
    db.prepare(`INSERT OR IGNORE INTO suppressions (email, reason) VALUES (?, 'opt_out')`).run(msg.coach_email);
    recordEvent(msg.id, "opt_out", {});
    return reply
      .header("Content-Type", "text/html")
      .send("<html><body style='font-family:sans-serif'><p>You have been unsubscribed from athlete outreach. Thank you.</p></body></html>");
  });
}
