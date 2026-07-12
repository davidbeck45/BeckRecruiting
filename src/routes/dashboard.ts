// Server-rendered HTML dashboard: the family-facing "did coaches see it" view.
// GET / — athletes, campaigns, and per-coach engagement for the latest campaign.
import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface ReportRow {
  message_id: number;
  status: string;
  sent_at: string | null;
  coach: string;
  title: string | null;
  school: string;
  division: string | null;
  opens: number;
  film_clicks: number;
  last_film_view: string | null;
}

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/", async (req, reply) => {
    const { campaign_id } = req.query as { campaign_id?: string };

    const athletes = db
      .prepare(`SELECT id, first_name, last_name, position, grad_year, gpa, film_url FROM athletes ORDER BY id`)
      .all() as Array<Record<string, unknown>>;

    const campaigns = db
      .prepare(
        `SELECT ca.id, ca.name, ca.status, ca.created_at,
                a.first_name || ' ' || a.last_name AS athlete,
                COUNT(m.id) AS messages,
                SUM(CASE WHEN m.status = 'sent' THEN 1 ELSE 0 END) AS sent
         FROM campaigns ca
         JOIN athletes a ON a.id = ca.athlete_id
         LEFT JOIN messages m ON m.campaign_id = ca.id
         GROUP BY ca.id ORDER BY ca.id DESC`
      )
      .all() as Array<Record<string, unknown>>;

    const selectedId = campaign_id ?? (campaigns[0]?.id as number | undefined);
    let report: ReportRow[] = [];
    let selected: Record<string, unknown> | undefined;
    if (selectedId !== undefined) {
      selected = campaigns.find((c) => String(c.id) === String(selectedId));
      report = db
        .prepare(
          `SELECT m.id AS message_id, m.status, m.sent_at,
                  c.first_name || ' ' || c.last_name AS coach, c.title,
                  s.name AS school, s.division,
                  SUM(CASE WHEN e.type = 'open' THEN 1 ELSE 0 END) AS opens,
                  SUM(CASE WHEN e.type = 'click' THEN 1 ELSE 0 END) AS film_clicks,
                  MAX(CASE WHEN e.type = 'click' THEN e.created_at END) AS last_film_view
           FROM messages m
           JOIN coaches c ON c.id = m.coach_id
           JOIN schools s ON s.id = c.school_id
           LEFT JOIN message_events e ON e.message_id = m.id
           WHERE m.campaign_id = ?
           GROUP BY m.id
           ORDER BY film_clicks DESC, opens DESC, school`
        )
        .all(selectedId) as ReportRow[];
    }

    const totalOpens = report.reduce((n, r) => n + Number(r.opens), 0);
    const totalClicks = report.reduce((n, r) => n + Number(r.film_clicks), 0);

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Beck Recruiting</title>
<style>
  :root { --ink: #16211c; --muted: #5f6f66; --line: #dde5df; --bg: #f5f7f4; --card: #ffffff; --accent: #1d5c3f; --gold: #b98a2e; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Georgia, 'Times New Roman', serif; background: var(--bg); color: var(--ink); }
  header { background: var(--accent); color: #f2efe6; padding: 20px 32px; display: flex; align-items: baseline; gap: 14px; }
  header h1 { margin: 0; font-size: 22px; letter-spacing: .04em; }
  header .tag { font-family: Arial, sans-serif; font-size: 12px; opacity: .85; }
  main { max-width: 1060px; margin: 0 auto; padding: 28px 32px 64px; }
  h2 { font-size: 16px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); border-bottom: 1px solid var(--line); padding-bottom: 8px; margin: 36px 0 14px; font-family: Arial, sans-serif; }
  .stats { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 18px; }
  .stat { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 14px 22px; min-width: 150px; }
  .stat .n { font-size: 30px; font-weight: 700; }
  .stat .l { font-family: Arial, sans-serif; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
  table { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; font-family: Arial, sans-serif; font-size: 13.5px; }
  th { text-align: left; font-size: 11px; letter-spacing: .07em; text-transform: uppercase; color: var(--muted); padding: 10px 14px; border-bottom: 1px solid var(--line); background: #fbfcfa; }
  td { padding: 10px 14px; border-bottom: 1px solid var(--line); }
  tr:last-child td { border-bottom: none; }
  .pill { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 11.5px; font-weight: 700; }
  .pill.hot { background: #f7ead3; color: var(--gold); }
  .pill.warm { background: #e3ecdf; color: var(--accent); }
  .pill.cold { background: #eef1ee; color: var(--muted); }
  .pill.sent { background: #e3ecdf; color: var(--accent); }
  .pill.failed { background: #f6e3e0; color: #a33a2a; }
  .muted { color: var(--muted); }
  a { color: var(--accent); }
  .note { font-family: Arial, sans-serif; font-size: 12px; color: var(--muted); margin-top: 10px; }
</style>
</head>
<body>
<header><h1>BECK RECRUITING</h1><span class="tag">College Pathways &middot; did the coaches see it?</span></header>
<main>

<h2>Athletes</h2>
<table>
<tr><th>Name</th><th>Position</th><th>Class</th><th>GPA</th><th>Film</th></tr>
${athletes.map((a) => `<tr>
  <td><strong>${esc(a.first_name)} ${esc(a.last_name)}</strong></td>
  <td>${esc(a.position)}</td><td>${esc(a.grad_year)}</td><td>${esc(a.gpa)}</td>
  <td>${a.film_url ? `<a href="${esc(a.film_url)}">highlights</a>` : '<span class="muted">—</span>'}</td>
</tr>`).join("\n")}
</table>

<h2>Campaigns</h2>
<table>
<tr><th>#</th><th>Campaign</th><th>Athlete</th><th>Status</th><th>Coaches reached</th><th></th></tr>
${campaigns.map((c) => `<tr>
  <td>${esc(c.id)}</td><td>${esc(c.name)}</td><td>${esc(c.athlete)}</td>
  <td><span class="pill ${c.status === "sent" ? "sent" : "cold"}">${esc(c.status)}</span></td>
  <td>${esc(c.sent)} / ${esc(c.messages)}</td>
  <td><a href="/?campaign_id=${esc(c.id)}">view report</a></td>
</tr>`).join("\n")}
</table>

${selected ? `
<h2>Engagement — ${esc(selected.name)} (${esc(selected.athlete)})</h2>
<div class="stats">
  <div class="stat"><div class="n">${report.length}</div><div class="l">Coaches emailed</div></div>
  <div class="stat"><div class="n">${totalOpens}</div><div class="l">Email opens</div></div>
  <div class="stat"><div class="n" style="color:var(--gold)">${totalClicks}</div><div class="l">Film views</div></div>
</div>
<div class="note">Film views are the metric that matters — an open can be a mail server; a film click is a person.</div>
<br>
<table>
<tr><th>Coach</th><th>Title</th><th>School</th><th>Div</th><th>Status</th><th>Opens</th><th>Film views</th><th>Last watched film</th></tr>
${report.map((r) => {
  const heat = Number(r.film_clicks) > 0 ? '<span class="pill hot">watched film</span>' :
               Number(r.opens) > 0 ? '<span class="pill warm">opened</span>' :
               '<span class="pill cold">no signal yet</span>';
  return `<tr>
  <td><strong>${esc(r.coach)}</strong></td>
  <td class="muted">${esc(r.title)}</td>
  <td>${esc(r.school)}</td>
  <td class="muted">${esc((r.division ?? "").toUpperCase())}</td>
  <td><span class="pill ${r.status === "sent" ? "sent" : "failed"}">${esc(r.status)}</span> ${heat}</td>
  <td>${esc(r.opens)}</td>
  <td><strong>${esc(r.film_clicks)}</strong></td>
  <td class="muted">${esc(r.last_film_view ?? "—")}</td>
</tr>`;
}).join("\n")}
</table>` : `<p class="muted">No campaigns yet — create one via <code>POST /campaigns</code>.</p>`}

</main>
</body>
</html>`;

    return reply.header("Content-Type", "text/html; charset=utf-8").send(html);
  });
}
