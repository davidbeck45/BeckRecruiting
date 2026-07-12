// Campaign lifecycle: create (build target list) -> send (compose + deliver) -> report.
import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { composeEmail, type AthleteProfile, type CoachTarget } from "../ai/composer.js";
import { sendEmail } from "../outreach/sender.js";
import { newToken, renderTrackedHtml, renderTrackedText } from "../outreach/tracking.js";

interface TargetFilter {
  divisions?: string[];       // e.g. ["fcs", "ii", "iii"]
  states?: string[];          // e.g. ["OH", "PA"]
  positionGroups?: string[];  // e.g. ["RB", "RC", "HC"] - coach position groups to contact
  limit?: number;
}

export async function campaignRoutes(app: FastifyInstance) {
  // Create a campaign: selects target coaches per filter and creates draft messages.
  app.post("/campaigns", async (req, reply) => {
    const { athlete_id, name, filter } = req.body as { athlete_id: number; name?: string; filter?: TargetFilter };
    const athlete = db.prepare(`SELECT * FROM athletes WHERE id = ?`).get(athlete_id) as AthleteProfile & { id: number } | undefined;
    if (!athlete) return reply.code(404).send({ error: "athlete not found" });

    const f = filter ?? {};
    let sql = `
      SELECT c.id AS coach_id, c.email
      FROM coaches c
      JOIN schools s ON s.id = c.school_id
      WHERE c.active = 1 AND c.email IS NOT NULL
        AND c.email NOT IN (SELECT email FROM suppressions)`;
    const params: unknown[] = [];
    if (f.divisions?.length) {
      sql += ` AND s.division IN (${f.divisions.map(() => "?").join(",")})`;
      params.push(...f.divisions);
    }
    if (f.states?.length) {
      sql += ` AND s.state IN (${f.states.map(() => "?").join(",")})`;
      params.push(...f.states);
    }
    if (f.positionGroups?.length) {
      sql += ` AND c.position_group IN (${f.positionGroups.map(() => "?").join(",")})`;
      params.push(...f.positionGroups);
    }
    sql += ` ORDER BY s.name LIMIT ?`;
    params.push(f.limit ?? 150);

    const targets = db.prepare(sql).all(...params) as Array<{ coach_id: number; email: string }>;
    if (targets.length === 0) return reply.code(400).send({ error: "no matching coaches with emails found" });

    const campaign = db
      .prepare(`INSERT INTO campaigns (athlete_id, name, target_filter) VALUES (?, ?, ?)`)
      .run(athlete_id, name ?? `Campaign for athlete ${athlete_id}`, JSON.stringify(f));
    const campaignId = Number(campaign.lastInsertRowid);

    const insertMsg = db.prepare(
      `INSERT INTO messages (campaign_id, athlete_id, coach_id, token) VALUES (?, ?, ?, ?)`
    );
    const tx = db.transaction(() => {
      for (const t of targets) insertMsg.run(campaignId, athlete_id, t.coach_id, newToken());
    });
    tx();

    return { campaign_id: campaignId, targets: targets.length, status: "draft" };
  });

  // Send a campaign: compose each draft with AI (or template fallback), inject tracking, deliver.
  app.post("/campaigns/:id/send", async (req, reply) => {
    const { id } = req.params as { id: string };
    const campaign = db.prepare(`SELECT * FROM campaigns WHERE id = ?`).get(id) as
      | { id: number; athlete_id: number; status: string }
      | undefined;
    if (!campaign) return reply.code(404).send({ error: "campaign not found" });

    const athlete = db.prepare(`SELECT * FROM athletes WHERE id = ?`).get(campaign.athlete_id) as AthleteProfile;
    athlete.verified_measurables = db
      .prepare(`SELECT metric, value, method, verified_by FROM verifications WHERE athlete_id = ?`)
      .all(campaign.athlete_id) as AthleteProfile["verified_measurables"];
    const drafts = db
      .prepare(
        `SELECT m.id, m.token, c.first_name, c.last_name, c.title, c.email,
                s.name AS school_name, s.conference, s.division, s.state AS school_state
         FROM messages m
         JOIN coaches c ON c.id = m.coach_id
         JOIN schools s ON s.id = c.school_id
         WHERE m.campaign_id = ? AND m.status = 'draft'`
      )
      .all(campaign.id) as Array<CoachTarget & { id: number; token: string; email: string }>;

    db.prepare(`UPDATE campaigns SET status = 'sending' WHERE id = ?`).run(campaign.id);

    let sent = 0;
    let failed = 0;
    for (const draft of drafts) {
      try {
        const composed = await composeEmail(athlete, draft);
        const html = renderTrackedHtml(composed.body, draft.token);
        const text = renderTrackedText(composed.body, draft.token);
        const result = await sendEmail({
          to: draft.email,
          replyTo: athlete.email ?? undefined,
          subject: composed.subject,
          html,
          text,
        });
        db.prepare(
          `UPDATE messages SET subject = ?, body = ?, status = ?, provider_message_id = ?, error = ?, sent_at = datetime('now')
           WHERE id = ?`
        ).run(
          composed.subject,
          composed.body,
          result.ok ? "sent" : "failed",
          result.providerMessageId ?? null,
          result.error ?? null,
          draft.id
        );
        result.ok ? sent++ : failed++;
      } catch (err) {
        db.prepare(`UPDATE messages SET status = 'failed', error = ? WHERE id = ?`).run(String(err), draft.id);
        failed++;
      }
    }

    db.prepare(`UPDATE campaigns SET status = 'sent' WHERE id = ?`).run(campaign.id);
    return { campaign_id: campaign.id, sent, failed };
  });

  // Engagement report: per-coach opens/clicks — "did they see it".
  app.get("/campaigns/:id/report", async (req, reply) => {
    const { id } = req.params as { id: string };
    const campaign = db.prepare(`SELECT * FROM campaigns WHERE id = ?`).get(id);
    if (!campaign) return reply.code(404).send({ error: "campaign not found" });

    const rows = db
      .prepare(
        `SELECT m.id AS message_id, m.status, m.sent_at,
                c.first_name || ' ' || c.last_name AS coach, c.title, s.name AS school,
                SUM(CASE WHEN e.type = 'open' THEN 1 ELSE 0 END) AS opens,
                SUM(CASE WHEN e.type = 'click' THEN 1 ELSE 0 END) AS film_clicks,
                MAX(CASE WHEN e.type = 'click' THEN e.created_at END) AS last_film_view
         FROM messages m
         JOIN coaches c ON c.id = m.coach_id
         JOIN schools s ON s.id = c.school_id
         LEFT JOIN message_events e ON e.message_id = m.id
         WHERE m.campaign_id = ?
         GROUP BY m.id
         ORDER BY film_clicks DESC, opens DESC`
      )
      .all(id);

    const totals = db
      .prepare(
        `SELECT COUNT(*) AS messages,
                SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
         FROM messages WHERE campaign_id = ?`
      )
      .get(id);

    return { campaign, totals, coaches: rows };
  });
}
