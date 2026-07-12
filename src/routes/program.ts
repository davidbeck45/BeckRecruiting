// PTF Placement System routes: written level projections, certified
// measurables, signing outcomes, and "The Receipts" — the published
// % signed at or above projected level.
import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";

// Level ordering for "signed at or above projection".
// naia and d3 are treated as peers; "none" = did not sign.
const LEVEL_RANK: Record<string, number> = {
  p4: 7, g5: 6, fcs: 5, d2: 4, d3: 3, naia: 3, juco: 2, none: 0,
};

function validLevel(level: unknown): level is string {
  return typeof level === "string" && level in LEVEL_RANK;
}

export async function programRoutes(app: FastifyInstance) {
  // --- Written level projections (Sophomore Recruiting Kickoff) ---
  app.post("/athletes/:id/projections", async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = req.body as Record<string, unknown>;
    if (!validLevel(b?.level) || b.level === "none") {
      return reply.code(400).send({ error: `level must be one of: p4, g5, fcs, d2, d3, naia, juco` });
    }
    if (!b.projected_by) return reply.code(400).send({ error: "projected_by (evaluator name) is required" });
    if (!db.prepare(`SELECT id FROM athletes WHERE id = ?`).get(id)) {
      return reply.code(404).send({ error: "athlete not found" });
    }
    const r = db
      .prepare(
        `INSERT INTO projections (athlete_id, level, projected_by, notes, film_plan, academic_notes)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, b.level, b.projected_by, b.notes ?? null, b.film_plan ?? null, b.academic_notes ?? null);
    return db.prepare(`SELECT * FROM projections WHERE id = ?`).get(r.lastInsertRowid);
  });

  app.get("/athletes/:id/projections", async (req) => {
    const { id } = req.params as { id: string };
    return db.prepare(`SELECT * FROM projections WHERE athlete_id = ? ORDER BY projected_at DESC`).all(id);
  });

  // --- Certified measurables ---
  app.post("/athletes/:id/verifications", async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = req.body as Record<string, unknown>;
    if (!b?.metric || b.value === undefined || !b.verified_by) {
      return reply.code(400).send({ error: "metric, value, and verified_by are required" });
    }
    if (!db.prepare(`SELECT id FROM athletes WHERE id = ?`).get(id)) {
      return reply.code(404).send({ error: "athlete not found" });
    }
    db.prepare(
      `INSERT INTO verifications (athlete_id, metric, value, method, verified_by)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(athlete_id, metric) DO UPDATE SET
         value = excluded.value, method = excluded.method,
         verified_by = excluded.verified_by, verified_at = datetime('now')`
    ).run(id, b.metric, b.value, b.method ?? "coach_certified", b.verified_by);
    return db.prepare(`SELECT * FROM verifications WHERE athlete_id = ? ORDER BY metric`).all(id);
  });

  app.get("/athletes/:id/verifications", async (req) => {
    const { id } = req.params as { id: string };
    return db.prepare(`SELECT * FROM verifications WHERE athlete_id = ? ORDER BY metric`).all(id);
  });

  // --- Signing outcomes ---
  app.post("/athletes/:id/signings", async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = req.body as Record<string, unknown>;
    if (!validLevel(b?.level)) {
      return reply.code(400).send({ error: `level must be one of: p4, g5, fcs, d2, d3, naia, juco, none` });
    }
    if (!db.prepare(`SELECT id FROM athletes WHERE id = ?`).get(id)) {
      return reply.code(404).send({ error: "athlete not found" });
    }
    let schoolId: number | null = null;
    if (b.school_name) {
      const s = db.prepare(`SELECT id FROM schools WHERE name = ?`).get(b.school_name) as { id: number } | undefined;
      schoolId = s?.id ?? null;
    }
    db.prepare(
      `INSERT INTO signings (athlete_id, school_id, school_name, level, notes)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(athlete_id) DO UPDATE SET
         school_id = excluded.school_id, school_name = excluded.school_name,
         level = excluded.level, notes = excluded.notes, signed_at = datetime('now')`
    ).run(id, schoolId, b.school_name ?? null, b.level, b.notes ?? null);
    return db.prepare(`SELECT * FROM signings WHERE athlete_id = ?`).get(id);
  });

  // --- The Receipts: % signed at or above projected level, published live ---
  app.get("/receipts", async () => {
    // Compare each signing against the athlete's FIRST (earliest) projection —
    // the honest version of the stat: the level we told the family up front.
    const rows = db
      .prepare(
        `SELECT a.id AS athlete_id,
                a.first_name || ' ' || a.last_name AS athlete,
                (SELECT p.level FROM projections p WHERE p.athlete_id = a.id ORDER BY p.projected_at ASC LIMIT 1) AS projected,
                sg.level AS signed,
                COALESCE(s.name, sg.school_name) AS school
         FROM signings sg
         JOIN athletes a ON a.id = sg.athlete_id
         LEFT JOIN schools s ON s.id = sg.school_id`
      )
      .all() as Array<{ athlete_id: number; athlete: string; projected: string | null; signed: string; school: string | null }>;

    const withProjection = rows.filter((r) => r.projected);
    const atOrAbove = withProjection.filter((r) => LEVEL_RANK[r.signed] >= LEVEL_RANK[r.projected!]);
    const signees = rows.filter((r) => r.signed !== "none");

    return {
      college_signees: signees.length,
      projected_and_signed: withProjection.length,
      signed_at_or_above_projection: atOrAbove.length,
      pct_at_or_above_projection:
        withProjection.length > 0 ? Math.round((atOrAbove.length / withProjection.length) * 100) : null,
      // The twice-a-year follow-up call list: every college that signed a player.
      follow_up_call_list: [...new Set(signees.map((r) => r.school).filter(Boolean))],
      detail: rows,
    };
  });
}
