// Generic staff-directory scraper.
// Most college athletic sites run on Sidearm Sports and expose a football
// coaches page (e.g. https://godeacs.com/sports/football/coaches) listing every
// assistant with a title and usually a mailto: email. This adapter is a
// best-effort generic parser: it finds mailto links and extracts the nearest
// name/title text. Individual sites will need per-site tuning; scrape results
// land with source='staff_directory' and last_verified_at set so freshness is
// auditable. Respect robots.txt and rate-limit crawls in production.
import * as cheerio from "cheerio";
import { db } from "../db/index.js";

export interface ScrapedCoach {
  name: string;
  title: string;
  email: string;
}

const TITLE_TO_GROUP: Array<[RegExp, string]> = [
  [/head coach/i, "HC"],
  [/recruiting/i, "RC"],
  [/quarterback/i, "QB"],
  [/running back/i, "RB"],
  [/wide receiver|receivers/i, "WR"],
  [/tight end/i, "TE"],
  [/offensive line|o-line/i, "OL"],
  [/defensive line|d-line/i, "DL"],
  [/linebacker/i, "LB"],
  [/defensive back|cornerback|safeties|secondary/i, "DB"],
  [/special teams/i, "ST"],
];

export function positionGroupFromTitle(title: string): string {
  for (const [re, group] of TITLE_TO_GROUP) {
    if (re.test(title)) return group;
  }
  return "other";
}

/** Parse a staff/coaches page and return coach candidates (exported for testing). */
export function parseStaffPage(html: string): ScrapedCoach[] {
  const $ = cheerio.load(html);
  const results: ScrapedCoach[] = [];
  const seen = new Set<string>();

  $('a[href^="mailto:"]').each((_, el) => {
    const email = ($(el).attr("href") ?? "").replace(/^mailto:/i, "").split("?")[0].trim().toLowerCase();
    if (!email || !email.includes("@") || seen.has(email)) return;

    // Walk up to a plausible card/row container and pull its text lines.
    const container = $(el).closest("tr, li, .sidearm-roster-coach, .s-person-card, article, div");
    const lines = container
      .text()
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 1 && !l.toLowerCase().includes(email));

    if (lines.length === 0) return;
    const name = lines[0].slice(0, 80);
    const title = (lines.find((l) => /coach|coordinator|director|recruiting|operations/i.test(l)) ?? "").slice(0, 120);

    seen.add(email);
    results.push({ name, title, email });
  });

  return results;
}

export async function scrapeSchoolStaff(schoolId: number): Promise<number> {
  const school = db.prepare(`SELECT id, name, staff_directory_url FROM schools WHERE id = ?`).get(schoolId) as
    | { id: number; name: string; staff_directory_url: string | null }
    | undefined;
  if (!school) throw new Error(`School ${schoolId} not found`);
  if (!school.staff_directory_url) throw new Error(`School ${school.name} has no staff_directory_url set`);

  const res = await fetch(school.staff_directory_url, {
    headers: { "User-Agent": "BeckRecruitingBot/0.1 (+contact: see site)" },
  });
  if (!res.ok) throw new Error(`Fetch ${school.staff_directory_url} failed: ${res.status}`);
  const scraped = parseStaffPage(await res.text());

  const upsert = db.prepare(`
    INSERT INTO coaches (school_id, first_name, last_name, title, position_group, email, source, last_verified_at)
    VALUES (@school_id, @first_name, @last_name, @title, @position_group, @email, 'staff_directory', datetime('now'))
    ON CONFLICT(school_id, first_name, last_name) DO UPDATE SET
      title = excluded.title,
      position_group = excluded.position_group,
      email = excluded.email,
      active = 1,
      last_verified_at = datetime('now'),
      updated_at = datetime('now')
  `);

  let count = 0;
  for (const c of scraped) {
    const parts = c.name.split(/\s+/);
    const firstName = parts.slice(0, -1).join(" ");
    const lastName = parts[parts.length - 1];
    if (!lastName) continue;
    upsert.run({
      school_id: school.id,
      first_name: firstName,
      last_name: lastName,
      title: c.title || null,
      position_group: positionGroupFromTitle(c.title),
      email: c.email,
    });
    count++;
  }
  return count;
}
