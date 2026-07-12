# Beck Recruiting

Football recruiting distribution service: a continuously-updated database of college football coaches, AI-personalized outreach that puts athlete film + measurables + academics in front of the right coaches, and engagement tracking that shows families which coaches actually opened the email and watched the film.

**Read [PLAN.md](./PLAN.md) first** — it covers the full business + technical plan (data strategy, AI usage, deliverability, compliance, roadmap).

## Quickstart (no API keys needed)

```bash
npm install
cp .env.example .env
npm run seed          # demo schools, coaches, athlete
npm run dev           # API on http://localhost:3000
```

Run a full campaign end-to-end (emails print to the console in dev):

```bash
# 1. Create a campaign for the seeded athlete targeting all seeded coaches
curl -s -X POST localhost:3000/campaigns -H 'content-type: application/json' \
  -d '{"athlete_id": 1, "name": "Demo blast", "filter": {"positionGroups": ["HC", "RB"]}}'

# 2. Send it (uses Claude if ANTHROPIC_API_KEY is set, template fallback otherwise)
curl -s -X POST localhost:3000/campaigns/1/send

# 3. Simulate a coach opening the email + clicking the film link
#    (grab a token from the console-logged email, then:)
curl -s localhost:3000/t/o/<token>.gif -o /dev/null
curl -sL localhost:3000/t/c/<token> -o /dev/null

# 4. Engagement report — "did they see it"
curl -s localhost:3000/campaigns/1/report
```

## With real data + AI

| Env var | Enables |
|---|---|
| `CFBD_API_KEY` | `POST /sync/cfbd` — pulls every FBS/FCS school + head coach from [CollegeFootballData](https://collegefootballdata.com) (free key) |
| `ANTHROPIC_API_KEY` | Claude-written personalized emails (`claude-opus-4-8`) and `POST /athletes/:id/match` school-fit ranking |
| `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` | Real email delivery (needs a verified sending domain) |

Assistant coaches + emails come from staff-directory scraping (`PATCH /schools/:id` to set `staff_directory_url`, then `POST /schools/:id/scrape`) and bulk imports (`POST /coaches/import`) of purchased datasets — see PLAN.md §3.

## API surface

| Method & path | Purpose |
|---|---|
| `POST /athletes` / `GET /athletes` | Athlete profiles (film, measurables, GPA/SAT/ACT) |
| `GET /schools` / `PATCH /schools/:id` | School directory, set staff-page URL |
| `GET /coaches` / `POST /coaches/import` | Coach contacts, bulk import |
| `POST /sync/cfbd` | Sync schools + head coaches from CFBD |
| `POST /schools/:id/scrape` | Scrape a school's staff directory for assistants + emails |
| `POST /athletes/:id/match` | AI school-fit ranking (0–100 with rationale) |
| `POST /athletes/:id/projections` | Written level projection (P4/G5/FCS/D2/D3/NAIA) — the Sophomore Kickoff deliverable |
| `POST /athletes/:id/verifications` | Certified measurables (laser-timed, coach-signed); cited by the AI composer |
| `POST /athletes/:id/signings` | Signing outcome (school + level) |
| `GET /receipts` | "The Receipts": % signed at or above projection + twice-a-year follow-up call list |
| `POST /campaigns` | Build a target list (division/state/position filters, suppression-aware) |
| `POST /campaigns/:id/send` | AI-compose + send one personalized email per coach |
| `GET /campaigns/:id/report` | Per-coach opens, film clicks, last-view timestamps |
| `GET /t/o/:token.gif`, `/t/c/:token`, `/t/u/:token` | Open pixel, film-click redirect, opt-out |

## Stack

Node 20+ · TypeScript · Fastify · SQLite (better-sqlite3, Postgres-portable schema) · Anthropic SDK · cheerio
