// Core resource routes: athletes, schools, coaches.
import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";

export async function coreRoutes(app: FastifyInstance) {
  // --- Athletes ---
  app.post("/athletes", async (req, reply) => {
    const a = req.body as Record<string, unknown>;
    if (!a?.first_name || !a?.last_name) {
      return reply.code(400).send({ error: "first_name and last_name are required" });
    }
    const result = db
      .prepare(
        `INSERT INTO athletes (first_name, last_name, grad_year, position, height_in, weight_lb,
           measurables, gpa, sat, act, ncaa_id, high_school, city, state, film_url,
           transcript_url, email, phone, twitter, guardian_email, notes)
         VALUES (@first_name, @last_name, @grad_year, @position, @height_in, @weight_lb,
           @measurables, @gpa, @sat, @act, @ncaa_id, @high_school, @city, @state, @film_url,
           @transcript_url, @email, @phone, @twitter, @guardian_email, @notes)`
      )
      .run({
        grad_year: null, position: null, height_in: null, weight_lb: null,
        gpa: null, sat: null, act: null, ncaa_id: null, high_school: null, city: null,
        state: null, film_url: null, transcript_url: null, email: null, phone: null,
        twitter: null, guardian_email: null, notes: null,
        ...a,
        measurables: a.measurables ? JSON.stringify(a.measurables) : null,
      });
    return db.prepare(`SELECT * FROM athletes WHERE id = ?`).get(result.lastInsertRowid);
  });

  app.get("/athletes", async () => db.prepare(`SELECT * FROM athletes ORDER BY id DESC`).all());
  app.get("/athletes/:id", async (req, reply) => {
    const row = db.prepare(`SELECT * FROM athletes WHERE id = ?`).get((req.params as { id: string }).id);
    return row ?? reply.code(404).send({ error: "not found" });
  });

  // --- Schools ---
  app.get("/schools", async (req) => {
    const { division, state } = req.query as { division?: string; state?: string };
    let sql = `SELECT * FROM schools WHERE 1=1`;
    const params: unknown[] = [];
    if (division) { sql += ` AND division = ?`; params.push(division); }
    if (state) { sql += ` AND state = ?`; params.push(state); }
    return db.prepare(sql + ` ORDER BY name`).all(...params);
  });

  app.patch("/schools/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { staff_directory_url } = req.body as { staff_directory_url?: string };
    if (staff_directory_url === undefined) return reply.code(400).send({ error: "staff_directory_url required" });
    db.prepare(`UPDATE schools SET staff_directory_url = ?, updated_at = datetime('now') WHERE id = ?`).run(staff_directory_url, id);
    return db.prepare(`SELECT * FROM schools WHERE id = ?`).get(id);
  });

  // --- Coaches ---
  app.get("/coaches", async (req) => {
    const { school_id, position_group, has_email } = req.query as Record<string, string | undefined>;
    let sql = `SELECT c.*, s.name AS school_name, s.division, s.conference
               FROM coaches c JOIN schools s ON s.id = c.school_id WHERE c.active = 1`;
    const params: unknown[] = [];
    if (school_id) { sql += ` AND c.school_id = ?`; params.push(school_id); }
    if (position_group) { sql += ` AND c.position_group = ?`; params.push(position_group); }
    if (has_email === "1") sql += ` AND c.email IS NOT NULL`;
    return db.prepare(sql + ` ORDER BY s.name, c.last_name`).all(...params);
  });

  // Manual/bulk import of coach contacts (e.g. from a purchased dataset)
  app.post("/coaches/import", async (req, reply) => {
    const rows = req.body as Array<Record<string, unknown>>;
    if (!Array.isArray(rows)) return reply.code(400).send({ error: "expected an array of coach rows" });
    const findSchool = db.prepare(`SELECT id FROM schools WHERE name = ?`);
    const upsert = db.prepare(`
      INSERT INTO coaches (school_id, first_name, last_name, title, position_group, email, phone, twitter, source, last_verified_at)
      VALUES (@school_id, @first_name, @last_name, @title, @position_group, @email, @phone, @twitter, 'import', datetime('now'))
      ON CONFLICT(school_id, first_name, last_name) DO UPDATE SET
        title = excluded.title, position_group = excluded.position_group,
        email = COALESCE(excluded.email, coaches.email),
        phone = COALESCE(excluded.phone, coaches.phone),
        twitter = COALESCE(excluded.twitter, coaches.twitter),
        active = 1, last_verified_at = datetime('now'), updated_at = datetime('now')
    `);
    let imported = 0;
    const skipped: string[] = [];
    for (const r of rows) {
      const school = findSchool.get(r.school_name) as { id: number } | undefined;
      if (!school) { skipped.push(String(r.school_name)); continue; }
      upsert.run({
        school_id: school.id,
        first_name: r.first_name ?? "",
        last_name: r.last_name,
        title: r.title ?? null,
        position_group: r.position_group ?? null,
        email: r.email ?? null,
        phone: r.phone ?? null,
        twitter: r.twitter ?? null,
      });
      imported++;
    }
    return { imported, skipped };
  });
}
