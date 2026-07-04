// CLI: npm run seed
// Seeds a small demo dataset (2 schools, 3 coaches, 1 athlete) so the full
// campaign pipeline can be exercised locally with the console email provider —
// no API keys required.
import { db } from "../db/index.js";

const insertSchool = db.prepare(`
  INSERT INTO schools (name, mascot, conference, division, city, state)
  VALUES (@name, @mascot, @conference, @division, @city, @state)
  ON CONFLICT(name) DO UPDATE SET updated_at = datetime('now')
`);
insertSchool.run({ name: "Demo State", mascot: "Demons", conference: "Demo Valley", division: "fcs", city: "Springfield", state: "OH" });
insertSchool.run({ name: "Example College", mascot: "Examples", conference: "Sample Athletic", division: "iii", city: "Columbus", state: "OH" });

const schoolId = (name: string) => (db.prepare(`SELECT id FROM schools WHERE name = ?`).get(name) as { id: number }).id;

const insertCoach = db.prepare(`
  INSERT INTO coaches (school_id, first_name, last_name, title, position_group, email, source, last_verified_at)
  VALUES (@school_id, @first_name, @last_name, @title, @position_group, @email, 'manual', datetime('now'))
  ON CONFLICT(school_id, first_name, last_name) DO UPDATE SET email = excluded.email, updated_at = datetime('now')
`);
insertCoach.run({ school_id: schoolId("Demo State"), first_name: "Pat", last_name: "Smith", title: "Head Coach", position_group: "HC", email: "psmith@demostate.example" });
insertCoach.run({ school_id: schoolId("Demo State"), first_name: "Lee", last_name: "Jones", title: "Running Backs Coach / Recruiting Coordinator", position_group: "RB", email: "ljones@demostate.example" });
insertCoach.run({ school_id: schoolId("Example College"), first_name: "Sam", last_name: "Brown", title: "Head Coach", position_group: "HC", email: "sbrown@example.example" });

const existing = db.prepare(`SELECT id FROM athletes WHERE first_name = 'Jordan' AND last_name = 'Demo'`).get();
if (!existing) {
  db.prepare(`
    INSERT INTO athletes (first_name, last_name, grad_year, position, height_in, weight_lb, measurables, gpa, sat,
                          high_school, city, state, film_url, email, phone, guardian_email)
    VALUES ('Jordan', 'Demo', 2027, 'RB', 70, 195, '{"forty": 4.62, "vertical": 33, "squat": 455}', 3.6, 1180,
            'Springfield High', 'Springfield', 'OH', 'https://www.hudl.com/video/demo', 'jordan.demo@example.com',
            '555-0100', 'parent.demo@example.com')
  `).run();
}

console.log("Seeded demo schools, coaches, athlete.");
console.log("Athletes:", db.prepare(`SELECT id, first_name, last_name, position FROM athletes`).all());
console.log("Coaches:", db.prepare(`SELECT id, last_name, title, email FROM coaches`).all());
