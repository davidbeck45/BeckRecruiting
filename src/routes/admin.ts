// Admin/data operations: CFBD sync, staff-directory scraping, AI school matching.
import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { syncSchools, syncHeadCoaches } from "../sync/cfbd.js";
import { scrapeSchoolStaff } from "../sync/staffDirectory.js";
import { scoreSchoolFits, type SchoolCandidate } from "../ai/matcher.js";
import type { AthleteProfile } from "../ai/composer.js";

export async function adminRoutes(app: FastifyInstance) {
  // Pull schools + head coaches from CollegeFootballData (2 API calls).
  app.post("/sync/cfbd", async (req) => {
    const { year } = (req.body ?? {}) as { year?: number };
    const y = year ?? new Date().getFullYear();
    const schools = await syncSchools(y);
    const headCoaches = await syncHeadCoaches(y);
    return { year: y, schools, head_coaches: headCoaches };
  });

  // Scrape one school's staff directory page (requires staff_directory_url set on the school).
  app.post("/schools/:id/scrape", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const coaches = await scrapeSchoolStaff(Number(id));
      return { school_id: Number(id), coaches_upserted: coaches };
    } catch (err) {
      return reply.code(400).send({ error: String(err) });
    }
  });

  // AI school-fit ranking for an athlete across a filtered school set.
  app.post("/athletes/:id/match", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { divisions, states, limit } = (req.body ?? {}) as { divisions?: string[]; states?: string[]; limit?: number };
    const athlete = db.prepare(`SELECT * FROM athletes WHERE id = ?`).get(id) as AthleteProfile | undefined;
    if (!athlete) return reply.code(404).send({ error: "athlete not found" });

    let sql = `SELECT id, name, conference, division, city, state FROM schools WHERE 1=1`;
    const params: unknown[] = [];
    if (divisions?.length) { sql += ` AND division IN (${divisions.map(() => "?").join(",")})`; params.push(...divisions); }
    if (states?.length) { sql += ` AND state IN (${states.map(() => "?").join(",")})`; params.push(...states); }
    sql += ` ORDER BY name LIMIT ?`;
    params.push(limit ?? 100);
    const schools = db.prepare(sql).all(...params) as SchoolCandidate[];
    if (schools.length === 0) return reply.code(400).send({ error: "no schools match the filter; run /sync/cfbd first" });

    const fits = await scoreSchoolFits(athlete, schools);
    const byId = new Map(schools.map((s) => [s.id, s]));
    return fits.map((f) => ({ ...f, school: byId.get(f.school_id) ?? null }));
  });
}
