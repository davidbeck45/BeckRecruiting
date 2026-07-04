// CollegeFootballData.com sync — free public API (key: https://collegefootballdata.com/key)
// Provides the school skeleton (all FBS/FCS programs) and the head-coach layer.
// Assistant coaches + emails come from staff-directory scraping (see staffDirectory.ts)
// and imported datasets.
import { db } from "../db/index.js";
import { config } from "../config.js";

const CFBD_BASE = "https://api.collegefootballdata.com";

async function cfbdGet<T>(path: string): Promise<T> {
  if (!config.cfbdApiKey) {
    throw new Error("CFBD_API_KEY is not set. Get a free key at https://collegefootballdata.com/key");
  }
  const res = await fetch(`${CFBD_BASE}${path}`, {
    headers: { Authorization: `Bearer ${config.cfbdApiKey}` },
  });
  if (!res.ok) {
    throw new Error(`CFBD ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

interface CfbdTeam {
  id: number;
  school: string;
  mascot: string | null;
  conference: string | null;
  classification: string | null; // fbs | fcs | ii | iii
  location?: { city?: string | null; state?: string | null };
}

interface CfbdCoach {
  first_name: string;
  last_name: string;
  seasons: Array<{ school: string; year: number }>;
}

export async function syncSchools(year: number): Promise<number> {
  const teams = await cfbdGet<CfbdTeam[]>(`/teams?year=${year}`);
  const upsert = db.prepare(`
    INSERT INTO schools (cfbd_id, name, mascot, conference, division, city, state)
    VALUES (@cfbd_id, @name, @mascot, @conference, @division, @city, @state)
    ON CONFLICT(name) DO UPDATE SET
      cfbd_id = excluded.cfbd_id,
      mascot = excluded.mascot,
      conference = excluded.conference,
      division = excluded.division,
      city = excluded.city,
      state = excluded.state,
      updated_at = datetime('now')
  `);
  const tx = db.transaction((rows: CfbdTeam[]) => {
    for (const t of rows) {
      upsert.run({
        cfbd_id: t.id,
        name: t.school,
        mascot: t.mascot,
        conference: t.conference,
        division: t.classification,
        city: t.location?.city ?? null,
        state: t.location?.state ?? null,
      });
    }
  });
  tx(teams);
  return teams.length;
}

export async function syncHeadCoaches(year: number): Promise<number> {
  const coaches = await cfbdGet<CfbdCoach[]>(`/coaches?year=${year}&minYear=${year}`);
  const findSchool = db.prepare(`SELECT id FROM schools WHERE name = ?`);
  const upsert = db.prepare(`
    INSERT INTO coaches (school_id, first_name, last_name, title, position_group, source, last_verified_at)
    VALUES (@school_id, @first_name, @last_name, 'Head Coach', 'HC', 'cfbd', datetime('now'))
    ON CONFLICT(school_id, first_name, last_name) DO UPDATE SET
      title = 'Head Coach',
      position_group = 'HC',
      active = 1,
      last_verified_at = datetime('now'),
      updated_at = datetime('now')
  `);
  let count = 0;
  const tx = db.transaction((rows: CfbdCoach[]) => {
    for (const c of rows) {
      const season = c.seasons.find((s) => s.year === year);
      if (!season) continue;
      const school = findSchool.get(season.school) as { id: number } | undefined;
      if (!school) continue;
      upsert.run({ school_id: school.id, first_name: c.first_name, last_name: c.last_name });
      count++;
    }
  });
  tx(coaches);
  return count;
}
